import { EventEmitter } from 'node:events';
import pg from 'pg';
import { logger } from './logger.js';
import { CollectionName, Identifiable, ChangeEvent } from '../types.js';

const { Pool } = pg;

export class PgDb extends EventEmitter {
  private pool: pg.Pool;
  private initialized = false;
  private _pgConfigCache: Record<string, unknown> = {};

  // For seamless drop-in logic for getById, getAll, etc.
  // Note: Since JsonDb is synchronous for reads (cache), PgDb will also use a cache
  // OR we can make it fully async? Wait, JsonDb `getAll` is synchronous!
  // If `getAll` is synchronous, we MUST maintain an in-memory cache that is synced with PG,
  // or we have to refactor every single route to use `await db.getAll()`.
  // Wargaming: "Build the PostgreSQL DAL with IDENTICAL method signatures to jsonDb.ts... Routes require ZERO changes"
  private cache: Map<CollectionName, Identifiable[]> = new Map();

  constructor() {
    super();
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://cerberus:cerberus_sovereign_2026@127.0.0.1:5432/cerberus_brain',
      ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Test connection
    try {
      const client = await this.pool.connect();
      client.release();
    } catch (err) {
      logger.error(err, '[pgDb] Connection failed');
      throw err; // Will let the caller perform Wolverine fallback to JsonDb
    }

    // Load data into cache to support synchronous reads
    await this.refreshCache();
    await this.loadConfig();

    this.initialized = true;
    logger.info('[pgDb] Initialized PostgreSQL connection');
  }

  private async refreshCache(): Promise<void> {
    const collections: CollectionName[] = ['nodes', 'edges', 'tasks', 'task_history'];
    for (const col of collections) {
      const res = await this.pool.query(`SELECT * FROM ${col}`);
      // JSON types in Postgres come back as objects, but we might need to camelCase or parse
      // Actually columns match keys except snake_case vs camelCase if we're not careful.
      // Wait, in JsonDb the objects are arbitrary JSON. In PG we made specific columns.
      // We should construct the objects properly.
      // A generic approach: serialize row back to an object.
      // Since `metadata` is JSONB, it parses automatically.
      this.cache.set(col, res.rows as Identifiable[]);
    }
  }

  // READ Operations (Synchronous, from cache)
  getAll<T extends Identifiable>(collection: CollectionName): T[] {
    return (this.cache.get(collection) || []) as T[];
  }

  getById<T extends Identifiable>(collection: CollectionName, id: string): T | undefined {
    const items = this.cache.get(collection) || [];
    return items.find((item) => item.id === id) as T | undefined;
  }

  query<T extends Identifiable>(collection: CollectionName, predicate: (item: T) => boolean): T[] {
    const items = this.cache.get(collection) || [];
    return (items as T[]).filter(predicate);
  }

  getConfig(): Record<string, unknown> {
    return this._pgConfigCache;
  }

  async loadConfig(): Promise<void> {
    try {
      const res = await this.pool.query('SELECT value FROM sdm_config WHERE key = $1', ['main']);
      if (res.rows.length > 0) {
        this._pgConfigCache = res.rows[0].value;
      }
    } catch (err) {
      logger.error(err, '[pgDb] Failed to load config');
    }
  }

  // WRITE Operations

  async insert<T extends Identifiable>(collection: CollectionName, item: T): Promise<T> {
    // 1. Build dynamic query
    const keys = Object.keys(item);
    const vars = keys.map((_, i) => `$${i + 1}`).join(', ');
    const cols = keys.join(', ');
    const values = Object.values(item).map(v => 
      (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v
    );
    
    await this.pool.query(`INSERT INTO ${collection} (${cols}) VALUES (${vars})`, values);
    
    // 2. Update cache
    const items = this.cache.get(collection) || [];
    items.push(item as Identifiable);
    this.cache.set(collection, items);

    // 3. Emit change
    this.emit('change', { collection, action: 'insert', item });
    return item;
  }

  async update<T extends Identifiable>(collection: CollectionName, id: string, patch: Partial<T>): Promise<T | undefined> {
    const keys = Object.keys(patch);
    if (keys.length === 0) return this.getById(collection, id) as T | undefined;

    const setStr = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = Object.values(patch).map(v => 
      (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v
    );
    values.push(id);

    await this.pool.query(`UPDATE ${collection} SET ${setStr} WHERE id = $${values.length}`, values);

    // Update cache
    const items = this.cache.get(collection) || [];
    const index = items.findIndex((i) => i.id === id);
    if (index !== -1) {
      const updated = { ...items[index], ...patch } as T;
      items[index] = updated as Identifiable;
      this.cache.set(collection, items);
      this.emit('change', { collection, action: 'update', item: updated, patch });
      return updated;
    }
    return undefined;
  }

  async remove(collection: CollectionName, id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM ${collection} WHERE id = $1 RETURNING *`, [id]);
    if (res.rowCount && res.rowCount > 0) {
      const items = this.cache.get(collection) || [];
      const index = items.findIndex((i) => i.id === id);
      if (index !== -1) items.splice(index, 1);
      
      this.emit('change', { collection, action: 'remove', item: res.rows[0] as Identifiable });
      return true;
    }
    return false;
  }

  async bulkInsert<T extends Identifiable>(collection: CollectionName, newItems: T[]): Promise<number> {
    if (newItems.length === 0) return 0;
    
    const client = await this.pool.connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      for (const item of newItems) {
        const keys = Object.keys(item);
        const vars = keys.map((_, i) => `$${i + 1}`).join(', ');
        const cols = keys.join(', ');
        const values = Object.values(item).map(v => 
          (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v
        );
        await client.query(`INSERT INTO ${collection} (${cols}) VALUES (${vars}) ON CONFLICT DO NOTHING`, values);
        inserted++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    
    // Refresh cache
    const res = await this.pool.query(`SELECT * FROM ${collection}`);
    this.cache.set(collection, res.rows as Identifiable[]);
    
    return inserted;
  }

  async flushAll(): Promise<string[]> {
    return []; // No-op, PostgreSQL writes instantly
  }

  async archiveOldHistory(daysThreshold = 90): Promise<number> {
    const res = await this.pool.query(`DELETE FROM task_history WHERE timestamp < NOW() - INTERVAL '$1 days'`, [daysThreshold]);
    await this.refreshCache();
    return res.rowCount || 0;
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [col, items] of this.cache.entries()) {
      stats[col] = items.length;
    }
    return stats;
  }

  hasDirtyCollections(): boolean { return false; }
  getDirtyCollections(): CollectionName[] { return []; }
}