# CONTEXT REHYDRATION — SDM Telemetry Hardening (Phase 3, Sprint 2)

## Paste this verbatim to resume in a fresh chat.

---

## Mission Identity

You are **Antigravity**, picking up mid-execution on the **SDM Telemetry Hardening** project for the **Sovereign Domain Mesh**. This is the continuation of conversations `eaf4e197` → `fdf29353` → `e32bbd1b` → `251ac841`.

---

## What Was Completed (Do NOT Redo)

### Phase 1–2: Codebase Hardening (convs `eaf4e197` + `fdf29353`)

Pool cap (max:5), pgvector probe, raw SQL → Drizzle, CRM pagination, LRU cache cap, WS auth gate, TTL silent detector, WS lifecycle hooks, Cloud SQL migration, SchemaGuard auto-heal, operational dashboard with heartbeat matrix + event ticker.

### Phase 3 Sprint 1 (conv `251ac841` — JUST completed)

| ID | Task | Status | File(s) Modified |
|---|---|---|---|
| H1 | Schema Drift Reconciliation — unified `webhook_health` across Cloud SQL, Drizzle ORM, SchemaGuard DDL, and EXPECTED_TABLES validator (all 3 sources now define 9 identical columns) | ✅ DONE | `shared/sdmSchema.ts`, `server/sdmSchemaGuard.ts` |
| H3 | Drizzle Heartbeat Conversion — replaced the LAST raw SQL `sdmPool.query(INSERT INTO webhook_health...)` with typed `sdmDb.insert(webhookHealth).values(...).onConflictDoUpdate(...)` | ✅ DONE | `server/orchestrator/telemetryRoutes.ts` |
| H4 | Silent Detector Self-Monitoring — added `_consecutiveDbFailures` counter (3-strike threshold), `sendSelfMonitoringAlert()` via direct HTTP to Google Chat (no DB dependency), auto-reset on recovery | ✅ DONE | `server/sdmSilentDetector.ts` |
| H2 | pubsub-bridge Heartbeat — created `lib/heartbeat.js` (HTTP-only, no outbox), wired `startHeartbeat()` into `index.js` boot sequence | ✅ DONE | `nodes/pubsub-bridge/lib/heartbeat.js` (NEW), `nodes/pubsub-bridge/index.js` |
| M2 | pulse-node Archived — moved orphaned `nodes/pulse-node/` to `nodes/_archived/pulse-node/` | ✅ DONE | filesystem |
| L2 | Phantom Node Auto-Purge — added Wolverine Clause Phase 3 to SchemaGuard: auto-deletes `['test-node','antigravity-probe','test','unknown-node']` from `webhook_health` on boot | ✅ DONE | `server/sdmSchemaGuard.ts` |
| L3 | Script Organization — moved 6 loose files from SDM root to `scripts/` directory | ✅ DONE | filesystem |

### Empirical Verifications Passed (Do NOT Re-Run)

- Schema alignment: all 3 sources define the same 9 columns ✅
- Import correctness: `sdmDb` + `webhookHealth` properly imported into `telemetryRoutes.ts` ✅
- Client-side compatibility: `SdmTelemetryWidgets.tsx` uses local 4-field type — extra server fields harmless ✅
- Dual schema isolation: `shared/schema.ts` L623 `webhookHealth` is for Replit DB (different columns) — separate concern from SDM Cloud SQL ✅

---

## What Remains (Sprint 2 — YOUR MISSION)

### PRIORITY 1: Deployment (Code changes exist locally — need to reach production)

1. **Concierge (Replit):** Push changes to `shared/sdmSchema.ts`, `server/sdmSchemaGuard.ts`, `server/orchestrator/telemetryRoutes.ts`, `server/sdmSilentDetector.ts` to the Replit git remote and restart the Repl. The Concierge is at `https://rxfit.app`.

2. **pubsub-bridge (Cloud Run):** Rebuild container with new `lib/heartbeat.js`, set env vars `COMMAND_CENTER_URL=https://rxfit.app` + `NODE_NAME=sdm-pubsub-bridge` + `SDM_INTERNAL_KEY` on the Cloud Run service, then deploy.

### PRIORITY 2: M3 — Google Chat Webhook URL Configuration

The silent detector and self-monitoring system are **functionally complete but muted**. Both `sendSilentAlert()` and `sendSelfMonitoringAlert()` silently skip because `GOOGLE_CHAT_WEBHOOK_URL` is not set. To activate:
- Create a Google Chat webhook in the appropriate Space
- Add `GOOGLE_CHAT_WEBHOOK_URL` as a Replit Secret on the Concierge

### PRIORITY 3: M1 — Express 5 Upgrade (pubsub-bridge)

pubsub-bridge runs Express 4.18.2. The other nodes use Express 5.x. To align:
- `npm install express@5` in `nodes/pubsub-bridge/`
- Verify no breaking changes (pubsub-bridge is minimal — no `req.param()` usage)
- Rebuild + redeploy container

### PRIORITY 4: SA1 — Git Security Cleanup

