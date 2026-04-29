import { Pool } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log('Connecting to cerberus_brain...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://cerberus:cerberus_sovereign_2026@127.0.0.1:5432/cerberus_brain',
  });

  try {
    const ddl = await fs.readFile(path.join(__dirname, '../server/lib/schema.sql'), 'utf-8');
    
    console.log('Resetting schema...');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    console.log('Applying DDL...');
    await pool.query(ddl);
    console.log('DDL Applied Successfully!');

    console.log('Migrating data from JSON...');
    // Load JSON files
    const jsonDir = path.join(__dirname, '../data');
    const tables = ['nodes', 'edges', 'tasks', 'task_history'];
    
    for (const table of tables) {
      try {
        const dataPath = path.join(jsonDir, `${table}.json`);
        const data = await fs.readFile(dataPath, 'utf-8');
        const items = JSON.parse(data);
        
        console.log(`Table ${table}: Found ${items.length} records in JSON.`);
        
        for (const item of items) {
          const keys = Object.keys(item);
          const cols = keys.join(', ');
          const vars = keys.map((_, i) => `$${i+1}`).join(', ');
          const values = Object.values(item).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
          
          try {
            await pool.query(
              `INSERT INTO ${table} (${cols}) VALUES (${vars}) ON CONFLICT DO NOTHING`,
              values
            );
          } catch(e) {
            console.log(`  -> Skipping ${item.id} in ${table}: ${e.message}`);
          }
        }
        console.log(`Table ${table}: Migration complete.`);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(`Table ${table}: No JSON file found. Skipping.`);
        } else {
          console.error(`Table ${table} Error:`, err.message);
        }
      }
    }

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
