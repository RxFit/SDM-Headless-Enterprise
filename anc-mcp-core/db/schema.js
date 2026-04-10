/**
 * DRIZZLE SCHEMA — Sovereign Domain Mesh
 * 
 * Tables are organized into two categories:
 *   1. SHARED (public schema) — event_outbox, event_decisions, webhook_health
 *      These are used by ALL nodes via the outbox pipeline.
 *   2. PER-NODE (isolated schemas) — crm_cache.clients, stripe_cache.*, etc.
 *      Each node writes only to its own schema via its role.
 * 
 * IMPORTANT: We use pgSchema() to target node-specific PostgreSQL schemas.
 * This preserves the security model from 001_sdm_foundation.sql where
 * each node role (e.g., crm_node_rw) can only write to its own schema.
 * 
 * NOTE: The outbox pipeline (outbox_writer.js, outbox_dispatcher.js) continues
 * to use raw pg queries for Phase 3 stability. Only CRM cache tables use
 * Drizzle in this phase.
 */

const { pgTable, pgSchema, serial, text, varchar, integer, timestamp, boolean, jsonb } = require('drizzle-orm/pg-core');

// ═══════════════════════════════════════════════════════
// SCHEMA NAMESPACES — Match 001_sdm_foundation.sql
// ═══════════════════════════════════════════════════════

const crmSchema = pgSchema('crm_cache');
const stripeSchema = pgSchema('stripe_cache');
const wellnessSchema = pgSchema('wellness_cache');

// ═══════════════════════════════════════════════════════
// CRM CACHE TABLES — Google Drive Master Client List mirror
// ═══════════════════════════════════════════════════════

/**
 * Local cache of the Master Client List spreadsheet from Google Drive.
 * Source of truth is ALWAYS Drive — this table is an ephemeral read-cache
 * that gets wiped and rebuilt on each sync cycle.
 */
const clients = crmSchema.table('clients', {
  id:                serial('id').primaryKey(),
  driveRowIndex:     integer('drive_row_index'),                // Row index in the Google Sheet (for optimistic locking)
  clientName:        text('client_name').notNull(),
  email:             varchar('email', { length: 255 }),
  phone:             varchar('phone', { length: 20 }),
  trainerId:         varchar('trainer_id', { length: 100 }),
  trainerName:       text('trainer_name'),
  status:            varchar('status', { length: 30 }).notNull().default('active'),  // active, at_risk, archived
  paymentStatus:     varchar('payment_status', { length: 30 }).default('current'),    // current, overdue, at_risk, cancelled
  billingRate:       integer('billing_rate'),                    // cents per session
  sessionsPerWeek:   integer('sessions_per_week'),
  startDate:         varchar('start_date', { length: 20 }),     // Keep as string to match Sheet format
  lastSessionDate:   varchar('last_session_date', { length: 20 }),
  notes:             text('notes'),
  stripeCustomerId:  varchar('stripe_customer_id', { length: 100 }),
  driveFileId:       varchar('drive_file_id', { length: 100 }), // Google Drive file ID of the source sheet
  lastSyncedAt:      timestamp('last_synced_at').defaultNow(),
  contentHash:       varchar('content_hash', { length: 64 }),   // SHA-256 of the row data — for change detection
});

/**
 * Immutable Event Stream for GoHighLevel actions.
 * Translates CoPilot pipeline updates into a chronological history.
 */
const clientEvents = crmSchema.table('client_events', {
  id:              serial('id').primaryKey(),
  clientId:        integer('client_id'),          // FK to clients.id (soft ref)
  ghlContactId:    varchar('ghl_contact_id', { length: 100 }),
  eventType:       varchar('event_type', { length: 60 }).notNull(),
  payload:         jsonb('payload'),               // Raw webhook or SDM event body
  occurredAt:      timestamp('occurred_at').defaultNow(),
  idempotencyKey:  varchar('idempotency_key', { length: 128 }).unique(),
  source:          varchar('source', { length: 30 }).default('ghl_webhook'),
});

/**
 * Sync audit log — tracks every Drive ↔ PG sync operation.
 */
const syncLog = crmSchema.table('sync_log', {
  id:             serial('id').primaryKey(),
  syncType:       varchar('sync_type', { length: 20 }).notNull(), // 'full', 'incremental', 'write_back'
  direction:      varchar('direction', { length: 10 }).notNull(), // 'pull' (Drive→PG) or 'push' (PG→Drive)
  rowsProcessed:  integer('rows_processed').default(0),
  rowsSkipped:    integer('rows_skipped').default(0),
  rowsFailed:     integer('rows_failed').default(0),
  errorDetails:   text('error_details'),
  durationMs:     integer('duration_ms'),
  startedAt:      timestamp('started_at').defaultNow(),
  completedAt:    timestamp('completed_at'),
});

/**
 * Conflict log — tracks optimistic locking conflicts during write-back.
 */
const conflictLog = crmSchema.table('conflict_log', {
  id:              serial('id').primaryKey(),
  clientId:        integer('client_id'),
  fieldName:       varchar('field_name', { length: 50 }).notNull(),
  expectedValue:   text('expected_value'),
  actualValue:     text('actual_value'),
  attemptedValue:  text('attempted_value'),
  resolution:      varchar('resolution', { length: 20 }).default('ABORTED'), // ABORTED, FORCE_OVERWRITE, MANUAL
  createdAt:       timestamp('created_at').defaultNow(),
});

module.exports = {
  // Schema namespaces
  crmSchema,
  stripeSchema,
  wellnessSchema,
  
  // CRM tables
  clients,
  clientEvents,
  syncLog,
  conflictLog,
};
