/**
 * MUTUAL WATCHDOG — Jade ↔ Antigravity Health Monitor
 * 
 * Solves F-06 (Jade as SPOF). Both orchestrators monitor each other.
 * If Jade goes down, Antigravity takes over alerting.
 * If Antigravity goes down, Jade alerts Danny.
 * 
 * How it works:
 * - Each orchestrator sends heartbeats to the other via event_outbox
 * - Each maintains a last-seen timestamp for its counterpart
 * - If 3 heartbeats are missed (90s), the surviving orchestrator fires alerts
 */

const HEARTBEAT_INTERVAL = 30000; // 30s
const DEAD_THRESHOLD = 90000;     // 3 missed beats = 90s

// Track heartbeats from the partner orchestrator
const partnerStatus = {
  partnerId: null,
  lastSeen: null,
  alive: true,
};

/**
 * Initialize the watchdog for a given partner.
 * 
 * @param {Object} opts
 * @param {string} opts.selfId       - This orchestrator's ID ('jade' or 'antigravity')
 * @param {string} opts.partnerId    - The counterpart's ID
 * @param {Function} opts.enqueueEvent - The outbox writer function
 * @param {Function} opts.onPartnerDead - Callback when partner is declared dead
 */
function startWatchdog({ selfId, partnerId, enqueueEvent, onPartnerDead }) {
  partnerStatus.partnerId = partnerId;

  console.log(`[WATCHDOG] ${selfId} monitoring ${partnerId} (${HEARTBEAT_INTERVAL / 1000}s interval, ${DEAD_THRESHOLD / 1000}s dead threshold)`);

  // Send our own heartbeat to the partner
  const sendBeat = async () => {
    try {
      await enqueueEvent({
        domain: 'infrastructure',
        eventType: 'ORCHESTRATOR_HEARTBEAT',
        payload: {
          orchestratorId: selfId,
          timestamp: new Date().toISOString(),
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        target: partnerId,
        source: selfId,
      });
    } catch (err) {
      console.error(`[WATCHDOG] Failed to send heartbeat: ${err.message}`);
    }
  };

  // Check if the partner is alive
  const checkPartner = () => {
    if (partnerStatus.lastSeen === null) return; // Haven't received first beat yet

    const elapsed = Date.now() - partnerStatus.lastSeen;
    if (elapsed > DEAD_THRESHOLD && partnerStatus.alive) {
      partnerStatus.alive = false;
      console.error(`\n[WATCHDOG] ═══ ${partnerId.toUpperCase()} DECLARED DEAD ═══`);
      console.error(`  Last seen: ${new Date(partnerStatus.lastSeen).toISOString()}`);
      console.error(`  Elapsed: ${Math.floor(elapsed / 1000)}s (threshold: ${DEAD_THRESHOLD / 1000}s)\n`);

      if (typeof onPartnerDead === 'function') {
        onPartnerDead(partnerId, elapsed);
      }
    }
  };

  // Start loops
  sendBeat();
  setInterval(sendBeat, HEARTBEAT_INTERVAL);
  setInterval(checkPartner, HEARTBEAT_INTERVAL);

  return { partnerStatus };
}

/**
 * Call this when a heartbeat is received from the partner.
 * (Hooked into the Pub/Sub subscriber or outbox reader)
 */
function recordPartnerHeartbeat(partnerId) {
  if (partnerStatus.partnerId === partnerId) {
    partnerStatus.lastSeen = Date.now();
    if (!partnerStatus.alive) {
      partnerStatus.alive = true;
      console.log(`[WATCHDOG] ${partnerId} is back online`);
    }
  }
}

/**
 * Get watchdog status.
 */
function getStatus() {
  return {
    partnerId: partnerStatus.partnerId,
    partnerAlive: partnerStatus.alive,
    lastSeen: partnerStatus.lastSeen ? new Date(partnerStatus.lastSeen).toISOString() : null,
    timeSinceLastBeat: partnerStatus.lastSeen ? Date.now() - partnerStatus.lastSeen : null,
  };
}

module.exports = { startWatchdog, recordPartnerHeartbeat, getStatus };
