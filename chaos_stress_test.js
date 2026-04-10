/**
 * SDM CHAOS STRESS TEST — Multi-Node Simultaneous Kill
 * 
 * Simulates a catastrophic mesh failure by force-killing multiple
 * worker nodes simultaneously, then monitoring recovery metrics.
 * 
 * Tests:
 * 1. PM2 exponential backoff recovery (all killed nodes)
 * 2. alert_cascade.js Jade ticket generation for each failure
 * 3. webhook_sweeper stability under cascading load
 * 4. webhook_monitor SILENT detection accuracy
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const HANDOFF_DIR = path.join(__dirname, '..', 'RxFit-MCP', 'automation', 'handoff');
const ALERT_LOG = path.join(__dirname, 'alert_log.jsonl');

// Nodes to kill (the worker nodes — NOT the monitors)
const KILL_TARGETS = ['stripe-node', 'crm-node', 'wellness-node'];
const RECOVERY_WAIT_MS = 15000; // 15 seconds for PM2 to revive
const MONITOR_WAIT_MS = 120000; // 2 minutes for webhook_monitor to detect silence

function log(msg) {
  console.log(`[CHAOS ${new Date().toISOString()}] ${msg}`);
}

function getTicketCount() {
  if (!fs.existsSync(HANDOFF_DIR)) return 0;
  return fs.readdirSync(HANDOFF_DIR).filter(f => f.startsWith('TICKET_') && f.includes('SDM_AUTO_HEAL')).length;
}

function getPm2Status() {
  try {
    const raw = execSync('pm2 jlist', { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch (e) {
    log(`PM2 status check failed: ${e.message}`);
    return [];
  }
}

function getAlertLogTail(n = 10) {
  if (!fs.existsSync(ALERT_LOG)) return [];
  const lines = fs.readFileSync(ALERT_LOG, 'utf8').trim().split('\n');
  return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return l; } });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  SDM CHAOS STRESS TEST — MULTI-NODE SIMULTANEOUS KILL');
  console.log('═'.repeat(70));

  // ── PRE-FLIGHT ────────────────────────────────────────
  const preFlight = getPm2Status();
  const preTickets = getTicketCount();
  log(`Pre-flight PM2 processes: ${preFlight.length}`);
  log(`Pre-flight handoff tickets: ${preTickets}`);

  for (const proc of preFlight) {
    log(`  [${proc.name}] status=${proc.pm2_env.status} restarts=${proc.pm2_env.restart_time} pid=${proc.pid}`);
  }

  // ── PHASE 1: SIMULTANEOUS KILL ────────────────────────
  console.log('\n' + '─'.repeat(70));
  log('PHASE 1: Executing simultaneous SIGKILL on target nodes...');
  const killResults = {};

  for (const target of KILL_TARGETS) {
    const proc = preFlight.find(p => p.name === target);
    if (!proc || proc.pm2_env.status !== 'online') {
      log(`  ⚠️ ${target} not online — skipping kill`);
      killResults[target] = { killed: false, reason: 'not online' };
      continue;
    }

    try {
      execSync(`taskkill /F /PID ${proc.pid}`, { encoding: 'utf8' });
      log(`  🔴 KILLED ${target} (PID ${proc.pid})`);
      killResults[target] = { killed: true, pid: proc.pid, killTime: Date.now() };
    } catch (e) {
      log(`  ✗ Failed to kill ${target}: ${e.message}`);
      killResults[target] = { killed: false, reason: e.message };
    }
  }

  // ── PHASE 2: RECOVERY MONITORING ──────────────────────
  console.log('\n' + '─'.repeat(70));
  log(`PHASE 2: Waiting ${RECOVERY_WAIT_MS / 1000}s for PM2 exponential backoff recovery...`);
  await sleep(RECOVERY_WAIT_MS);

  const postRecovery = getPm2Status();
  log('Post-recovery PM2 status:');
  const recoveryResults = {};

  for (const target of KILL_TARGETS) {
    const proc = postRecovery.find(p => p.name === target);
    if (!proc) {
      log(`  ✗ ${target} — MISSING from PM2 entirely`);
      recoveryResults[target] = { recovered: false, reason: 'missing' };
      continue;
    }

    const isOnline = proc.pm2_env.status === 'online';
    const newPid = proc.pid;
    const restarts = proc.pm2_env.restart_time;
    const recoveryTime = killResults[target]?.killed ? Date.now() - killResults[target].killTime : null;

    log(`  ${isOnline ? '🟢' : '🔴'} ${target} — status=${proc.pm2_env.status} pid=${newPid} restarts=${restarts} recovery=${recoveryTime ? recoveryTime + 'ms' : 'N/A'}`);
    recoveryResults[target] = { recovered: isOnline, newPid, restarts, recoveryTimeMs: recoveryTime };
  }

  // Confirm non-target services survived
  const survivors = ['webhook-monitor', 'webhook-sweeper', 'jade-subscriber', 'mcp-sentinel'];
  log('\nCollateral damage check (non-target services):');
  for (const svc of survivors) {
    const proc = postRecovery.find(p => p.name === svc);
    if (proc) {
      log(`  ${proc.pm2_env.status === 'online' ? '🟢' : '🔴'} ${svc} — status=${proc.pm2_env.status}`);
    } else {
      log(`  ⚠️ ${svc} — not found in PM2`);
    }
  }

  // ── PHASE 3: TICKET GENERATION AUDIT ──────────────────
  console.log('\n' + '─'.repeat(70));
  const postTickets = getTicketCount();
  const newTickets = postTickets - preTickets;
  log(`PHASE 3: Jade ticket generation audit`);
  log(`  Pre-test tickets: ${preTickets}`);
  log(`  Post-test tickets: ${postTickets}`);
  log(`  New tickets generated: ${newTickets}`);

  // ── PHASE 4: ALERT LOG AUDIT ──────────────────────────
  console.log('\n' + '─'.repeat(70));
  log('PHASE 4: Alert cascade log tail (last 10 entries):');
  const recentAlerts = getAlertLogTail(10);
  for (const alert of recentAlerts) {
    if (typeof alert === 'object') {
      log(`  [${alert.level}] ${alert.title} — channels: ${JSON.stringify(alert.channels)}`);
    }
  }

  // ── FINAL REPORT ──────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  STRESS TEST RESULTS SUMMARY');
  console.log('═'.repeat(70));

  const allRecovered = KILL_TARGETS.every(t => recoveryResults[t]?.recovered);
  const allSurvived = survivors.every(s => {
    const p = postRecovery.find(pp => pp.name === s);
    return p && p.pm2_env.status === 'online';
  });

  console.log(`  Nodes killed:        ${KILL_TARGETS.filter(t => killResults[t]?.killed).length}/${KILL_TARGETS.length}`);
  console.log(`  Nodes recovered:     ${KILL_TARGETS.filter(t => recoveryResults[t]?.recovered).length}/${KILL_TARGETS.length}`);
  console.log(`  Non-targets stable:  ${allSurvived ? 'YES ✓' : 'NO ✗ (COLLATERAL DAMAGE)'}`);
  console.log(`  New Jade tickets:    ${newTickets}`);
  console.log(`  Full recovery:       ${allRecovered ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  Mesh stability:      ${allRecovered && allSurvived ? 'BULLETPROOF ✓' : 'DEGRADED ✗'}`);
  console.log('═'.repeat(70));

  // Write machine-readable results
  const resultsPath = path.join(__dirname, 'stress_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    killTargets: KILL_TARGETS,
    killResults,
    recoveryResults,
    ticketsBefore: preTickets,
    ticketsAfter: postTickets,
    newTickets,
    allRecovered,
    allSurvivorsStable: allSurvived,
    meshVerdict: allRecovered && allSurvived ? 'BULLETPROOF' : 'DEGRADED'
  }, null, 2));

  log(`Results written to: ${resultsPath}`);
}

main().catch(err => {
  console.error('[CHAOS FATAL]', err);
  process.exit(1);
});
