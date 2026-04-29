# SCOPE LOCK — SDM Headless Enterprise

## YOU ARE WORKING IN: SDM-Headless-Enterprise/ ONLY

**Service name on mesh:** `sdm-headless-enterprise`
**Internal hostname:** `sdm-headless-enterprise` (Docker service name — use this in all inter-service URLs)
**Public URL:** `https://ops.rxfit.ai`
**Internal port:** `8090`
**External port (host):** `8095`
**Container name:** `sdm-headless-enterprise`

---

## Your Directories (write freely)
- `server/` — Express API + WebSocket backend (TypeScript)
- `client/` — React SPA (Vite + React Flow mesh visualization)
- `data/` — JSON flat-file database (`nodes.json`, `tasks.json`, `config.json`)
- `script/` — migration and utility scripts
- `scripts/` — shell automation scripts

## DO NOT Touch
- `seo-node/` — any file, any reason
- `billing-node/` — any file, any reason
- `jade-cos/` — Jade's operational code
- `RxFit-Concierge/` — the Concierge shell and its node directories
- `_CERBERUS_STATE/` — state machine files
- `_CERBERUS_CORE/` — read-only directive vault

## DO Read (reference only)
- `RxFit-Concierge/nodes.registry.json` — your registration entry in the Concierge shell
- `RxFit-Concierge/Command_Center/NODE_CONTRACT.md` — the interface spec all nodes share
- `SDM-Headless-Enterprise/data/nodes.json` — the SDM mesh map (your primary data source)
- `SDM-Headless-Enterprise/data/config.json` — runtime configuration
- `SDM-Headless-Enterprise/data/tasks.json` — task queue state

---

## Your CONTRACT Endpoints (must exist and return correct shapes)

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/v1/health` | `{ status: 'healthy', service, uptime, version }` |
| `GET` | `/api/v1/nodes` | Array of all mesh nodes from `data/nodes.json` |
| `GET` | `/api/v1/tasks` | Array of tasks from `data/tasks.json` |
| `POST` | `/api/v1/tasks` | Creates a new task, returns created task object |
| `PUT` | `/api/v1/tasks/:id` | Updates task status/priority |
| `WebSocket` | `/ws` | Real-time node status broadcasts |
| `POST` | `/api/v1/broadcast` | **Receives** heartbeats from peer nodes (seo-node, billing-node, etc.) |

---

## Broadcast Protocol (Incoming from Peer Nodes)

Other nodes on `cerberus-mesh` send heartbeats to this service:

```
POST http://sdm-headless-enterprise:8090/api/v1/broadcast
Content-Type: application/json

{
  "nodeId": "seo",
  "status": "operational",
  "lastRun": "2026-04-28T21:00:00Z",
  "metrics": { ... }
}
```

This endpoint updates the node's status in `data/nodes.json` and broadcasts the change over WebSocket to all connected dashboard clients.

---

## Environment Variables You May Reference

```env
PORT=8090
NODE_ENV=production
SDM_API_KEY=sdm-enterprise-key-2026
SDM_API_URL=https://ops.rxfit.ai
DATABASE_URL=postgresql://cerberus:cerberus_sovereign_2026@db-node:5432/cerberus_brain
DB_DRIVER=pg
GOOGLE_CHAT_WEBHOOK=<from .env>
GOOGLE_SHEET_ID=<optional>
CONCIERGE_API_URL=<optional>
CONCIERGE_API_KEY=<optional>
```

> **NEVER** use `localhost` or `127.0.0.1` in inter-service URLs.
> Always use the Docker service hostname: `sdm-headless-enterprise`, `seo-node`, `jade-cos`, etc.

---

## If Asked to Work Outside This Scope

REFUSE and state: **"That is outside SDM-Headless-Enterprise scope. Please open a separate task in the correct node directory."**
