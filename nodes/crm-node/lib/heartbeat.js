/**
 * HEARTBEAT — Outbound Node Health Beacon (B1 Pipeline Wiring)
 * 
 * Dual-path heartbeat:
 * 1. Publishes NODE_ALIVE event to the outbox (local PG → Pub/Sub)
 * 2. POSTs directly to Command Center /api/internal/heartbeat (HTTP)
 * 
 * Path 2 is the PRIMARY mechanism for dashboard visibility.
 * Path 1 is retained for eventual Pub/Sub → routing-engine processing.
 * 
 * The Command Center upserts webhook_health on each beat.
 * After 3 missed beats (90s), the webhook_monitor flags the node as OFFLINE.
 */

const { enqueueEvent } = require('./outbox_writer');

const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000');
const nodeName = process.env.NODE_NAME || 'unknown-node';
const COMMAND_CENTER_URL = process.env.COMMAND_CENTER_URL || '';
const SDM_INTERNAL_KEY = process.env.SDM_INTERNAL_KEY || '';
let startTime = Date.now();
let _consecutiveHttpFailures = 0;

/**
 * Send heartbeat via HTTP to Command Center (primary path).
 * Silently degrades after 3 consecutive failures to avoid log spam.
 */
async function sendHttpHeartbeat() {
  if (!COMMAND_CENTER_URL) {
    // No URL configured — skip (local dev mode)
    return;
  }

  const url = `${COMMAND_CENTER_URL}/api/internal/heartbeat`;
  const payload = {
    nodeName,
    status: 'HEALTHY',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sdm-key': SDM_INTERNAL_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
    }

    // Reset failure counter on success
    if (_consecutiveHttpFailures > 0) {
      console.log(`[HEARTBEAT] HTTP heartbeat recovered after ${_consecutiveHttpFailures} failures`);
    }
    _consecutiveHttpFailures = 0;
  } catch (err) {
    _consecutiveHttpFailures++;
    // Only log first 3 failures, then throttle to every 10th
    if (_consecutiveHttpFailures <= 3 || _consecutiveHttpFailures % 10 === 0) {
      console.error(`[HEARTBEAT] HTTP POST failed (${_consecutiveHttpFailures}x): ${err.message}`);
    }
  }
}

/**
 * Send heartbeat via outbox (secondary path — local PG → Pub/Sub).
 */
async function sendOutboxHeartbeat() {
  try {
    await enqueueEvent({
      domain: 'infrastructure',
      eventType: 'NODE_ALIVE',
      payload: {
        nodeId: nodeName,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Outbox write failure is non-fatal — HTTP path is primary
    console.error(`[HEARTBEAT] Outbox enqueue failed: ${err.message}`);
  }
}

async function sendHeartbeat() {
  // Fire both paths concurrently — HTTP is primary, outbox is secondary
  await Promise.allSettled([
    sendHttpHeartbeat(),
    sendOutboxHeartbeat(),
  ]);
}

/**
 * Start the heartbeat loop.
 */
function startHeartbeat() {
  startTime = Date.now();
  const httpEnabled = COMMAND_CENTER_URL ? 'YES' : 'NO (no COMMAND_CENTER_URL)';
  console.log(`[HEARTBEAT] ${nodeName} — every ${HEARTBEAT_INTERVAL / 1000}s | HTTP→CC: ${httpEnabled}`);
  sendHeartbeat(); // Immediate first beat
  return setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

/**
 * Send a single heartbeat (for CLI health check).
 */
async function sendOnce() {
  await sendHeartbeat();
  console.log(`[HEARTBEAT] Sent for ${nodeName}`);
}

module.exports = { startHeartbeat, sendOnce };
