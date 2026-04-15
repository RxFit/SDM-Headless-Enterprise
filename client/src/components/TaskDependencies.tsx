/**
 * TaskDependencies.tsx — Dependency Visualization (TASK_D08)
 * Shows which tasks block this one and which tasks it unblocks.
 */

import type { EnterpriseTask } from '../types';

interface TaskDependenciesProps {
  task: EnterpriseTask;
  allTasks: EnterpriseTask[];
  onTaskClick?: (taskId: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#94a3b8',
  'in-progress': '#fbbf24',
  completed: '#4ade80',
  blocked: '#f87171',
  deferred: '#64748b',
  review: '#a78bfa',
  cancelled: '#374151',
};

const STATUS_ICON: Record<string, string> = {
  pending: '⏳',
  'in-progress': '🔄',
  completed: '✅',
  blocked: '🚫',
  deferred: '⏸️',
  review: '👁️',
  cancelled: '❌',
};

export function TaskDependencies({ task, allTasks, onTaskClick }: TaskDependenciesProps) {
  const blockedBy = (task.blocked_by ?? [])
    .map(id => allTasks.find(t => t.id === id))
    .filter((t): t is EnterpriseTask => t !== undefined);

  const unblocks = allTasks.filter(t =>
    (t.blocked_by ?? []).includes(task.id)
  );

  if (blockedBy.length === 0 && unblocks.length === 0) {
    return (
      <div className="dep-empty">
        No dependencies for this task.
      </div>
    );
  }

  const TaskChip = ({ t, dir }: { t: EnterpriseTask; dir: 'blocker' | 'unblocks' }) => (
    <button
      className={`task-chip ${dir} status-${t.status}`}
      onClick={() => onTaskClick?.(t.id)}
      title={t.title}
    >
      <span className="chip-icon">{STATUS_ICON[t.status] || '📋'}</span>
      <span className="chip-title">{t.title.length > 40 ? t.title.slice(0, 38) + '…' : t.title}</span>
      <span
        className="chip-status"
        style={{ color: STATUS_COLOR[t.status] || '#64748b' }}
      >
        {t.status}
      </span>
    </button>
  );

  return (
    <div className="dep-root">
      {blockedBy.length > 0 && (
        <div className="dep-group">
          <div className="dep-label blocker-label">
            <span>🚫</span> Blocked by ({blockedBy.length})
          </div>
          {blockedBy.map(t => <TaskChip key={t.id} t={t} dir="blocker" />)}
        </div>
      )}

      {unblocks.length > 0 && (
        <div className="dep-group">
          <div className="dep-label unblocks-label">
            <span>🟢</span> Unblocks ({unblocks.length})
          </div>
          {unblocks.map(t => <TaskChip key={t.id} t={t} dir="unblocks" />)}
        </div>
      )}

      <style>{`
        .dep-root { display: flex; flex-direction: column; gap: 14px; }
        .dep-group { display: flex; flex-direction: column; gap: 6px; }
        .dep-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: #64748b; margin-bottom: 2px;
        }
        .blocker-label { color: #f87171; }
        .unblocks-label { color: #4ade80; }
        .task-chip {
          display: flex; align-items: center; gap: 8px; width: 100%;
          background: #111122; border: 1px solid #1e2030; border-radius: 6px;
          padding: 8px 12px; cursor: pointer; text-align: left;
          transition: border-color 0.2s, background 0.2s;
        }
        .task-chip:hover { background: #1a1a2e; border-color: #6366f1; }
        .task-chip.blocker { border-left: 2px solid #f87171; }
        .task-chip.unblocks { border-left: 2px solid #4ade80; }
        .chip-icon { font-size: 13px; }
        .chip-title { flex: 1; font-size: 12px; color: #e2e8f0; }
        .chip-status { font-size: 10px; font-weight: 600; text-transform: capitalize; }
        .dep-empty { font-size: 12px; color: #475569; font-style: italic; padding: 4px 0; }
      `}</style>
    </div>
  );
}
