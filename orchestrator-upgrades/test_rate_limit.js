const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/antigravity_brain' });
const { routeEvent } = require('./routing_engine');

async function testRateLimit() {
  console.log('Inserting 10 mock AI_FALLBACK rows to trigger limit...');
  for (let i = 0; i < 10; i++) {
    await pool.query(
      `INSERT INTO event_decisions (event_id, domain, event_type, source_node, decision, decision_method, dispatched_at)
       VALUES ($1, 'test', 'unknown', 'test_node', 'DLQ', 'AI_FALLBACK', NOW())`,
      [`mock-event-${Date.now()}-${i}`]
    );
  }

  console.log('Testing routeEvent on unknown event...');
  const event = { eventId: 'limit-test', domain: 'test', eventType: 'unknown_trigger', payload: {} };
  
  // Need a mock pubsub object
  const mockPubsub = {};
  
  const result = await routeEvent(event, pool, mockPubsub);
  console.log('Routing Result:', result.decision);

  if (result.decision === 'AI_RATE_LIMITED_DLQ') {
    console.log('✅ SUCCESS: Rate Limiter blocked the 11th invocation correctly!');
  } else {
    console.log('❌ FAILED: Rate Limiter did not catch it.');
  }

  // Cleanup
  await pool.query(`DELETE FROM event_decisions WHERE domain = 'test' AND event_type = 'unknown'`);
  await pool.end();
}

testRateLimit().catch(console.error);
