/**
 * useApiNodes.ts — API-backed node state hook (TASK_D02)
 * Replaces hardcoded initialNodes from data/nodes.ts.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Node } from '@xyflow/react';
import type { NodeData } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

function authHeaders() {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}

export interface UseApiNodesReturn {
  nodes: Node<NodeData>[];
  loading: boolean;
  error: string | null;
  updateNode: (id: string, updates: Partial<NodeData> & { position?: { x: number; y: number } }) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useApiNodes(): UseApiNodesReturn {
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/nodes`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { nodes: NodeData[] };

      // Convert API enterprise nodes → ReactFlow Node format
      const rfNodes: Node<NodeData>[] = (data.nodes ?? []).map(n => ({
        id: n.id,
        type: n.type || 'custom',
        position: n.position ?? { x: 0, y: 0 },
        data: n,
      }));

      setNodes(rfNodes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[useApiNodes] fetch error:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNodes();
  }, [fetchNodes]);

  const updateNode = useCallback(async (id: string, updates: Partial<NodeData> & { position?: { x: number; y: number } }): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/nodes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return false;
      const updated = await res.json() as NodeData;
      setNodes(prev => prev.map(n =>
        n.id === id ? { ...n, data: updated, position: updated.position ?? n.position } : n
      ));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { nodes, loading, error, updateNode, refetch: fetchNodes };
}
