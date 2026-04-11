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

## Task 1: H1+H3 — Schema Drift Reconciliation + Drizzle Heartbeat

### 3b. Context & Dependency Matrix

| Dependency | Type | Direction | Risk Level |
|---|---|---|---|
| `shared/sdmSchema.ts` (webhookHealth) | Code | MODIFY | CRITICAL |
| `server/sdmSchemaGuard.ts` (TABLE_DDL + EXPECTED_TABLES) | Code | MODIFY | HIGH |
| `server/orchestrator/telemetryRoutes.ts` L95 | Code | MODIFY | HIGH |
| `server/sdmSilentDetector.ts` (reads webhookHealth) | Code | READ | MEDIUM |
| `server/sdmDb.ts` (sdmDb Drizzle instance) | Code | READ | LOW |
| Cloud SQL `webhook_health` table | DB | READ (columns already exist) | LOW |

### 3c. Blast Radius Prediction

1. **Data Desync**: Adding `updated_at` to Drizzle schema — Cloud SQL already has the column with a DEFAULT. No migration needed. RISK: LOW.
2. **Type Expansion**: `$inferSelect` type gains 5 fields. Existing consumers use structural typing — extra fields don't break destructured reads. RISK: LOW.
3. **Heartbeat Upsert**: Converting raw SQL `INSERT...ON CONFLICT` to Drizzle `.insert().onConflictDoUpdate()` — functionally identical SQL generation. RISK: LOW.
4. **Silent Detector**: Uses `webhookHealth.status` and `.last_received_at` — unchanged. RISK: NONE.

### 3d. Explicit Mitigations

1. Add 5 missing columns to sdmSchema.ts as NULLABLE with defaults — matches Cloud SQL reality.
2. Update sdmSchemaGuard TABLE_DDL to match the full 9-column schema.
3. Update sdmSchemaGuard EXPECTED_TABLES to list all 9 columns.
4. Replace `sdmPool.query(INSERT INTO...)` at telemetryRoutes.ts L95 with `sdmDb.insert(webhookHealth).values(...).onConflictDoUpdate(...)`.
5. Import sdmDb and webhookHealth into telemetryRoutes.ts.
6. Verify via TypeScript type-check that all consumers compile clean.

### 3i. Hostile Auditor — Task 1 (H1+H3)

**Weaknesses:**
- The Drizzle `onConflictDoUpdate` generates SQL with `ON CONFLICT (node_name)` which requires a UNIQUE constraint. The SchemaGuard already ensures this (Phase 1.5), but if the constraint is ever dropped, heartbeats would fail with a Drizzle error instead of the previous raw SQL fallback.

**Edge Cases:**
- If `updated_at` column was somehow removed from Cloud SQL but remains in the Drizzle schema, the INSERT would fail. Mitigated by the SchemaGuard column validator.
- New columns (`endpoint_url`, `expected_cadence_ms`, `alert_sent`) are nullable with defaults — safe for existing rows.

**Breaking Points:**
- High-volume heartbeats (4 nodes × every 30s = 8 beats/min) is well within db-f1-micro capacity. Adding pubsub-bridge makes it 5 nodes = 10 beats/min — still negligible.

**Security:** No new attack surface. Auth gate unchanged.

**Verdict: PASS** — No CRITICAL or HIGH flaws found.

---

## Task 2: H4 — Silent Detector Self-Monitoring

**Implementation:** Added `_consecutiveDbFailures` counter with 3-strike threshold. When the detector's own DB query fails 3 times, it fires a Google Chat webhook alert via direct HTTP (no DB dependency). Resets on recovery.

### Hostile Auditor — Task 2 (H4)

**Weaknesses:**
- The self-alert fires only once (`_selfAlertSent = true`) until recovery. If the Chat webhook is also down, zero notification reaches anyone. Acceptable — you can't alert about your own alerting being down if ALL channels are dead.

**Edge Cases:**
- If `GOOGLE_CHAT_WEBHOOK_URL` is not set (current state — M3 pending), both the node-silent alerts AND the self-monitoring alerts silently skip. The self-monitoring system is technically functional but muted.

**Verdict: PASS** — Contingent on M3 (webhook URL configuration) for full activation.

---

## Task 3: H2 — pubsub-bridge Heartbeat

