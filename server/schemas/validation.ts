import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

// Base enums that mirror types.ts
export const TaskStatusSchema = z.enum(['pending', 'in-progress', 'done', 'blocked', 'deferred', 'cancelled', 'review']);
export const PrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export const SourceSchema = z.enum(['manual', 'google-drive', 'agent', 'cron', 'system-event', 'kaizen']);
export const NodeVariantSchema = z.enum(['core', 'data', 'agent', 'comms', 'finance', 'team', 'group']);
export const SystemStatusSchema = z.enum(['operational', 'degraded', 'down', 'unknown']);

// Tasks
export const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  node_id: z.string().nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  assignee: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  source: SourceSchema.optional(),
  agent_id: z.string().optional(),
  due_date: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
}).passthrough();

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: TaskStatusSchema.optional()
}).passthrough();

export const delegateTaskSchema = z.object({
  name: z.string().optional(),
  method: z.string().optional(),
  assignee: z.string().optional(),
  agent_id: z.string().optional(),
  message: z.string().optional()
}).passthrough();

// Nodes
export const createNodeSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  variant: NodeVariantSchema,
  status: SystemStatusSchema.optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  owner: z.string().optional(),
  url: z.string().optional(),
  container_name: z.string().optional(),
  health_endpoint: z.string().optional(),
  cron_jobs: z.array(z.string()).optional(),
  parent_id: z.string().optional(),
  extent: z.string().optional(),
  style: z.record(z.string(), z.any()).optional(),
  z_index: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional()
}).passthrough();

export const updateNodeSchema = createNodeSchema.partial().passthrough();

// Edges
export const createEdgeSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  animated: z.boolean().optional(),
  source_handle: z.string().optional(),
  target_handle: z.string().optional(),
  marker_end: z.object({ type: z.string() }).optional(),
  style: z.record(z.string(), z.any()).optional()
}).passthrough();

export const updateEdgeSchema = createEdgeSchema.partial().passthrough();

// Agents
export const agentCommandSchema = z.object({
  command: z.string().min(1),
  args: z.record(z.string(), z.any()).optional()
}).passthrough();

export const agentEventSchema = z.object({
  trigger: z.string().min(1),
  node: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
}).passthrough();

/**
 * Express middleware to validate request body against a Zod schema
 */
export const validateBody = (schema: z.ZodType<any, any, any>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error && (error as any).errors !== undefined) {
        logger.warn({ path: req.path, errors: (error as any).errors }, '[Validation] Zod schema mismatch');
        res.status(400).json({
          error: "Validation Failed",
          details: (error as any).errors.map((e: any) => ({ path: e.path.join('.'), message: e.message }))
        });
      } else {
        next(error);
      }
    }
  };
};