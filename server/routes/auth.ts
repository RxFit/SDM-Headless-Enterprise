import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger.js';

export function createAuthRoutes(apiKey: string) {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET || apiKey;

  // POST /api/v1/auth/token
  // Exchanges a valid api key for a time-limited JWT
  router.post('/token', (req: Request, res: Response): void => {
    const { key } = req.body;

    if (!key || key !== apiKey) {
      logger.warn(`[auth] Failed token exchange attempt from ${req.ip}`);
      res.status(401).json({ error: 'Invalid or missing API key' });
      return;
    }

    // Issue a JWT valid for 24 hours
    const token = jwt.sign({ role: 'sdm_client', issuer: 'cerberus' }, jwtSecret, { expiresIn: '24h' });
    
    logger.info(`[auth] Issued new JWT token to client at ${req.ip}`);
    res.json({ token, expires_in: 86400 });
  });

  return router;
}
