import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { createChildLogger } from "../lib/logger.js";
import { Logger } from "pino";

// Augment the Express Request object to include our properties
declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
    }
  }
}

/**
 * Middleware: Request ID & Child Logger
 * Generates a unique UUID for each incoming request, attaches it to the req object,
 * adds it to the X-Request-Id header, and initializes a child logger bound to this ID.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const reqId = req.headers["x-request-id"] as string || uuidv4();
  
  req.id = reqId;
  res.setHeader("X-Request-Id", reqId);
  
  // Attach a child logger so all route handlers can log with context
  req.log = createChildLogger({ reqId });
  
  // Log the initial request
  req.log.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, "Incoming request");
  
  // Log on completion
  res.on("finish", () => {
    req.log.info({
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
    }, "Request completed");
  });

  next();
};