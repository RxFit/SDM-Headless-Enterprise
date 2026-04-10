# Sovereign Domain Mesh — Architecture Summary

## Data Layer Architecture (Unified Cloud Model)

> **IMPORTANT**: In Production/Replit, the SDM operates as a **Unified Cloud Model**. All business and telemetry data live in the same PostgreSQL instance (DATABASE_URL). All engineers
> must understand which database holds which data before writing queries.

### Unified Production Database: Replit PostgreSQL
**Connection:** `DATABASE_URL` (set automatically by Replit)

| Table | Domain | Description |
|-------|--------|-------------|
| `profiles` | Business | Client profiles (stripeCustomerId, ghlContactId, etc.) |
| `users` | Auth | User accounts and credentials |
| `client_mrr_snapshots` | KPI | Monthly MRR per client per month |
| `trainer_clients` | Business | Trainer-client relationships |
| `marketing_spend` | KPI | Ad spend tracking |
| `oura_tokens` | Integration | Oura Ring OAuth tokens |
| `google_chat_tokens` | Integration | Google Chat OAuth tokens |

| `webhook_health` | Telemetry | Real-time node health status (ONLINE/OFFLINE/DEGRADED) |
| `event_decisions` | Telemetry | Routing engine decision log |
| `system_health_timeline` | Telemetry | 5-minute health snapshot buckets for SparklineHUD |
| `agent_memories` | AI | Persistent semantic memories for Jade/Antigravity |
| `active_jobs` | Ops | Queued agent job tracking |

### Database Routing & Environment Config
- **Production (Replit):** `DATABASE_URL` is the primary connection string. `SDM_DATABASE_URL` is optional — if unset, `sdmDb.ts` **auto-heals** by falling back to `DATABASE_URL` (Wolverine Clause).
- **Local (CLI / Nodes):** `SDM_DATABASE_URL` is set to the Replit external connection string or a local replica.
- **Cross-Referencing:** JOINs are natively supported between business metrics (e.g. `client_mrr_snapshots`) and SDM events. The `SdmTelemetryWidgets` and `CouncilHUD` read from this single source of truth.

### Heartbeat Pipeline (Task B1) - STATUS: OPERATIONAL
- All headless worker nodes (Cloud Run) send hourly HTTP POSTs to the Command Center (`/api/internal/heartbeat`).
- Authenticated via the shared `SDM_INTERNAL_KEY`.
- The Command Center UPSERTS into `webhook_health`, allowing the frontend to dynamically update node status cards (Healthy/Degraded/Offline) based on staleness.
- The `sdmSchemaGuard` Wolverines auto-create any missing tables perfectly on boot.
---

## Authentication Architecture

### SDM Internal Key
- **Purpose:** Authenticates inter-node API calls (stripe-node → Command Center, etc.)
- **Storage:** `SDM_INTERNAL_KEY` env var in all node `.env` files and Command Center `.env`
- **Security:** 256-bit cryptographically random key (rotated 2026-03-30)
- **Boot Guard:** All nodes exit(1) if `SDM_INTERNAL_KEY` is not set

