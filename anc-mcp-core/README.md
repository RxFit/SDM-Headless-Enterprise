# ANC-MCP Core — Universal Worker Node Template

The boilerplate for all Sovereign Domain Mesh worker nodes.

## Quick Start

```bash
# 1. Clone this template for a new node
cp -r anc-mcp-core/ nodes/stripe-node/

# 2. Configure
cd nodes/stripe-node/
cp .env.example .env
# Edit .env with node-specific credentials

# 3. Run the database migration (once)
psql -U postgres -d antigravity_brain -f migrations/001_sdm_foundation.sql

# 4. Install dependencies
npm install

# 5. Start the node
npm start
```

## Architecture

```
anc-mcp-core/
├── node.js                  ← Main entry point (boot sequence)
├── test_node.js             ← Integration tests
├── lib/
│   ├── event_schema.js      ← Universal event envelope (domain routing)
│   ├── outbox_writer.js     ← Crash-safe event enqueue
│   ├── outbox_dispatcher.js ← Background worker (Pub/Sub or console.log)
│   ├── heartbeat.js         ← Outbound NODE_ALIVE beacon
│   └── directive_loader.js  ← GitHub directive pull + cache + versioning
├── handlers/                ← Node-specific logic (one file per node)
├── migrations/              ← SQL migrations
├── .env.example             ← Required environment variables
└── .gitignore               ← Protects credentials
```

## Creating a New Node

1. Clone the template to `nodes/{node-name}/`
2. Create `handlers/{node-name}.js` exporting a `start({ directives, enqueueEvent })` function
3. Configure `.env` with the node's identity, DB credentials, and orchestrator topic
4. The node auto-boots: loads directives, starts dispatcher, heartbeat, and your handler

## Event Schema

All events follow this envelope:
```json
{
  "eventId": "uuid",
  "source": "stripe-node",
  "target": "jade",
  "domain": "billing",
  "eventType": "PAYMENT_FAILED",
  "payload": { ... },
  "schemaVersion": "1.0",
  "timestamp": "ISO-8601"
}
```

Valid domains: `billing`, `seo`, `marketing`, `infrastructure`, `client-ops`, `scheduling`, `internal-ops`, `security`, `test`
