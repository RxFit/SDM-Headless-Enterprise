-- Migration 003: Event Decisions Audit Table + Webhook Health Monitor
-- SDM Phase 2: Intelligent Routing
-- Date: 2026-03-20

-- Audit trail for every routing decision Jade makes
CREATE TABLE IF NOT EXISTS event_decisions (
  id              SERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL,
  domain          TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  source_node     TEXT NOT NULL,
  decision        TEXT NOT NULL,           -- e.g. 'ROUTE_TO_CRM', 'ALERT_DANNY', 'IGNORE_DUPLICATE'
  decision_method TEXT NOT NULL,           -- 'DETERMINISTIC' or 'AI_FALLBACK'
  target_node     TEXT,                    -- which node received the command (null if no dispatch)
  dispatched_at   TIMESTAMPTZ,
  outcome         TEXT DEFAULT 'PENDING',  -- 'SUCCESS', 'FAILED', 'TIMEOUT'
  hop_count       INT DEFAULT 0,
  ai_reasoning    TEXT,                    -- Gemini's reasoning (AI_FALLBACK only)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_event_id ON event_decisions(event_id);
CREATE INDEX IF NOT EXISTS idx_decisions_domain ON event_decisions(domain, event_type);
CREATE INDEX IF NOT EXISTS idx_decisions_created ON event_decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_method ON event_decisions(decision_method);

-- Webhook health monitor — tracks last-received per endpoint
CREATE TABLE IF NOT EXISTS webhook_health (
  id                  SERIAL PRIMARY KEY,
  node_name           TEXT NOT NULL UNIQUE,
  endpoint_url        TEXT NOT NULL,
  last_received_at    TIMESTAMPTZ,
  expected_cadence_ms INT DEFAULT 300000,   -- 5 min default
  status              TEXT DEFAULT 'HEALTHY', -- HEALTHY, SILENT, DEAD
  alert_sent          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_health_status ON webhook_health(status);

-- Deduplication tracking for the subscriber
CREATE TABLE IF NOT EXISTS event_dedup (
  event_id    TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dedup_received ON event_dedup(received_at);

-- Grant permissions to relevant roles
GRANT SELECT, INSERT, UPDATE ON event_decisions TO postgres;
GRANT SELECT, INSERT, UPDATE ON event_decisions TO agent_reader;
GRANT USAGE, SELECT ON SEQUENCE event_decisions_id_seq TO postgres;

GRANT SELECT, INSERT, UPDATE ON webhook_health TO postgres;
GRANT SELECT ON webhook_health TO agent_reader;
GRANT USAGE, SELECT ON SEQUENCE webhook_health_id_seq TO postgres;

GRANT SELECT, INSERT, DELETE ON event_dedup TO postgres;
