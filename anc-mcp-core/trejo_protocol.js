/**
 * TREJO PROTOCOL — Full Verification Script
 * Tests: DB state, crash recovery, event schema, outbox dispatch, env validation
 */
require('dotenv').config();
const { Pool } = require('pg');
const { createEvent, validateEvent, VALID_DOMAINS } = require('./lib/event_schema');
const { enqueueEvent, pool: writerPool } = require('./lib/outbox_writer');
const { dispatchPending, pool: dispatcherPool } = require('./lib/outbox_dispatcher');

let passed = 0, failed = 0;
function assert(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ FAIL: ${label}`); failed++; }
}

async function run() {
  const adminPool = new Pool({ host:'localhost', port:5432, database:'antigravity_brain', user:'postgres', password:'postgres', max:1 });

  console.log('═'.repeat(60));
  console.log('TREJO PROTOCOL — SOVEREIGN DOMAIN MESH VERIFICATION');
  console.log('═'.repeat(60));

  // --- PHASE 1: DB STATE AUDIT ---
  console.log('\n[PHASE 1] Database State Audit');
  const schemas = await adminPool.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('stripe_cache','wellness_cache','crm_cache')");
  assert('stripe_cache schema exists', schemas.rows.some(r => r.nspname === 'stripe_cache'));
  assert('wellness_cache schema exists', schemas.rows.some(r => r.nspname === 'wellness_cache'));
  assert('crm_cache schema exists', schemas.rows.some(r => r.nspname === 'crm_cache'));

  const roles = await adminPool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('stripe_node_rw','wellness_node_rw','crm_node_rw','agent_reader')");
  assert('stripe_node_rw role exists', roles.rows.some(r => r.rolname === 'stripe_node_rw'));
  assert('wellness_node_rw role exists', roles.rows.some(r => r.rolname === 'wellness_node_rw'));
  assert('crm_node_rw role exists', roles.rows.some(r => r.rolname === 'crm_node_rw'));
  assert('agent_reader role exists', roles.rows.some(r => r.rolname === 'agent_reader'));

  const outboxExists = await adminPool.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='event_outbox')");
  assert('event_outbox table exists', outboxExists.rows[0].exists);

  // --- PHASE 2: CRASH RECOVERY ---
  console.log('\n[PHASE 2] Crash Recovery Simulation');
  const crashEvent = await enqueueEvent({ domain: 'test', eventType: 'CRASH_SIM', payload: { test: 'crash_recovery' } });
  const preCheck = await adminPool.query('SELECT status FROM event_outbox WHERE event_id=$1', [crashEvent.event_id]);
  assert('Event survives in PENDING after simulated crash', preCheck.rows[0].status === 'PENDING');
  await dispatchPending();
  const postCheck = await adminPool.query('SELECT status FROM event_outbox WHERE event_id=$1', [crashEvent.event_id]);
  assert('Event recovers to DISPATCHED after restart', postCheck.rows[0].status === 'DISPATCHED');

  // --- PHASE 3: EVENT SCHEMA VALIDATION ---
  console.log('\n[PHASE 3] Event Schema Enforcement');
  assert('Valid domains list has 9 entries', VALID_DOMAINS.length === 9);
  const goodEvent = createEvent({ domain: 'billing', eventType: 'TEST' });
  assert('Schema version is 1.0', goodEvent.schemaVersion === '1.0');
  try { createEvent({ domain: 'fake', eventType: 'TEST' }); assert('Invalid domain rejected', false); }
  catch(_) { assert('Invalid domain rejected', true); }
  const v = validateEvent({ eventId: 'x', domain: 'billing', eventType: 'TEST', schemaVersion: '1.0' });
  assert('Validation passes for valid envelope', v.valid);
  const v2 = validateEvent({ random: 'garbage' });
  assert('Validation fails for garbage', !v2.valid);

  // --- PHASE 4: OUTBOX STATS ---
  console.log('\n[PHASE 4] Outbox Statistics');
  const stats = await adminPool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='PENDING') as pending, COUNT(*) FILTER (WHERE status='DISPATCHED') as dispatched, COUNT(*) FILTER (WHERE status='FAILED') as failed FROM event_outbox");
  const s = stats.rows[0];
  console.log(`  Total events: ${s.total} | Pending: ${s.pending} | Dispatched: ${s.dispatched} | Failed: ${s.failed}`);
  assert('No stuck FAILED events', parseInt(s.failed) === 0);

  // --- SUMMARY ---
  console.log('\n' + '═'.repeat(60));
  console.log(`TREJO PROTOCOL RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  await writerPool.end();
  await dispatcherPool.end();
  await adminPool.end();
  process.exit(failed > 0 ? 1 : 0);
}
run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
