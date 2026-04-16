# SDM Headless Enterprise

**Source of Truth for Autonomous Enterprise Operations**

The Sovereign Domain Mesh (SDM) Headless Enterprise is a portable, Git-versioned, API-backed operational management system. It provides real-time visualization, task management, agent automation, and audit trails for enterprise infrastructure — completely independent of any specific platform.

## Architecture

- **Frontend**: React + ReactFlow interactive topology diagram
- **Backend**: Express.js API with WebSocket real-time sync
- **Database**: Git-versioned JSON files (portable, searchable, auditable)
- **Auth**: API key-based authentication
- **Sync**: Bidirectional Google Sheet integration
- **Agents**: MCP tool endpoints for autonomous task management

## Quick Start

```bash
cp .env.example .env
# Edit .env with your API key and configuration
npm install
npm run dev
```

## Data Model

All data is stored as JSON files in the `data/` directory:

| File | Purpose |
|------|---------|
| `nodes.json` | System topology (positions, metadata, health endpoints) |
| `edges.json` | System connections and data flows |
| `tasks.json` | All enterprise tasks (status, priority, assignee, dependencies) |
| `task_history.json` | Complete audit trail of all changes |
| `config.json` | SDM configuration (not tracked — use `.env.example`) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | System health (public) |
| `GET/POST/PATCH/DELETE` | `/api/tasks` | Task CRUD |
| `GET/POST/PATCH/DELETE` | `/api/nodes` | Node topology CRUD |
| `GET/POST/PATCH/DELETE` | `/api/edges` | Edge CRUD |
| `GET` | `/api/history` | Audit trail queries |
| `POST` | `/api/tasks/:id/delegate` | Task delegation |
| `POST` | `/api/agents/tasks` | Agent task creation |
| `POST` | `/api/agents/events` | System event ingestion |
| `WebSocket` | `/ws` | Real-time event stream |

## License

MIT
