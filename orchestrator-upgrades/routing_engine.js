/**
 * ROUTING ENGINE — Deterministic with AI Fallback
 * 
 * Given an event, returns a routing decision:
 * 1. Look up domain/eventType in routing_table.json
 * 2. If found → execute deterministic actions
 * 3. If not found → AI fallback (Gemini, max 10/hour)
 * 4. Log everything to event_decisions
 */

const fs = require('fs');
const path = require('path');

// --- LOAD ROUTING TABLE ---
const TABLE_PATH = path.join(__dirname, 'routing_table.json');
let routingTable;

function loadRoutingTable() {
  try {
    routingTable = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
    return true;
  } catch (err) {
    console.error(`[ROUTING] Failed to load routing table: ${err.message}`);
    // Hardcoded fallback — never let routing go completely blind
    routingTable = {
      routes: {
        'billing/PAYMENT_FAILED': { actions: [{ type: 'ALERT', level: 'WARNING' }] },
        'infrastructure/NODE_ALIVE': { actions: [{ type: 'LOG_ONLY' }] },
      }
    };
    return false;
  }
}

loadRoutingTable();

// Watch for routing table changes (hot-reload)
fs.watchFile(TABLE_PATH, { interval: 30000 }, () => {
  console.log('[ROUTING] Routing table changed — reloading');
  loadRoutingTable();
});

// --- CACHE CONTEXT CONFIG ---
// F-DEPLOY-02: Docker-portable config loading
// In Docker: set CONTEXT_CONFIG_PATH or GOOGLE_API_KEY env var
// On local dev: falls back to relative path traversal
const CONFIG_PATH = process.env.CONTEXT_CONFIG_PATH || path.join(__dirname, '..', '..', 'RxFit-MCP', 'automation', 'context_config.json');
let contextConfig = {};
try {
  contextConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  // Not fatal — AI fallback still works if GOOGLE_API_KEY env is set
  if (process.env.GOOGLE_API_KEY) {
    contextConfig = { google_api_key: process.env.GOOGLE_API_KEY };
    console.log('[ROUTING] Using GOOGLE_API_KEY from env (context_config.json not found)');
  } else {
    console.warn(`[ROUTING] No AI fallback: context_config.json not found and GOOGLE_API_KEY not set`);
  }
}

// --- AI FALLBACK RATE LIMITER ---
const AI_FALLBACK_MAX_PER_HOUR = 10;

async function canUseAiFallback(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM event_decisions 
       WHERE decision_method = 'AI_FALLBACK' 
       AND dispatched_at > NOW() - INTERVAL '1 hour'`
    );
    return parseInt(rows[0].cnt) < AI_FALLBACK_MAX_PER_HOUR;
  } catch (err) {
    console.error(`[AI RATE LIMIT ERROR] ${err.message}`);
    // Fail secure: if DB is unreachable, prevent unmetered AI invocations
    return false;
  }
}

/**
 * Route an event. Returns a routing result.
 * 
 * @param {Object} event - Parsed event envelope
 * @param {Pool} pool - PostgreSQL pool for outbox writes
 * @param {PubSub} pubsub - Pub/Sub client for dispatching commands
 * @returns {Object} { decision, method, targetNode, aiReasoning, outcome }
 */
async function routeEvent(event, pool, pubsub) {
  const key = `${event.domain}/${event.eventType}`;
  const route = routingTable.routes?.[key];

  if (route) {
    return await executeDeterministicRoute(key, route, event, pool, pubsub);
  } else {
    return await executeAiFallback(key, event, pool);
  }
}

/**
 * Execute a deterministic route from the routing table.
 */
async function executeDeterministicRoute(key, route, event, pool, pubsub) {
  const results = [];
  let targetNode = null;

  for (const action of route.actions) {
    switch (action.type) {
      case 'DISPATCH': {
        targetNode = action.target;
        const topicName = action.topic || 'jade-commands';
        const commandId = require('crypto').randomUUID();
        
        const commandPayload = {
          commandId: commandId,
          command: action.command,
          sourceEvent: event.eventId,
          payload: event.payload,
          hopCount: (event.hopCount || 0) + 1,
          timestamp: new Date().toISOString(),
        };
        
        const commandAttributes = {
          command: action.command,
          target: action.target,
          sourceEvent: event.eventId,
        };

        // F-OPS-05: Retry with exponential backoff (3 attempts)
        const MAX_RETRIES = 3;
        const BASE_DELAY_MS = 500;
        let dispatched = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            // TWO-PHASE COMMIT: Insert into outbox rather than directly publishing
            await pool.query(
              `INSERT INTO outbox_commands (id, topic, payload, attributes)
               VALUES ($1, $2, $3, $4)`,
              [commandId, topicName, commandPayload, commandAttributes]
            );

            results.push(`OUTBOXED:${action.command}→${action.target}`);
            console.log(`[OUTBOXED] ${action.command} → ${action.target} via ${topicName}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
            dispatched = true;
            break;
          } catch (err) {
            const isTransient = err.code === '08006' || err.code === '57P01' ||
              err.message.includes('ECONNREFUSED') || err.message.includes('timeout');

            if (isTransient && attempt < MAX_RETRIES) {
              const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
              console.warn(`[OUTBOX RETRY] ${action.command} attempt ${attempt}/${MAX_RETRIES} failed (${err.code || err.message}). Retrying in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
            } else {
              console.error(`[OUTBOX FAILED] ${action.command}: ${err.message} (after ${attempt} attempt${attempt > 1 ? 's' : ''})`);
              results.push(`OUTBOX_FAILED:${err.message}`);
            }
          }
        }
        break;
      }

      case 'ALERT': {
        try {
          const { fireAlert } = require('./alert_cascade');
          await fireAlert({
            level: action.level || 'WARNING',
            title: `[SDM] ${event.domain}/${event.eventType}`,
            body: `Source: ${event.source}\n` +
                  `Event ID: ${event.eventId}\n` +
                  `Payload: ${JSON.stringify(event.payload, null, 2)}`,
          });
          results.push(`ALERTED:${action.level}`);
        } catch (err) {
          console.error(`[ALERT ERROR] ${err.message}`);
          results.push(`ALERT_FAILED:${err.message}`);
        }
        break;
      }

      case 'LOG_ONLY': {
        results.push('LOGGED');
        break;
      }

      case 'SILENT': {
        // Update webhook_health for liveness tracking but skip audit table
        try {
          await pool.query(
            `INSERT INTO webhook_health (node_name, endpoint_url, last_received_at, status, updated_at)
             VALUES ($1, $2, NOW(), 'HEALTHY', NOW())
             ON CONFLICT (node_name) DO UPDATE SET last_received_at = NOW(), status = 'HEALTHY', updated_at = NOW()`,
            [event.source || 'unknown', `pubsub://${event.domain}/${event.eventType}`]
          );
        } catch (err) {
          console.error(`[ROUTING ERROR] SILENT DB Update failed for ${event.source}: ${err.message}`);
        }
        results.push('SILENT');
        break;
      }

      default:
        results.push(`UNKNOWN_ACTION:${action.type}`);
    }
  }

  return {
    decision: results.join(' + '),
    method: 'DETERMINISTIC',
    targetNode,
    aiReasoning: null,
    outcome: results.some(r => r.includes('FAILED')) ? 'PARTIAL' : 'SUCCESS',
  };
}

