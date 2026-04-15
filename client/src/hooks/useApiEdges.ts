/**
 * useApiEdges.ts — API-backed edge state hook (TASK_D03)
 * Replaces hardcoded initialEdges from data/edges.ts.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Edge } from '@xyflow/react';
import type { EnterpriseEdge } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}

export interface UseApiEdgesReturn {
  edges: Edge[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApiEdges(): UseApiEdgesReturn {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEdges = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/edges`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { edges: EnterpriseEdge[] };

      // Convert API edges → ReactFlow Edge format
      const rfEdges: Edge[] = (data.edges ?? []).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type || 'smoothstep',
        animated: e.animated ?? false,
        label: e.label,
        data: e,
        style: e.style,
      }));

      setEdges(rfEdges);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[useApiEdges] fetch error:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEdges();
  }, [fetchEdges]);

  return { edges, loading, error, refetch: fetchEdges };
}
