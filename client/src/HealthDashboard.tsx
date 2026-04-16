import { useMemo, useEffect, useState } from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  Users,
  Zap,
  Wifi,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { RxNodeData, TaskItem } from './types';
import { variantColors, statusColors } from './types';
import type { HealthFeed } from './hooks/useOrchestratorHealth';

/** SDM API /api/health response shape */
interface SdmHealth {
  status: string;
  version: string;
  uptime_seconds: number;
  collections: Record<string, number>;
  tasks: { total: number; by_status: Record<string, number> };
  websocket: { connected: number; maxConnections: number };
  git: { enabled: boolean; pending_changes: number; last_commit: string | null };
  timestamp: string;
}

interface HealthDashboardProps {
  nodes: Node<RxNodeData>[];
  getNodeTasks: (nodeId: string) => TaskItem[];
  getAggregateStats: () => ReturnType<typeof computeStats>;
  healthData?: HealthFeed | null;
  isOpen: boolean;
  onClose: () => void;
}

// Re-export type for external usage
function computeStats() {
  return {
    tasks: { total: 0, done: 0, pending: 0, inProgress: 0, blocked: 0, critical: 0 },
    systems: { total: 0, operational: 0, degraded: 0, down: 0, unknown: 0 },
    byVariant: {} as Record<string, { total: number; done: number }>,
    byAssignee: {} as Record<string, { total: number; done: number }>,
  };
}
export type AggregateStats = ReturnType<typeof computeStats>;

const variantLabels: Record<string, string> = {
  core: 'Core Services',
  data: 'Data Layer',
  agent: 'Agentic Layer',
  comms: 'Communications',
  finance: 'Billing & Finance',
  team: 'People & Operators',
};

