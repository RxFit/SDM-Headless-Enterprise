import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskItem, TaskPriority, TaskStatus } from '../types';
import {
  dataSources,
  DEFAULT_COLUMN_MAP,
  HEADER_ALIASES,
  SYSTEM_TO_NODE_ID,
  type ColumnMapping,
  type SheetDataSource,
} from '../data/dataSources';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'loading' | 'error' | 'disabled';

interface SyncState {
  /** Tasks grouped by node ID */
  tasksByNode: Record<string, TaskItem[]>;
  /** Current sync status */
  status: SyncStatus;
  /** Last successful sync timestamp */
  lastSync: Date | null;
  /** Error message if status is 'error' */
  error: string | null;
  /** Number of tasks fetched */
  taskCount: number;
}

interface UseGoogleSheetTasksReturn extends SyncState {
  /** Force an immediate refresh of all data sources */
  refresh: () => void;
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const CACHE_KEY = 'rxfit-gdrive-cache';

// Valid priority/status values for normalization
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_STATUSES: TaskStatus[] = ['pending', 'in-progress', 'done', 'blocked'];

// ─────────────────────────────────────────────────────────
// Helper: Fuzzy column header resolution
// ─────────────────────────────────────────────────────────

function resolveColumnMap(
  headers: string[],
  overrides?: Partial<ColumnMapping>
): Record<keyof ColumnMapping, number> {
  const map: Record<string, number> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    // First check explicit override
    const override = overrides?.[field as keyof ColumnMapping];
    if (override) {
      const idx = lowerHeaders.indexOf(override.toLowerCase());
      if (idx !== -1) {
        map[field] = idx;
        continue;
      }
    }

    // Then check default map
    const defaultName = DEFAULT_COLUMN_MAP[field as keyof ColumnMapping];
    const defaultIdx = lowerHeaders.indexOf(defaultName.toLowerCase());
    if (defaultIdx !== -1) {
      map[field] = defaultIdx;
      continue;
    }

    // Finally try all aliases
    for (const alias of aliases) {
      const aliasIdx = lowerHeaders.indexOf(alias);
      if (aliasIdx !== -1) {
        map[field] = aliasIdx;
        break;
      }
    }
  }

  return map as Record<keyof ColumnMapping, number>;
}

// ─────────────────────────────────────────────────────────
// Helper: Normalize priority/status strings from freeform sheet input
// ─────────────────────────────────────────────────────────

function normalizePriority(raw: string): TaskPriority {
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith('crit')) return 'critical';
  if (lower.startsWith('high') || lower === 'h' || lower === 'urgent') return 'high';
  if (lower.startsWith('low') || lower === 'l') return 'low';
  if (VALID_PRIORITIES.includes(lower as TaskPriority)) return lower as TaskPriority;
  return 'medium'; // default
}

function normalizeStatus(raw: string): TaskStatus {
  const lower = raw.toLowerCase().trim();
  if (lower === 'done' || lower === 'complete' || lower === 'completed' || lower === 'yes' || lower === 'true' || lower === '✅') return 'done';
  if (lower === 'blocked' || lower === 'stuck' || lower === 'waiting') return 'blocked';
  if (lower.includes('progress') || lower === 'active' || lower === 'wip' || lower === 'in progress') return 'in-progress';
  if (VALID_STATUSES.includes(lower as TaskStatus)) return lower as TaskStatus;
  return 'pending'; // default
}

// ─────────────────────────────────────────────────────────
// Helper: Resolve "System" column value → node ID
// ─────────────────────────────────────────────────────────

function resolveNodeId(systemValue: string, fallbackNodeId: string): string {
  if (!systemValue) return fallbackNodeId;
  const lower = systemValue.toLowerCase().trim();
  return SYSTEM_TO_NODE_ID[lower] || fallbackNodeId;
}

// ─────────────────────────────────────────────────────────
// Helper: Parse rows from a single data source
// ─────────────────────────────────────────────────────────

