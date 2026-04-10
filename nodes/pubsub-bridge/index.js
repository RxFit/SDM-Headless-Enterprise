const express = require('express');

const app = express();
app.use(express.json());

const COMMAND_CENTER_URL = process.env.COMMAND_CENTER_URL || 'https://rxfit.app';
const SDM_INTERNAL_KEY = process.env.SDM_INTERNAL_KEY;

if (!SDM_INTERNAL_KEY) {
  console.error('[BRIDGE] FATAL: SDM_INTERNAL_KEY environment variable is required.');
  process.exit(1);
}

// ─── Health Probe ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', node: 'pubsub-bridge', uptime: process.uptime() });
});

app.post('/', async (req, res) => {
  try {
    const pubsubMessage = req.body.message;
    if (!pubsubMessage || !pubsubMessage.data) {
      console.warn('[BRIDGE] Received invalid Pub/Sub push payload.');
      return res.status(400).send('Bad Request');
    }

    // Decode Base64 data
    const payloadStr = Buffer.from(pubsubMessage.data, 'base64').toString('utf8');
    const event = JSON.parse(payloadStr);

    console.log(`[BRIDGE] Forwarding event from ${event.agent || 'unknown agent'}...`);

    // Forward to Sovereign Domain Mesh Command Center
    const result = await fetch(`${COMMAND_CENTER_URL}/api/internal/orchestrator-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sdm-key': SDM_INTERNAL_KEY
      },
      body: JSON.stringify({
        level: event.level || 'info',
        agent: event.agent || 'jade-local',
        message: event.message || JSON.stringify(event)
      })
    });

    if (result.ok) {
      console.log(`[BRIDGE] Forwarded successfully (200 OK).`);
      return res.status(200).send('Forwarded');
    } else {
      const errorText = await result.text();
      console.error(`[BRIDGE] Forwarding failed with ${result.status}: ${errorText}`);
      // Return 500 to Pub/Sub to trigger a retry
      return res.status(500).send('Failed to forward');
    }
  } catch (error) {
    console.error(`[BRIDGE] Exception handling Pub/Sub message: ${error.message}`);
    return res.status(500).send('Internal Error');
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[BRIDGE] SDM Pub/Sub Bridge listening on port ${PORT}`);
});
