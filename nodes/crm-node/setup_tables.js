require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'antigravity_brain',
  user: 'postgres',
  password: 'postgres'
});

async function run() {
  const sql = `
    CREATE SCHEMA IF NOT EXISTS crm_cache;
    CREATE TABLE IF NOT EXISTS crm_cache.clients (
      id SERIAL PRIMARY KEY,
      drive_row_index INTEGER,
      client_name TEXT NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(20),
      trainer_id VARCHAR(100),
      trainer_name TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      payment_status VARCHAR(30) DEFAULT 'current',
      billing_rate INTEGER,
      sessions_per_week INTEGER,
      start_date VARCHAR(20),
      last_session_date VARCHAR(20),
      notes TEXT,
      stripe_customer_id VARCHAR(100),
      drive_file_id VARCHAR(100),
      last_synced_at TIMESTAMP DEFAULT NOW(),
      content_hash VARCHAR(64)
    );
    CREATE TABLE IF NOT EXISTS crm_cache.client_events (
      id SERIAL PRIMARY KEY,
      client_id INTEGER,
      ghl_contact_id VARCHAR(100),
      event_type VARCHAR(60) NOT NULL,
      payload JSONB,
      occurred_at TIMESTAMP DEFAULT NOW(),
      idempotency_key VARCHAR(128) UNIQUE,
      source VARCHAR(30) DEFAULT 'ghl_webhook'
    );
    CREATE TABLE IF NOT EXISTS crm_cache.sync_log (
      id SERIAL PRIMARY KEY,
      sync_type VARCHAR(20) NOT NULL,
      direction VARCHAR(10) NOT NULL,
      rows_processed INTEGER DEFAULT 0,
      rows_skipped INTEGER DEFAULT 0,
      rows_failed INTEGER DEFAULT 0,
      error_details TEXT,
      duration_ms INTEGER,
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS crm_cache.conflict_log (
      id SERIAL PRIMARY KEY,
      client_id INTEGER,
      field_name VARCHAR(50) NOT NULL,
      expected_value TEXT,
      actual_value TEXT,
      attempted_value TEXT,
      resolution VARCHAR(20) DEFAULT 'ABORTED',
      created_at TIMESTAMP DEFAULT NOW()
    );
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA crm_cache TO public;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA crm_cache TO public;
  `;
  try {
    await pool.query(sql);
    console.log('Tables created successfully.');
  } catch (err) {
    console.error('Table creation failed:', err);
  } finally {
    await pool.end();
  }
}
run();
