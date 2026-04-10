/**
 * CRM NODE — Handler
 * 
 * Receives commands from Jade (via Pub/Sub crm-commands topic)
 * and delegates to the active CRM adapter.
 * 
 * Commands:
 *   FLAG_CLIENT    → marks client as payment-at-risk
 *   ARCHIVE_CLIENT → moves client to archived status
 *   ENRICH_CLIENT  → updates CRM fields with new data
 */

const { PubSub } = require('@google-cloud/pubsub');

const POLL_INTERVAL_MS = 5000;

/**
 * Load the active CRM adapter based on CRM_ADAPTER env var.
 */
function loadAdapter() {
  const adapterName = process.env.CRM_ADAPTER || 'copilot';
  try {
    const adapter = require(`../adapters/${adapterName}`);
    console.log(`[CRM-NODE] Loaded adapter: ${adapterName}`);
    return adapter;
  } catch (err) {
    console.error(`[CRM-NODE] Failed to load adapter "${adapterName}": ${err.message}`);
    // Fall back to copilot
    return require('../adapters/copilot');
  }
}

/**
 * @param {Object} ctx
 * @param {Function} ctx.enqueueEvent - Enqueue response events back to Jade
 */
async function start({ directives, enqueueEvent, app }) {
  const adapter = loadAdapter();
  const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID || 'dummy-if-local' });
  const subscription = pubsub.subscription('crm-sub');

  // --- Attach to global W-HTTP-02 Sentinel Server ---
  // app.use(express.json()); // Handled globally by Sentinel
  
  const ghlWebhookRouter = require('../routes/ghl_webhook');
  app.use('/webhooks', ghlWebhookRouter);

  // W-AUTH-01: Require env vars — no hardcoded fallbacks
  const GHL_API_TOKEN = process.env.GHL_API_TOKEN;
  if (!GHL_API_TOKEN) { console.error('[CRM-NODE-HANDLER] WARNING: GHL_API_TOKEN not set - requests will fail'); }
  const SDM_INTERNAL_KEY = process.env.SDM_INTERNAL_KEY || 'default_local_key';
  if (SDM_INTERNAL_KEY === 'default_local_key') { console.error('[CRM-NODE-HANDLER] WARNING: SDM_INTERNAL_KEY uses insecure default'); }

  function requireSdmKey(req, res, next) {
    if (req.headers['x-sdm-internal-key'] !== SDM_INTERNAL_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok', node: 'crm-node-handler', ts: Date.now() }));

  app.get('/search', requireSdmKey, async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) return res.status(400).json({ error: 'Missing query param' });

      console.log(`[CRM-NODE] Live Search Triggered: ${query}`);
      const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/?query=${encodeURIComponent(query)}`, {
        headers: { "Authorization": `Bearer ${GHL_API_TOKEN}` }
      });

      if (!response.ok) return res.status(response.status).json({ error: await response.text() });
      res.json(await response.json());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/update-contact', requireSdmKey, async (req, res) => {
    try {
      const { ghlContactId, payload } = req.body;
      if (!ghlContactId || !payload) return res.status(400).json({ error: 'Missing contact ID or payload' });

      console.log(`[CRM-NODE] Direct Mutation -> Contact ${ghlContactId}`);
      const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${GHL_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) return res.status(response.status).json({ success: false, error: await response.text() });
      res.json({ success: true, data: await response.json() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/outbound-sync', requireSdmKey, async (req, res) => {
    try {
      const { ghlContactId, tagsToAdd, tagsToRemove, customFields } = req.body;
      if (!ghlContactId) return res.status(400).json({ error: 'Missing contact ID' });

      const payload = {};
      if (tagsToAdd && tagsToAdd.length > 0) payload.tags = tagsToAdd;
      if (customFields && Object.keys(customFields).length > 0) {
        payload.customField = Object.entries(customFields).map(([id, value]) => ({ id, field_value: value }));
      }

      const url = `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`;
      const headers = { "Authorization": `Bearer ${GHL_API_TOKEN}`, "Content-Type": "application/json" };

      const response = await fetch(url, { method: "PUT", headers, body: JSON.stringify(payload) });
      if (!response.ok) return res.status(response.status).json({ success: false, error: await response.text() });

      if (tagsToRemove && tagsToRemove.length > 0) {
        await fetch(`${url}/tags`, { method: "DELETE", headers, body: JSON.stringify({ tags: tagsToRemove }) });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/lookup-contact', requireSdmKey, async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: 'Missing email param' });

      const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/lookup?email=${encodeURIComponent(email)}`, {
        headers: { "Authorization": `Bearer ${GHL_API_TOKEN}` }
      });
      if (!response.ok) return res.status(response.status).json({ error: await response.text() });

      const data = await response.json();
      res.json({ contactId: data.contacts?.[0]?.id || null, contact: data.contacts?.[0] || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Listen handled globally by node.js Sentinel
  // ------------------------------

  // Pub/Sub streaming pull — optional, only works when crm-sub exists
  try {
    console.log(`[CRM-NODE] Attempting Pub/Sub streaming pull on crm-sub...`);

    // Streaming pull — messages arrive via event handler
    subscription.on('message', async (message) => {
      let command;
      try {
        command = JSON.parse(message.data.toString());
      } catch (err) {
        console.error(`[CRM-NODE] Invalid command JSON: ${err.message}`);
        message.ack();
        return;
      }

      const cmdType = command.command || message.attributes?.command;
      const customerId = command.payload?.customerId;
      const reason = command.payload?.stripeEventId || 'SDM automated action';

      console.log(`[CRM-NODE] Processing: ${cmdType} for ${customerId}`);

      let result;
      try {
        switch (cmdType) {
          case 'FLAG_CLIENT':
            result = await adapter.flagClient(customerId, reason);
            break;
          case 'ARCHIVE_CLIENT':
            result = await adapter.archiveClient(customerId, reason);
            break;
          case 'ENRICH_CLIENT':
            result = await adapter.enrichClient(customerId, command.payload);
            break;
          default:
            console.warn(`[CRM-NODE] Unknown command: ${cmdType}`);
            result = { success: false, error: `Unknown command: ${cmdType}` };
        }

        // Report result back to Jade
        await enqueueEvent({
          domain: 'client-ops',
          eventType: `CRM_${cmdType}_${result.success ? 'COMPLETED' : 'FAILED'}`,
          payload: {
            command: cmdType,
            customerId,
            result,
            sourceEvent: command.sourceEvent,
          },
          target: 'jade',
        });

        console.log(`[CRM-NODE] ${cmdType}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      } catch (err) {
        console.error(`[CRM-NODE] ${cmdType} error: ${err.message}`);
        await enqueueEvent({
          domain: 'client-ops',
          eventType: `CRM_${cmdType}_ERROR`,
          payload: { command: cmdType, customerId, error: err.message },
          target: 'jade',
        });
      }

      message.ack();
    });

    subscription.on('error', (err) => {
      console.error(`[CRM-NODE] Subscription error: ${err.message}`);
    });

    console.log(`[CRM-NODE] Pub/Sub streaming active on crm-sub`);
  } catch (pubsubErr) {
    console.warn(`[CRM-NODE] Pub/Sub not available (${pubsubErr.message}) — HTTP routes still active`);
  }
}

module.exports = { start };
