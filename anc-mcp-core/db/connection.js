/**
 * DRIZZLE CONNECTION — Factory for Drizzle DB instances
 * 
 * Returns a configured Drizzle ORM instance connected to PostgreSQL.
 * Uses the same PG_* env vars as outbox_writer.js for consistency.
 * 
 * Usage:
 *   const { db, pool } = require('./db/connection');
 *   const result = await db.select().from(clients).where(...);
 */

const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./schema');

// Build connection from env vars (same pattern as outbox_writer.js)
const pool = new Pool({
  host:     process.env.PG_HOST || 'localhost',
  port:     parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'antigravity_brain',
  user:     process.env.PG_WRITE_USER,
  password: process.env.PG_WRITE_PASSWORD,
  max:      3,
  statement_timeout: 10000, // 10s query timeout
});

// Create the Drizzle instance with all schema tables
const db = drizzle(pool, { schema });

module.exports = { db, pool, schema };
