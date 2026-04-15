/**
 * useApiTasks.ts — API-backed task state hook (TASK_D01)
 * Replaces useTaskState.ts — fetches from SDM API and subscribes via WebSocket.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { EnterpriseTask } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

function authHeaders() {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}

export interface UseApiTasksReturn {
  tasks: EnterpriseTask[];
  loading: boolean;
  error: string | null;
  createTask: (data: Partial<EnterpriseTask>) => Promise<EnterpriseTask | null>;
  updateTask: (id: string, updates: Partial<EnterpriseTask>) => Promise<EnterpriseTask | null>;
  deleteTask: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useApiTasks(): UseApiTasksReturn {
  const [tasks, setTasks] = useState<EnterpriseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/tasks`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { tasks: EnterpriseTask[] };
      setTasks(data.tasks ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[useApiTasks] fetch error:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket for real-time updates
  useEffect(() => {
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws' + (API_KEY ? `?key=${API_KEY}` : '');
    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as { type: string; payload: EnterpriseTask };
          if (msg.type === 'task_created') {
            setTasks(prev => [msg.payload, ...prev]);
          } else if (msg.type === 'task_updated') {
            setTasks(prev => prev.map(t => t.id === msg.payload.id ? msg.payload : t));
          } else if (msg.type === 'task_deleted') {
            setTasks(prev => prev.filter(t => t.id !== msg.payload.id));
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    void fetchTasks();
    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [fetchTasks]);

  const createTask = useCallback(async (data: Partial<EnterpriseTask>): Promise<EnterpriseTask | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const task = await res.json() as EnterpriseTask;
      return task;
    } catch (err) {
      console.error('[useApiTasks] createTask error:', err);
      return null;
    }
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<EnterpriseTask>): Promise<EnterpriseTask | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const task = await res.json() as EnterpriseTask;
      return task;
    } catch (err) {
      console.error('[useApiTasks] updateTask error:', err);
      return null;
    }
  }, []);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { tasks, loading, error, createTask, updateTask, deleteTask, refetch: fetchTasks };
}
