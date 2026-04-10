/**
 * OUTBOX WRITER — Transactional Event Enqueue (Production)
 * 
 * Extracted from validated MVP (RxFit-MCP/automation/outbox_writer.js).
 * 
 * Changes from MVP:
 * - Uses event_schema for validation
 * - All credentials from .env (no hardcoded defaults)
 * - Validates required env vars on load
 */

const { Pool } = require('pg');
const { createEvent } = require('./event_schema');

// Validate required env vars
const required = ['PG_HOST', 'PG_DATABASE', 'PG_WRITE_USER', 'PG_WRITE_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[OUTBOX WRITER] Missing required env var: ${key}. Copy .env.example to .env and fill in values.`);
  }
}

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_WRITE_USER,
  password: process.env.PG_WRITE_PASSWORD,
  max: 3,
});

/**
 * Enqueue a domain-routed event into the transactional outbox.
 * 
 * @param {Object} opts - Same as createEvent: { domain, eventType, payload, target, source }
 * @returns {Promise<{event_id: string, created_at: string}>}
 */
async function enqueueEvent(opts) {
  const event = createEvent(opts);

  // Safe serialization — handle circular references gracefully
  let safePayload;
  try {
    safePayload = JSON.stringify(event.payload);
    JSON.parse(safePayload); // Round-trip validation
  } catch (err) {
    safePayload = JSON.stringify({
      _serialization_error: err.message,
      _keys: Object.keys(event.payload || {}),
    });
  }

  const query = `
    INSERT INTO event_outbox (event_id, source, target, domain, event_type, payload, schema_version)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    RETURNING event_id, created_at
  `;
  const result = await pool.query(query, [
    event.eventId,
    event.source,
    event.target,
    event.domain,
    event.eventType,
    safePayload,
    event.schemaVersion,
  ]);
  return result.rows[0];
}

module.exports = { enqueueEvent, pool };
