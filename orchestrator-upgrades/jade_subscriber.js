/**
 * JADE PUB/SUB SUBSCRIBER — Pull Model
 * 
 * Runs as a standalone sibling process alongside Jade's MCP server.
 * Polls jade-sub every 5 seconds, deduplicates, routes, and acks.
 * 
 * Usage: node jade_subscriber.js
 * 
 * Requires: .env with GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, PG_*
 */

// F-DEPLOY-02: Docker-portable env loading
// In Docker/Cloud Run, env vars are injected directly — dotenv is a no-op fallback
const dotenvPath = process.env.DOTENV_PATH ||
  require('path').join(__dirname, '.env') ;
require('dotenv').config({ path: dotenvPath, override: true });
// Also try the local MCP core env if it exists (dev environment)
try { require('dotenv').config({ path: require('path').join(__dirname, '..', 'anc-mcp-core', '.env'), override: false }); } catch (_) {}

const { Pool } = require('pg');
const { PubSub } = require('@google-cloud/pubsub');

// --- CONFIG ---
const POLL_INTERVAL_MS = parseInt(process.env.SUBSCRIBER_POLL_MS || '5000');
const DEDUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const PG_HEALTH_INTERVAL_MS = 30 * 1000;
const MAX_MESSAGES_PER_PULL = 20;

// --- CONNECTIONS ---
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
  max: 5,
  statement_timeout: 10000,
});

const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID });
const subscription = pubsub.subscription('jade-sub');

// --- STATE ---
let pgHealthy = true;
let processedCount = 0;
let dedupCount = 0;
let errorCount = 0;
let relayDropCount = 0; // W-NET-02: Track Terminal Feed relay failures

/**
 * Check if an event has been seen. pure read function.
 */
async function isDuplicate(eventId, client) {
  const existing = await client.query(
    'SELECT 1 FROM event_dedup WHERE event_id = $1',
    [eventId]
  );
  return existing.rows.length > 0;
}

/**
 * Persist the event to prevent future processing.
 */
async function markProcessed(eventId, client) {
  await client.query(
    'INSERT INTO event_dedup (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [eventId]
  );
}

/**
 * Background garbage collection for dedup table
 */
async function gcDedupTable() {
  if (!pgHealthy) return;
  try {
    await pool.query(
      `DELETE FROM event_dedup WHERE received_at < NOW() - INTERVAL '${DEDUP_WINDOW_MS / 1000} seconds'`
    );
  } catch (err) {
    console.error(`[SUBSCRIBER GC] ${err.message}`);
  }
}

/**
 * Log a routing decision to the audit table.
 */
