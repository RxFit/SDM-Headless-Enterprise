/**
 * DRIZZLE CONFIG — Sovereign Domain Mesh
 * 
 * Configuration for drizzle-kit CLI (migrations, push, introspection).
 * 
 * IMPORTANT: This targets the crm_cache schema specifically.
 * Each node that uses Drizzle should have its own config targeting
 * its own schema namespace.
 * 
 * Usage:
 *   npx drizzle-kit push    — Push schema to database
 *   npx drizzle-kit generate — Generate migration SQL
 */

require('dotenv').config();

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema:  './db/schema.js',
  out:     './drizzle-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host:     process.env.PG_HOST || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'antigravity_brain',
    user:     process.env.PG_WRITE_USER || 'postgres',
    password: process.env.PG_WRITE_PASSWORD || 'postgres',
  },
};
