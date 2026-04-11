require('dotenv').config({ path: require('path').join(__dirname, 'anc-mcp-core', '.env'), override: true });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
});
async function fixDb() {
  try {
    console.log('Adding UNIQUE constraint on node_name to webhook_health table...');
    await pool.query('ALTER TABLE webhook_health DROP CONSTRAINT IF EXISTS webhook_health_node_name_key;');
    await pool.query('ALTER TABLE webhook_health ADD UNIQUE (node_name);');
    console.log('Constraint added successfully.');
    
    // Also test an insert
    await pool.query(
      `INSERT INTO webhook_health (node_name, endpoint_url, last_received_at, status, updated_at)
       VALUES ($1, $2, NOW(), 'HEALTHY', NOW())
       ON CONFLICT (node_name) DO UPDATE SET last_received_at = NOW(), status = 'HEALTHY', updated_at = NOW()`,
      ['test-node', 'test-url']
    );
    console.log('Insert test successful.');
  } catch (err) {
    console.error('Database Error:', err.message);
  } finally {
    pool.end();
  }
}
fixDb();
