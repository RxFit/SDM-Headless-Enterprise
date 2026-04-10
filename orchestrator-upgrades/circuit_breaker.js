/**
 * CIRCUIT BREAKER — Rate Limiter for the Sovereign Domain Mesh
 * 
 * Tracks API calls and node executions per hour. If thresholds are
 * exceeded, halts the mesh and fires the multi-channel alert cascade.
 * 
 * Placed in: Sovereign_Domain_Mesh/orchestrator-upgrades/
 * Integrated into: RxFit-MCP (Jade's toolset)
 */

const { enqueueEvent } = require('./alert_cascade');

// --- CONFIGURATION ---
const WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const DEFAULT_THRESHOLDS = {
  apiCalls: parseInt(process.env.CB_MAX_API_CALLS || '500'),
  nodeExecutions: parseInt(process.env.CB_MAX_NODE_EXECUTIONS || '200'),
  enclaveSpawns: parseInt(process.env.CB_MAX_ENCLAVE_SPAWNS || '50'),
};

// --- STATE ---
const counters = {
  apiCalls: [],       // timestamps of API calls in the window
  nodeExecutions: [], // timestamps of node executions
  enclaveSpawns: [],  // timestamps of enclave spawns
};

let meshHalted = false;

/**
 * Prune timestamps older than the window.
 */
function pruneWindow(timestamps) {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

/**
 * Record an event and check if the circuit should trip.
 * @param {'apiCalls'|'nodeExecutions'|'enclaveSpawns'} type
 * @returns {{ tripped: boolean, count: number, threshold: number }}
 */
function record(type) {
  if (!counters[type]) {
    throw new Error(`Unknown counter type: ${type}`);
  }

  counters[type].push(Date.now());
  pruneWindow(counters[type]);

  const count = counters[type].length;
  const threshold = DEFAULT_THRESHOLDS[type];

  if (count >= threshold && !meshHalted) {
    meshHalted = true;
    triggerHalt(type, count, threshold);
    return { tripped: true, count, threshold };
  }

  return { tripped: false, count, threshold };
}

/**
 * Halt the mesh and fire alerts.
 */
async function triggerHalt(type, count, threshold) {
  console.error(`\n[CIRCUIT BREAKER] ═══ MESH HALTED ═══`);
  console.error(`  Trigger: ${type} reached ${count}/${threshold} in the last hour`);
  console.error(`  Time: ${new Date().toISOString()}`);
  console.error(`  Action: All mesh operations suspended\n`);

  try {
    await require('./alert_cascade').fireAlert({
      level: 'CRITICAL',
      title: 'CIRCUIT BREAKER TRIPPED — MESH HALTED',
      body: `The Sovereign Domain Mesh has been automatically halted.\n\n` +
            `Trigger: ${type} exceeded threshold (${count}/${threshold} per hour).\n` +
            `Time: ${new Date().toISOString()}\n\n` +
            `All mesh operations are suspended until manual reset.`,
    });
  } catch (err) {
    console.error(`[CIRCUIT BREAKER] Alert cascade failed: ${err.message}`);
  }
}

/**
 * Check if the mesh is currently halted.
 */
function isHalted() {
  return meshHalted;
}

/**
 * Manually reset the circuit breaker (after human review).
 */
function reset() {
  meshHalted = false;
  counters.apiCalls = [];
  counters.nodeExecutions = [];
  counters.enclaveSpawns = [];
  console.log('[CIRCUIT BREAKER] Reset — mesh operations resumed');
}

/**
 * Get current status snapshot.
 */
function getStatus() {
  pruneWindow(counters.apiCalls);
  pruneWindow(counters.nodeExecutions);
  pruneWindow(counters.enclaveSpawns);

  return {
    halted: meshHalted,
    apiCalls: { count: counters.apiCalls.length, threshold: DEFAULT_THRESHOLDS.apiCalls },
    nodeExecutions: { count: counters.nodeExecutions.length, threshold: DEFAULT_THRESHOLDS.nodeExecutions },
    enclaveSpawns: { count: counters.enclaveSpawns.length, threshold: DEFAULT_THRESHOLDS.enclaveSpawns },
  };
}

module.exports = { record, isHalted, reset, getStatus };
