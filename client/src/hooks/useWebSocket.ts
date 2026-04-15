/**
 * useWebSocket.ts — WebSocket connection manager (TASK_D04)
 * Real-time event subscription to SDM Headless Enterprise.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

export type WsEventType =
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'node_updated'
  | 'edge_created'
  | 'edge_deleted'
  | 'cron_status'
  | 'agent_event'
  | 'connected'
  | 'pong';

export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

export type WsHandler<T = unknown> = (msg: WsMessage<T>) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  on: <T = unknown>(eventType: WsEventType, handler: WsHandler<T>) => () => void;
  send: (type: string, payload: unknown) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef<Map<WsEventType, Set<WsHandler>>>(new Map());
  const [connected, setConnected] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback((msg: WsMessage) => {
    const subs = handlers.current.get(msg.type);
    if (subs) subs.forEach(h => h(msg));
  }, []);

  const connect = useCallback(() => {
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws' + (API_KEY ? `?key=${API_KEY}` : '');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[ws] Connected to SDM');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as WsMessage;
        emit(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[ws] Disconnected — reconnecting in 3s...');
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [emit]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  /** Subscribe to a specific event type. Returns unsubscribe fn. */
  const on = useCallback(<T = unknown>(eventType: WsEventType, handler: WsHandler<T>): (() => void) => {
    if (!handlers.current.has(eventType)) {
      handlers.current.set(eventType, new Set());
    }
    handlers.current.get(eventType)!.add(handler as WsHandler);
    return () => {
      handlers.current.get(eventType)?.delete(handler as WsHandler);
    };
  }, []);

  const send = useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { connected, on, send };
}