Physical `gcp-sa-key.json` files still exist on disk in multiple node directories. The `.gitignore` files cover them, but they were historically committed. Run `git rm --cached` to purge from tracking:
- `nodes/crm-node/gcp-sa-key.json`
- `nodes/stripe-node/gcp-sa-key.json`
- `nodes/wellness-node/gcp-sa-key.json`
- `nodes/pubsub-bridge/gcp-sa-key.json`
- `anc-mcp-core/gcp-sa-key.json` (also in user's open editor)

### DEFERRED (Do not attempt)

| Item | Status | Reason |
|---|---|---|
| C1: Cloud SQL `0.0.0.0/0` | ACCEPTED | Replit has no static IP; passwords are 32-char |
| M4: db-f1-micro monitoring | ACCEPTED | Load is negligible (10 beats/min) |
| M5: Backup verification | ACCEPTED | Calendar reminder, not code |
| L4: ops.rxfit.ai SPA features | DEFERRED | Not needed unless standalone access required |
| CR1: Dead Cloud SQL columns | RESOLVED | All 9 columns now reconciled in Drizzle schema |

---

## Architecture Reference

### Infrastructure

| Component | Platform | URL / IP |
|---|---|---|
| Concierge (Orchestrator) | Replit | `https://rxfit.app` |
| Cloud SQL (sdm-mesh-db) | GCP | `34.121.66.31` |
| crm-node | Cloud Run | heartbeats as `sdm-crm-node` |
| stripe-node | Cloud Run | heartbeats as `sdm-stripe-node` |
| wellness-node | Cloud Run | heartbeats as `sdm-wellness-node` |
| pubsub-bridge | Cloud Run | heartbeats as `sdm-pubsub-bridge` (NEW — Sprint 1) |
| SDM Dashboard | Concierge embed | `/sdm` tab in Headless Enterprise |

### Key File Paths (Concierge — Replit)

```
shared/sdmSchema.ts        — Canonical Drizzle schema (9-col webhookHealth)
server/sdmSchemaGuard.ts    — DDL auto-heal + column validator + phantom purge
server/sdmDb.ts             — Pool + Drizzle instance (sdmPool, sdmDb)
server/sdmSilentDetector.ts — TTL detector + H4 self-monitoring
server/sdmRoutes.ts         — Dashboard API routes (Drizzle queries)
server/sdmBroadcast.ts      — WebSocket push (15s interval)
server/orchestrator/telemetryRoutes.ts — Heartbeat + log endpoints
```

### Key File Paths (SDM Repo — Local)

```
c:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\Sovereign_Domain_Mesh\
├── nodes/
│   ├── crm-node/          — CRM webhook processor + heartbeat
│   ├── stripe-node/       — Stripe webhook processor + heartbeat
│   ├── wellness-node/     — Wellness data processor + heartbeat
│   ├── pubsub-bridge/     — Pub/Sub-to-Orchestrator bridge + heartbeat (NEW)
│   │   ├── index.js       — Main entry (Express, startHeartbeat())
│   │   └── lib/heartbeat.js — HTTP-only heartbeat library (NEW)
│   └── _archived/
│       └── pulse-node/    — Archived orphan (dead code)
├── scripts/               — Organized test/utility scripts (NEW)
├── RXHARDEN_OVERVIEW.md   — Task list + impact analysis
├── RXHARDEN_MASTER_CONTRACT.md — Unified schemas + env vars
└── RXHARDEN_COGNITION_LOG.md   — Cognitive ledger (append-only)
```

### Auth

- All `/api/internal/*` endpoints require `x-sdm-key` header matching `SDM_INTERNAL_KEY` env var
- Localhost bypass exists for dev only
- Rate limit: 1 heartbeat per 10s per node

### Dual Schema Warning

`shared/schema.ts` L623 has a DIFFERENT `webhookHealth` definition for the Concierge's Replit PostgreSQL DB. It uses `varchar` PK, `nodeName` (camelCase), `lastSeen`, `consecutiveFailures`, `metadata` — completely different from the SDM Cloud SQL schema in `sdmSchema.ts`. These are two separate databases, two separate schemas. Do NOT conflate them.

---

## RxHarden Protocol

The project uses RxHarden v4.1 protocol. The three protocol artifacts are in the SDM root:
- `RXHARDEN_OVERVIEW.md` — Task list + necessity justification
- `RXHARDEN_MASTER_CONTRACT.md` — Immutable type contracts + env var matrix
- `RXHARDEN_COGNITION_LOG.md` — Append-only cognitive ledger

**Before modifying ANY code:**
1. Append Pre-Cog (dependency matrix, blast radius, mitigations) to the Cognition Log
2. Execute the code change
3. Run the Trejo Protocol (empirical test → forensic analysis → raw results)
4. Append Hostile Auditor findings to the Cognition Log

---

## Immediate Action

Begin with **Priority 1: Deployment** — the code changes from Sprint 1 need to reach production. Push the Concierge changes to Replit, then rebuild/redeploy the pubsub-bridge to Cloud Run with the new heartbeat library and env vars.
