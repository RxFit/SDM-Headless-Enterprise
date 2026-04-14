/**
 * index.ts — SDM Headless Enterprise Server Entry Point
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

import { JsonDb } from './lib/jsonDb.js';
import { GitSync } from './lib/gitSync.js';
import { WssBroadcast } from './lib/wssBroadcast.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createNodeRoutes } from './routes/nodes.js';
import { createEdgeRoutes } from './routes/edges.js';
import { createHistoryRoutes } from './routes/history.js';
import { createHealthRoutes } from './routes/health.js';
import { createAgentRoutes } from './routes/agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8090', 10);
const API_KEY = process.env.SDM_API_KEY || '';
const GIT_ENABLED = process.env.GIT_AUTO_SYNC !== 'false';
const GIT_INTERVAL = parseInt(process.env.GIT_SYNC_INTERVAL_MS || '30000', 10);

if (!API_KEY) {
  console.warn('[server] ⚠ SDM_API_KEY not set — API will operate without authentication');
}

// ─────────────────────────────────────────────────────────
// Initialize Core Systems
// ─────────────────────────────────────────────────────────
const dataDir = join(ROOT, 'data');
const db = new JsonDb(dataDir);
const git = new GitSync(ROOT, GIT_INTERVAL, GIT_ENABLED);
const wss = new WssBroadcast(API_KEY);
const startTime = new Date();

// Wire DB changes → git sync
db.on('change', () => {
  git.recordChange();
});

// ─────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────
const app = express();
const server = createServer(app);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow iframe embedding
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: true, // Allow all origins (Concierge iframe, standalone, dev)
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Auth middleware (skip public paths)
if (API_KEY) {
  app.use('/api', createAuthMiddleware(API_KEY));
}

// ─────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────
app.use('/api/health', createHealthRoutes(db, wss, git, startTime));
app.use('/api/tasks', createTaskRoutes(db, wss, git));
app.use('/api/nodes', createNodeRoutes(db, wss, git));
app.use('/api/edges', createEdgeRoutes(db, wss, git));
app.use('/api/history', createHistoryRoutes(db));
app.use('/api/agents', createAgentRoutes(db, wss, git));

// ─────────────────────────────────────────────────────────
// Static File Serving (built client)
// ─────────────────────────────────────────────────────────
const clientDist = join(ROOT, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA catch-all — ONLY for non-API paths
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
  console.log(`[server] Serving static client from ${clientDist}`);
}

// ─────────────────────────────────────────────────────────
// Boot Sequence
// ─────────────────────────────────────────────────────────
async function boot() {
  try {
    // 1. Initialize JSON database
    await db.initialize();
    console.log('[server] ✓ JSON database initialized');

    // 2. Attach WebSocket server
    wss.attach(server);
    console.log('[server] ✓ WebSocket server attached');

    // 3. Start git sync
    git.start();
    console.log('[server] ✓ Git sync started');

    // 4. Start HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║   SDM HEADLESS ENTERPRISE — ONLINE              ║');
      console.log(`║   HTTP:  http://localhost:${PORT}                  ║`);
      console.log(`║   WS:    ws://localhost:${PORT}/ws                 ║`);
      console.log(`║   Auth:  ${API_KEY ? 'ENABLED' : 'DISABLED (no SDM_API_KEY)'}${''.padEnd(API_KEY ? 14 : 0)}    ║`);
      console.log(`║   Git:   ${GIT_ENABLED ? 'ENABLED' : 'DISABLED'}${''.padEnd(GIT_ENABLED ? 15 : 16)}              ║`);
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');
    });

    // 5. Schedule daily history archival (midnight)
    scheduleHistoryArchival();

  } catch (err) {
    console.error('[server] Boot failure:', err);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────
// Graceful Shutdown
// ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`[server] ${signal} received — shutting down gracefully`);

  // Flush git changes
  await git.flush();
  git.stop();

  // Close WebSocket
  wss.close();

  // Close HTTP server
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[server] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─────────────────────────────────────────────────────────
// Daily History Archival (WOLF-007)
// ─────────────────────────────────────────────────────────
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
      console.log(`[server] Daily archival: ${archived} history entries archived`);
    } catch (err) {
      console.error('[server] Archival failed:', err);
    }
    // Reschedule for next day
    scheduleHistoryArchival();
  }, delay);

  console.log(`[server] History archival scheduled in ${Math.round(delay / 3600000)}h`);
}

// ─────────────────────────────────────────────────────────
// IGNITE
// ─────────────────────────────────────────────────────────
boot();
