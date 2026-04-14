// System health status
export type SystemStatus = 'operational' | 'degraded' | 'down' | 'unknown';

// Node variant categories matching CSS classes
export type NodeVariant = 'core' | 'data' | 'agent' | 'comms' | 'finance' | 'team' | 'group';

// Task priority levels
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

// Task status
export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

// Individual task item
export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  dueDate?: string;
  source?: 'manual' | 'google-drive' | 'github';
}

// Extended node data model
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
