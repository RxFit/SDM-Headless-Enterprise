/**
 * server/types.ts — SDM Headless Enterprise Core Types
 * Source of Truth for all enterprise data models.
 */

// ─────────────────────────────────────────────────────────
// Task Statuses & Priorities
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Enterprise Task
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Enterprise Node (System Topology)
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Enterprise Edge (System Connections)
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Task History (Audit Trail)
// ─────────────────────────────────────────────────────────

export interface TaskHistoryEntry {
  [key: string]: unknown;
  id: string;                      // UUID
  task_id: string;                 // FK → EnterpriseTask.id
  action: HistoryAction;
  actor: string;                   // user email, agent ID, or 'system'
  from_value?: string;
  to_value?: string;
  timestamp: string;               // ISO timestamp
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────
// Auto-Task Rules
// ─────────────────────────────────────────────────────────

export interface AutoTaskRule {
  trigger: AutoTaskTrigger;
  node_id: string;
  priority: TaskPriority;
  title_template: string;          // e.g., "Fix {{node}} container health"
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────
// SDM Configuration
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Cron Status (from Jade CoS heartbeat)
// ─────────────────────────────────────────────────────────

export interface CronStatusEntry {
  job_name: string;
  status: 'success' | 'failed' | 'running';
  duration_ms?: number;
  timestamp: string;               // ISO timestamp
  error?: string;
}

// ─────────────────────────────────────────────────────────
// WebSocket Event Types
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// API Request/Response helpers
// ─────────────────────────────────────────────────────────

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
