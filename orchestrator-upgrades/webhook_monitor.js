/**
 * SDM Webhook Health Monitor
 * 
 * Runs as a standalone PM2 background service.
 * Periodically scans the `webhook_health` table to detect nodes
 * that have stopped sending `NODE_ALIVE` heartbeats.
 * 
 * If a node is silent for > 90 seconds (3 missed heartbeats),
 * it fires a CRITICAL alert cascade and marks it SILENT.
 * When the heartbeat returns, it fires an INFO alert and marks it HEALTHY.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', 'anc-mcp-core', '.env'), override: true });
const { Pool } = require('pg');
const { fireAlert } = require('./alert_cascade');

const POLL_INTERVAL_MS = 30000;
const SILENCE_THRESHOLD_MS = 90000;
const FLAP_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

// Connect to the brain DB
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
});

async function checkHealth() {
  try {
    const { rows } = await pool.query('SELECT * FROM webhook_health');
    const now = new Date();

    for (const row of rows) {
      try {
        const lastSeen = new Date(row.last_received_at);
        const lastUpdated = new Date(row.updated_at);
        const isSilent = (now - lastSeen) > SILENCE_THRESHOLD_MS;

        if (isSilent && row.status !== 'SILENT') {
          // Check for flapping (recently recovered then died again)
          const isFlapping = (row.status === 'HEALTHY' && (now - lastUpdated) < FLAP_DEBOUNCE_MS);

          if (isFlapping) {
            console.log(`[MONITOR] ⚠️ Node ${row.node_name} is FLAPPING (died within 5 mins of recovery)`);
            await pool.query(
              `UPDATE webhook_health 
               SET status = 'SILENT', updated_at = NOW() 
               WHERE node_name = $1`,
              [row.node_name]
            );
            // Throttle alert cascade
            await fireAlert({
              level: 'WARNING',
              title: `[SDM] Node Flapping: ${row.node_name}`,
              body: `The mesh worker node '${row.node_name}' is caught in a fast-restart loop. Suppressing further CRITICAL alerts for this node.`
            });
          } else {
            console.log(`[MONITOR] 🔴 Node ${row.node_name} went SILENT (last seen ${Math.round((now - lastSeen)/1000)}s ago)`);
            await pool.query(
              `UPDATE webhook_health 
               SET status = 'SILENT', alert_sent = true, updated_at = NOW() 
               WHERE node_name = $1`,
              [row.node_name]
            );
            await fireAlert({
              level: 'CRITICAL',
              title: `[SDM] Node Offline: ${row.node_name}`,
              body: `The mesh worker node '${row.node_name}' has missed 3 consecutive node heartbeats.\nLast seen: ${lastSeen.toISOString()}\n\nPlease check PM2 status and logs: \npm2 logs ${row.node_name}`
            });
          }

        } else if (!isSilent && row.status !== 'HEALTHY') {
          console.log(`[MONITOR] 🟢 Node ${row.node_name} RECOVERED`);
          await pool.query(
            `UPDATE webhook_health 
             SET status = 'HEALTHY', alert_sent = false, updated_at = NOW() 
             WHERE node_name = $1`,
            [row.node_name]
          );
          await fireAlert({
            level: 'INFO',
            title: `[SDM] Node Recovered: ${row.node_name}`,
            body: `The mesh worker node '${row.node_name}' has restored its heartbeat connection and is processing events normally again.`
          });
        }
      } catch (rowErr) {
        // Isolate failure so one broken webhook/db row doesn't kill the mesh monitor
        console.error(`[MONITOR ERROR] Failed processing node ${row.node_name}: ${rowErr.message}`);
      }
    }
  } catch (err) {
    console.error(`[MONITOR ERROR] ${err.message}`);
  }
}

async function boot() {
  console.log('═'.repeat(60));
  console.log('  SDM WEBHOOK HEALTH MONITOR');
  console.log('═'.repeat(60));
  console.log(`  Poll Interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`  Silence Threshold: ${SILENCE_THRESHOLD_MS / 1000}s`);
  console.log('═'.repeat(60));

  // Initial check
  await checkHealth();

  // Polling loop
  setInterval(checkHealth, POLL_INTERVAL_MS);
}

process.on('SIGINT', async () => {
  console.log('\n[MONITOR] Shutting down...');
  await pool.end();
  process.exit(0);
});

boot().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
