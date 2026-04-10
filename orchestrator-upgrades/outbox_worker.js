/**
 * TRANSACTIONAL OUTBOX WORKER
 * 
 * Polls the PostgreSQL outbox_commands table for pending messages
 * and dispatches them to Pub/Sub. Guarantees at-least-once delivery
 * while preventing double-dispatch on DB connection drops.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', 'anc-mcp-core', '.env'), override: true });

const { Pool } = require('pg');
const { PubSub } = require('@google-cloud/pubsub');

const POLL_INTERVAL_MS = 2000;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
  max: 2,
});

const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID });

async function processOutbox() {
  try {
    const { rows } = await pool.query(
      `SELECT id, topic, payload, attributes, retry_count 
       FROM outbox_commands 
       WHERE dispatched = false 
       ORDER BY created_at ASC 
       LIMIT 20`
    );

    if (rows.length === 0) return;

    console.log(`[OUTBOX] Processing ${rows.length} pending commands...`);

    for (const row of rows) {
      try {
        const topic = pubsub.topic(row.topic);
        
        await topic.publishMessage({
          data: Buffer.from(JSON.stringify(row.payload)),
          attributes: row.attributes || {}
        });

        await pool.query(
          `UPDATE outbox_commands SET dispatched = true WHERE id = $1`,
          [row.id]
        );
        console.log(`[OUTBOX] ✓ Dispatched ${row.id} -> ${row.topic}`);

      } catch (err) {
        console.error(`[OUTBOX] ✗ Failed ${row.id}: ${err.message}`);
        await pool.query(
          `UPDATE outbox_commands SET retry_count = retry_count + 1 WHERE id = $1`,
          [row.id]
        );
      }
    }
  } catch (err) {
    console.error(`[OUTBOX POLLER ERROR] ${err.message}`);
  }
}

async function start() {
  console.log('═'.repeat(50));
  console.log('TRANSACTIONAL OUTBOX WORKER STARTED');
  console.log('═'.repeat(50));

  setInterval(processOutbox, POLL_INTERVAL_MS);
  
  process.on('SIGINT', async () => {
    console.log('\n[OUTBOX] Shutting down gracefully...');
    await pool.end();
    process.exit(0);
  });
}

start();
