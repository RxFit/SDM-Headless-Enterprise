// Quick DB check for Stripe events
require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ host:'localhost', port:5432, database:'antigravity_brain', user:'postgres', password:'postgres' });

(async () => {
  const r = await p.query(
    "SELECT event_id, source, domain, event_type, status, payload->>'stripeEventId' as stripe_id FROM event_outbox WHERE source='stripe-node' ORDER BY created_at DESC LIMIT 5"
  );
  console.log('STRIPE-NODE EVENTS:');
  console.log(JSON.stringify(r.rows, null, 2));

  const s = await p.query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='PENDING') as pending, COUNT(*) FILTER (WHERE status='DISPATCHED') as dispatched, COUNT(*) FILTER (WHERE status='FAILED') as failed FROM event_outbox"
  );
  console.log('\nOUTBOX STATS:', s.rows[0]);
  await p.end();
})();
