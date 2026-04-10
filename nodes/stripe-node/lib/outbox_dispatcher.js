/**
 * OUTBOX DISPATCHER — Background Event Worker (Production)
 * 
 * Extracted from validated MVP (RxFit-MCP/automation/outbox_dispatcher.js).
 * 
 * Changes from MVP:
 * - Dispatches to GCP Pub/Sub instead of console.log
 * - Falls back to console.log if Pub/Sub is not configured (local dev)
 * - All credentials from .env
 * - Dead Letter logic: 5 retries then FAILED
 */

const { Pool } = require('pg');

// Lazy-load Pub/Sub — only initialized if GCP credentials exist
let pubsubClient = null;
let pubsubTopic = null;

function initPubSub() {
  if (pubsubClient) return true;

  const projectId = process.env.GCP_PROJECT_ID;
  const topicName = process.env.ORCHESTRATOR_TOPIC;

  if (!projectId || !topicName || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('[DISPATCHER] No Pub/Sub config — dispatching to console.log (local dev mode)');
    return false;
  }

  try {
    const { PubSub } = require('@google-cloud/pubsub');
    pubsubClient = new PubSub({ projectId });
    pubsubTopic = pubsubClient.topic(topicName);
    console.log(`[DISPATCHER] Pub/Sub connected → topic: ${topicName}`);
    return true;
  } catch (err) {
    console.error(`[DISPATCHER] Pub/Sub init failed: ${err.message} — falling back to console.log`);
    return false;
  }
}

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
  max: 3,
});

const MAX_RETRIES = 5;
const POLL_INTERVAL_MS = parseInt(process.env.DISPATCH_POLL_MS || '5000');
const BATCH_SIZE = 20;

async function dispatchPending() {
  const pending = await pool.query(
    `SELECT * FROM event_outbox WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT $1`,
    [BATCH_SIZE]
  );

  if (pending.rows.length === 0) return;

  const hasPubSub = initPubSub();

  for (const event of pending.rows) {
    try {
      if (hasPubSub && pubsubTopic) {
        // === PRODUCTION: Publish to GCP Pub/Sub ===
        const messageData = JSON.stringify({
          eventId: event.event_id,
          source: event.source,
          target: event.target,
          domain: event.domain,
          eventType: event.event_type,
          payload: event.payload,
          schemaVersion: event.schema_version || '1.0',
          timestamp: event.created_at,
        });

        await pubsubTopic.publishMessage({
          data: Buffer.from(messageData),
          attributes: {
            domain: event.domain,
            eventType: event.event_type,
            source: event.source,
            target: event.target || '',
          },
        });

        console.log(`[PUBSUB] ${event.domain}/${event.event_type} → ${event.target || 'orchestrator'}`);
      } else {
        // === LOCAL DEV: Console dispatch ===
        console.log(
          `[DISPATCH] ${event.domain}/${event.event_type} → ${event.target || 'broadcast'}`,
          JSON.stringify(event.payload)
        );
      }

      await pool.query(
        `UPDATE event_outbox SET status = 'DISPATCHED', dispatched_at = NOW() WHERE id = $1`,
        [event.id]
      );
    } catch (err) {
      const retries = event.retry_count + 1;
      const newStatus = retries >= MAX_RETRIES ? 'FAILED' : 'PENDING';
      await pool.query(
        `UPDATE event_outbox SET status = $1, retry_count = $2, error_message = $3 WHERE id = $4`,
        [newStatus, retries, err.message, event.id]
      );
      console.error(`[OUTBOX FAIL] Event ${event.event_id}: ${err.message} (retry ${retries}/${MAX_RETRIES})`);
    }
  }
}

// --- MAIN ---
if (require.main === module) {
  require('dotenv').config();
  console.log(`[OUTBOX] Dispatcher running (${POLL_INTERVAL_MS / 1000}s poll, batch=${BATCH_SIZE}, max_retries=${MAX_RETRIES})`);

  dispatchPending().catch(err => console.error('[OUTBOX FATAL]', err.message));

  setInterval(() => {
    dispatchPending().catch(err => console.error('[OUTBOX FATAL]', err.message));
  }, POLL_INTERVAL_MS);
}

module.exports = { dispatchPending, pool };
