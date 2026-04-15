/**
 * TaskHistory.tsx — Audit Trail Viewer (TASK_D09)
 * Fetches from GET /api/history?task_id=:id and renders a timeline.
 */

import { useState, useEffect } from 'react';
import type { TaskHistoryEntry } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

interface TaskHistoryProps {
  taskId: string;
}

const ACTION_ICON: Record<string, string> = {
  created: '🆕',
  status_changed: '🔄',
  priority_changed: '⬆️',
  assigned: '👤',
  delegated: '📬',
  commented: '💬',
  completed: '✅',
  blocked: '🚫',
  unblocked: '🟢',
};

export function TaskHistory({ taskId }: TaskHistoryProps) {
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/history?task_id=${taskId}`, {
          headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { history: TaskHistoryEntry[] };
        setHistory(data.history ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [taskId]);

  if (loading) {
    return (
      <div className="history-loading">
        <div className="pulse-dot" />
        Loading history…
      </div>
    );
  }

  if (error) {
    return <div className="history-error">⚠️ {error}</div>;
  }

  if (history.length === 0) {
    return <div className="history-empty">No history entries for this task.</div>;
  }

  return (
    <div className="task-history">
      <div className="history-header">
        <span className="history-icon">📋</span>
        <span>Audit Trail</span>
        <span className="history-count">{history.length} events</span>
      </div>
      <div className="timeline">
        {history.map((entry, idx) => (
          <div key={entry.id} className={`timeline-item ${idx === 0 ? 'latest' : ''}`}>
            <div className="timeline-dot">
              {ACTION_ICON[entry.action] || '📌'}
            </div>
            <div className="timeline-content">
              <div className="timeline-action">{entry.action.replace(/_/g, ' ')}</div>
              {entry.actor && <div className="timeline-actor">by {entry.actor}</div>}
              {entry.old_value && entry.new_value && (
                <div className="timeline-diff">
                  <span className="val-old">{String(entry.old_value)}</span>
                  <span className="val-arrow">→</span>
                  <span className="val-new">{String(entry.new_value)}</span>
                </div>
              )}
              {entry.comment && <div className="timeline-comment">"{entry.comment}"</div>}
              <div className="timeline-time">
                {new Date(entry.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .task-history { padding: 0; }
        .history-header {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          color: #64748b; letter-spacing: 0.08em; padding: 12px 0 10px;
          border-bottom: 1px solid #1e2030;
        }
        .history-icon { font-size: 14px; }
        .history-count {
          margin-left: auto; background: #1e2030;
          border-radius: 10px; padding: 1px 8px; font-size: 10px; color: #6366f1;
        }
        .timeline { display: flex; flex-direction: column; gap: 0; padding: 8px 0; }
        .timeline-item {
          display: flex; gap: 12px; position: relative; padding-bottom: 14px;
        }
        .timeline-item:not(:last-child)::before {
          content: ''; position: absolute; left: 14px; top: 28px;
          bottom: 0; width: 1px; background: #1e2030;
        }
        .timeline-item.latest .timeline-dot { background: rgba(99,102,241,0.2); border-color: #6366f1; }
        .timeline-dot {
          width: 28px; height: 28px; border-radius: 50%;
          background: #0d0d1a; border: 1px solid #2d2d4e;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; flex-shrink: 0;
        }
        .timeline-content { flex: 1; padding-top: 4px; }
        .timeline-action { font-size: 13px; font-weight: 600; color: #e2e8f0; text-transform: capitalize; }
        .timeline-actor { font-size: 11px; color: #6366f1; margin-top: 2px; }
        .timeline-diff {
          display: flex; align-items: center; gap: 6px;
          margin-top: 4px; font-size: 11px;
        }
        .val-old { color: #f87171; text-decoration: line-through; }
        .val-arrow { color: #64748b; }
        .val-new { color: #4ade80; }
        .timeline-comment { font-size: 11px; color: #94a3b8; font-style: italic; margin-top: 4px; }
        .timeline-time { font-size: 10px; color: #475569; margin-top: 4px; }
        .history-loading {
          display: flex; align-items: center; gap: 8px;
          color: #64748b; font-size: 13px; padding: 16px 0;
        }
        .pulse-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #6366f1; animation: pulse 1.2s infinite;
        }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .history-error { color: #f87171; font-size: 12px; padding: 8px 0; }
        .history-empty { color: #475569; font-size: 12px; padding: 12px 0; font-style: italic; }
      `}</style>
    </div>
  );
}