/**
 * Helper to safely extract JSON out of Markdown fences.
 * Finds the first JSON block even if surrounded by conversational text.
 */
function extractJSONFromMarkdown(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match && match[1]) return match[1].trim();

  // Fallback if no fence but it looks like JSON
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0].trim();

  return text.trim();
}

const ALLOWED_TOPICS = [
  'jade-commands', 'crm-commands', 'scarlet-tasks', 
  'antigravity-tasks', 'wellness-commands', 'billing-commands'
];

/**
 * AI Fallback — send unknown event to Gemini for routing advice.
 */
async function executeAiFallback(key, event, pool) {
  if (!(await canUseAiFallback(pool))) {
    console.warn(`[AI FALLBACK] Rate limit reached (${AI_FALLBACK_MAX_PER_HOUR}/hour). Routing to DLQ.`);
    return {
      decision: 'AI_RATE_LIMITED_DLQ',
      method: 'AI_FALLBACK',
      targetNode: null,
      aiReasoning: 'Rate limit exceeded — routed to DLQ for manual review',
      outcome: 'DLQ',
    };
  }

  try {
    const prompt = `You are a routing engine for the Sovereign Domain Mesh.
An unknown event arrived that has no deterministic route.

Event: ${JSON.stringify(event, null, 2)}

Known routing domains: billing, seo, marketing, infrastructure, client-ops, scheduling, internal-ops, security, test

Available actions:
- DISPATCH to a worker node (crm-node, stripe-node)
- ALERT (CRITICAL, WARNING, INFO)
- LOG_ONLY (no action needed)

What should Jade do with this event? Respond in JSON format:
{ "decision": "...", "reasoning": "..." }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${contextConfig.google_api_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON securely (handles markdown block and trailing characters)
    try {
      const jsonStr = extractJSONFromMarkdown(text);
      let parsed = JSON.parse(jsonStr);

      if (!parsed.decision || !parsed.reasoning) {
        throw new Error('Missing top-level decision or reasoning parameters');
      }

      // Semantic Target Enforcement (Prevent AI target spoofing/hallucination)
      if (parsed.decision === 'DISPATCH' && parsed.target && !ALLOWED_TOPICS.includes(parsed.target)) {
        console.warn(`[AI FALLBACK] Hallucinated target prevented: ${parsed.target}. Degrading to DLQ.`);
        parsed.decision = 'AI_HALLUCINATED_TARGET_DLQ';
        parsed.targetNode = null;
      }

      console.log(`[AI FALLBACK] ${key} → ${parsed.decision} (${parsed.reasoning})`);
      return {
        decision: parsed.decision || 'AI_UNKNOWN',
        method: 'AI_FALLBACK',
        targetNode: parsed.target || null,
        aiReasoning: parsed.reasoning || text,
        outcome: parsed.decision.includes('DLQ') ? 'DLQ' : 'LOGGED',
      };
    } catch (parseErr) {
      console.warn(`[AI FALLBACK] Parse error: ${parseErr.message}. Fallback text was: ${text.slice(0, 100)}`);
      return {
        decision: 'AI_UNPARSEABLE',
        method: 'AI_FALLBACK',
        targetNode: null,
        aiReasoning: text.slice(0, 500),
        outcome: 'LOGGED',
      };
    }
  } catch (err) {
    console.error(`[AI FALLBACK ERROR] ${err.message}`);
    return {
      decision: 'AI_ERROR',
      method: 'AI_FALLBACK',
      targetNode: null,
      aiReasoning: err.message,
      outcome: 'FAILED',
    };
  }
}

module.exports = { routeEvent, loadRoutingTable };
