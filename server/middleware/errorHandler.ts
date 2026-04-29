import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  logger.error({ 
    err: err.message, 
    stack: err.stack, 
    path: req.path, 
    method: req.method 
  }, '[Global Error Handler] Uncaught exception');

  // If headers are already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message
  });
};