import { useCallback, useState, useEffect } from 'react';
import type { Node } from '@xyflow/react';
import type { RxNodeData, TaskItem, TaskStatus, TaskPriority } from '../types';

const TASKS_STORAGE_KEY = 'rxfit-task-overrides';

interface TaskOverrides {
  [nodeId: string]: {
    [taskId: string]: Partial<TaskItem>;
  };
}

interface AddedTasks {
  [nodeId: string]: TaskItem[];
}

const ADDED_TASKS_KEY = 'rxfit-added-tasks';

/**
 * Central task state manager. Reads initial tasks from node data,
 * applies localStorage overrides (status toggles), and supports
 * adding new tasks — all persisted to localStorage.
 *
 * Wolverine Clause: auto-heals corrupted localStorage.
 */
export function useTaskState<T extends RxNodeData>(
  initialNodes: Node<T>[],
  externalTasks: Record<string, TaskItem[]> = {}
) {
  // Load overrides from localStorage
  const loadOverrides = useCallback((): TaskOverrides => {
    try {
      const raw = localStorage.getItem(TASKS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        localStorage.removeItem(TASKS_STORAGE_KEY);
        return {};
      }
      return parsed;
    } catch {
      localStorage.removeItem(TASKS_STORAGE_KEY);
      return {};
    }
  }, []);

  // Load user-added tasks
  const loadAddedTasks = useCallback((): AddedTasks => {
    try {
      const raw = localStorage.getItem(ADDED_TASKS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        localStorage.removeItem(ADDED_TASKS_KEY);
        return {};
      }
      return parsed;
    } catch {
      localStorage.removeItem(ADDED_TASKS_KEY);
      return {};
    }
  }, []);

  const [overrides, setOverrides] = useState<TaskOverrides>(loadOverrides);
  const [addedTasks, setAddedTasks] = useState<AddedTasks>(loadAddedTasks);

  // Persist overrides
  useEffect(() => {
    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(overrides));
    } catch { /* storage full — non-critical */ }
  }, [overrides]);

  // Persist added tasks
  useEffect(() => {
    try {
      localStorage.setItem(ADDED_TASKS_KEY, JSON.stringify(addedTasks));
    } catch { /* storage full — non-critical */ }
  }, [addedTasks]);

  /**
   * Get tasks for a specific node, merging base data + overrides + added tasks.
   */
  const getNodeTasks = useCallback(
    (nodeId: string): TaskItem[] => {
      const node = initialNodes.find((n) => n.id === nodeId);
      const baseTasks: TaskItem[] = (node?.data?.tasks as TaskItem[]) || [];
      const nodeOverrides = overrides[nodeId] || {};
      const nodeAdded = addedTasks[nodeId] || [];
      const nodeExternal = externalTasks[nodeId] || [];

      // Merge overrides into base tasks
      const merged = baseTasks.map((task) => {
        const override = nodeOverrides[task.id];
        return override ? { ...task, ...override } : task;
      });

      // Merge overrides into external (Google Drive) tasks
      const externalMerged = nodeExternal.map((task) => {
        const override = nodeOverrides[task.id];
        return override ? { ...task, ...override } : task;
      });

      // Merge overrides into user-added tasks
      const addedMerged = nodeAdded.map((task) => {
        const override = nodeOverrides[task.id];
        return override ? { ...task, ...override } : task;
      });

      return [...merged, ...externalMerged, ...addedMerged];
    },
    [initialNodes, overrides, addedTasks, externalTasks]
  );

  /**
   * Toggle a task between done ↔ pending.
   */
  const toggleTask = useCallback((nodeId: string, taskId: string) => {
    setOverrides((prev) => {
      const nodeOvr = prev[nodeId] || {};
      const currentOverride = nodeOvr[taskId] || {};

      // Find the base task status (check all three layers)
      const node = initialNodes.find((n) => n.id === nodeId);
      const baseTasks = (node?.data?.tasks as TaskItem[]) || [];
      const addedNodeTasks = addedTasks[nodeId] || [];
      const externalNodeTasks = externalTasks[nodeId] || [];
      const allTasks = [...baseTasks, ...externalNodeTasks, ...addedNodeTasks];
      const baseTask = allTasks.find((t) => t.id === taskId);

      const currentStatus: TaskStatus = (currentOverride.status as TaskStatus) || baseTask?.status || 'pending';
      const newStatus: TaskStatus = currentStatus === 'done' ? 'pending' : 'done';

      return {
        ...prev,
        [nodeId]: {
          ...nodeOvr,
          [taskId]: { ...currentOverride, status: newStatus },
        },
      };
    });
  }, [initialNodes, addedTasks, externalTasks]);

  /**
   * Add a new task to a node.
   */
  const addTask = useCallback(
    (nodeId: string, title: string, priority: TaskPriority, assignee?: string) => {
      const newTask: TaskItem = {
        id: `t-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        status: 'pending',
        priority,
        assignee: assignee || undefined,
        source: 'manual',
      };

      setAddedTasks((prev) => ({
        ...prev,
        [nodeId]: [...(prev[nodeId] || []), newTask],
      }));
    },
    []
  );

  /**
   * Delete a user-added task (can't delete base data tasks).
   */
  const deleteTask = useCallback((nodeId: string, taskId: string) => {
    setAddedTasks((prev) => ({
      ...prev,
      [nodeId]: (prev[nodeId] || []).filter((t) => t.id !== taskId),
    }));
    // Also remove any overrides for this task
    setOverrides((prev) => {
      const nodeOvr = { ...(prev[nodeId] || {}) };
      delete nodeOvr[taskId];
      return { ...prev, [nodeId]: nodeOvr };
    });
  }, []);

  /**
   * Get aggregate stats across all nodes.
   */
  const getAggregateStats = useCallback(() => {
    let total = 0;
    let done = 0;
    let pending = 0;
    let inProgress = 0;
    let blocked = 0;
    let critical = 0;
    const byVariant: Record<string, { total: number; done: number }> = {};
    const byAssignee: Record<string, { total: number; done: number }> = {};

    for (const node of initialNodes) {
      if (node.data.variant === 'group') continue;
      const tasks = getNodeTasks(node.id);
      const variant = node.data.variant;

      if (!byVariant[variant]) byVariant[variant] = { total: 0, done: 0 };

      for (const task of tasks) {
        total++;
        byVariant[variant].total++;

        if (task.assignee) {
          if (!byAssignee[task.assignee]) byAssignee[task.assignee] = { total: 0, done: 0 };
          byAssignee[task.assignee].total++;
        }

        if (task.status === 'done') {
          done++;
          byVariant[variant].done++;
          if (task.assignee) byAssignee[task.assignee].done++;
        } else if (task.status === 'in-progress') {
          inProgress++;
        } else if (task.status === 'blocked') {
          blocked++;
        } else {
          pending++;
        }

        if (task.priority === 'critical' && task.status !== 'done') {
          critical++;
        }
      }
    }

    // System status aggregation
    let operational = 0;
    let degraded = 0;
    let downCount = 0;
    let unknown = 0;
    const nonGroupNodes = initialNodes.filter((n) => n.data.variant !== 'group');
    for (const node of nonGroupNodes) {
      const s = node.data.status;
      if (s === 'operational') operational++;
      else if (s === 'degraded') degraded++;
      else if (s === 'down') downCount++;
      else unknown++;
    }

    return {
      tasks: { total, done, pending, inProgress, blocked, critical },
      systems: { total: nonGroupNodes.length, operational, degraded, down: downCount, unknown },
      byVariant,
      byAssignee,
    };
  }, [initialNodes, getNodeTasks]);

  return {
    getNodeTasks,
    toggleTask,
    addTask,
    deleteTask,
    getAggregateStats,
  };
}
