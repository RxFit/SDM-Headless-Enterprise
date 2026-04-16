/**
 * tasks.ts — Task CRUD Routes
 * WOLF-008: Idempotency key support for agent task creation.
 *
 * The heart of the SDM Headless Enterprise.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { JsonDb } from '../lib/jsonDb.js';
import type { WssBroadcast } from '../lib/wssBroadcast.js';
import type { GitSync } from '../lib/gitSync.js';
import type {
  EnterpriseTask,
  TaskHistoryEntry,
  CreateTaskRequest,
  UpdateTaskRequest,
  DelegateTaskRequest,
  TaskStatus,
} from '../types.js';

export function createTaskRoutes(db: JsonDb, wss: WssBroadcast, git: GitSync): Router {
  const router = Router();

  // ─────────────────────────────────────────────────────────
  // GET /api/tasks — List tasks with optional filters
  // ─────────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    let tasks = db.getAll<EnterpriseTask>('tasks');

    // Apply filters
    const { node_id, status, priority, assignee, source } = req.query;
    if (node_id) tasks = tasks.filter(t => t.node_id === node_id);
    if (status) tasks = tasks.filter(t => t.status === status);
    if (priority) tasks = tasks.filter(t => t.priority === priority);
    if (assignee) tasks = tasks.filter(t => t.assignee === assignee);
    if (source) tasks = tasks.filter(t => t.source === source);

    res.json({ tasks, count: tasks.length });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/tasks/unassigned — Tasks with null node_id
  // ─────────────────────────────────────────────────────────
  router.get('/unassigned', (_req, res) => {
    const tasks = db.query<EnterpriseTask>('tasks', t => !t.node_id);
    res.json({ tasks, count: tasks.length });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/tasks/:id — Get single task
  // ─────────────────────────────────────────────────────────
  router.get('/:id', (req, res) => {
    const task = db.getById<EnterpriseTask>('tasks', req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Resolve dependencies
    if (task.depends_on && task.depends_on.length > 0) {
      const blocked_by = task.depends_on.filter(depId => {
        const dep = db.getById<EnterpriseTask>('tasks', depId);
        return dep && dep.status !== 'done';
      });
      task.blocked_by = blocked_by;
    }

    res.json(task);
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/tasks — Create task
  // ─────────────────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const body = req.body as CreateTaskRequest;

      if (!body.title) {
        res.status(400).json({ error: 'title is required' });
        return;
      }

      // WOLF-008: Check idempotency key
      if (body.metadata?.idempotency_key) {
        const existing = db.query<EnterpriseTask>('tasks', t =>
          t.metadata?.idempotency_key === body.metadata!.idempotency_key
        );
        if (existing.length > 0) {
          res.status(200).json(existing[0]); // Return existing, don't create duplicate
          return;
        }
      }

      // Check for circular dependencies
      if (body.depends_on && body.depends_on.length > 0) {
        for (const depId of body.depends_on) {
          if (!db.getById('tasks', depId)) {
            res.status(400).json({ error: `Dependency task not found: ${depId}` });
            return;
          }
        }
      }

      const now = new Date().toISOString();
      const task: EnterpriseTask = {
        id: uuidv4(),
        node_id: body.node_id ?? null,
        title: body.title,
        description: body.description,
        status: body.status || 'pending',
        priority: body.priority || 'medium',
        assignee: body.assignee,
        depends_on: body.depends_on,
        source: body.source || 'manual',
        agent_id: body.agent_id,
        due_date: body.due_date,
        created_at: now,
        updated_at: now,
        metadata: body.metadata,
      };

      // Auto-block if dependencies aren't done
      if (task.depends_on && task.depends_on.length > 0) {
        const unfinished = task.depends_on.filter(depId => {
          const dep = db.getById<EnterpriseTask>('tasks', depId);
          return dep && dep.status !== 'done';
        });
        if (unfinished.length > 0) {
          task.blocked_by = unfinished;
          task.status = 'blocked';
        }
      }

      await db.insert('tasks', task);

      // Create history entry
      const history: TaskHistoryEntry = {
        id: uuidv4(),
        task_id: task.id,
        action: 'created',
        actor: body.agent_id || 'user',
        to_value: task.status,
        timestamp: now,
      };
      await db.insert('task_history', history);

      // Broadcast
      wss.broadcast('task_created', task);
      git.recordChange();

      res.status(201).json(task);
    } catch (err) {
      console.error('[tasks] Create failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/tasks/:id — Update task
  // ─────────────────────────────────────────────────────────
  router.patch('/:id', async (req, res) => {
    try {
      const existing = db.getById<EnterpriseTask>('tasks', req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const body = req.body as UpdateTaskRequest;
      const now = new Date().toISOString();
      const patch: Partial<EnterpriseTask> = { updated_at: now };

      // Track changes for history
      const historyEntries: TaskHistoryEntry[] = [];

      if (body.status !== undefined && body.status !== existing.status) {
        const fromStatus = existing.status;
        patch.status = body.status;
        if (body.status === 'done') {
          patch.completed_at = now;
        }
        historyEntries.push({
          id: uuidv4(),
          task_id: existing.id,
          action: 'status_changed',
          actor: (req.body as Record<string, unknown>).actor as string || 'user',
          from_value: fromStatus,
          to_value: body.status,
          timestamp: now,
        });

        // Dependency cascade: if task is done, unblock dependents
        if (body.status === 'done') {
          await cascadeDependencyResolution(db, existing.id, wss, git);
        }
      }

      if (body.priority !== undefined && body.priority !== existing.priority) {
        historyEntries.push({
          id: uuidv4(),
          task_id: existing.id,
          action: 'priority_changed',
          actor: (req.body as Record<string, unknown>).actor as string || 'user',
          from_value: existing.priority,
          to_value: body.priority,
          timestamp: now,
        });
        patch.priority = body.priority;
      }

      if (body.assignee !== undefined && body.assignee !== existing.assignee) {
        historyEntries.push({
          id: uuidv4(),
          task_id: existing.id,
          action: 'assigned',
          actor: (req.body as Record<string, unknown>).actor as string || 'user',
          from_value: existing.assignee,
          to_value: body.assignee,
          timestamp: now,
        });
        patch.assignee = body.assignee;
      }

      if (body.description !== undefined) patch.description = body.description;
      if (body.depends_on !== undefined) patch.depends_on = body.depends_on;
      if (body.due_date !== undefined) patch.due_date = body.due_date;
      if (body.node_id !== undefined) patch.node_id = body.node_id;
      if (body.metadata !== undefined) patch.metadata = { ...existing.metadata, ...body.metadata };

      const updated = await db.update<EnterpriseTask>('tasks', req.params.id, patch);

      // Insert history entries
      for (const entry of historyEntries) {
        await db.insert('task_history', entry);
      }

      // Broadcast
      wss.broadcast('task_updated', updated);
      git.recordChange();

      res.json(updated);
    } catch (err) {
      console.error('[tasks] Update failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/tasks/:id — Soft delete (set status=cancelled)
  // ─────────────────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      const existing = db.getById<EnterpriseTask>('tasks', req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const now = new Date().toISOString();
      await db.update<EnterpriseTask>('tasks', req.params.id, {
        status: 'cancelled' as TaskStatus,
        updated_at: now,
      });

      await db.insert('task_history', {
        id: uuidv4(),
        task_id: existing.id,
        action: 'deleted',
        actor: 'user',
        from_value: existing.status,
        to_value: 'cancelled',
        timestamp: now,
      } as TaskHistoryEntry);

      wss.broadcast('task_deleted', { id: existing.id });
      git.recordChange();

      res.json({ deleted: true, id: existing.id });
    } catch (err) {
      console.error('[tasks] Delete failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/tasks/:id/delegate — Delegate task
  // ─────────────────────────────────────────────────────────
  router.post('/:id/delegate', async (req, res) => {
    try {
      const existing = db.getById<EnterpriseTask>('tasks', req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const body = req.body as DelegateTaskRequest;
      if (!body.name || !body.method) {
        res.status(400).json({ error: 'name and method are required' });
        return;
      }

      const now = new Date().toISOString();
      const delegationInfo = {
        name: body.name,
        email: body.email,
        method: body.method,
        delegated_at: now,
      };

      const updated = await db.update<EnterpriseTask>('tasks', req.params.id, {
        delegated_to: delegationInfo,
        assignee: body.name,
        updated_at: now,
      });

      await db.insert('task_history', {
        id: uuidv4(),
        task_id: existing.id,
        action: 'delegated',
        actor: 'user',
        from_value: existing.assignee,
        to_value: `${body.name} (${body.method})`,
        timestamp: now,
        metadata: { delegation: delegationInfo },
      } as TaskHistoryEntry);

      // TODO: Trigger notification via notifications.ts
      // notifications.send(body.method, body.email, existing.title);

      wss.broadcast('task_updated', updated);
      git.recordChange();

      res.json(updated);
    } catch (err) {
      console.error('[tasks] Delegate failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────
// Dependency Cascade Resolution
// ─────────────────────────────────────────────────────────

async function cascadeDependencyResolution(
  db: JsonDb,
  completedTaskId: string,
  wss: WssBroadcast,
  git: GitSync
): Promise<void> {
  // Find all tasks that depend on the completed task
  const dependents = db.query<EnterpriseTask>('tasks', (t) =>
    !!(t.depends_on?.includes(completedTaskId)) && t.status === 'blocked'
  );

  for (const dep of dependents) {
    // Check if ALL dependencies are now done
    const allDone = dep.depends_on!.every(depId => {
      const d = db.getById<EnterpriseTask>('tasks', depId);
      return d && d.status === 'done';
    });

    if (allDone) {
      const now = new Date().toISOString();
      await db.update<EnterpriseTask>('tasks', dep.id, {
        status: 'pending',
        blocked_by: [],
        updated_at: now,
      });

      await db.insert('task_history', {
        id: uuidv4(),
        task_id: dep.id,
        action: 'status_changed',
        actor: 'system',
        from_value: 'blocked',
        to_value: 'pending',
        timestamp: now,
        metadata: { reason: `All dependencies resolved (${completedTaskId} completed)` },
      } as TaskHistoryEntry);

      wss.broadcast('task_updated', { ...dep, status: 'pending', blocked_by: [] });
      git.recordChange();

      console.log(`[tasks] Auto-unblocked ${dep.id} (dependency ${completedTaskId} completed)`);
    }
  }
}
