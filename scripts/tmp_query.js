const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
});
async function test() {
  const { rows } = await pool.query("SELECT conname, contype, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE conrelid = 'webhook_health'::regclass;");
  console.log(rows);
  process.exit(0);
}
test().catch(console.error);