export default function HealthDashboard({
  nodes,
  getNodeTasks,
  getAggregateStats,
  healthData,
  isOpen,
  onClose,
}: HealthDashboardProps) {
  const stats = useMemo(() => getAggregateStats(), [getAggregateStats]);

  // SDM API health
  const [sdmHealth, setSdmHealth] = useState<SdmHealth | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const apiBase = (import.meta as any).env?.VITE_API_URL || '';
    const key = (import.meta as any).env?.VITE_API_KEY || '';
    const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
    const fetchHealth = () =>
      fetch(`${apiBase}/api/health`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(d => setSdmHealth(d))
        .catch(() => setSdmHealth(null));
    fetchHealth();
    const iv = setInterval(fetchHealth, 30_000);
    return () => clearInterval(iv);
  }, [isOpen]);

  // Find nodes with degraded/down status
  const problemNodes = useMemo(() => {
    if (healthData) {
      return healthData.nodes.filter(n => n.status !== 'healthy');
    }
    return nodes.filter(
      (n) =>
        n.data.variant !== 'group' &&
        (n.data.status === 'degraded' || n.data.status === 'down')
    ).map(n => ({
      id: n.id,
      name: n.data.label,
      status: n.data.status || 'unknown'
    }));
  }, [nodes, healthData]);

  // Find critical tasks
  const criticalTasks = useMemo(() => {
    const items: { nodeLabel: string; task: TaskItem }[] = [];
    for (const node of nodes) {
      if (node.data.variant === 'group') continue;
      const tasks = getNodeTasks(node.id);
      for (const task of tasks) {
        if (task.priority === 'critical' && task.status !== 'done') {
          items.push({ nodeLabel: node.data.label, task });
        }
      }
    }
    return items;
  }, [nodes, getNodeTasks]);

  if (!isOpen) return null;

  const completionPct = stats.tasks.total > 0
    ? Math.round((stats.tasks.done / stats.tasks.total) * 100)
    : 0;

  let systemHealthPct = 0;
  let sysOp = stats.systems.operational;
  let sysDeg = stats.systems.degraded;
  let sysDown = stats.systems.down;
  
  if (healthData) {
    const alive = healthData.healthyCount;
    systemHealthPct = healthData.totalNodes > 0 ? Math.round((alive / healthData.totalNodes) * 100) : 0;
    sysOp = healthData.healthyCount;
    sysDeg = healthData.degradedCount;
    sysDown = healthData.offlineCount;
  } else {
    systemHealthPct = stats.systems.total > 0
      ? Math.round((stats.systems.operational / stats.systems.total) * 100)
      : 0;
  }

  return (
    <div className="health-overlay" role="dialog" aria-modal="true" aria-label="System Health Dashboard" onClick={(e) => {
      if ((e.target as HTMLElement).classList.contains('health-overlay')) onClose();
    }}>
      <div className="health-dashboard">
        {/* Header */}
        <div className="health-header">
          <div className="health-header-left">
            <Activity size={20} style={{ color: '#10b981' }} />
            <span className="health-title">System Health Dashboard</span>
          </div>
          <button className="health-close" onClick={onClose} aria-label="Close dashboard">
            <X size={18} />
          </button>
        </div>

        {/* Top Cards */}
        <div className="health-cards">
          {/* System Uptime */}
          <div className="health-card">
            <div className="health-card-header">
              <Zap size={16} style={{ color: '#10b981' }} />
              <span>System Health</span>
            </div>
            <div className="health-card-value">
              <span className="health-pct" style={{ color: systemHealthPct >= 80 ? '#10b981' : systemHealthPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                {systemHealthPct}%
              </span>
              <span className="health-label">operational</span>
            </div>
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{
                  width: `${systemHealthPct}%`,
                  background: systemHealthPct >= 80 ? '#10b981' : systemHealthPct >= 50 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <div className="health-card-breakdown">
              <span style={{ color: statusColors.operational }}>● {sysOp} operational</span>
              <span style={{ color: statusColors.degraded }}>● {sysDeg} degraded</span>
              <span style={{ color: statusColors.down }}>● {sysDown} down</span>
              {!healthData && <span style={{ color: statusColors.unknown }}>● {stats.systems.unknown} unknown</span>}
            </div>
          </div>

          {/* Task Completion */}
          <div className="health-card">
            <div className="health-card-header">
              <BarChart3 size={16} style={{ color: '#0ea5e9' }} />
              <span>Task Completion</span>
            </div>
            <div className="health-card-value">
              <span className="health-pct" style={{ color: '#0ea5e9' }}>{completionPct}%</span>
              <span className="health-label">{stats.tasks.done}/{stats.tasks.total} done</span>
            </div>
            <div className="health-bar-track">
              <div className="health-bar-fill" style={{ width: `${completionPct}%`, background: '#0ea5e9' }} />
            </div>
            <div className="health-card-breakdown">
              <span><CheckCircle2 size={12} style={{ color: '#10b981' }} /> {stats.tasks.done} done</span>
              <span><Clock size={12} style={{ color: '#0ea5e9' }} /> {stats.tasks.inProgress} active</span>
              <span><AlertTriangle size={12} style={{ color: '#f59e0b' }} /> {stats.tasks.pending} pending</span>
              <span><ShieldAlert size={12} style={{ color: '#ef4444' }} /> {stats.tasks.blocked} blocked</span>
            </div>
          </div>
        </div>

        {/* SDM API Status */}
        {sdmHealth && (
          <div className="health-cards" style={{ marginTop: '0.5rem' }}>
            <div className="health-card" style={{ flex: '1' }}>
              <div className="health-card-header">
                <Wifi size={16} style={{ color: sdmHealth.status === 'healthy' ? '#10b981' : '#ef4444' }} />
                <span>SDM API v{sdmHealth.version}</span>
              </div>
              <div className="health-card-breakdown" style={{ gap: '0.75rem' }}>
                <span style={{ color: '#10b981' }}>{'\u25cf'} {sdmHealth.status}</span>
                <span>{'\u23f1'} {Math.round(sdmHealth.uptime_seconds / 60)}m uptime</span>
                <span>{sdmHealth.websocket.connected}/{sdmHealth.websocket.maxConnections} ws</span>
                <span>{sdmHealth.git.enabled ? 'Git sync ON' : 'Git sync OFF'}</span>
                <span>{sdmHealth.collections.nodes ?? 0} nodes / {sdmHealth.collections.tasks ?? 0} tasks</span>
              </div>
            </div>
          </div>
        )}

        {/* Critical Tasks */}
        {criticalTasks.length > 0 && (
          <div className="health-section">
            <div className="health-section-header">
              <ShieldAlert size={16} style={{ color: '#ef4444' }} />
              <span>Critical Tasks ({criticalTasks.length})</span>
            </div>
            <div className="health-critical-list">
              {criticalTasks.map((item) => (
                <div key={item.task.id} className="health-critical-item">
                  <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <div className="health-critical-content">
                    <span className="health-critical-title">{item.task.title}</span>
                    <span className="health-critical-meta">
                      {item.nodeLabel} · {item.task.assignee || 'Unassigned'}
                    </span>
                  </div>
                  <span className={`health-status-chip ${item.task.status}`}>
                    {item.task.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Problem Systems */}
        {problemNodes.length > 0 && (
          <div className="health-section">
            <div className="health-section-header">
              <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
              <span>Systems Requiring Attention ({problemNodes.length})</span>
            </div>
            <div className="health-problem-list">
              {problemNodes.map((pn) => (
                <div key={pn.id} className="health-problem-item">
                  <div
                    className="health-problem-dot"
                    style={{ background: statusColors[pn.status === 'healthy' ? 'operational' : pn.status === 'offline' ? 'down' : 'degraded'] || statusColors.unknown }}
                  />
                  <span className="health-problem-label">{pn.name}</span>
                  <span
                    className="health-problem-status"
                    style={{ color: statusColors[pn.status === 'healthy' ? 'operational' : pn.status === 'offline' ? 'down' : 'degraded'] || statusColors.unknown }}
                  >
                    {pn.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Component */}
        <div className="health-section">
          <div className="health-section-header">
            <Users size={16} style={{ color: '#64748b' }} />
            <span>Tasks by Component</span>
          </div>
          <div className="health-variant-grid">
            {Object.entries(stats.byVariant).map(([variant, data]) => {
              const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
              return (
                <div key={variant} className="health-variant-item">
                  <div className="health-variant-header">
                    <div className="health-variant-dot" style={{ background: variantColors[variant] || '#64748b' }} />
                    <span>{variantLabels[variant] || variant}</span>
                    <span className="health-variant-count">{data.done}/{data.total}</span>
                  </div>
                  <div className="health-bar-track small">
                    <div
                      className="health-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: variantColors[variant] || '#64748b',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Assignee */}
        {Object.keys(stats.byAssignee).length > 0 && (
          <div className="health-section">
            <div className="health-section-header">
              <Users size={16} style={{ color: '#ec4899' }} />
              <span>Tasks by Assignee</span>
            </div>
            <div className="health-assignee-grid">
              {Object.entries(stats.byAssignee)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([assignee, data]) => {
                  const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
                  return (
                    <div key={assignee} className="health-assignee-item">
                      <div className="health-assignee-avatar">
                        {assignee.charAt(0).toUpperCase()}
                      </div>
                      <div className="health-assignee-info">
                        <span className="health-assignee-name">{assignee}</span>
                        <span className="health-assignee-stats">{data.done}/{data.total} tasks ({pct}%)</span>
                      </div>
                      <div className="health-bar-track small flex-bar">
                        <div
                          className="health-bar-fill"
                          style={{ width: `${pct}%`, background: '#ec4899' }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
