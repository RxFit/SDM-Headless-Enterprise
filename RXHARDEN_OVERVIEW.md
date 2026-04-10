# RxHarden Overview — SDM Telemetry Hardening Phase 3

**Project:** Sovereign Domain Mesh — Telemetry Infrastructure Hardening
**Date:** 2026-04-10
**Protocol:** RxHarden v4.1
**Continuation:** Conversations `eaf4e197` → `fdf29353` → `e32bbd1b` → `251ac841` (this chat)

---

## 1a. Project Overview & Core Objective

The Sovereign Domain Mesh (SDM) is a distributed telemetry system that connects 4 Cloud Run microservice nodes (crm-node, stripe-node, wellness-node, pubsub-bridge) to a central Concierge orchestrator (Replit, rxfit.app). All nodes report health via HTTP heartbeats to the Concierge, which persists status in a Cloud SQL PostgreSQL instance (`sdm-mesh-db`, `34.121.66.31`).

Phases 1-2 (completed) migrated from localhost PG to Cloud SQL, implemented Drizzle ORM, hardened WebSocket auth, built the silent node detector, and created the operational dashboard.

**Phase 3 Core Objective:** Resolve the remaining 13 hardening items identified by the RxCartographer forensic audit, prioritizing schema drift reconciliation, monitoring completeness, and operational hygiene.

---

## 1b. Exhaustive Task List

| # | ID | Task | Priority |
|---|---|---|---|
| 1 | H1 | Schema Drift Reconciliation — align `webhook_health` across Cloud SQL (9 cols), sdmSchemaGuard (5 cols), sdmSchema.ts (4 cols) | HIGH |
| 2 | H3 | Convert heartbeat raw SQL INSERT (telemetryRoutes.ts L95) to Drizzle typed query | HIGH |
| 3 | H2 | Add heartbeat library to pubsub-bridge node | HIGH |
| 4 | H4 | Add self-monitoring fallback to silent detector (DB-independent alert path) | HIGH |
| 5 | M1 | Upgrade pubsub-bridge from Express 4.x to Express 5.x | MEDIUM |
| 6 | M2 | Resolve pulse-node orphan (delete or formalize) | MEDIUM |
| 7 | M3 | Configure GOOGLE_CHAT_WEBHOOK_URL for silent alerts | MEDIUM |
| 8 | L2 | Delete phantom `test-node` row from webhook_health | LOW |
| 9 | L3 | Move loose test/script files in SDM root to organized directories | LOW |
| 10 | SA1 | Verify gcp-sa-key.json is git rm --cached from tracked files | SECURITY |
| 11 | CR1 | Clean up dead Cloud SQL columns OR add to schema (reconciliation follow-up) | MEDIUM |

**Deferred (not in scope):**
- C1: Cloud SQL `0.0.0.0/0` — accepted as permanent (Replit has no static IP)
- M4: db-f1-micro monitoring — informational, upgrade when needed
- M5: Backup verification — calendar reminder, not code change
- L1: Stale documentation URLs — will be handled by walkthrough
- L4: ops.rxfit.ai SPA features — deferred unless standalone access needed

---

## 1c. Task Impact Analysis

| Task | System Impact |
|---|---|
| H1 (Schema Drift) | Prevents TypeScript from catching column mismatches. The `endpoint_url NOT NULL` bug that required emergency fix would have been caught at compile-time with unified schema. |
| H3 (Drizzle Heartbeat) | Removes the last raw SQL query in the SDM pipeline. Ensures all DB mutations go through typed Drizzle layer. |
| H2 (PubSub Heartbeat) | pubsub-bridge is currently invisible to the health dashboard. If it crashes, it stays HEALTHY until the 5-min TTL flips it to SILENT — but no proactive notification fires. |
| H4 (Self-Monitoring) | The silent detector has the same SPOF as what it monitors. If Cloud SQL goes down, the detector fails silently — zero alerts sent. |
| M1 (Express 5) | Version mismatch between nodes risks copy-paste breakage. Express 5 has breaking changes in router and req.param(). |
| M2 (pulse-node) | Dead code confusion — no package.json, no deployment, could mislead engineers. |
| M3 (Chat Webhook) | Silent alerts don't fire without this URL. The entire monitoring system produces no proactive notifications. |

---

## 1d. Necessity Justification

| Task | Why Strictly Necessary |
|---|---|
| H1 | Schema drift is the #1 class of bug in this system (3 incidents in Phase 2). A unified schema eliminates this entire class. |
| H3 | Last raw SQL query defeats the purpose of the Drizzle migration (S3). Incomplete migration = two maintenance paths. |
| H2 | 4-node mesh with 3-node monitoring = 75% visibility. Unacceptable for production telemetry. |
| H4 | A monitoring system that fails silently when the thing it monitors fails is architecturally broken. |
| M1 | Version consistency across nodes prevents latent copy-paste bugs. |
| M2 | Dead code in production repos creates operational confusion. |
| M3 | A detection system without notification is a dead system. |
