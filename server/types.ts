/**
 * server/types.ts â€” SDM Headless Enterprise Core Types
 * Source of Truth for all enterprise data models.
 */

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Database Engine Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type CollectionName = 'nodes' | 'edges' | 'tasks' | 'task_history';

export interface Identifiable {
  id: string;
  [key: string]: unknown;
}

export type ChangeEvent = {
  collection: CollectionName;
  action: 'insert' | 'update' | 'remove';
  item: Identifiable;
  patch?: Partial<Identifiable>;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Task Statuses & Priorities
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type TaskStatus =
  | 'pending'
  | 'in-progress'
  | 'done'
  | 'blocked'
  | 'deferred'
  | 'cancelled'
  | 'review';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskSource =
  | 'manual'
  | 'google-drive'
  | 'agent'
  | 'cron'
  | 'system-event'
  | 'kaizen';

export type DelegationMethod = 'email' | 'google-chat' | 'command-center';

export type SystemStatus = 'operational' | 'degraded' | 'down' | 'unknown';

export type NodeVariant = 'core' | 'data' | 'agent' | 'comms' | 'finance' | 'team' | 'group';

export type HistoryAction =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'delegated'
  | 'priority_changed'
  | 'dependency_added'
  | 'dependency_removed'
  | 'completed'
  | 'deleted'
  | 'sync_conflict';

export type AutoTaskTrigger =
  | 'container_unhealthy'
  | 'pr_merged'
  | 'audit_complete'
  | 'cron_failed'
  | 'kaizen_approved';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Enterprise Task
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DelegationInfo {
  name: string;
  email?: string;
  method: DelegationMethod;
  delegated_at: string; // ISO timestamp
}

export interface EnterpriseTask {
  [key: string]: unknown;
  id: string;                      // UUID
  node_id: string | null;          // ReactFlow node ID (null = unassigned)
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;               // human name or agent ID
  delegated_to?: DelegationInfo;
  depends_on?: string[];           // task IDs this depends on
  blocked_by?: string[];           // resolved at runtime from depends_on
  source: TaskSource;
  agent_id?: string;               // jade, brock, seo, mr, cdo, antigravity
  due_date?: string;               // ISO date
  created_at: string;              // ISO timestamp
  updated_at: string;              // ISO timestamp
  completed_at?: string;           // ISO timestamp
  metadata?: Record<string, unknown>;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Enterprise Node (System Topology)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EnterpriseNode {
  [key: string]: unknown;
  id: string;                      // ReactFlow node ID
  label: string;
  variant: NodeVariant;
  status: SystemStatus;
  position: { x: number; y: number };
  description?: string;
  icon?: string;
  owner?: string;
  url?: string;
  container_name?: string;         // Docker container for health mapping
  health_endpoint?: string;        // URL for health checks
  cron_jobs?: string[];            // associated cron job names
  // ReactFlow layout properties
  parent_id?: string;              // group parent
  extent?: string;                 // 'parent' for constrained nodes
  style?: Record<string, unknown>;
  z_index?: number;
  metadata?: Record<string, unknown>;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Enterprise Edge (System Connections)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EnterpriseEdge {
  [key: string]: unknown;
  id: string;
  source: string;                  // source node ID
  target: string;                  // target node ID
  label?: string;
  animated?: boolean;
  source_handle?: string;
  target_handle?: string;
  marker_end?: {
    type: string;                  // 'arrowclosed'
  };
  style?: Record<string, unknown>;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Task History (Audit Trail)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface TaskHistoryEntry {
  [key: string]: unknown;
  id: string;                      // UUID
  task_id: string;                 // FK â†’ EnterpriseTask.id
  action: HistoryAction;
  actor: string;                   // user email, agent ID, or 'system'
  from_value?: string;
  to_value?: string;
  timestamp: string;               // ISO timestamp
  metadata?: Record<string, unknown>;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Auto-Task Rules
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AutoTaskRule {
  trigger: AutoTaskTrigger;
  node_id: string;
  priority: TaskPriority;
  title_template: string;          // e.g., "Fix {{node}} container health"
  enabled: boolean;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SDM Configuration
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SdmConfig {
  version: string;
  google_sheet?: {
    spreadsheet_id: string;
    sheet_tab: string;
    sync_interval_ms: number;
    proxy_url: string;
  };
  websocket: {
    heartbeat_interval_ms: number;
    max_connections: number;
  };
  notifications?: {
    google_chat_webhook?: string;
    email_sender?: string;
  };
  auto_task_rules: AutoTaskRule[];
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cron Status (from Jade CoS heartbeat)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CronStatusEntry {
  job_name: string;
  status: 'success' | 'failed' | 'running';
  duration_ms?: number;
  timestamp: string;               // ISO timestamp
  error?: string;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WebSocket Event Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type WsEventType =
  | 'connected'
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'node_updated'
  | 'edge_updated'
  | 'cron_status';

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
  timestamp: string;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// API Request/Response helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CreateTaskRequest {
  node_id?: string | null;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  depends_on?: string[];
  source?: TaskSource;
  agent_id?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  description?: string;
  depends_on?: string[];
  due_date?: string;
  node_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DelegateTaskRequest {
  name: string;
  email?: string;
  method: DelegationMethod;
}

export interface AgentEventRequest {
  trigger: AutoTaskTrigger;
  node?: string;
  metadata?: Record<string, unknown>;
}