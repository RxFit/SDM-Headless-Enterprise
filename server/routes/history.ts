/**
 * history.ts — Audit Trail Query Routes
 */

import { Router } from 'express';
import type { JsonDb } from '../lib/jsonDb.js';
import type { TaskHistoryEntry } from '../types.js';

export function createHistoryRoutes(db: JsonDb): Router {
  const router = Router();

  // GET /api/history — Query history with filters
  router.get('/', (req, res) => {
    let entries = db.getAll<TaskHistoryEntry>('task_history');

    const { task_id, actor, action, start_date, end_date } = req.query;
    if (task_id) entries = entries.filter(e => e.task_id === task_id);
    if (actor) entries = entries.filter(e => e.actor === actor);
    if (action) entries = entries.filter(e => e.action === action);
    if (start_date) entries = entries.filter(e => e.timestamp >= (start_date as string));
    if (end_date) entries = entries.filter(e => e.timestamp <= (end_date as string));

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Limit results
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    entries = entries.slice(0, limit);

    res.json({ entries, count: entries.length });
  });

  // GET /api/history/task/:taskId — All history for a specific task
  router.get('/task/:taskId', (req, res) => {
    let entries = db.query<TaskHistoryEntry>('task_history', e => e.task_id === req.params.taskId);
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json({ entries, count: entries.length });
  });

  return router;
}
