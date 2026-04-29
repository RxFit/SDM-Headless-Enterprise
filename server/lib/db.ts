import { EventEmitter } from 'node:events';
import { JsonDb } from './jsonDb.js';
import { PgDb } from './pgDb.js';
import { logger } from './logger.js';
import { CollectionName, Identifiable } from '../types.js';

export interface IDatabase extends EventEmitter {
  initialize(): Promise<void>;
  getAll<T extends Identifiable>(collection: CollectionName): T[];
  getById<T extends Identifiable>(collection: CollectionName, id: string): T | undefined;
  query<T extends Identifiable>(collection: CollectionName, predicate: (item: T) => boolean): T[];
  getConfig(): Record<string, unknown>;
  loadConfig(): Promise<void>;
  insert<T extends Identifiable>(collection: CollectionName, item: T): Promise<T>;
  update<T extends Identifiable>(collection: CollectionName, id: string, patch: Partial<T>): Promise<T | undefined>;
  remove(collection: CollectionName, id: string): Promise<boolean>;
  bulkInsert<T extends Identifiable>(collection: CollectionName, newItems: T[]): Promise<number>;
  flushAll(): Promise<string[]>;
  archiveOldHistory(daysThreshold?: number): Promise<number>;
  getStats(): Record<string, number>;
  hasDirtyCollections(): boolean;
  getDirtyCollections(): CollectionName[];
}

export class DatabaseFacade extends EventEmitter implements IDatabase {
  private primaryDb!: IDatabase;
  private secondaryDb?: IDatabase; // For dual-write or fallback

  constructor(dataDir: string) {
    super();
    // Instantiate DB engines
    const driver = process.env.DB_DRIVER || 'json';
    const jsonDb = new JsonDb(dataDir);
    const pgDb = new PgDb();

    if (driver === 'pg') {
      logger.info('DB_DRIVER is pg. Attempting to use PostgreSQL as primary, JSON as fallback (dual-write).');
      this.primaryDb = pgDb;
      this.secondaryDb = jsonDb;
    } else {
      logger.info('DB_DRIVER is json (or unset). Using JSON as primary.');
      this.primaryDb = jsonDb;
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.primaryDb.initialize();

      if (this.secondaryDb) {
        try {
          await this.secondaryDb.initialize();
        } catch (e) {
          logger.warn(e, '');
        }
      }

      this.primaryDb.on('change', (payload) => {
        this.emit('change', payload);
      });

    } catch (err) {
      if (this.secondaryDb) {
        logger.error(err, '');
        this.primaryDb = this.secondaryDb;
        this.secondaryDb = undefined;
        await this.primaryDb.initialize();
      } else {
        throw err;
      }
    }
  }

  getAll<T extends Identifiable>(collection: CollectionName): T[] {
    return this.primaryDb.getAll<T>(collection);
  }

  getById<T extends Identifiable>(collection: CollectionName, id: string): T | undefined {
    return this.primaryDb.getById<T>(collection, id);
  }

  query<T extends Identifiable>(collection: CollectionName, predicate: (item: T) => boolean): T[] {
    return this.primaryDb.query<T>(collection, predicate);
  }

  getConfig(): Record<string, unknown> {
    return this.primaryDb.getConfig();
  }

  async loadConfig(): Promise<void> {
    await this.primaryDb.loadConfig();
    if (this.secondaryDb) await this.secondaryDb.loadConfig();
  }

  async insert<T extends Identifiable>(collection: CollectionName, item: T): Promise<T> {
    const res = await this.primaryDb.insert(collection, item);
    if (this.secondaryDb) {
      this.secondaryDb.insert(collection, item).catch(err => {
        logger.warn(`[DatabaseFacade] Secondary DB insert failed: ${err}`);
      });
    }
    return res;
  }

  async update<T extends Identifiable>(collection: CollectionName, id: string, patch: Partial<T>): Promise<T | undefined> {
    const res = await this.primaryDb.update(collection, id, patch);
    if (res && this.secondaryDb) {
      this.secondaryDb.update(collection, id, patch).catch(err => {
        logger.warn(`[DatabaseFacade] Secondary DB update failed: ${err}`);
      });
    }
    return res;
  }

  async remove(collection: CollectionName, id: string): Promise<boolean> {
    const res = await this.primaryDb.remove(collection, id);
    if (res && this.secondaryDb) {
      this.secondaryDb.remove(collection, id).catch(err => {
         logger.warn(`[DatabaseFacade] Secondary DB remove failed: ${err}`);
      });
    }
    return res;
  }

  async bulkInsert<T extends Identifiable>(collection: CollectionName, newItems: T[]): Promise<number> {
    const count = await this.primaryDb.bulkInsert(collection, newItems);
    if (this.secondaryDb) {
      this.secondaryDb.bulkInsert(collection, newItems).catch(err => {
         logger.warn(`[DatabaseFacade] Secondary DB bulkInsert failed: ${err}`);
      });
    }
    return count;
  }

  async flushAll(): Promise<string[]> {
    const res = await this.primaryDb.flushAll();
    if (this.secondaryDb) {
      this.secondaryDb.flushAll().catch(e => {
         logger.warn(`[DatabaseFacade] Secondary DB flushAll failed: ${e}`);
      });
    }
    return res;
  }

  async archiveOldHistory(daysThreshold?: number): Promise<number> {
    const res = await this.primaryDb.archiveOldHistory(daysThreshold);
    if (this.secondaryDb) {
      this.secondaryDb.archiveOldHistory(daysThreshold).catch(e => {
        logger.warn(`[DatabaseFacade] Secondary DB archiveOldHistory failed: ${e}`);
      });
    }
    return res;
  }

  getStats(): Record<string, number> {
    return this.primaryDb.getStats();
  }

  hasDirtyCollections(): boolean {
    return this.primaryDb.hasDirtyCollections();
  }

  getDirtyCollections(): CollectionName[] {
    return this.primaryDb.getDirtyCollections();
  }
}