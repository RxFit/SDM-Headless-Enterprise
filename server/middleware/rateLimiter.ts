import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";

// Create a global rate limiter: 100 requests per minute
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`[RateLimit] Global limit exceeded by ${req.ip} for ${req.method} ${req.originalUrl}`);
    res.status(429).json({ error: "Too many requests, please try again later." });
  }
});

// Create a stricter rate limiter for write operations (POST, PATCH, DELETE): 10 requests per minute
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 10, 
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`[RateLimit] Write limit exceeded by ${req.ip} for ${req.method} ${req.originalUrl}`);
    res.status(429).json({ error: "Too many write operations, please try again later." });
  }
});

// Middleware to selectively apply the write limiter based on HTTP method
export const selectiveWriteLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
};