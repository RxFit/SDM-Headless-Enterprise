/**
 * nodes.ts â€” Node Topology CRUD Routes
 * Manages the ReactFlow system topology (positions, metadata, status).
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { IDatabase } from '../lib/db.js';
import type { WssBroadcast } from '../lib/wssBroadcast.js';
import type { GitSync } from '../lib/gitSync.js';
import { EnterpriseNode } from '../types.js';
import { logger } from "../lib/logger.js";
import { validateBody, createNodeSchema, updateNodeSchema } from '../schemas/validation.js';

export function createNodeRoutes(db: IDatabase, wss: WssBroadcast, git: GitSync): Router {
  const router = Router();

  // GET /api/nodes
  router.get('/', (_req, res) => {
    const nodes = db.getAll<EnterpriseNode>('nodes');
    res.json({ nodes, count: nodes.length });
  });

  // GET /api/nodes/:id
  router.get('/:id', (req, res) => {
    const node = db.getById<EnterpriseNode>('nodes', (req.params.id as string));
    if (!node) { res.status(404).json({ error: 'Node not found' }); return; }
    res.json(node);
  });

  // POST /api/nodes
  router.post('/', validateBody(createNodeSchema), async (req, res) => {
    try {
      const body = req.body;
      if (!body.label || !body.variant) {
        res.status(400).json({ error: 'label and variant are required' });
        return;
      }
      const node: EnterpriseNode = {
        id: body.id || uuidv4(),
        label: body.label,
        variant: body.variant,
        status: body.status || 'unknown',
        position: body.position || { x: 0, y: 0 },
        description: body.description,
        icon: body.icon,
        owner: body.owner,
        url: body.url,
        container_name: body.container_name,
        health_endpoint: body.health_endpoint,
        cron_jobs: body.cron_jobs,
        parent_id: body.parent_id,
        extent: body.extent,
        style: body.style,
        z_index: body.z_index,
        metadata: body.metadata,
      };

      await db.insert('nodes', node);
      wss.broadcast('node_updated', node);
      git.recordChange();
      res.status(201).json(node);
    } catch (err) {
      logger.error(err, '[nodes] Create failed:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/nodes/:id
  router.patch('/:id', validateBody(updateNodeSchema), async (req, res) => {
    try {
      const existing = db.getById<EnterpriseNode>('nodes', (req.params.id as string));
      if (!existing) { res.status(404).json({ error: 'Node not found' }); return; }

      const updated = await db.update<EnterpriseNode>('nodes', (req.params.id as string), req.body);
      wss.broadcast('node_updated', updated);
      git.recordChange();
      res.json(updated);
    } catch (err) {
      logger.error(err, '[nodes] Update failed:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/nodes/:id
  router.delete('/:id', async (req, res) => {
    try {
      const removed = await db.remove('nodes', (req.params.id as string));
      if (!removed) { res.status(404).json({ error: 'Node not found' }); return; }
      wss.broadcast('node_updated', { id: (req.params.id as string), deleted: true });
      git.recordChange();
      res.json({ deleted: true, id: (req.params.id as string) });
    } catch (err) {
      logger.error(err, '[nodes] Delete failed:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}