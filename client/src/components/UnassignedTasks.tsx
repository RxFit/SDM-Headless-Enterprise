/**
 * UnassignedTasks.tsx — Unassigned Tasks Sidebar (TASK_D10)
 * Shows tasks with node_id=null. Allows manual node assignment.
 */

import { useState } from 'react';
import type { EnterpriseTask } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#4ade80',
};

interface UnassignedTasksProps {
  tasks: EnterpriseTask[];
  nodeIds: string[];
  onTaskAssigned?: (taskId: string, nodeId: string) => void;
}

export function UnassignedTasks({ tasks, nodeIds, onTaskAssigned }: UnassignedTasksProps) {
  const unassigned = tasks.filter(t => !t.node_id);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [nodeSelect, setNodeSelect] = useState<Record<string, string>>({});

  const handleAssign = async (task: EnterpriseTask) => {
    const nodeId = nodeSelect[task.id];
    if (!nodeId) return;
    setAssigning(task.id);
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ node_id: nodeId }),
      });
      if (res.ok) {
        onTaskAssigned?.(task.id, nodeId);
      }
    } finally {
      setAssigning(null);
    }
  };

  if (unassigned.length === 0) {
    return (
      <div className="unassigned-empty">
        <span className="empty-icon">✅</span>
        <span>All tasks assigned</span>
      </div>
    );
  }

  return (
    <div className="unassigned-panel">
      <div className="unassigned-header">
        <span>📥</span>
        <span>Unassigned Tasks</span>
        <span className="unassigned-count">{unassigned.length}</span>
      </div>

      <div className="unassigned-list">
        {unassigned.map(task => (
          <div key={task.id} className="unassigned-item">
            <div className="unassigned-priority" style={{ background: PRIORITY_COLOR[task.priority] || '#64748b' }} />
            <div className="unassigned-content">
              <div className="unassigned-title">{task.title}</div>
              <div className="unassigned-meta">
                {task.assignee && <span className="meta-assignee">@{task.assignee}</span>}
                <span className="meta-priority">{task.priority}</span>
              </div>
              <div className="assign-row">
                <select
                  className="assign-select"
                  value={nodeSelect[task.id] || ''}
                  onChange={e => setNodeSelect(prev => ({ ...prev, [task.id]: e.target.value }))}
                >
                  <option value="">Select node…</option>
                  {nodeIds.map(nid => (
                    <option key={nid} value={nid}>{nid}</option>
                  ))}
                </select>
                <button
                  className="assign-btn"
                  onClick={() => void handleAssign(task)}
                  disabled={!nodeSelect[task.id] || assigning === task.id}
                >
                  {assigning === task.id ? '…' : 'Assign →'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .unassigned-panel {
          background: #0d0d1a; border: 1px solid #1e2030;
          border-radius: 8px; overflow: hidden;
        }
        .unassigned-header {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; background: #111122;
          border-bottom: 1px solid #1e2030;
          font-size: 12px; font-weight: 700; color: #94a3b8;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .unassigned-count {
          margin-left: auto; background: rgba(99,102,241,0.2);
          color: #6366f1; border-radius: 10px; padding: 0 8px;
          font-size: 11px;
        }
        .unassigned-list { max-height: 400px; overflow-y: auto; }
        .unassigned-item {
          display: flex; gap: 0; border-bottom: 1px solid #111122;
          transition: background 0.15s;
        }
        .unassigned-item:hover { background: #111122; }
        .unassigned-priority { width: 3px; flex-shrink: 0; }
        .unassigned-content { flex: 1; padding: 10px 14px; }
        .unassigned-title { font-size: 12px; font-weight: 600; color: #e2e8f0; line-height: 1.4; }
        .unassigned-meta { display: flex; gap: 8px; margin-top: 4px; }
        .meta-assignee { font-size: 10px; color: #6366f1; }
        .meta-priority { font-size: 10px; color: #475569; text-transform: uppercase; }
        .assign-row { display: flex; gap: 6px; margin-top: 8px; }
        .assign-select {
          flex: 1; background: #0d0d1a; border: 1px solid #2d2d4e;
          border-radius: 4px; padding: 4px 8px; font-size: 11px; color: #94a3b8;
        }
        .assign-btn {
          background: #6366f1; color: white; border: none;
          border-radius: 4px; padding: 4px 10px; font-size: 11px;
          font-weight: 600; cursor: pointer; transition: opacity 0.2s;
        }
        .assign-btn:hover:not(:disabled) { opacity: 0.8; }
        .assign-btn:disabled { opacity: 0.4; cursor: default; }
        .unassigned-empty {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 14px; font-size: 12px; color: #4ade80;
        }
        .empty-icon { font-size: 14px; }
      `}</style>
    </div>
  );
}
