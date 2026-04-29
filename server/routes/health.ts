/**
 * health.ts â€” System Health & Cron Status Routes
 * Public endpoint (no auth required).
 */

import { Router } from 'express';
import type { IDatabase } from '../lib/db.js';
import type { WssBroadcast } from '../lib/wssBroadcast.js';
import type { GitSync } from '../lib/gitSync.js';
import type { EnterpriseTask, CronStatusEntry } from '../types.js';

// In-memory cron status store
const cronStatuses: Map<string, CronStatusEntry> = new Map();

export function createHealthRoutes(
  db: IDatabase,
  wss: WssBroadcast,
  git: GitSync,
  startTime: Date
): Router {
  const router = Router();

  // GET /api/health â€” Public system health
  router.get('/', (_req, res) => {
    const tasks = db.getAll<EnterpriseTask>('tasks');
    const stats = db.getStats();
    const wsStats = wss.getStats();
    const gitStatus = git.getStatus();

    const tasksByStatus: Record<string, number> = {};
    for (const task of tasks) {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    }

    res.json({
      status: 'healthy',
      version: '1.0.0',
      uptime_seconds: Math.floor((Date.now() - startTime.getTime()) / 1000),
      collections: stats,
      tasks: {
        total: tasks.length,
        by_status: tasksByStatus,
      },
      websocket: wsStats,
      git: {
        enabled: gitStatus.enabled,
        pending_changes: gitStatus.pendingChanges,
        last_commit: gitStatus.lastCommit?.toISOString() || null,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/health/cron â€” Cron job statuses
  router.get('/cron', (_req, res) => {
    const statuses = Array.from(cronStatuses.values());
    statuses.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json({ cron_jobs: statuses, count: statuses.length });
  });

  // POST /api/health/cron-status â€” Receive cron status from Jade CoS
  router.post('/cron-status', (req, res) => {
    const { job_name, status, duration_ms, error } = req.body;
    if (!job_name || !status) {
      res.status(400).json({ error: 'job_name and status are required' });
      return;
    }

    const entry: CronStatusEntry = {
      job_name,
      status,
      duration_ms,
      timestamp: new Date().toISOString(),
      error,
    };

    cronStatuses.set(job_name, entry);

    // Broadcast cron status
    wss.broadcast('cron_status', entry);

    res.json({ received: true });
  });

  return router;
}