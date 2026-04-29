import { JsonDb } from '../server/lib/jsonDb.js';
import { PgDb } from '../server/lib/pgDb.js';
import { CollectionName } from '../server/types.js';
import path from 'path';

/**
 * Executes JSON -> PG Data Migration
 */
async function runMigration() {
  console.log('--- Starting SDM Headless Enterprise Migration (JSON -> PG) ---');
  
  const dataDir = path.resolve(process.cwd(), 'data');
  const jsonDb = new JsonDb(dataDir);
  // Wait to initialize to ensure files are loaded
  await jsonDb.initialize().catch(e => console.log('JsonDb init warning:', e));

  const pgDb = new PgDb();
  await pgDb.initialize();

  const collections: CollectionName[] = ['nodes', 'edges', 'tasks', 'task_history'];
  
  for (const col of collections) {
    const items = jsonDb.getAll(col);
    if (!items || items.length === 0) {
      console.log(`[Migration] Collection '${col}' is empty in JSON. Skipping.`);
      continue;
    }
    console.log(`[Migration] Found ${items.length} records in JSON collection '${col}'. Starting bulk insert to PG...`);
    try {
      const inserted = await pgDb.bulkInsert(col, items);
      console.log(`[Migration] Successfully wrote ${inserted} records to PG collection '${col}'.`);
    } catch (err) {
      console.error(`[Migration] Error migrating collection '${col}':`, err);
    }
  }

  console.log('--- Migration Complete ---');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
