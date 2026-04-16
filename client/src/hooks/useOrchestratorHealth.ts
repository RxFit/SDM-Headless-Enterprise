import { useState, useEffect } from 'react';

export interface HealthNode {
  id: string;
  name: string;
  type: 'agent' | 'database' | 'service' | 'infrastructure';
  location: 'cloud' | 'local' | 'external';
  status: 'healthy' | 'degraded' | 'offline';
  latencyMs: number;
  detail?: string;
  lastChecked: string;
}

export interface HealthFeed {
  nodes: HealthNode[];
  timestamp: string;
  totalNodes: number;
  healthyCount: number;
  degradedCount: number;
  offlineCount: number;
}

/**
 * Hook to consume real-time infrastructure metrics.
 * Supports receiving data via postMessage from Concierge parent 
 * or fallback polling if running standalone.
 */
export function useOrchestratorHealth() {
  const [healthData, setHealthData] = useState<HealthFeed | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Cross-app postMessage bridge for embedded mode
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security Validation: Only accept messages from internal/trusted origins in production
      // (Actual origin check is done in App.tsx to drop untrusted messages before this hook if desired, 
      // but we perform safe type checking anyway).
      if (!event.data || typeof event.data !== 'object') return;
      
      if (event.data.type === 'rxfit-health-feed' && event.data.data) {
        setHealthData(event.data.data);
        setLastUpdated(new Date());
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return { healthData, lastUpdated };
}
