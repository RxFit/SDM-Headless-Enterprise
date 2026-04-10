-- ═══════════════════════════════════════════════════════
-- SOVEREIGN DOMAIN MESH — Database Migration
-- Run once against antigravity_brain (PostgreSQL 17)
-- ═══════════════════════════════════════════════════════

-- 1. EVENT OUTBOX TABLE (if not already created from MVP testing)
CREATE TABLE IF NOT EXISTS event_outbox (
  id SERIAL PRIMARY KEY,
  event_id UUID DEFAULT gen_random_uuid(),
  source VARCHAR(64) NOT NULL DEFAULT 'jade',
  target VARCHAR(64),
  domain VARCHAR(64) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  schema_version VARCHAR(16) NOT NULL DEFAULT '1.0',
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON event_outbox(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_domain ON event_outbox(domain);

-- 2. PER-NODE SCHEMAS (isolated data silos)
-- Each worker node gets its own schema for caching domain data.
-- Add new schemas here as new nodes are deployed.

CREATE SCHEMA IF NOT EXISTS stripe_cache;
CREATE SCHEMA IF NOT EXISTS wellness_cache;
CREATE SCHEMA IF NOT EXISTS crm_cache;

-- 3. PER-NODE WRITE ROLES
-- Each worker can only write to its own schema + the shared event_outbox.

DO $$
BEGIN
  -- Stripe Node
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stripe_node_rw') THEN
    CREATE ROLE stripe_node_rw WITH LOGIN PASSWORD 'stripe_node_2026';
  END IF;
  GRANT USAGE ON SCHEMA stripe_cache TO stripe_node_rw;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA stripe_cache TO stripe_node_rw;
  ALTER DEFAULT PRIVILEGES IN SCHEMA stripe_cache GRANT ALL ON TABLES TO stripe_node_rw;
  -- Allow writing to shared outbox
  GRANT INSERT, UPDATE, SELECT ON event_outbox TO stripe_node_rw;
  GRANT USAGE, SELECT ON SEQUENCE event_outbox_id_seq TO stripe_node_rw;

  -- Wellness Node
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wellness_node_rw') THEN
    CREATE ROLE wellness_node_rw WITH LOGIN PASSWORD 'wellness_node_2026';
  END IF;
  GRANT USAGE ON SCHEMA wellness_cache TO wellness_node_rw;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA wellness_cache TO wellness_node_rw;
  ALTER DEFAULT PRIVILEGES IN SCHEMA wellness_cache GRANT ALL ON TABLES TO wellness_node_rw;
  GRANT INSERT, UPDATE, SELECT ON event_outbox TO wellness_node_rw;
  GRANT USAGE, SELECT ON SEQUENCE event_outbox_id_seq TO wellness_node_rw;

  -- CRM Node
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_node_rw') THEN
    CREATE ROLE crm_node_rw WITH LOGIN PASSWORD 'crm_node_2026';
  END IF;
  GRANT USAGE ON SCHEMA crm_cache TO crm_node_rw;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA crm_cache TO crm_node_rw;
  ALTER DEFAULT PRIVILEGES IN SCHEMA crm_cache GRANT ALL ON TABLES TO crm_node_rw;
  GRANT INSERT, UPDATE, SELECT ON event_outbox TO crm_node_rw;
  GRANT USAGE, SELECT ON SEQUENCE event_outbox_id_seq TO crm_node_rw;
END
$$;

-- 4. ORCHESTRATOR CROSS-READ ACCESS
-- agent_reader (used by Jade/Antigravity) can read ALL schemas
GRANT USAGE ON SCHEMA stripe_cache TO agent_reader;
GRANT USAGE ON SCHEMA wellness_cache TO agent_reader;
GRANT USAGE ON SCHEMA crm_cache TO agent_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA stripe_cache TO agent_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA wellness_cache TO agent_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA crm_cache TO agent_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA stripe_cache GRANT SELECT ON TABLES TO agent_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA wellness_cache GRANT SELECT ON TABLES TO agent_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm_cache GRANT SELECT ON TABLES TO agent_reader;
