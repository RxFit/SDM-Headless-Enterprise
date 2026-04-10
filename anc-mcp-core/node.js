/**
 * ANC-MCP NODE — Main Entry Point
 * 
 * This is the universal node runner. When you clone anc-mcp-core to
 * create a new worker node (e.g., stripe-node), this file boots the node:
 * 
 * 1. Loads environment config from .env
 * 2. Loads behavioral directives from GitHub (cached)
 * 3. Starts the outbox dispatcher (background event worker)
 * 4. Starts the heartbeat beacon
 * 5. Starts directive polling (15-min check for updates)
 * 6. Calls the node-specific handler (defined in handlers/)
 * 
 * Each cloned node only needs to:
 * - Create a handlers/{node-name}.js with a start() function
 * - Customize the .env with its specific credentials and domain
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { startHeartbeat } = require('./lib/heartbeat');
const { loadDirectives, startDirectivePolling } = require('./lib/directive_loader');
const { dispatchPending } = require('./lib/outbox_dispatcher');
const { enqueueEvent } = require('./lib/outbox_writer');
const express = require('express');

const NODE_NAME = process.env.NODE_NAME || 'unnamed-node';
const POLL_INTERVAL = parseInt(process.env.DISPATCH_POLL_MS || '5000');

// --- W-HTTP-02: SENTINEL HTTP SERVER (STRUCTURAL GUARANTEE) ---
// This MUST execute at module level, BEFORE boot(), so that Cloud Run
// liveness probes pass even if boot() throws an uncaught exception.
const app = express();
app.use(express.json());
const sentinelPort = parseInt(process.env.PORT || '8080');
app.get('/', (req, res) => res.send(`${NODE_NAME} Sentinel Online`));
app.get('/health', (req, res) => res.json({ status: 'ok', node: NODE_NAME, uptime: process.uptime() }));
app.listen(sentinelPort, '0.0.0.0', () => {
  console.log(`[SENTINEL] Listening on 0.0.0.0:${sentinelPort} — Cloud Run Liveness Probe LIVE`);
});

async function boot() {
  console.log('═'.repeat(60));
  console.log(`  ANC-MCP NODE: ${NODE_NAME}`);
  console.log(`  Domain:       ${process.env.NODE_DOMAIN || 'unset'}`);
  console.log(`  Orchestrator: ${process.env.ORCHESTRATOR_TOPIC || 'none (local mode)'}`);
  console.log('═'.repeat(60));

  // Step 1: Load directives from GitHub
  const directives = await loadDirectives();
  if (directives) {
    console.log(`[BOOT] Directives loaded: ${Object.keys(directives).length} rules`);
  }

  // Step 2: Start the outbox dispatcher
  console.log(`[BOOT] Starting outbox dispatcher (${POLL_INTERVAL / 1000}s poll)`);
  setInterval(() => {
    dispatchPending().catch(err => console.error('[OUTBOX FATAL]', err.message));
  }, POLL_INTERVAL);
  dispatchPending().catch(err => console.error('[OUTBOX FATAL]', err.message));

  // Step 3: Start heartbeat
  startHeartbeat();

  // Step 4: Start directive polling
  startDirectivePolling(enqueueEvent);

  // Step 5: Load and run the node-specific handler
  const handlerPath = `./handlers/${NODE_NAME}`;
  try {
    const handler = require(handlerPath);
    if (typeof handler.start === 'function') {
      console.log(`[BOOT] Starting handler: ${handlerPath}`);
      await handler.start({ directives, enqueueEvent, app });
    } else {
      console.log(`[BOOT] Handler loaded but has no start() function: ${handlerPath}`);
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log(`[BOOT] No handler found at ${handlerPath} — running as skeleton node`);
    } else {
      console.error(`[BOOT] Handler error: ${err.message}`);
    }
  }

  // Emit boot event
  await enqueueEvent({
    domain: 'infrastructure',
    eventType: 'NODE_BOOTED',
    payload: {
      nodeId: NODE_NAME,
      directivesVersion: directives?.version || 'none',
      bootTime: new Date().toISOString(),
    },
  });

  console.log(`\n[${NODE_NAME}] Node is LIVE ✓\n`);
}

// --- Graceful shutdown ---
process.on('SIGINT', async () => {
  console.log(`\n[${NODE_NAME}] Shutting down...`);
  try {
    await enqueueEvent({
      domain: 'infrastructure',
      eventType: 'NODE_SHUTDOWN',
      payload: { nodeId: NODE_NAME, reason: 'SIGINT' },
    });
  } catch (_) {}
  process.exit(0);
});

boot().catch(err => {
  console.error(`[${NODE_NAME}] BOOT ERROR (Non-fatal — Sentinel still alive):`, err.message);
});
