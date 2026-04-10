/**
 * NIGHTLY HEALER — GOHIGHLEVEL SYNC WORKER
 * 
 * Polls the CoPilot (GoHighLevel) CRM API and reconciles the 
 * local PostgreSQL clients table and client_events stream.
 * 
 * Usage:
 *   node sync_worker.js
 */

require('dotenv').config();
const { db, schema } = require('../../anc-mcp-core/db/connection');
const copilot = require('./adapters/copilot');
const crypto = require('crypto');
const { eq } = require('drizzle-orm');

async function runSync() {
  console.log('🔄 Starting GHL Nightly Healer Sync...');
  
  try {
    let allContacts = [];
    
    // Trejo Protocol: Fetch the first 100 contacts to empirically prove ingestion pipeline
    console.log(`[HEALER] Fetching empirical batch...`);
    const result = await copilot.listContacts(100, '');
    const batch = result.contacts || [];
    allContacts.push(...batch);
    
    console.log(`[HEALER] Retrieved ${allContacts.length} contacts from GoHighLevel.`);
    
    // Load local clients mapping
    const existingRecords = await db.select().from(schema.clients);
    const emailMap = new Map();
    for (const record of existingRecords) {
      if (record.email) emailMap.set(record.email.toLowerCase(), record);
    }
    
    let inserted = 0;
    let updated = 0;
    
    for (const contact of allContacts) {
      const email = contact.email ? contact.email.toLowerCase() : null;
      if (!email) continue;
      
      const existing = emailMap.get(email);
      let localClientId = null;
      
      const tags = contact.tags || [];
      const status = tags.includes('archived') ? 'archived' : 'active';
      
      if (!existing) {
        // Insert new foundational record
        const insertRes = await db.insert(schema.clients).values({
          clientName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email,
          phone: contact.phone,
          status: status,
          lastSyncedAt: new Date()
        }).returning({ id: schema.clients.id });
        
        localClientId = insertRes[0].id;
        inserted++;
      } else {
        localClientId = existing.id;
        // Optionally update core metadata...
        updated++;
      }
      
      // Inject a baseline "HEALER_SYNC" event into the stream with the raw contact state
      const hash = crypto.createHash('md5').update(JSON.stringify(contact)).digest('hex');
      const idempotencyKey = `healer_sync_${contact.id}_${hash}`;
      
      await db.insert(schema.clientEvents)
        .values({
          clientId: localClientId,
          ghlContactId: contact.id,
          eventType: 'HEALER_SYNC',
          payload: contact,
          idempotencyKey,
          source: 'nightly_healer'
        })
        .onConflictDoNothing({ target: schema.clientEvents.idempotencyKey });
    }
    
    console.log(`✅ Healer Complete: ${inserted} new clients inserted, ${updated} reconciled against event stream.`);
    
    // Emit to Orchestrator Dashboard Terminal Feed
    try {
      await fetch('http://localhost:5000/api/internal/orchestrator-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'agent',
          agent: 'crm-node',
          message: `Nightly Healer: ${inserted} new, ${updated} reconciled from ${allContacts.length} GHL contacts`,
        }),
      });
    } catch (_) { /* fire-and-forget */ }
    
  } catch (err) {
    console.error(`❌ Healer Failed:`, err);
    // Emit failure to Terminal Feed
    try {
      await fetch('http://localhost:5000/api/internal/orchestrator-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          agent: 'crm-node',
          message: `Nightly Healer FAILED: ${err.message}`,
        }),
      });
    } catch (_) { /* fire-and-forget */ }
  }
}

// Execute if run directly
if (require.main === module) {
  runSync().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runSync };
