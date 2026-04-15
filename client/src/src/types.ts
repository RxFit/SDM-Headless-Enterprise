// System health status
export type SystemStatus = 'operational' | 'degraded' | 'down' | 'unknown';

// Node variant categories matching CSS classes
export type NodeVariant = 'core' | 'data' | 'agent' | 'comms' | 'finance' | 'team' | 'group';

// Task priority levels
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

// Task status (legacy panel)
export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

// Individual task item (legacy panel compatibility)
export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  dueDate?: string;
  source?: 'manual' | 'google-drive' | 'github' | 'agent' | string;
}

// Extended node data model (legacy)
export interface RxNodeData {
  [key: string]: unknown;
  label: string;
  description?: string;
  variant: NodeVariant;
  icon?: string;
  status?: SystemStatus;
  tasks?: TaskItem[];
  url?: string;
}

// ─── SDM API Types (live data) ─────────────────────────────────

/** Full enterprise task from SDM API */
export interface EnterpriseTask {
  [key: string]: unknown;
  id: string;
  node_id?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked' | 'deferred' | 'review' | 'cancelled';
  priority: TaskPriority;
  assignee?: string;
  tags?: string[];
  source: 'manual' | 'agent' | 'sheet' | 'cron' | 'github';
  agent_id?: string;
  blocked_by?: string[];
  created_at: string;
  updated_at: string;
}

/** Enterprise node data from SDM API (ReactFlow-compatible) */
export interface NodeData {
  [key: string]: unknown;
  id: string;
  label: string;
  description?: string;
  variant: NodeVariant;
  icon?: string;
  status?: SystemStatus;
  url?: string;
  position?: { x: number; y: number };
  type?: string;
}

/** Enterprise edge from SDM API */
export interface EnterpriseEdge {
  [key: string]: unknown;
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  label?: string;
  style?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Cron status entry reported by Jade CoS */
export interface CronStatusEntry {
  job_name: string;
  status: 'success' | 'failure' | 'running' | 'skipped';
  duration_ms?: number;
  timestamp: string;
  error?: string;
}

/** Task history entry from SDM audit trail */
export interface TaskHistoryEntry {
  id: string;
  task_id: string;
  action: string;
  actor?: string;
  old_value?: unknown;
  new_value?: unknown;
  comment?: string;
  timestamp: string;
}

// Variant → accent color mapping (used in MiniMap + status ring)
export const variantColors: Record<string, string> = {
  core: '#0ea5e9',
  data: '#10b981',
  agent: '#f59e0b',
  comms: '#ec4899',
  finance: '#eab308',
  team: '#64748b',
};

// Status → color mapping
export const statusColors: Record<SystemStatus, string> = {
  operational: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#64748b',
};

// Enterprise task status → color
export const taskStatusColors: Record<string, string> = {
  pending: '#94a3b8',
  'in-progress': '#fbbf24',
  completed: '#4ade80',
  blocked: '#f87171',
  deferred: '#64748b',
  review: '#a78bfa',
  cancelled: '#374151',
};
