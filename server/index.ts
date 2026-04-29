/**
 * index.ts â€” SDM Headless Enterprise Server Entry Point
 *
 * Wires together: Express API, JSON DB, WebSocket, Git Sync, Auth.
 * Source of Truth for all enterprise operations.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { DatabaseFacade, IDatabase } from './lib/db.js';
import { GitSync } from './lib/gitSync.js';
import { WssBroadcast } from './lib/wssBroadcast.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createNodeRoutes } from './routes/nodes.js';
import { createEdgeRoutes } from './routes/edges.js';
import { createHistoryRoutes } from './routes/history.js';
import { createHealthRoutes } from './routes/health.js';
import { createAgentRoutes } from './routes/agents.js';
import { createAuthRoutes } from './routes/auth.js';
import { initSheetSync } from './lib/sheetSync.js';
import { initAutoTaskEngine } from './lib/autoTaskRules.js';
import { logger } from "./lib/logger.js";
import { requestIdMiddleware } from './middleware/requestId.js';
import { globalLimiter, selectiveWriteLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In dev: __dirname = <project>/server â†’ ROOT = <project>
// In prod: __dirname = /app/dist/server â†’ ROOT = /app/dist â†’ need /app
// Resolve ROOT by checking if data/ exists at each level
function resolveRoot(): string {
  const oneUp = join(__dirname, '..');
  if (existsSync(join(oneUp, 'data'))) return oneUp;
  const twoUp = join(__dirname, '..', '..');
  if (existsSync(join(twoUp, 'data'))) return twoUp;
  return oneUp; // fallback
}
const ROOT = process.env.SDM_ROOT || resolveRoot();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Configuration
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PORT = parseInt(process.env.PORT || '8090', 10);
const API_KEY = process.env.SDM_API_KEY || '';
const GIT_ENABLED = process.env.GIT_AUTO_SYNC !== 'false';
const GIT_INTERVAL = parseInt(process.env.GIT_SYNC_INTERVAL_MS || '30000', 10);

if (!API_KEY) {
  logger.warn('[server] âš  SDM_API_KEY not set â€” API will operate without authentication');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Initialize Core Systems
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const dataDir = join(ROOT, 'data');
const db = new DatabaseFacade(dataDir);
const git = new GitSync(ROOT, GIT_INTERVAL, GIT_ENABLED);
const wss = new WssBroadcast(API_KEY);
const startTime = new Date();

// Wire DB changes â†’ git sync
db.on('change', () => {
  git.recordChange();
});

// Auto-task rule engine (config-driven)
const autoTaskEngine = initAutoTaskEngine(db, wss);

// Sheet sync engine (optional â€” requires GOOGLE_SHEET_ID)
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_CREDS = process.env.GOOGLE_CREDENTIALS_PATH || join(ROOT, 'credentials.json');
const SHEET_INTERVAL = parseInt(process.env.SHEET_SYNC_INTERVAL_MS || '60000', 10);
const sheetSync = SHEET_ID ? initSheetSync(db, wss, {
  spreadsheet_id: SHEET_ID,
  credentials_path: SHEET_CREDS,
  sync_interval_ms: SHEET_INTERVAL,
}) : null;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Express App
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const app = express();
const server = createServer(app);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", "https://ops.rxfit.ai", "https://rxfit.app", "http://localhost:*"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
const allowedOrigins = [/^https?:\/\/localhost:\d+$/, /^https:\/\/ops\.rxfit\.ai$/, /^https:\/\/rxfit\.app$/];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.some(rx => rx.test(origin))) {
      callback(null, true);
    } else {
      logger.warn(`[cors] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestIdMiddleware);

// Rate Limits
app.use(globalLimiter);
app.use(selectiveWriteLimiter);

// Legacy API Redirect (Deprecation)
app.use('/api', (req, res, next) => {
  if (!req.url.startsWith('/v1/')) {
    res.setHeader('Deprecation', 'true');
    // req.originalUrl preserves querystring e.g. /api/tasks?foo=bar
    const newUrl = req.originalUrl.replace(/^\/api\//, '/api/v1/');
    // If it's precisely /api, redirect to /api/v1/
    if (req.originalUrl === '/api') return res.redirect(301, '/api/v1/');
    return res.redirect(301, newUrl);
  }
  next();
});

// Auth middleware (skip public paths)
if (API_KEY) {
  app.use('/api/v1', createAuthMiddleware(API_KEY));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// API Routes
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api/v1/auth', createAuthRoutes(API_KEY));
app.use('/api/v1/health', createHealthRoutes(db, wss, git, startTime));
app.use('/api/v1/tasks', createTaskRoutes(db, wss, git));
app.use('/api/v1/nodes', createNodeRoutes(db, wss, git));
app.use('/api/v1/edges', createEdgeRoutes(db, wss, git));
app.use('/api/v1/history', createHistoryRoutes(db));
app.use('/api/v1/agents', createAgentRoutes(db, wss, git));

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Static File Serving (built client)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const clientDist = join(ROOT, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA catch-all â€” ONLY for non-API paths
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
  logger.info(`[server] Serving static client from ${clientDist}`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Global Error Handler
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(errorHandler);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Boot Sequence
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function boot() {
  try {
    // 1. Initialize JSON database
    await db.initialize();
    logger.info('[server] âœ“ JSON database initialized');

    // 2. Attach WebSocket server
    wss.attach(server);
    logger.info('[server] âœ“ WebSocket server attached');

    // 3. Start git sync
    git.start();
    logger.info('[server] âœ“ Git sync started');

    // 4. Load auto-task rules from config
    try {
      const config = db.getConfig();
      autoTaskEngine.loadRules(config);
      logger.info('[server] âœ“ Auto-task rules loaded');
    } catch (e) {
      logger.warn(e, '[server] Auto-task rules not loaded');
    }

    // 5. Start sheet sync (if configured)
    if (sheetSync) {
      try {
        await sheetSync.initialize();
        sheetSync.start();
        logger.info('[server] âœ“ Google Sheet sync started');
      } catch (e) {
        logger.warn(e, '[server] Sheet sync failed to init (check GOOGLE_SHEET_ID + credentials)');
      }
    } else {
      logger.info('[server] Google Sheet sync: DISABLED (no GOOGLE_SHEET_ID)');
    }

    // 6. Start HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      logger.info('');
      logger.info('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
      logger.info('â•‘   SDM HEADLESS ENTERPRISE â€” ONLINE              â•‘');
      logger.info(`â•‘   HTTP:  http://localhost:${PORT}                  â•‘`);
      logger.info(`â•‘   WS:    ws://localhost:${PORT}/ws                 â•‘`);
      logger.info(`â•‘   Auth:  ${API_KEY ? 'ENABLED' : 'DISABLED (no SDM_API_KEY)'}${''.padEnd(API_KEY ? 14 : 0)}    â•‘`);
      logger.info(`â•‘   Git:   ${GIT_ENABLED ? 'ENABLED' : 'DISABLED'}${''.padEnd(GIT_ENABLED ? 15 : 16)}              â•‘`);
      logger.info('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
      logger.info('');
    });

    // 5. Schedule daily history archival (midnight)
    scheduleHistoryArchival();

  } catch (err) {
    logger.error(err, '[server] Boot failure');
    process.exit(1);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Graceful Shutdown
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function shutdown(signal: string) {
  logger.info(`[server] ${signal} received â€” shutting down gracefully`);

  // Flush git changes
  await git.flush();
  git.stop();

  // Close WebSocket
  wss.close();

  // Close HTTP server
  server.close(() => {
    logger.info('[server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('[server] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Daily History Archival (WOLF-007)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function scheduleHistoryArchival(): void {
  // Run at 3:00 AM daily
  const now = new Date();
  const next3AM = new Date(now);
  next3AM.setHours(3, 0, 0, 0);
  if (next3AM <= now) next3AM.setDate(next3AM.getDate() + 1);
  const delay = next3AM.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      const archived = await db.archiveOldHistory(90);
      logger.info(`[server] Daily archival: ${archived} history entries archived`);
    } catch (err) {
      logger.error(err as Error, '[server] Archival failed');
    }
    // Reschedule for next day
    scheduleHistoryArchival();
  }, delay);

  logger.info(`[server] History archival scheduled in ${Math.round(delay / 3600000)}h`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// IGNITE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
boot();