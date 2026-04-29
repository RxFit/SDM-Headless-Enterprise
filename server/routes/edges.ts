/**
 * edges.ts â€” Edge CRUD Routes
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { IDatabase } from '../lib/db.js';
import type { WssBroadcast } from '../lib/wssBroadcast.js';
import type { GitSync } from '../lib/gitSync.js';
import { EnterpriseEdge } from '../types.js';
import { logger } from "../lib/logger.js";
import { validateBody, createEdgeSchema, updateEdgeSchema } from '../schemas/validation.js';

export function createEdgeRoutes(db: IDatabase, wss: WssBroadcast, git: GitSync): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const edges = db.getAll<EnterpriseEdge>('edges');
    res.json({ edges, count: edges.length });
  });

  router.post('/', validateBody(createEdgeSchema), async (req, res) => {
    try {
      const body = req.body;
      if (!body.source || !body.target) {
        res.status(400).json({ error: 'source and target are required' });
        return;
      }
      const edge: EnterpriseEdge = {
        id: body.id || `e-${uuidv4().slice(0, 8)}`,
        source: body.source,
        target: body.target,
        label: body.label,
        animated: body.animated,
        source_handle: body.source_handle,
        target_handle: body.target_handle,
        marker_end: body.marker_end,
        style: body.style,
      };
      await db.insert('edges', edge);
      wss.broadcast('edge_updated', edge);
      git.recordChange();
      res.status(201).json(edge);
    } catch (err) {
      logger.error(err, '[edges] Create failed:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id', validateBody(updateEdgeSchema), async (req, res) => {
    try {
      const existing = db.getById<EnterpriseEdge>('edges', (req.params.id as string));
      if (!existing) { res.status(404).json({ error: 'Edge not found' }); return; }
      const updated = await db.update<EnterpriseEdge>('edges', (req.params.id as string), req.body);
      wss.broadcast('edge_updated', updated);
      git.recordChange();
      res.json(updated);
    } catch (err) {
      logger.error(err, '[edges] Update failed:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const removed = await db.remove('edges', (req.params.id as string));
      if (!removed) { res.status(404).json({ error: 'Edge not found' }); return; }
      wss.broadcast('edge_updated', { id: (req.params.id as string), deleted: true });
      git.recordChange();
      res.json({ deleted: true, id: (req.params.id as string) });
    } catch (err) {
      logger.error(err, '[edges] Delete failed:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}