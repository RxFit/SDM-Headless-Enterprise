/**
 * HEARTBEAT — HTTP-Only Node Health Beacon for pubsub-bridge
 * 
 * Simplified version of crm-node/lib/heartbeat.js.
 * pubsub-bridge has no local PG connection, so this uses HTTP-only path
 * to report health to the Command Center.
 * 
 * The Command Center upserts webhook_health on each beat.
 * After 5 minutes of silence, the Silent Detector flags the node as SILENT.
 */

const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000');
const nodeName = process.env.NODE_NAME || 'sdm-pubsub-bridge';
const COMMAND_CENTER_URL = process.env.COMMAND_CENTER_URL || '';
const SDM_INTERNAL_KEY = process.env.SDM_INTERNAL_KEY || '';
let startTime = Date.now();
let _consecutiveHttpFailures = 0;

/**
 * Send heartbeat via HTTP to Command Center.
 * Silently degrades after 3 consecutive failures to avoid log spam.
 */
async function sendHttpHeartbeat() {
  if (!COMMAND_CENTER_URL) {
    return; // No URL configured — skip
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

    if (_consecutiveHttpFailures > 0) {
      console.log(`[HEARTBEAT] HTTP heartbeat recovered after ${_consecutiveHttpFailures} failures`);
    }
    _consecutiveHttpFailures = 0;
  } catch (err) {
    _consecutiveHttpFailures++;
    if (_consecutiveHttpFailures <= 3 || _consecutiveHttpFailures % 10 === 0) {
      console.error(`[HEARTBEAT] HTTP POST failed (${_consecutiveHttpFailures}x): ${err.message}`);
    }
  }
}

/**
 * Start the heartbeat loop.
 */
function startHeartbeat() {
  startTime = Date.now();
  const httpEnabled = COMMAND_CENTER_URL ? 'YES' : 'NO (no COMMAND_CENTER_URL)';
  console.log(`[HEARTBEAT] ${nodeName} — every ${HEARTBEAT_INTERVAL / 1000}s | HTTP→CC: ${httpEnabled}`);
  sendHttpHeartbeat(); // Immediate first beat
  return setInterval(sendHttpHeartbeat, HEARTBEAT_INTERVAL);
}

module.exports = { startHeartbeat };
