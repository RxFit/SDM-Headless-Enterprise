# RxHarden Cognitive Ledger — SDM Telemetry Hardening Phase 3

> This file is the externalized chain-of-thought for the RxHarden execution.
> It is APPEND-ONLY. Never delete or overwrite previous entries.
> The agent MUST append Pre-Cog outputs and Hostile Auditor findings here
> BEFORE writing any implementation code.

---

## Initial Recon Summary (2026-04-10 12:00 CDT)

### Blocker Status
- Password rotation blocker from conv `e32bbd1b`: Concierge is **LIVE**. Heartbeat endpoint returns 403 (correct auth gate behavior). The Repl has been restarted and is connected to Cloud SQL.

### Gitignore Status (re-verified)
- Root `.gitignore`: ✅ covers `gcp-sa-key.json`, `.env`, `node_modules/`, `*.log`
- `crm-node/.gitignore`: ✅ covers `.env`, `gcp-sa-key.json`, `node_modules/`, `*.log`
- `pubsub-bridge/.gitignore`: ✅ covers `.env`, `gcp-sa-key.json`, `node_modules/`, `*.log`
- `wellness-node/.gitignore`: ✅ present (same pattern)
- `stripe-node/.gitignore`: ✅ present (same pattern)
- Physical `gcp-sa-key.json` files still exist on disk — need `git rm --cached` verification

### Schema Drift (H1 — verified)
- **Cloud SQL `webhook_health`**: 9 columns (id, node_name, endpoint_url, last_received_at, expected_cadence_ms, status, alert_sent, created_at, updated_at)
- **sdmSchemaGuard.ts DDL**: 5 columns (id, node_name, status, last_received_at, created_at)
- **sdmSchema.ts Drizzle**: 4 columns (id, node_name, status, last_received_at)
- **Gap**: 5 columns in Cloud SQL are invisible to code. SchemaGuard would create wrong table on fresh DB.

### Raw SQL (H3 — verified)
- `telemetryRoutes.ts` L95: `sdmPool.query(INSERT INTO webhook_health ...)` — raw SQL, not Drizzle
- All other SDM routes use typed Drizzle queries (migrated in S3)

### pubsub-bridge (H2 — verified)
- No `lib/` directory at all — no heartbeat, no outbox
- Express 4.18.2 (M1 — version mismatch confirmed)
- Simple passthrough: decodes Pub/Sub base64 → POSTs to orchestrator-log

### Silent Detector (H4 — verified)
- Uses `sdmDb` (Drizzle) which depends on `sdmPool`
- When pool breaks → detector silently fails → zero alerts
- No self-monitoring or fallback notification path

### pulse-node (M2 — verified)
- 3 files: Dockerfile, pulse-engine.js, pulse.log
- No package.json, no deployment, no heartbeat — orphaned

---
