import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function run() {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://cerberus:cerberus_sovereign_2026@127.0.0.1:5432/cerberus_brain',
  });

  const schemaPath = path.resolve(process.cwd(), 'server/lib/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('Applying schema...');
  try {
    const client = await pool.connect();
    await client.query(sql);
    client.release();
    console.log('Schema applied successfully.');
  } catch (err) {
    console.error('Schema application failed:', err);
  } finally {
    await pool.end();
  }
}

run();
