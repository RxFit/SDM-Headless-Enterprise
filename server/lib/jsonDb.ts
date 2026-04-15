/**
 * jsonDb.ts — Git-Versioned JSON Database Engine
 * WOLF-001: File-level mutex lock. All writes serialize through an async queue.
 * WOLF-007: Task history auto-archival (90-day rotation).
 *
 * This is the heart of the SDM Headless Enterprise data layer.
 * All data lives as JSON files in the data/ directory.
 * In-memory cache is authoritative; files are the persistence layer.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type CollectionName = 'nodes' | 'edges' | 'tasks' | 'task_history';

interface Identifiable {
  id: string;
  [key: string]: unknown;
}

export type ChangeEvent = {
  collection: CollectionName;
  action: 'insert' | 'update' | 'remove';
  item: Identifiable;
  patch?: Partial<Identifiable>;
};

// ─────────────────────────────────────────────────────────
// Mutex Lock (WOLF-001)
// ─────────────────────────────────────────────────────────

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

// ─────────────────────────────────────────────────────────
// JSON Database Engine
// ─────────────────────────────────────────────────────────

export class JsonDb extends EventEmitter {
  private dataDir: string;
  private cache: Map<CollectionName, Identifiable[]> = new Map();
  private mutexes: Map<CollectionName, AsyncMutex> = new Map();
  private dirty: Set<CollectionName> = new Set();
  private initialized = false;

  constructor(dataDir: string) {
    super();
    this.dataDir = dataDir;

    // Initialize mutexes for each collection
    const collections: CollectionName[] = ['nodes', 'edges', 'tasks', 'task_history'];
    for (const col of collections) {
      this.mutexes.set(col, new AsyncMutex());
    }
  }

  /**
   * Load all JSON files from data/ into memory on boot.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      await mkdir(this.dataDir, { recursive: true });
    }

    // Ensure archive directory exists
    const archiveDir = join(this.dataDir, 'archive');
    if (!existsSync(archiveDir)) {
      await mkdir(archiveDir, { recursive: true });
    }

    const collections: CollectionName[] = ['nodes', 'edges', 'tasks', 'task_history'];

    for (const col of collections) {
      const filePath = join(this.dataDir, `${col}.json`);
      try {
        if (existsSync(filePath)) {
          const raw = await readFile(filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            this.cache.set(col, data);
          } else {
            console.warn(`[jsonDb] ${col}.json is not an array, initializing empty`);
            this.cache.set(col, []);
          }
        } else {
          console.log(`[jsonDb] ${col}.json not found, creating empty`);
          this.cache.set(col, []);
          await this.persistCollection(col);
        }
      } catch (err) {
        console.error(`[jsonDb] Failed to load ${col}.json:`, err);
        this.cache.set(col, []);
      }
    }

    this.initialized = true;
    await this.loadConfig();
    console.log(`[jsonDb] Initialized with ${collections.map(c => `${c}:${this.cache.get(c)?.length || 0}`).join(', ')}`);
  }

  // ─────────────────────────────────────────────────────────
  // READ Operations (no mutex needed)
  // ─────────────────────────────────────────────────────────

  getAll<T extends Identifiable>(collection: CollectionName): T[] {
    return (this.cache.get(collection) || []) as T[];
  }

  getById<T extends Identifiable>(collection: CollectionName, id: string): T | undefined {
    const items = this.cache.get(collection) || [];
    return items.find(item => item.id === id) as T | undefined;
  }

  query<T extends Identifiable>(
    collection: CollectionName,
    predicate: (item: T) => boolean
  ): T[] {
    const items = this.cache.get(collection) || [];
    return (items as T[]).filter(predicate);
  }

  /** Read data/config.json (not a collection — direct file read with in-memory cache) */
  getConfig(): Record<string, unknown> {
    const raw = this._configCache;
    if (raw) return raw;
    // If not loaded yet, return empty (will be populated during initialize via loadConfig)
    return {};
  }

  private _configCache: Record<string, unknown> | null = null;

  async loadConfig(): Promise<void> {
    const { readFile: rf } = await import('node:fs/promises');
    const { existsSync: es } = await import('node:fs');
    const { join: j } = await import('node:path');
    const configPath = j(this.dataDir, 'config.json');
    if (es(configPath)) {
      try {
        const raw = await rf(configPath, 'utf-8');
        this._configCache = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this._configCache = {};
      }
    } else {
      this._configCache = {};
    }
  }



  async insert<T extends Identifiable>(collection: CollectionName, item: T): Promise<T> {
    const mutex = this.mutexes.get(collection)!;
    await mutex.acquire();

    try {
      const items = this.cache.get(collection) || [];

      // WOLF-008: Check for duplicate ID
      if (items.some(existing => existing.id === item.id)) {
        throw new Error(`Duplicate ID: ${item.id} already exists in ${collection}`);
      }

      items.push(item as Identifiable);
      this.cache.set(collection, items);
      this.dirty.add(collection);

      // Persist to disk
      await this.persistCollection(collection);

      // Emit change event for WebSocket broadcast
      this.emit('change', {
        collection,
        action: 'insert',
        item,
      } satisfies ChangeEvent);

      return item;
    } finally {
      mutex.release();
    }
  }

  async update<T extends Identifiable>(
    collection: CollectionName,
    id: string,
    patch: Partial<T>
  ): Promise<T | undefined> {
    const mutex = this.mutexes.get(collection)!;
    await mutex.acquire();

    try {
      const items = this.cache.get(collection) || [];
      const index = items.findIndex(item => item.id === id);

      if (index === -1) {
        return undefined;
      }

      // Apply patch
      const updated = { ...items[index], ...patch } as T;
      items[index] = updated as Identifiable;
      this.cache.set(collection, items);
      this.dirty.add(collection);

      // Persist to disk
      await this.persistCollection(collection);

      // Emit change event
      this.emit('change', {
        collection,
        action: 'update',
        item: updated as Identifiable,
        patch: patch as Partial<Identifiable>,
      } satisfies ChangeEvent);

      return updated;
    } finally {
      mutex.release();
    }
  }

  async remove(collection: CollectionName, id: string): Promise<boolean> {
    const mutex = this.mutexes.get(collection)!;
    await mutex.acquire();

    try {
      const items = this.cache.get(collection) || [];
      const index = items.findIndex(item => item.id === id);

      if (index === -1) {
        return false;
      }

      const removed = items.splice(index, 1)[0];
      this.cache.set(collection, items);
      this.dirty.add(collection);

      // Persist to disk
      await this.persistCollection(collection);

      // Emit change event
      this.emit('change', {
        collection,
        action: 'remove',
        item: removed,
      } satisfies ChangeEvent);

      return true;
    } finally {
      mutex.release();
    }
  }

  /**
   * Bulk insert — optimized for migration/sync, single lock acquisition.
   */
  async bulkInsert<T extends Identifiable>(collection: CollectionName, newItems: T[]): Promise<number> {
    if (newItems.length === 0) return 0;

    const mutex = this.mutexes.get(collection)!;
    await mutex.acquire();

    try {
      const items = this.cache.get(collection) || [];
      let inserted = 0;

      for (const item of newItems) {
        if (!items.some(existing => existing.id === item.id)) {
          items.push(item as Identifiable);
          inserted++;
        }
      }

      this.cache.set(collection, items);
      this.dirty.add(collection);
      await this.persistCollection(collection);

      return inserted;
    } finally {
      mutex.release();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────

  private async persistCollection(collection: CollectionName): Promise<void> {
    const filePath = join(this.dataDir, `${collection}.json`);
    const data = this.cache.get(collection) || [];

    try {
      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty.delete(collection);
    } catch (err) {
      console.error(`[jsonDb] Failed to persist ${collection}:`, err);
      // Don't throw — in-memory state is authoritative
    }
  }

  /**
   * Persist all dirty collections. Called by gitSync before commit.
   */
  async flushAll(): Promise<string[]> {
    const flushed: string[] = [];
    for (const col of this.dirty) {
      await this.persistCollection(col);
      flushed.push(col);
    }
    return flushed;
  }

  /**
   * WOLF-007: Archive old task_history entries (> 90 days) to data/archive/
   */
  async archiveOldHistory(daysThreshold = 90): Promise<number> {
    const mutex = this.mutexes.get('task_history')!;
    await mutex.acquire();

    try {
      const items = this.cache.get('task_history') || [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysThreshold);
      const cutoffIso = cutoff.toISOString();

      const toArchive = items.filter(
        (item) => typeof item.timestamp === 'string' && item.timestamp < cutoffIso
      );

      if (toArchive.length === 0) return 0;

      // Write archived entries to archive file
      const archivePath = join(this.dataDir, 'archive', `history_${cutoff.toISOString().split('T')[0]}.json`);
      let existing: unknown[] = [];
      try {
        if (existsSync(archivePath)) {
          existing = JSON.parse(await readFile(archivePath, 'utf-8'));
        }
      } catch { /* ignore */ }

      await writeFile(archivePath, JSON.stringify([...existing, ...toArchive], null, 2), 'utf-8');

      // Remove archived from active
      const remaining = items.filter(
        (item) => typeof item.timestamp !== 'string' || item.timestamp >= cutoffIso
      );
      this.cache.set('task_history', remaining);
      await this.persistCollection('task_history');

      console.log(`[jsonDb] Archived ${toArchive.length} history entries (older than ${daysThreshold} days)`);
      return toArchive.length;
    } finally {
      mutex.release();
    }
  }

  /**
   * Get statistics for health endpoint.
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [col, items] of this.cache.entries()) {
      stats[col] = items.length;
    }
    return stats;
  }

  /**
   * Check if any collections have unsaved changes.
   */
  hasDirtyCollections(): boolean {
    return this.dirty.size > 0;
  }

  getDirtyCollections(): CollectionName[] {
    return Array.from(this.dirty);
  }
}
