/**
 * auth.ts — API Key Authentication Middleware
 * WOLF-006: API key in env var only. Never in client bundle.
 */

import type { Request, Response, NextFunction } from 'express';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/api/health', '/api/auth/token'];

export function createAuthMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for public paths
    if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) {
      next();
      return;
    }

    // Check Authorization header (Bearer <key>)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer' && parts[1] === apiKey) {
        next();
        return;
      }
    }

    // Check X-SDM-API-Key header
    const headerKey = req.headers['x-sdm-api-key'];
    if (headerKey === apiKey) {
      next();
      return;
    }

    // Check query parameter (for WebSocket upgrade compatibility)
    const queryKey = req.query.key;
    if (queryKey === apiKey) {
      next();
      return;
    }

    res.status(401).json({ error: 'Unauthorized — provide a valid API key' });
  };
}