function parseSheetRows(
  source: SheetDataSource,
  headers: string[],
  rows: Record<string, string>[]
): Record<string, TaskItem[]> {
  const colMap = resolveColumnMap(headers, source.columnMap);
  const result: Record<string, TaskItem[]> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values = headers.map((h) => row[h] || '');

    const titleIdx = colMap.title;
    const title = titleIdx !== undefined ? values[titleIdx] : '';
    if (!title) continue; // skip rows without a title

    const statusIdx = colMap.status;
    const priorityIdx = colMap.priority;
    const assigneeIdx = colMap.assignee;
    const systemIdx = colMap.system;
    const dueDateIdx = colMap.dueDate;

    const status = statusIdx !== undefined ? normalizeStatus(values[statusIdx]) : 'pending';
    const priority = priorityIdx !== undefined ? normalizePriority(values[priorityIdx]) : 'medium';
    const assignee = assigneeIdx !== undefined ? values[assigneeIdx] || undefined : undefined;
    const dueDate = dueDateIdx !== undefined ? values[dueDateIdx] || undefined : undefined;
    const systemVal = systemIdx !== undefined ? values[systemIdx] : '';

    // Determine target node ID
    const fallbackNode = source.nodeMapping !== 'auto' ? source.nodeMapping : 'cc';
    const nodeId = source.nodeMapping === 'auto'
      ? resolveNodeId(systemVal, fallbackNode)
      : source.nodeMapping;

    const task: TaskItem = {
      id: `t-gdrive-${source.id}-${i}`,
      title,
      status,
      priority,
      assignee,
      dueDate,
      source: 'google-drive',
    };

    if (!result[nodeId]) result[nodeId] = [];
    result[nodeId].push(task);
  }

  return result;
}

// ─────────────────────────────────────────────────────────
// Helper: localStorage cache (Wolverine Clause)
// ─────────────────────────────────────────────────────────

interface CachedData {
  tasksByNode: Record<string, TaskItem[]>;
  lastSync: string;
  taskCount: number;
}

function loadCache(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed.tasksByNode) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function saveCache(data: CachedData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* storage full — non-critical */ }
}

// ─────────────────────────────────────────────────────────
// Helper: Fetch a single data source
// ─────────────────────────────────────────────────────────

async function fetchDataSource(
  source: SheetDataSource
): Promise<Record<string, TaskItem[]>> {
  if (!source.proxyUrl) {
    return {}; // No URL configured yet — skip silently
  }

  const url = new URL(source.proxyUrl);
  if (source.sheetTab) {
    url.searchParams.set('sheet', source.sheetTab);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.rows || !Array.isArray(data.rows)) {
    throw new Error('Invalid response format: missing rows array');
  }

  const headers: string[] = data.headers || (data.rows.length > 0 ? Object.keys(data.rows[0]) : []);
  return parseSheetRows(source, headers, data.rows);
}

// ─────────────────────────────────────────────────────────
// Hook: useGoogleSheetTasks
// ─────────────────────────────────────────────────────────

export function useGoogleSheetTasks(): UseGoogleSheetTasksReturn {
  const enabledSources = dataSources.filter((s) => s.enabled);
  const hasConfiguredSources = enabledSources.some((s) => !!s.proxyUrl);

  // Initialize from cache
  const cached = loadCache();

  const [state, setState] = useState<SyncState>({
    tasksByNode: cached?.tasksByNode || {},
    status: hasConfiguredSources ? 'idle' : 'disabled',
    lastSync: cached?.lastSync ? new Date(cached.lastSync) : null,
    error: null,
    taskCount: cached?.taskCount || 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Core fetch function
  const fetchAll = useCallback(async () => {
    if (!hasConfiguredSources) {
      setState((prev) => ({ ...prev, status: 'disabled' }));
      return;
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    try {
      const allTasks: Record<string, TaskItem[]> = {};

      for (const source of enabledSources) {
        if (!source.proxyUrl) continue;

        const sourceTasks = await fetchDataSource(source);
        for (const [nodeId, tasks] of Object.entries(sourceTasks)) {
          if (!allTasks[nodeId]) allTasks[nodeId] = [];
          allTasks[nodeId].push(...tasks);
        }
      }

      // Count total tasks
      let taskCount = 0;
      for (const tasks of Object.values(allTasks)) {
        taskCount += tasks.length;
      }

      const now = new Date();

      // Persist to cache
      saveCache({
        tasksByNode: allTasks,
        lastSync: now.toISOString(),
        taskCount,
      });

      if (mountedRef.current) {
        setState({
          tasksByNode: allTasks,
          status: 'idle',
          lastSync: now,
          error: null,
          taskCount,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: errorMsg,
          // Keep last-known-good data (Wolverine Clause)
        }));
      }
    }
  }, [enabledSources, hasConfiguredSources]);

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    if (hasConfiguredSources) {
      fetchAll();
    }
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling interval
  useEffect(() => {
    if (!hasConfiguredSources) return;

    // Use the shortest interval from all enabled sources
    const minInterval = Math.min(...enabledSources.map((s) => s.refreshIntervalMs));

    intervalRef.current = setInterval(fetchAll, minInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchAll, enabledSources, hasConfiguredSources]);

  // Manual refresh
  const refresh = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    ...state,
    refresh,
  };
}