### Google Service Account
- **Purpose:** Google Drive/Sheets probes, Google Calendar, etc.
- **Storage:** `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON stringified in env var)
- **Email:** `sdm-node-pubsub@rxfit-automation.iam.gserviceaccount.com`
- **Security Note (W-AUTH-04):** Static SA keys are permanent until manually revoked.

---

## Google Cloud Integration (Task E1)

### The Cloud Run Pub/Sub Bridge
In order for internal routing decisions made locally on `TrejosRig` to be broadcast to the Command Center's live Terminal Feed, the Mesh utilizes GCP Pub/Sub.

- **Topic:** `jade-commands`
- **Subscription:** `replit-bridge-sub` (Push Subscription)
- **Bridge Microservice:** `sdm-pubsub-bridge` deployed to Cloud Run.
- **Data Flow:** Pub/Sub pushes incoming base64 messages to the bridge. The bridge decodes them, injects the `SDM_INTERNAL_KEY`, and POSTs the payload to `/api/internal/orchestrator-log` on `rxfit.app`.
- **Status:** **OPERATIONAL** (Task E1 complete).

### GHL / Copilot API Token
- **Purpose:** GoHighLevel CRM integration
- **Storage:** `GHL_API_TOKEN` in crm-node `.env`
- **Expiry Check:** JWT expiry decoded on boot; CRITICAL alert if < 7 days remaining
- **Rotation:** Manual — Danny must generate new token from GHL admin panel

### Stripe Webhook Secret
- **Purpose:** Validates inbound Stripe webhook signatures
- **Storage:** `STRIPE_WEBHOOK_SECRET` in stripe-node `.env`
- **Boot Guard:** Exits(1) in non-test environments if not set

---

## Node Inventory

| Node | Port | Status | Location |
|------|------|--------|----------|
| stripe-node | 8080 | **DEPLOYED** (rev 00001-2x2) | Cloud Run: `sdm-stripe-node-11747747730.us-central1.run.app` |
| crm-node | 8080 | **DEPLOYED** (rev 00017-vsz) | Cloud Run: `sdm-crm-node-11747747730.us-central1.run.app` |
| wellness-node | 8080 | **DEPLOYED** (rev 00010-jrs) | Cloud Run: `sdm-wellness-node-11747747730.us-central1.run.app` |
| routing-engine | — | Active | TrejosRig (Pub/Sub subscriber) |
| jade-subscriber | — | Active | TrejosRig (Pub/Sub subscriber) |

> **Security (W-AUTH-05):** All Dockerfiles exclude `.env` — secrets injected via Cloud Run env vars at runtime.

---

## Google Drive Integration (Inline — No Dedicated Node)

> **Decision (D3, 2026-03-31):** Google Drive sync is handled **inline by the Command Center**
> via `server/scripts/syncBillingData.ts` and the `POST /api/orchestrator/force-sync` endpoint.
> No dedicated `drive-node` exists in the mesh.

**Rationale:** The inline script reads from the Master Client List spreadsheet and writes
to the Command Center's PostgreSQL. Adding a separate node would:
1. Increase deployment complexity (another Cloud Run service to maintain)
2. Require a new Pub/Sub subscription and heartbeat pipeline
3. Provide no benefit — the sync is a simple read-only pull on demand

**Revisit when:** Drive sync becomes bidirectional, requires multi-sheet monitoring,
or needs real-time change detection via Google Drive Push Notifications API.

The `google-drive` health probe in `server/orchestrator/meshRoutes.ts` tests the Google Sheets API
directly (using `GOOGLE_SERVICE_ACCOUNT_KEY`), not a worker node heartbeat.

---

## Command Center Route Architecture (Task 1B) — STATUS: COMPLETE

> **Refactored 2026-04-01:** The monolithic `orchestratorRoutes.ts` (2,219 lines) was decomposed into
> 6 domain-specific modules under `server/orchestrator/`. The original file is now a 37-line barrel
> that re-imports and delegates to all modules. `invalidateFinancialsCache` is re-exported from the
> barrel for backward compatibility with `stripeClient.ts`.

| Module | Size | Responsibility |
|--------|------|----------------|
| `meshRoutes.ts` | 16.7 KB | Health probes, timeline, topology, 5-min cron, Google Drive probe |
| `financialsRoutes.ts` | 17.5 KB | Stripe MRR, KPI engine, Council HUD, expenses |
| `businessRoutes.ts` | 5.6 KB | CRM roster, business-pulse, Google Drive force-sync |
| `telemetryRoutes.ts` | 10.6 KB | Heartbeat (`/api/internal/heartbeat`), token burn, alert-log, Trejo Protocol |
| `intelligenceRoutes.ts` | 15.1 KB | AirGap NLP, memory browser, marketing ROI, agent commands |
| `queueRoutes.ts` | 3.5 KB | Job queue CRUD |

### SDM Schema Guard (`sdmSchemaGuard.ts`) — 8 Tables Auto-Healed
`webhook_health`, `event_decisions`, `system_health_timeline`, `active_jobs`, `clients`, `client_events`, `alert_log`, `system_settings`

---

*Document created 2026-03-30 by Antigravity as part of W-OPS-01 remediation.*
*Updated 2026-04-01: D3 decision — Drive integration kept inline (Option B).*
*Updated 2026-04-01: B1 RESOLVED — Wolverine auto-heal in sdmDb.ts; SDM_DATABASE_URL falls back to DATABASE_URL. Heartbeat pipeline unblocked.*
*Updated 2026-04-01: HEADLESS SWEEP — All 3 nodes rebuilt & deployed to Cloud Run (no .env baking). D2 Trejo Protocol Hub verified via alert_log INSERT/SELECT. Stripe node first deploy (rev 00001-2x2).*
*Updated 2026-04-01: Task 1B — Route split documented. Stale `orchestratorRoutes.ts` reference fixed → `orchestrator/meshRoutes.ts`. Legacy `alert_log.jsonl` archived.*

---

## Wellness Node Integration (Task C1) — STATUS: OPERATIONAL
- **Data Source:** Pulls directly from the SnapCalorie log `WELLNESS_SHEET_ID` via the Sheets REST API.
- **Cache TTL:** 5 minutes between Sheets API calls to manage rate limits while polling every 15m.
- **Events Emitted:** `LOW_CALORIE_LOG`, `MISSED_THREE_DAYS`, `GOAL_ACHIEVED`, `DATA_STALE`, and `FETCH_ERROR`.
- **Cloud Run Env Vars (rev 00012-jwr):** `WELLNESS_SHEET_ID`, `WELLNESS_SHEET_RANGE`, `GOOGLE_SERVICE_ACCOUNT_KEY` all injected 2026-04-01.
- **Status:** **FULLY OPERATIONAL** — Health probe returns `ok`, Sentinel online, polling live Sheets data.

---

## Stripe Node Integration (Task C2) — STATUS: OPERATIONAL
- **Purpose:** Ingests Stripe webhooks (subscription lifecycle) and proxies MRR data to Command Center.
- **Webhook Endpoint:** `POST /stripe-webhook` on Cloud Run
- **Stripe Webhook ID:** `we_1THSNbFrMqe8QyNbbCp9YBCe` (livemode, created 2026-04-01)
- **Events Monitored:** `customer.subscription.created/updated/deleted`, `invoice.payment_failed/succeeded`
- **Signature Verification:** ✅ ENABLED — `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` injected (rev 00002-6td).
- **Cloud Run Env Vars (6/6):** `NODE_NAME`, `COMMAND_CENTER_URL`, `SDM_INTERNAL_KEY`, `NODE_ENV`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`
- **Status:** **FULLY OPERATIONAL** — Webhook endpoint live, signature verification enabled, health probe `ok`.
