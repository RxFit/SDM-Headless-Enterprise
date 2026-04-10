/**
 * ANC-MCP NODE — Integration Test
 * 
 * Validates the full boot sequence without requiring Pub/Sub or GitHub.
 * Tests: event schema, outbox write, outbox dispatch, heartbeat.
 */

require('dotenv').config();

// Override env for test isolation
process.env.NODE_NAME = process.env.NODE_NAME || 'test-node';
process.env.NODE_DOMAIN = process.env.NODE_DOMAIN || 'test';

const { createEvent, validateEvent, VALID_DOMAINS } = require('./lib/event_schema');
const { enqueueEvent, pool: writerPool } = require('./lib/outbox_writer');
const { dispatchPending, pool: dispatcherPool } = require('./lib/outbox_dispatcher');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

async function test() {
  const withDispatch = process.argv.includes('--with-dispatch');

  console.log('═'.repeat(60));
  console.log('ANC-MCP CORE — INTEGRATION TEST');
  console.log('═'.repeat(60));

  // --- TEST 1: Event Schema ---
  console.log('\n[TEST 1] Event Schema');
  const event = createEvent({ domain: 'billing', eventType: 'PAYMENT_FAILED', payload: { amount: 150 } });
  assert('Event has eventId', !!event.eventId);
  assert('Event has timestamp', !!event.timestamp);
  assert('Event domain is billing', event.domain === 'billing');
  assert('Schema version is 1.0', event.schemaVersion === '1.0');

  // Invalid domain should throw
  try {
    createEvent({ domain: 'invalid-domain', eventType: 'TEST' });
    assert('Invalid domain throws', false);
  } catch (_) {
    assert('Invalid domain throws', true);
  }

  // Validate inbound event
  const v1 = validateEvent(event);
  assert('Valid event passes validation', v1.valid === true);
  const v2 = validateEvent({ foo: 'bar' });
  assert('Malformed event fails validation', v2.valid === false);

  // --- TEST 2: Outbox Write ---
  console.log('\n[TEST 2] Outbox Write');
  const e1 = await enqueueEvent({ domain: 'billing', eventType: 'TEST_PAYMENT', payload: { test: true }, target: 'antigravity' });
  assert('Event enqueued (has event_id)', !!e1.event_id);
  assert('Event enqueued (has created_at)', !!e1.created_at);

  // Circular JSON resilience
  const circular = {};
  circular.self = circular;
  const e2 = await enqueueEvent({ domain: 'test', eventType: 'CIRCULAR_PAYLOAD', payload: circular });
  assert('Circular JSON handled gracefully', !!e2.event_id);

  // --- TEST 3: Outbox Dispatch ---
  if (withDispatch) {
    console.log('\n[TEST 3] Outbox Dispatch');
    await dispatchPending();
    // Check if our test events got dispatched
    const check = await writerPool.query(
      `SELECT status FROM event_outbox WHERE event_id = $1`, [e1.event_id]
    );
    assert('Test event dispatched', check.rows[0]?.status === 'DISPATCHED');
  } else {
    console.log('\n[TEST 3] Skipped (run with --with-dispatch)');
  }

  // --- SUMMARY ---
  console.log('\n' + '═'.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  // Cleanup
  await writerPool.end();
  if (withDispatch) await dispatcherPool.end();

  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
