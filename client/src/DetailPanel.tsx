import { useCallback, useEffect, useRef, useState } from 'react';
import type { RxNodeData, TaskItem, TaskPriority, EnterpriseTask } from './types';
import { statusColors, variantColors } from './types';
import { TaskDelegation } from './components/TaskDelegation';
import { TaskHistory } from './components/TaskHistory';
import { TaskDependencies } from './components/TaskDependencies';
import {
  X,
  ExternalLink,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Plus,
  Trash2,
  ChevronDown,
  Cloud,
  GitBranch,
  History,
  Share2,
} from 'lucide-react';

interface DetailPanelProps {
  nodeId: string | null;
  data: RxNodeData | null;
  tasks: TaskItem[];
  allTasks?: EnterpriseTask[];
  onClose: () => void;
  onTaskToggle: (nodeId: string, taskId: string) => void;
  onTaskAdd: (nodeId: string, title: string, priority: TaskPriority, assignee?: string) => void;
  onTaskDelete: (nodeId: string, taskId: string) => void;
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: 'CRIT', color: '#ef4444' },
  high: { label: 'HIGH', color: '#f59e0b' },
  medium: { label: 'MED', color: '#0ea5e9' },
  low: { label: 'LOW', color: '#64748b' },
};

const statusIcons: Record<string, typeof Circle> = {
  pending: Circle,
  'in-progress': Clock,
  done: CheckCircle2,
  completed: CheckCircle2,
  blocked: AlertTriangle,
  deferred: Clock,
  review: Circle,
  cancelled: X,
};

type PanelTab = 'tasks' | 'history' | 'dependencies';

const priorityOptions: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