**Implementation:** Created `lib/heartbeat.js` (HTTP-only, no outbox since pubsub-bridge has no local PG). Wired `startHeartbeat()` into `index.js` boot sequence.

### Hostile Auditor — Task 3 (H2)

**Weaknesses:**
- The `COMMAND_CENTER_URL` env var must be set on the Cloud Run service for heartbeats to fire. Currently defaults to empty string (skips).
- The `NODE_NAME` defaults to `sdm-pubsub-bridge` — must match what the dashboard expects.

**Edge Cases:**
- Cloud Run cold starts: pubsub-bridge is a cold-start-only service. Heartbeats only fire while the container is warm. Once it scales to zero, heartbeats stop and the Silent Detector correctly flips it to SILENT. This is expected behavior for an event-driven service.

**Verdict: PASS** — Requires Cloud Run env var update for activation.

---

## Task 4: M2 — pulse-node Archive

**Implementation:** Moved `nodes/pulse-node/` to `nodes/_archived/pulse-node/`. Preserved for reference, removed from active mesh.

**Verdict: PASS** — No code risk.

---

## Task 5: L3 — Script Organization

**Implementation:** Moved 6 loose files (`chaos_stress_test.js`, `stress_test_results.json`, `fix_db.js`, `tmp_query.js`, `testApi.js`, `sync_alert_log.js`) to `scripts/` directory.

**Verdict: PASS** — No code risk.

---

## Task 6: L2 — Phantom Node Purge

**Implementation:** Added Wolverine Clause to SchemaGuard Phase 3: auto-purges known phantom entries (`test-node`, `antigravity-probe`, `test`, `unknown-node`) from `webhook_health` on boot.

**Verdict: PASS** — Self-cleaning, no manual intervention needed.

---

## Sprint 2: Deployment Phase (2026-04-10 ~19:50 CDT)

### Pre-Cog: Priority 1 — Concierge Deployment

#### Context & Dependency Matrix

| Dependency | Type | Direction | Risk Level |
|---|---|---|---|
| `RxFit-Concierge/shared/sdmSchema.ts` | Code | MODIFY | HIGH |
| `RxFit-Concierge/server/sdmSchemaGuard.ts` | Code | MODIFY | HIGH |
| `RxFit-Concierge/server/orchestrator/telemetryRoutes.ts` | Code | MODIFY | HIGH |
| `RxFit-Concierge/server/sdmSilentDetector.ts` | Code | CREATE | MEDIUM |
| GitHub → Replit sync | Infra | DEPLOY | MEDIUM |
| Cloud Run pubsub-bridge | Infra | DEPLOY | MEDIUM |

#### Blast Radius Prediction

1. **sdmSchema.ts**: Adding 5 columns to Drizzle definition. Cloud SQL already has them. No migration needed. Existing consumers use structural typing — extra fields harmless. RISK: LOW.
2. **sdmSchemaGuard.ts**: Expanding DDL from 5→9 columns + adding phantom purge Phase 3. CREATE TABLE IF NOT EXISTS — only fires on fresh DB. RISK: LOW.
3. **telemetryRoutes.ts**: Replacing raw SQL `sdmPool.query(INSERT INTO webhook_health...)` with Drizzle `sdmDb.insert(webhookHealth)...`. Same SQL semantics. Requires new imports (`sdmDb`, `webhookHealth`). RISK: LOW.
4. **sdmSilentDetector.ts**: Creating new file with self-monitoring (H4). This file may already exist on Replit from Phase 2 work. Push will overwrite. The `sdmBroadcast.ts` import and `startSilentDetector()` call may need wiring in the boot sequence. RISK: MEDIUM.
5. **pubsub-bridge Cloud Run**: Rebuild container with new `lib/heartbeat.js`. Requires env vars `COMMAND_CENTER_URL`, `NODE_NAME`, `SDM_INTERNAL_KEY`. RISK: LOW.

#### Mitigations

1. Apply changes to local RxFit-Concierge repo, commit, push to GitHub.
2. Replit auto-syncs from GitHub on push (or manual deploy trigger).
3. Verify via HTTP probe that heartbeat endpoint still responds correctly after deploy.
4. For pubsub-bridge: use Cloud Run MCP tool or gcloud to deploy and set env vars.

