const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Attempt to load legacy DB connection — optional on Cloud Run
let db, schema;
try {
  ({ db, schema } = require('../../../anc-mcp-core/db/connection'));
} catch (e) {
  console.warn('[GHL_WEBHOOK] Legacy DB connection not available — using outbox-only mode');
}

router.post('/ghl', async (req, res) => {
  const payload = req.body || {};
  
  // Extract event data
  const eventType = payload.type || 'UNKNOWN';
  const contactId = payload.contact_id || payload.id || null;
  
  // Generate an idempotency key using the native event ID or falling back to a SHA256 content hash
  const idempotencyKey = payload.event_id || 
    crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  try {
    // If legacy DB is available, upsert into client_events
    if (db && schema?.clientEvents) {
      await db.insert(schema.clientEvents)
        .values({
          ghlContactId: contactId ? String(contactId) : null,
          eventType,
          payload,
          idempotencyKey,
          source: 'ghl_webhook'
        })
        .onConflictDoNothing({ target: schema.clientEvents.idempotencyKey });
    }
      
    console.log(`[WEBHOOK] Ingested GHL Event: ${eventType} (Contact: ${contactId})`);
    
    // Emit to Orchestrator Dashboard Terminal Feed (fire-and-forget)
    try {
      const CC_URL = process.env.COMMAND_CENTER_URL || 'http://localhost:5000';
      fetch(`${CC_URL}/api/internal/orchestrator-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'info',
          agent: 'crm-node',
          message: `GHL Webhook: ${eventType} (Contact: ${contactId || 'N/A'})`,
        }),
      }).catch(() => {});
    } catch (_) {}
    
    // Always return 200 OK rapidly to GHL so it doesn't queue retries
    res.status(200).json({ success: true, message: 'Event ingested' });
  } catch (err) {
    console.error(`[WEBHOOK] Database insert error: ${err.message}`);
    
    // Emit failure to Terminal Feed
    try {
      const CC_URL = process.env.COMMAND_CENTER_URL || 'http://localhost:5000';
      fetch(`${CC_URL}/api/internal/orchestrator-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          agent: 'crm-node',
          message: `GHL Webhook FAILED: ${err.message}`,
        }),
      }).catch(() => {});
    } catch (_) {}
    
    // 500 triggers GHL retry mechanism if the database is genuinely down
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