export default function DetailPanel({
  nodeId,
  data,
  tasks,
  allTasks = [],
  onClose,
  onTaskToggle,
  onTaskAdd,
  onTaskDelete,
}: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('tasks');
  const [delegatingTask, setDelegatingTask] = useState<EnterpriseTask | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (nodeId) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [nodeId, onClose]);

  // Focus title input when form opens
  useEffect(() => {
    if (showAddForm) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [showAddForm]);

  // Reset form when panel closes
  useEffect(() => {
    if (!nodeId) {
      setShowAddForm(false);
      setNewTitle('');
      setNewPriority('medium');
      setNewAssignee('');
    }
  }, [nodeId]);

  // Close on click outside
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    },
    [onClose]
  );

  const handleAddTask = useCallback(() => {
    if (!nodeId || !newTitle.trim()) return;
    onTaskAdd(nodeId, newTitle.trim(), newPriority, newAssignee.trim() || undefined);
    setNewTitle('');
    setNewPriority('medium');
    setNewAssignee('');
    setShowAddForm(false);
  }, [nodeId, newTitle, newPriority, newAssignee, onTaskAdd]);

  const handleFormKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAddTask();
      }
      if (e.key === 'Escape') {
        setShowAddForm(false);
      }
    },
    [handleAddTask]
  );

  if (!nodeId || !data || data.variant === 'group') return null;

  const status = data.status || 'unknown';
  const accentColor = variantColors[data.variant] || '#64748b';
  const pendingCount = tasks.filter((t) => t.status !== 'done').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  // Find EnterpriseTask objects matching this panel's tasks for delegation/deps
  const enterpriseTasks = allTasks.filter(t => t.node_id === nodeId);

  return (
    <>
    {delegatingTask && (
      <TaskDelegation
        task={delegatingTask}
        onClose={() => setDelegatingTask(null)}
      />
    )}
    <div className="detail-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label={`Details for ${data.label}`}>
      <div className="detail-panel" ref={panelRef}>
        {/* Accent bar */}
        <div className="detail-panel-accent" style={{ background: accentColor }} />

        {/* Header */}
        <div className="detail-panel-header">
          <div className="detail-panel-header-left">
            <span className="detail-panel-label">{data.label}</span>
            <div className="detail-panel-meta">
              <span
                className="detail-panel-status-chip"
                style={{ background: `${statusColors[status as keyof typeof statusColors] ?? '#64748b'}22`, color: statusColors[status as keyof typeof statusColors] ?? '#64748b' }}
              >
                <span className="detail-status-dot" style={{ background: statusColors[status as keyof typeof statusColors] ?? '#64748b' }} />
                {status}
              </span>
              <span className="detail-panel-variant-chip" style={{ background: `${accentColor}22`, color: accentColor }}>
                {data.variant}
              </span>
            </div>
          </div>
          <button className="detail-panel-close" onClick={onClose} aria-label="Close detail panel">
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        {data.description && <p className="detail-panel-desc">{data.description}</p>}

        {/* Deep link */}
        {data.url && (
          <a className="detail-panel-link" href={data.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} />
            Open {data.label}
            <ChevronRight size={14} />
          </a>
        )}

        {/* Tabs */}
        <div className="detail-tabs">
          <button className={`detail-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
            <CheckCircle2 size={13} /> Tasks ({tasks.length})
          </button>
          <button className={`detail-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <History size={13} /> History
          </button>
          <button className={`detail-tab ${activeTab === 'dependencies' ? 'active' : ''}`} onClick={() => setActiveTab('dependencies')}>
            <GitBranch size={13} /> Deps
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'history' && nodeId && (
          <div className="detail-panel-tasks">
            {tasks.map(t => (
              <TaskHistory key={t.id} taskId={t.id} />
            ))}
            {tasks.length === 0 && <div className="detail-panel-empty">No tasks to show history for.</div>}
          </div>
        )}

        {activeTab === 'dependencies' && (
          <div className="detail-panel-tasks">
            {enterpriseTasks.map(t => (
              <div key={t.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{t.title}</div>
                <TaskDependencies task={t} allTasks={allTasks} />
              </div>
            ))}
            {enterpriseTasks.length === 0 && <div className="detail-panel-empty">No tasks for dependency view.</div>}
          </div>
        )}

        {/* Task list (default tab) */}
        {activeTab === 'tasks' && <div className="detail-panel-tasks">
          <div className="detail-panel-tasks-header">
            <span>Tasks</span>
            <div className="detail-tasks-header-right">
              {tasks.length > 0 && (
                <span className="detail-task-count">
                  {doneCount}/{tasks.length} done
                </span>
              )}
              {pendingCount > 0 && <span className="detail-task-pending">{pendingCount} pending</span>}
            </div>
          </div>

          {/* Task progress bar */}
          {tasks.length > 0 && (
            <div className="detail-task-progress">
              <div
                className="detail-task-progress-fill"
                style={{
                  width: `${Math.round((doneCount / tasks.length) * 100)}%`,
                  background: accentColor,
                }}
              />
            </div>
          )}

          {tasks.length === 0 && !showAddForm ? (
            <div className="detail-panel-empty">No tasks assigned to this system.</div>
          ) : (
            <ul className="detail-task-list">
              {tasks.map((task: TaskItem) => {
                const StatusIcon = statusIcons[task.status] || Circle;
                const prio = priorityConfig[task.priority] || priorityConfig.medium;
                const isDone = task.status === 'done';
                const isUserAdded = task.id.startsWith('t-user-');
                const isGoogleDrive = task.id.startsWith('t-gdrive-');

                return (
                  <li key={task.id} className={`detail-task-item ${isDone ? 'done' : ''}`}>
                    <button
                      className="detail-task-toggle"
                      onClick={() => nodeId && onTaskToggle(nodeId, task.id)}
                      aria-label={isDone ? 'Mark as pending' : 'Mark as done'}
                    >
                      <StatusIcon size={16} style={{ color: isDone ? '#10b981' : '#94a3b8' }} />
                    </button>
                    <div className="detail-task-content">
                      <span className={`detail-task-title ${isDone ? 'done' : ''}`}>{task.title}</span>
                      <div className="detail-task-meta">
                        <span className="detail-task-priority" style={{ color: prio.color }}>
                          {prio.label}
                        </span>
                        {task.assignee && <span className="detail-task-assignee">{task.assignee}</span>}
                        {task.source && <span className="detail-task-source">{task.source}</span>}
                      </div>
                    </div>
                    {isUserAdded && (
                      <button
                        className="detail-task-delete"
                        onClick={() => nodeId && onTaskDelete(nodeId, task.id)}
                        aria-label="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    {isGoogleDrive && (
                      <span className="detail-task-cloud" title="Synced from Google Drive">
                        <Cloud size={13} />
                      </span>
                    )}
                    {/* Delegate button for API tasks */}
                    {(() => {
                      const et = allTasks.find(t => t.id === task.id);
                      return et ? (
                        <button
                          className="detail-task-delegate"
                          onClick={() => setDelegatingTask(et)}
                          title="Delegate task"
                        >
                          <Share2 size={13} />
                        </button>
                      ) : null;
                    })()}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add Task Button / Form */}
          {!showAddForm ? (
            <button className="detail-add-task-btn" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Add Task
            </button>
          ) : (
            <div className="detail-add-form" onKeyDown={handleFormKeyDown}>
              <input
                ref={titleInputRef}
                type="text"
                className="detail-add-input"
                placeholder="Task title…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <div className="detail-add-row">
                <div className="detail-add-select-wrapper">
                  <select
                    className="detail-add-select"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    style={{ color: priorityConfig[newPriority]?.color }}
                  >
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>
                        {priorityConfig[p].label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="detail-add-chevron" />
                </div>
                <input
                  type="text"
                  className="detail-add-input assignee"
                  placeholder="Assignee"
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                />
              </div>
              <div className="detail-add-actions">
                <button
                  className="detail-add-cancel"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="detail-add-submit"
                  onClick={handleAddTask}
                  disabled={!newTitle.trim()}
                  style={{ background: accentColor }}
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>
          )}
        </div>}
      </div>
    </div>
    </>
  );
}
