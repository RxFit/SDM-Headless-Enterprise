/**
 * CRM NODE — Sovereign Domain Mesh
 *
 * Microservice responsible for GoHighLevel (Copilot CRM) Bidirectional Sync.
 * - Inbound: Parses GHL webhooks & sends them to central Orchestrator.
 * - Outbound: Exposes local APIs for Orchestrator to update GHL Tags/MRR.
 *
 * ENHANCEMENT v2:
 * - Inbound webhook now requires x-sdm-internal-key auth guard
 * - tagsToRemove is now correctly structured in GHL V1 PATCH payload
 * - /health probe added for webhook-monitor compatibility
 * - Automatic ghl_contact_id lookup on first outbound sync
 */
const express = require('express');

// ── Wolverine: Auto-heal sales-velocity route import ──────────────────────
let salesVelocityRoutes;
try {
  salesVelocityRoutes = require('./routes/sales-velocity');
} catch (err) {
  console.warn('[CRM-NODE] Sales Velocity routes not loaded (Wolverine auto-heal):', err.message);
}

async function start({ directives, enqueueEvent }) {
  console.log('[CRM-NODE] Booting GHL/Copilot Telemetry Sync engine (v2)...');

  const app = express();
  app.use(express.json());

  const GHL_API_TOKEN = process.env.GHL_API_TOKEN;
  if (!GHL_API_TOKEN) {
    console.error("[CRM-NODE] FATAL ERROR: GHL_API_TOKEN is not set in environment.");
    process.exit(1);
  }

  // W-AUTH-02: JWT Expiry Check — warn if GHL token expires within 7 days
  try {
    const tokenPayload = JSON.parse(Buffer.from(GHL_API_TOKEN.split('.')[1], 'base64').toString('utf8'));
    if (tokenPayload.exp) {
      const expiresInMs = (tokenPayload.exp * 1000) - Date.now();
      const expiresInDays = Math.floor(expiresInMs / (1000 * 60 * 60 * 24));
      if (expiresInMs <= 0) {
        console.error('[CRM-NODE] CRITICAL: GHL_API_TOKEN is EXPIRED. All CRM syncs will fail with 401.');
      } else if (expiresInDays <= 7) {
        console.warn(`[CRM-NODE] WARNING: GHL_API_TOKEN expires in ${expiresInDays} day(s). Rotate immediately.`);
      } else {
        console.log(`[CRM-NODE] GHL token valid for ${expiresInDays} days.`);
      }
    }
  } catch (_) {
    console.warn('[CRM-NODE] Could not decode GHL_API_TOKEN expiry. Token may be a non-standard format.');
  }

  // W-AUTH-01: Require SDM_INTERNAL_KEY — no default fallback
  const SDM_INTERNAL_KEY = process.env.SDM_INTERNAL_KEY;
  if (!SDM_INTERNAL_KEY) {
    console.error("[CRM-NODE] FATAL ERROR: SDM_INTERNAL_KEY is not set. Cannot authenticate inbound requests.");
    process.exit(1);
  }

  // W-NET-01: Use COMMAND_CENTER_URL — never hardcode localhost
  const COMMAND_CENTER_URL = process.env.COMMAND_CENTER_URL || 'http://localhost:5000';
  if (!process.env.COMMAND_CENTER_URL && process.env.NODE_ENV === 'production') {
    console.error('[CRM-NODE] FATAL: COMMAND_CENTER_URL is not set in production.');
    process.exit(1);
  }
  console.log(`[CRM-NODE] Command Center URL: ${COMMAND_CENTER_URL}`);

  // ── INTERNAL AUTH GUARD ────────────────────────────────────────────────────
  function requireSdmKey(req, res, next) {
    const key = req.headers['x-sdm-internal-key'];
    if (key !== SDM_INTERNAL_KEY) {
      console.warn(`[CRM-NODE] Unauthorized /outbound-sync request from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // ── HEALTH PROBE ───────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', node: 'crm-node', ts: Date.now() }));

  // ── INBOUND: GHL Webhook Listener ─────────────────────────────────────────
  app.post('/webhook', async (req, res) => {
    try {
      const event = req.body;
      const contactId = event.contactId || event.id || 'unknown';
      
      console.log(`[CRM-NODE] Inbound GHL Webhook: Type [${event.type || 'unknown'}] Contact: ${contactId}`);

      await enqueueEvent({
        domain: 'crm',
        eventType: 'GHL_CONTACT_UPDATE',
        payload: event,
        target: 'orchestrator',
      });

      res.json({ received: true });
    } catch (err) {
      console.error('[CRM-NODE] Critical Inbound Webhook Error:', err);
      // Always return 200 to GHL to prevent infinite retry storms
      res.status(200).json({ received: true, error: err.message });
    }
  });

  // ── OUTBOUND: Sync MRR / State into GHL (Auth-guarded) ────────────────────
  app.post('/outbound-sync', requireSdmKey, async (req, res) => {
    try {
      const { ghlContactId, tagsToAdd, tagsToRemove, customFields } = req.body;
      
      if (!ghlContactId) {
        return res.status(400).json({ error: 'Missing contact ID' });
      }

      console.log(`[CRM-NODE] Outbound Sync -> Contact ${ghlContactId} | Add: [${(tagsToAdd||[]).join(',')}] | Remove: [${(tagsToRemove||[]).join(',')}]`);
      
      // V1 GHL structure: tags field for adds/removes, customField for custom fields
      const payload = {};
      if (tagsToAdd && tagsToAdd.length > 0) {
        payload.tags = tagsToAdd;
      }
      
      // Fixed: V1 API uses a separate endpoint for tag removal
      // PUT contact to set tags first
      const url = `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`;
      const headers = {
        "Authorization": `Bearer ${GHL_API_TOKEN}`,
        "Content-Type": "application/json"
      };

      if (customFields && Object.keys(customFields).length > 0) {
        payload.customField = Object.entries(customFields).map(([id, value]) => ({ id, field_value: value }));
      }

      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CRM-NODE] V1 API Sync Failed: ${response.status} ${errorText}`);
        return res.status(response.status).json({ success: false, error: errorText });
      }

      // Handle tag removal via dedicated GHL V1 endpoint if requested
      if (tagsToRemove && tagsToRemove.length > 0) {
        const removeResp = await fetch(`${url}/tags`, {
          method: "DELETE",
          headers,
          body: JSON.stringify({ tags: tagsToRemove })
        });
        if (!removeResp.ok) {
          console.warn(`[CRM-NODE] Tag removal warning: ${removeResp.status}`);
        }
      }

      console.log(`[CRM-NODE] Successfully synced state into GoHighLevel for ${ghlContactId}.`);
      res.json({ success: true });
    } catch (err) {
      console.error('[CRM-NODE] Critical Outbound Sync Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── LOOKUP: Resolve GHL Contact ID by email ────────────────────────────────
  // Called when a profile has no ghlContactId yet. One-time lookup on first sync.
  app.get('/lookup-contact', requireSdmKey, async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: 'Missing email param' });

      const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/search?query=${encodeURIComponent(email)}`, {
        headers: { "Authorization": `Bearer ${GHL_API_TOKEN}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      const contact = data.contacts?.[0] || null;
      if (contact) {
        console.log(`[CRM-NODE] GHL Contact resolved: ${contact.id} for ${email}`);
      } else {
        console.warn(`[CRM-NODE] No GHL contact found for email: ${email}`);
      }

      res.json({ contactId: contact?.id || null, contact });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── SEARCH: Query GHL Contacts ─────────────────────────────────────────────
  app.get('/search', requireSdmKey, async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) return res.status(400).json({ error: 'Missing query param' });

      console.log(`[CRM-NODE] Live Search Triggered: ${query}`);
      const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/search?query=${encodeURIComponent(query)}`, {
        headers: { "Authorization": `Bearer ${GHL_API_TOKEN}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── MUTATE: Direct Contact / Pipeline Updates ────────────────────────────────
  app.post('/update-contact', requireSdmKey, async (req, res) => {
    try {
      const { ghlContactId, payload } = req.body;
      if (!ghlContactId || !payload) {
        return res.status(400).json({ error: 'Missing contact ID or payload' });
      }

      console.log(`[CRM-NODE] Direct Mutation -> Contact ${ghlContactId}`);
      
      const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${GHL_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ success: false, error: errorText });
      }

      const data = await response.json();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Mount Sales Velocity routes (Wolverine: skip if module load failed) ──
  if (salesVelocityRoutes && typeof salesVelocityRoutes.mount === 'function') {
    salesVelocityRoutes.mount(app);
  }

  const PORT = process.env.SDM_CRM_PORT || 4002;
  app.listen(PORT, () => console.log(`[CRM-NODE] Live. Bidirectional CRM mesh listening on port ${PORT}`));
}

module.exports = { start };
