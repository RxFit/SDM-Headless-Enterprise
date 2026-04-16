/**
 * agents.ts — Agent Integration Routes
 * Endpoints for MCP tools (sdm_create_task, sdm_update_task, etc.)
 * and system event ingestion for auto-task creation.
 *
 * WOLF-008: Idempotency key support via CreateTaskRequest.metadata.idempotency_key
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { JsonDb } from '../lib/jsonDb.js';
import type { WssBroadcast } from '../lib/wssBroadcast.js';
import type { GitSync } from '../lib/gitSync.js';
import type {
  EnterpriseTask,
  TaskHistoryEntry,
  AgentEventRequest,
  AutoTaskRule,
  SdmConfig,
} from '../types.js';

export function createAgentRoutes(db: JsonDb, wss: WssBroadcast, git: GitSync): Router {
  const router = Router();

  // ─────────────────────────────────────────────────────────
  // POST /api/agents/tasks — Agent creates a task
  // (Same as POST /api/tasks but with agent-specific defaults)
  // ─────────────────────────────────────────────────────────
  router.post('/tasks', async (req, res) => {
    try {
      const body = req.body;

      if (!body.title) {
        res.status(400).json({ error: 'title is required' });
        return;
      }

      // Idempotency check
      if (body.idempotency_key) {
        const existing = db.query<EnterpriseTask>('tasks', t =>
          t.metadata?.idempotency_key === body.idempotency_key
        );
        if (existing.length > 0) {
          res.status(200).json({ task: existing[0], duplicate: true });
          return;
        }
      }

      const now = new Date().toISOString();
      const task: EnterpriseTask = {
        id: uuidv4(),
        node_id: body.node_id || null,
        title: body.title,
        description: body.description,
        status: body.status || 'pending',
        priority: body.priority || 'medium',
        assignee: body.assignee || body.agent_id,
        source: 'agent',
        agent_id: body.agent_id,
        due_date: body.due_date,
        depends_on: body.depends_on,
        created_at: now,
        updated_at: now,
        metadata: {
          ...body.metadata,
          idempotency_key: body.idempotency_key,
        },
      };

      await db.insert('tasks', task);

      await db.insert('task_history', {
        id: uuidv4(),
        task_id: task.id,
        action: 'created',
        actor: body.agent_id || 'agent',
        to_value: task.status,
        timestamp: now,
        metadata: { source: 'agent_api' },
      } as TaskHistoryEntry);

      wss.broadcast('task_created', task);
      git.recordChange();

      res.status(201).json({ task, duplicate: false });
    } catch (err) {
      console.error('[agents] Task creation failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/agents/events — Ingest system events
  // (container_unhealthy, pr_merged, audit_complete, etc.)
  // ─────────────────────────────────────────────────────────
  router.post('/events', async (req, res) => {
    try {
      const body = req.body as AgentEventRequest;

      if (!body.trigger) {
        res.status(400).json({ error: 'trigger is required' });
        return;
      }

      // Load auto-task rules from config
      const config = loadConfig(db);
      const matchingRules = config.auto_task_rules.filter(
        rule => rule.trigger === body.trigger && rule.enabled
      );

      if (matchingRules.length === 0) {
        res.json({ created: [], message: 'No matching auto-task rules' });
        return;
      }

      const createdTasks: EnterpriseTask[] = [];
      const now = new Date().toISOString();

      for (const rule of matchingRules) {
        // Template expansion
        let title = rule.title_template;
        title = title.replace('{{node}}', body.node || rule.node_id || 'unknown');
        if (body.metadata) {
          for (const [key, value] of Object.entries(body.metadata)) {
            title = title.replace(`{{${key}}}`, String(value));
          }
        }

        // Idempotency: don't create duplicate auto-tasks within 1 hour
        const idempKey = `auto_${body.trigger}_${body.node || rule.node_id}_${now.slice(0, 13)}`;
        const existing = db.query<EnterpriseTask>('tasks', t =>
          t.metadata?.idempotency_key === idempKey
        );
        if (existing.length > 0) continue;

        const task: EnterpriseTask = {
          id: uuidv4(),
          node_id: body.node || rule.node_id,
          title,
          status: 'pending',
          priority: rule.priority,
          source: 'system-event',
          created_at: now,
          updated_at: now,
          metadata: {
            trigger: body.trigger,
            idempotency_key: idempKey,
            event_metadata: body.metadata,
          },
        };

        await db.insert('tasks', task);
        await db.insert('task_history', {
          id: uuidv4(),
          task_id: task.id,
          action: 'created',
          actor: 'system',
          to_value: 'pending',
          timestamp: now,
          metadata: { trigger: body.trigger },
        } as TaskHistoryEntry);

        createdTasks.push(task);
        wss.broadcast('task_created', task);
        git.recordChange();
      }

      res.json({ created: createdTasks, count: createdTasks.length });
    } catch (err) {
      console.error('[agents] Event ingestion failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

// Load config from data/config.json via the DB
function loadConfig(db: JsonDb): SdmConfig {
  // Config is stored separately, not in the standard collections
  // Return a default if not loaded
  return {
    version: '1.0.0',
    websocket: { heartbeat_interval_ms: 30000, max_connections: 50 },
    auto_task_rules: [
      {
        trigger: 'container_unhealthy',
        node_id: '',
        priority: 'critical',
        title_template: 'Fix {{node}} container health',
        enabled: true,
      },
      {
        trigger: 'cron_failed',
        node_id: 'jade',
        priority: 'high',
        title_template: 'Investigate failed cron: {{job_name}}',
        enabled: true,
      },
      {
        trigger: 'kaizen_approved',
        node_id: '',
        priority: 'medium',
        title_template: 'Implement Kaizen proposal: {{proposal_title}}',
        enabled: true,
      },
    ],
  };
}
