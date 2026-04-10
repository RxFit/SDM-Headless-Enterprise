# RxHarden Master Contract — SDM Telemetry Hardening Phase 3

**Immutable since:** 2026-04-10T12:00:00-05:00
**Schema Version:** 1.0

---

## 2a. Shared Interfaces & Types

### webhook_health — UNIFIED Schema (H1 Target)

```typescript
// shared/sdmSchema.ts — webhookHealth table definition
// This is the CANONICAL schema. Cloud SQL, sdmSchemaGuard, and Drizzle must all match.
export const webhookHealth = pgTable("webhook_health", {
  id: serial("id").primaryKey(),
  node_name: text("node_name").notNull().unique(),  // UNIQUE for ON CONFLICT upsert
  status: text("status").notNull().default("OFFLINE"),
  last_received_at: timestamp("last_received_at").notNull().defaultNow(),
  endpoint_url: text("endpoint_url"),                // nullable — Cloud SQL legacy
  expected_cadence_ms: integer("expected_cadence_ms"), // nullable — future use
  alert_sent: boolean("alert_sent").default(false),  // nullable — silent detector flag
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
```

### Heartbeat HTTP Payload (H3 Target)

```typescript
interface HeartbeatPayload {
  nodeName: string;      // Required — maps to webhook_health.node_name
  status: string;        // Default: "HEALTHY"
  uptimeSeconds?: number;
  memoryMB?: number;
}
```

### Heartbeat Response

```typescript
interface HeartbeatResponse {
  ack: true;
  nodeName: string;
  status: string;
}
```

### Silent Detector Self-Check (H4 Target)

```typescript
interface SelfMonitorState {
  consecutiveDbFailures: number;
  lastSuccessfulCheck: Date | null;
  MAX_CONSECUTIVE_FAILURES: 3;  // After 3 DB failures, fire webhook directly
}
```

---

## 2b. Global State Shapes

### Environment Variables

| Variable | Used By | Required |
|---|---|---|
| `SDM_DATABASE_URL` | Concierge (sdmDb.ts) | Yes |
| `DATABASE_URL` | Concierge (db.ts — primary app) | Yes |
| `SDM_INTERNAL_KEY` | All nodes + Concierge | Yes |
| `COMMAND_CENTER_URL` | All mesh nodes (heartbeat target) | Yes (for nodes) |
| `GOOGLE_CHAT_WEBHOOK_URL` | Concierge (sdmSilentDetector.ts) | Yes (M3 target) |
| `NODE_NAME` | All mesh nodes (heartbeat identity) | Yes (for nodes) |
| `HEARTBEAT_INTERVAL_MS` | All mesh nodes (default: 30000) | Optional |

### Connection Pools

| Pool | File | Max Connections |
|---|---|---|
| `sdmPool` | server/sdmDb.ts | 5 (capped at S2) |
| Primary pool | server/db.ts | Default (10) |

---

## 2c. Database Schemas & API Payloads

### Tables in scope (8 SDM tables per drizzle-sdm.config.ts tablesFilter)

1. `webhook_health` — Node health status (heartbeat upserts)
2. `event_decisions` — Event routing decisions log
3. `system_health_timeline` — Aggregated health metrics
4. `active_jobs` — SDM job queue
5. `clients` — CRM client mirror
6. `client_events` — CRM event log
7. `alert_log` — Trejo Protocol alert history
8. `system_settings` — Key-value config store

### Heartbeat Upsert (Drizzle — H3 Target)

```typescript
await sdmDb.insert(webhookHealth)
  .values({
    node_name: nodeName,
    status: nodeStatus,
    last_received_at: new Date(),
    updated_at: new Date(),
  })
  .onConflictDoUpdate({
    target: webhookHealth.node_name,
    set: {
      status: nodeStatus,
      last_received_at: new Date(),
      updated_at: new Date(),
    },
  });
```

---

## 2d. Immutability Rule

> **MASTER CONTRACT IMMUTABILITY RULE:** No following task may deviate from this Master Contract without explicit reconciliation via the Cascade Diff Check (Step 3k). Any deviation without reconciliation is a CRITICAL VIOLATION requiring immediate halt.
