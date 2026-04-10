/**
 * GOOGLE DRIVE CRM ADAPTER
 * 
 * Implements the same interface as copilot.js but targets the
 * Google Drive-based Master Client List spreadsheet as the canonical source,
 * using the local Drizzle PostgreSQL database as an ephemeral high-speed cache.
 * 
 * To activate: set CRM_ADAPTER=gdrive_crm in .env
 */

const { db, schema } = require('../../anc-mcp-core/db/connection');
const { eq } = require('drizzle-orm');
const googleSheets = require('./googleSheets');

async function flagClient(customerId, reason) {
  try {
    const clients = schema.clients;
    
    // 1. Find client by stripe ID in local cache
    const existing = await db.select().from(clients).where(eq(clients.stripeCustomerId, customerId)).limit(1);
    
    if (!existing || existing.length === 0) {
       console.log(`[GDRIVE CRM] flagClient(${customerId}): Not found in local cache.`);
       return { success: false, error: 'Client not found in cache' };
    }
    const client = existing[0];
    
    // 2. Update local cache instantly
    await db.update(clients).set({ paymentStatus: 'at_risk' }).where(eq(clients.id, client.id));
    
    // 3. Push update out to Google Drive (Master Client List)
    if (client.driveRowIndex) {
      await googleSheets.updateSheetCell(client.driveRowIndex, 'paymentStatus', 'at_risk');
    }
    
    console.log(`[GDRIVE CRM] flagClient(${customerId}, ${reason}): Success.`);
    return { success: true };
  } catch (err) {
    console.error(`[GDRIVE CRM] flagClient Error:`, err);
    return { success: false, error: err.message };
  }
}

async function archiveClient(customerId, reason) {
  try {
    const clients = schema.clients;
    const existing = await db.select().from(clients).where(eq(clients.stripeCustomerId, customerId)).limit(1);
    
    if (!existing || existing.length === 0) {
       return { success: false, error: 'Client not found in cache' };
    }
    const client = existing[0];
    
    // Update local cache
    await db.update(clients).set({ status: 'archived' }).where(eq(clients.id, client.id));
    
    // Push update to Google Drive
    if (client.driveRowIndex) {
      await googleSheets.updateSheetCell(client.driveRowIndex, 'status', 'archived');
    }
    
    console.log(`[GDRIVE CRM] archiveClient(${customerId}, ${reason}): Success.`);
    return { success: true };
  } catch (err) {
    console.error(`[GDRIVE CRM] archiveClient Error:`, err);
    return { success: false, error: err.message };
  }
}

async function enrichClient(customerId, data) {
  try {
    const clients = schema.clients;
    const existing = await db.select().from(clients).where(eq(clients.stripeCustomerId, customerId)).limit(1);
    
    if (!existing || existing.length === 0) {
       return { success: false, error: 'Client not found in cache' };
    }
    const client = existing[0];
    
    // Determine which fields to update
    const updates = {};
    const sheetUpdates = [];
    
    if (data.phone) {
        updates.phone = data.phone;
        sheetUpdates.push({ col: 'phone', val: data.phone });
    }
    if (data.notes) {
        updates.notes = data.notes;
        sheetUpdates.push({ col: 'notes', val: data.notes });
    }
    
    if (Object.keys(updates).length > 0) {
        // Update local Postgres cache
        await db.update(clients).set(updates).where(eq(clients.id, client.id));
        
        // Push sequence of updates to Google Drive
        if (client.driveRowIndex) {
            for (const update of sheetUpdates) {
                await googleSheets.updateSheetCell(client.driveRowIndex, update.col, update.val);
            }
        }
    }
    
    console.log(`[GDRIVE CRM] enrichClient(${customerId}): Success.`);
    return { success: true };
  } catch (err) {
    console.error(`[GDRIVE CRM] enrichClient Error:`, err);
    return { success: false, error: err.message };
  }
}

module.exports = { flagClient, archiveClient, enrichClient };
