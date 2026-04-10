require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user: process.env.PG_WRITE_USER || 'postgres',
  password: process.env.PG_WRITE_PASSWORD || 'postgres',
});
async function verifyDb() {
  try {
    const { rows } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_outbox'");
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Database Error:', err.message);
  } finally {
    pool.end();
  }
}
verifyDb();
