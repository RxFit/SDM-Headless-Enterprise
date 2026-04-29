/**
 * auth.ts — API Key Authentication Middleware
 * WOLF-006: API key in env var only. Never in client bundle.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger.js';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health', '/auth/token'];

export function createAuthMiddleware(apiKey: string) {
  const jwtSecret = process.env.JWT_SECRET || apiKey;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for public paths
    if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) {
      next();
      return;
    }

    // Check Authorization header (Bearer <token_or_key>)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];

        // Legacy/Direct API key check via Bearer
        if (token === apiKey) {
          next();
          return;
        }

        // JWT Validation
        try {
          const decoded = jwt.verify(token, jwtSecret);
          (req as any).user = decoded;
          next();
          return;
        } catch (err) {
          logger.warn(`[auth] Invalid JWT provided: ${(err as Error).message}`);
        }
      }
    }

    // Check X-SDM-API-Key header (Legacy/Direct)
    const headerKey = req.headers['x-sdm-api-key'];
    if (headerKey === apiKey) {
      next();
      return;
    }

    res.status(401).json({ error: 'Unauthorized — active JWT or valid API key required' });
  };
}