async function logDecision({
  eventId, domain, eventType, sourceNode,
  decision, decisionMethod, targetNode = null,
  hopCount = 0, aiReasoning = null, outcome = 'PENDING'
}, client) {
  await client.query(
    `INSERT INTO event_decisions 
     (event_id, domain, event_type, source_node, decision, decision_method, 
      target_node, hop_count, ai_reasoning, outcome, dispatched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [eventId, domain, eventType, sourceNode, decision, decisionMethod,
     targetNode, hopCount, aiReasoning, outcome]
  );
}

/**
 * Process a single Pub/Sub message.
 */
async function processMessage(message) {
  let event;
  try {
    event = JSON.parse(message.data.toString());
  } catch (err) {
    console.error(`[SUBSCRIBER] Invalid JSON: ${err.message}`);
    message.ack(); // Don't retry garbage
    return;
  }

  const eventId = event.eventId || message.id;
  const domain = event.domain || message.attributes?.domain || 'unknown';
  const eventType = event.eventType || message.attributes?.eventType || 'UNKNOWN';
  const source = event.source || message.attributes?.source || 'unknown';
  const hopCount = event.hopCount || 0;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // --- DEDUP CHECK (Pure Read) ---
    if (await isDuplicate(eventId, client)) {
      await client.query('ROLLBACK');
      dedupCount++;
      console.log(`[DEDUP] ${domain}/${eventType} from ${source} — skipped (duplicate)`);
      message.ack();
      client.release();
      return;
    }

    // --- HOP COUNT CHECK (circular dependency prevention) ---
    if (hopCount > 3) {
      await logDecision({
        eventId, domain, eventType, sourceNode: source,
        decision: 'CIRCULAR_DEPENDENCY', decisionMethod: 'DETERMINISTIC',
        hopCount, outcome: 'DLQ'
      }, client);
      await client.query('COMMIT');
      console.error(`[CIRCULAR] ${domain}/${eventType} — hop_count=${hopCount}, routing to DLQ`);
      message.ack();
      client.release();
      return;
    }

    // --- ROUTE EVENT ---
    const { routeEvent } = require('./routing_engine');
    const result = await routeEvent(event, client, pubsub);

    // --- PERSIST TRANSACTIONAL STATE ---
    // Log the decision
    if (result.decision !== 'SILENT') {
      await logDecision({
        eventId, domain, eventType, sourceNode: source,
        decision: result.decision,
        decisionMethod: result.method,
        targetNode: result.targetNode,
        hopCount, aiReasoning: result.aiReasoning,
        outcome: result.outcome || 'SUCCESS'
      }, client);
    }

    // Mark as processed only AFTER routing succeeds
    await markProcessed(eventId, client);

    await client.query('COMMIT');

    processedCount++;
    if (result.decision !== 'SILENT') {
      console.log(`[ROUTED] ${domain}/${eventType} → ${result.decision} (${result.method})`);

      // ── TASK E2: Relay routing decisions to Command Center Terminal Feed ──
      const ccUrl = process.env.COMMAND_CENTER_URL;
      if (ccUrl) {
        const relayHeaders = { 'Content-Type': 'application/json' };
        if (process.env.SDM_INTERNAL_KEY) {
          relayHeaders['x-sdm-key'] = process.env.SDM_INTERNAL_KEY;
        }
        fetch(`${ccUrl}/api/internal/orchestrator-log`, {
          method: 'POST',
          headers: relayHeaders,
          body: JSON.stringify({
            level: result.outcome === 'FAILED' ? 'error' : result.method === 'AI_FALLBACK' ? 'warning' : 'info',
            agent: 'routing-engine',
            message: `[${result.method}] ${domain}/${eventType} → ${result.decision}${result.targetNode ? ` → ${result.targetNode}` : ''}`,
          }),
        }).then(() => { relayDropCount = 0; }) // W-NET-02: Reset on success
          .catch(() => {
            relayDropCount++;
            if (relayDropCount % 10 === 0) {
              console.warn(`[RELAY] Terminal Feed relay dropped ${relayDropCount} consecutive events. Is COMMAND_CENTER_URL correct? (${ccUrl})`);
            }
          });
      } else if (relayDropCount === 0) {
        // Log only once to avoid log spam
        console.warn('[RELAY] COMMAND_CENTER_URL not set — terminal feed relay disabled');
        relayDropCount = -1; // sentinel to skip future warnings
      }
    }
    
    // Final ACK: Routing and Persistence succeeded
    message.ack();

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    
    // Handle transient DB drop dynamically — fast fail the stream
    if (err.message.includes('ECONNREFUSED') || err.message.includes('terminating connection') || err.code === '57P01' || err.code === '08006') {
      if (pgHealthy) {
        console.error(`[PG FAST-FAIL] Connection lost during processing: ${err.message}`);
        pgHealthy = false;
      }
    } else {
      errorCount++;
      console.error(`[ROUTE ERROR] ${domain}/${eventType}: ${err.message}`);
    }
    // Nack returns message to queue to try again
    message.nack();
  } finally {
    client.release();
  }
}

/**
 * Start streaming pull — messages arrive via event handler.
 */
function startStreaming() {
  if (!pgHealthy) {
    console.log('[SUBSCRIBER] PG unhealthy — delaying streaming start');
    setTimeout(startStreaming, 5000);
    return;
  }

  subscription.on('message', async (message) => {
    if (!pgHealthy) {
      message.nack();
      return;
    }
    await processMessage(message);
  });

  subscription.on('error', (err) => {
    console.error(`[SUBSCRIBER] Subscription error: ${err.message}`);
    errorCount++;
  });

  console.log('[SUBSCRIBER] Streaming pull started — listening for messages');
}

/**
 * PG health check — ping every 30 seconds.
 */
async function checkPgHealth() {
  try {
    await pool.query('SELECT 1');
    if (!pgHealthy) {
      console.log('[PG] Connection restored');
      pgHealthy = true;
    }
  } catch (err) {
    if (pgHealthy) {
      console.error(`[PG] Connection lost: ${err.message}`);
      pgHealthy = false;

      // Fire alert cascade
      try {
        const { fireAlert } = require('./alert_cascade');
        await fireAlert({
          level: 'CRITICAL',
          title: 'SDM PostgreSQL Connection Lost',
          body: `Jade subscriber lost PG connection.\n` +
                `Error: ${err.message}\n` +
                `Events are safe in Pub/Sub (7-day retention).\n` +
                `Processing paused until PG recovers.`
        });
      } catch (_) {}
    }
  }
}

/**
 * Print status every 60 seconds.
 */
function printStatus() {
  console.log(
    `[STATUS] Processed: ${processedCount} | Deduped: ${dedupCount} | ` +
    `Errors: ${errorCount} | PG: ${pgHealthy ? 'HEALTHY' : 'DOWN'}`
  );
}

// --- MAIN ---
async function main() {
  console.log('═'.repeat(60));
  console.log('JADE SUBSCRIBER — Sovereign Domain Mesh');
  console.log('═'.repeat(60));
  console.log(`Dedup window:     ${DEDUP_WINDOW_MS / 1000}s`);
  console.log(`PG health check:  ${PG_HEALTH_INTERVAL_MS / 1000}s`);
  console.log(`Subscription:     jade-sub`);
  console.log(`Project:          ${process.env.GCP_PROJECT_ID}`);
  console.log('═'.repeat(60));

  // Initial PG check
  await checkPgHealth();

  // Start streaming pull
  startStreaming();

  // PG health check
  setInterval(checkPgHealth, PG_HEALTH_INTERVAL_MS);

  // Status reporter
  setInterval(printStatus, 60000);

  // Background Dedup GC (every 5 minutes)
  setInterval(gcDedupTable, 5 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[SUBSCRIBER] Shutting down gracefully...');
    subscription.removeAllListeners();
    printStatus();
    await pool.end();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
