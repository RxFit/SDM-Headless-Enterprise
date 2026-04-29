/**
 * wssBroadcast.ts Ã¢â‚¬â€ WebSocket Broadcast Engine
 * WOLF-004: Max 50 connections. Heartbeat-based dead client cleanup.
 *
 * Real-time event broadcasting for the Source of Truth Mandate.
 * All connected clients (Concierge iframe, standalone, agents) receive
 * instant updates when tasks, nodes, or edges change.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import type { WsEvent, WsEventType } from '../types.js';
import { logger } from "./logger.js";


const MAX_CONNECTIONS = 50;
const HEARTBEAT_INTERVAL = 30000; // 30s
const PONG_TIMEOUT = 10000;      // 10s to respond to ping

interface ExtendedWs extends WebSocket {
  isAlive: boolean;
  clientId: string;
}

export class WssBroadcast {
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private apiKey: string;
  private clientCount = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Attach WebSocket server to an existing HTTP server.
   */
  attach(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      verifyClient: (info, callback) => {
        // WOLF-004: Connection cap
        if (this.clientCount >= MAX_CONNECTIONS) {
          logger.warn(`[wss] Rejected connection: max ${MAX_CONNECTIONS} reached`);
          callback(false, 429, 'Too Many Connections');
          return;
        }

        // Auth: check API key in query params
        const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
        const key = url.searchParams.get('key');

        if (!this.apiKey || key === this.apiKey) {
          callback(true);
        } else {
          logger.warn(`[wss] Rejected connection: invalid API key`);
          callback(false, 401, 'Unauthorized');
        }
      },
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const extWs = ws as ExtendedWs;
      extWs.isAlive = true;
      extWs.clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      this.clientCount++;

      logger.info(`[wss] Client connected: ${extWs.clientId} (${this.clientCount} total)`);

      // Send connected event with current timestamp
      this.sendTo(extWs, {
        type: 'connected',
        payload: { clientId: extWs.clientId, serverTime: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });

      // Pong handler for heartbeat
      extWs.on('pong', () => {
        extWs.isAlive = true;
      });

      // T11: Per-Client Rate Limiting (DOS Protection)
      // Limit clients to 120 incoming frames (messages/pongs) per minute
      let frameCount = 0;
      let lastFrameReset = Date.now();

      extWs.on('message', () => {
        const now = Date.now();
        if (now - lastFrameReset > 60000) {
          frameCount = 0;
          lastFrameReset = now;
        }
        frameCount++;
        
        if (frameCount > 120) {
          logger.warn(`[wss] Rate limit exceeded by ${extWs.clientId} - terminating connection`);
          extWs.terminate();
        }
      });

      extWs.on('close', () => {
        this.clientCount = Math.max(0, this.clientCount - 1);
        logger.info(`[wss] Client disconnected: ${extWs.clientId} (${this.clientCount} remaining)`);
      });

      extWs.on('error', (err) => {
        logger.error(err, `[wss] Client error (${extWs.clientId})`);
      });
    });

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      if (!this.wss) return;

      this.wss.clients.forEach((ws) => {
        const extWs = ws as ExtendedWs;
        if (!extWs.isAlive) {
          logger.info(`[wss] Terminating dead client: ${extWs.clientId}`);
          this.clientCount = Math.max(0, this.clientCount - 1);
          return extWs.terminate();
        }
        extWs.isAlive = false;
        extWs.ping();
      });
    }, HEARTBEAT_INTERVAL);

    logger.info(`[wss] WebSocket server attached on /ws (max ${MAX_CONNECTIONS} connections)`);
  }

  /**
   * Broadcast an event to ALL connected clients.
   */
  broadcast(type: WsEventType, payload: unknown): void {
    if (!this.wss) return;

    const event: WsEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    const data = JSON.stringify(event);
    let sent = 0;

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        sent++;
      }
    });

    if (sent > 0) {
      logger.info(`[wss] Broadcast ${type} to ${sent} clients`);
    }
  }

  /**
   * Send an event to a specific client.
   */
  private sendTo(ws: ExtendedWs, event: WsEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Get connection statistics.
   */
  getStats(): { connected: number; maxConnections: number } {
    return {
      connected: this.clientCount,
      maxConnections: MAX_CONNECTIONS,
    };
  }

  /**
   * Graceful shutdown.
   */
  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    logger.info('[wss] WebSocket server closed');
  }
}