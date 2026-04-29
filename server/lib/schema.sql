-- SDM Headless Enterprise PostgreSQL Schema
-- Execution Intent: T13

-- Nodes Topology
CREATE TABLE IF NOT EXISTS nodes (
  id VARCHAR(255) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  variant VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'unknown',
  position JSONB NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  description TEXT,
  icon VARCHAR(255),
  owner VARCHAR(255),
  url VARCHAR(255),
  container_name VARCHAR(255),
  health_endpoint VARCHAR(255),
  cron_jobs JSONB DEFAULT '[]'::jsonb,
  parent_id VARCHAR(255),
  extent VARCHAR(50),
  style JSONB DEFAULT '{}'::jsonb,
  z_index INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Edges Topology
CREATE TABLE IF NOT EXISTS edges (
  id VARCHAR(255) PRIMARY KEY,
  source VARCHAR(255) NOT NULL,
  target VARCHAR(255) NOT NULL,
  label VARCHAR(255),
  animated BOOLEAN DEFAULT FALSE,
  source_handle VARCHAR(255),
  target_handle VARCHAR(255),
  marker_end JSONB,
  style JSONB,
  FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Enterprise Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(255) PRIMARY KEY,
  node_id VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL,
  assignee VARCHAR(255),
  delegated_to JSONB,
  depends_on JSONB DEFAULT '[]'::jsonb,
  blocked_by JSONB DEFAULT '[]'::jsonb,
  source VARCHAR(50) NOT NULL,
  agent_id VARCHAR(255),
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL
);

-- Task History / Audit Trail
CREATE TABLE IF NOT EXISTS task_history (
  id VARCHAR(255) PRIMARY KEY,
  task_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor VARCHAR(255) NOT NULL,
  from_value VARCHAR(255),
  to_value VARCHAR(255),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- System Config
CREATE TABLE IF NOT EXISTS sdm_config (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_tasks_node_id ON tasks(node_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
