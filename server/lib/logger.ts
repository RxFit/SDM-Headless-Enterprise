import pino from "pino";

// Determine if we are in development mode
const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * Core Pino logger configuration for Cerberus SDM
 * Uses pino-pretty in development for readability.
 * In production, emits raw structured JSON for the Trejo Protocol.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // In development, pipe output through pino-pretty
  ...(isDevelopment && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
  // Default base fields for all logs
  base: {
    env: process.env.NODE_ENV || "development"
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  }
});

/**
 * Helper to create child loggers with predefined context.
 * Best practice: pass a module name (e.g., { module: 'WssBroadcast' })
 */
export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};