/**
 * STRIPE NODE — Sovereign Domain Mesh
 *
 * Microservice responsible for ingesting live Stripe webhooks 
 * (Subscription lifecycle events) and proxying them to the central 
 * Orchestrator API (/api/kpi/sync-mrr-snapshot) to track Exact MRR.
 *
 * ENHANCEMENT v2: Stripe Signature Verification added for production security.
 */
const express = require('express');
const crypto = require('crypto');

// ── Stripe Signature Verification ───────────────────────────────────────────
function verifyStripeSignature(rawBody, sigHeader, secret) {
  // W-AUTH-03: secret is always required in production — no bypass
  if (!secret) return false;
  if (!sigHeader) return false;
  try {
    const parts = sigHeader.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;
    // Reject webhooks older than 5 minutes to prevent replay attacks
    const drift = Math.abs(Date.now() / 1000 - parseInt(timestamp));
    if (drift > 300) {
      console.warn('[STRIPE-NODE] Webhook timestamp drift exceeded 5 min — rejected (replay protection)');
      return false;
    }
    const payload = `${timestamp}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

async function start({ directives, enqueueEvent }) {
  console.log('[STRIPE-NODE] Booting Triad Telemetry Webhook Listener (v2)...');

  // W-AUTH-03: Require STRIPE_WEBHOOK_SECRET — no production bypass
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET && process.env.NODE_ENV !== 'test') {
    console.error('[STRIPE-NODE] FATAL: STRIPE_WEBHOOK_SECRET is not set. Cannot accept webhooks securely.');
    process.exit(1);
  }

  // W-AUTH-01: Require SDM_INTERNAL_KEY — no default fallback
  const SDM_INTERNAL_KEY = process.env.SDM_INTERNAL_KEY;
  if (!SDM_INTERNAL_KEY) {
    console.error('[STRIPE-NODE] FATAL: SDM_INTERNAL_KEY is not set. Cannot authenticate with Command Center.');
    process.exit(1);
  }

  // W-NET-01: Use COMMAND_CENTER_URL — never hardcode localhost
  const COMMAND_CENTER_URL = process.env.COMMAND_CENTER_URL || 'http://localhost:5000';
  if (!process.env.COMMAND_CENTER_URL && process.env.NODE_ENV === 'production') {
    console.error('[STRIPE-NODE] FATAL: COMMAND_CENTER_URL is not set in production. MRR syncs will fail.');
    process.exit(1);
  }
  console.log(`[STRIPE-NODE] Command Center URL: ${COMMAND_CENTER_URL}`);

  const app = express();
  
  // Use raw parser to capture body for signature verification
  app.use('/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());

  app.post('/webhook', async (req, res) => {
    try {
      const rawBody = req.body;
      const sigHeader = req.headers['stripe-signature'];
      
      // W-AUTH-03: Signature verification always enforced
      const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : JSON.stringify(rawBody);
      if (!verifyStripeSignature(rawStr, sigHeader, WEBHOOK_SECRET)) {
        console.error('[STRIPE-NODE] Invalid Stripe signature — webhook rejected.');
        return res.status(401).send('Invalid signature');
      }

      const event = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString('utf8')) : rawBody;

      if (!event || !event.type) {
        return res.status(400).send('Webhook Error: Unknown event');
      }

      // We only care about subscription lifecycle events for MRR tracking
      const allowedEvents = [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted'
      ];

      if (allowedEvents.includes(event.type)) {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;
        const subscriptionId = subscription.id;
        
        // Calculate exact recurring MRR in cents
        let amountInCents = 0;
        if (subscription.items && subscription.items.data) {
          amountInCents = subscription.items.data.reduce((sum, item) => {
            const price = item.price?.unit_amount || 0;
            const qty = item.quantity || 1;
            const interval = item.price?.recurring?.interval || 'month';
            const rawMonthly = interval === 'year' ? Math.round(price / 12) : price;
            return sum + (rawMonthly * qty);
          }, 0);
        }

        // Generate YYYY-MM based on the time the webhook fired
        const dateObj = new Date(event.created ? event.created * 1000 : Date.now());
        const month = dateObj.toISOString().slice(0, 7);

        console.log(`[STRIPE-NODE] Verified [${event.type}] for ${stripeCustomerId} -> $${(amountInCents / 100).toFixed(2)} MRR`);

        // W-NET-01: Forward to Command Center via COMMAND_CENTER_URL env var
        const response = await fetch(`${COMMAND_CENTER_URL}/api/kpi/sync-mrr-snapshot`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sdm-internal-key": SDM_INTERNAL_KEY
          },
          body: JSON.stringify({
            stripeCustomerId,
            subscriptionId,
            eventType: event.type,
            amountInCents,
            month,
            timestamp: event.created
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[STRIPE-NODE] Failed to proxy telemetry: ${response.status} ${errorText}`);
        } else {
          console.log(`[STRIPE-NODE] Successfully synced MRR state to Command Center.`);
        }
      }

      // Always acknowledge Stripe promptly so it doesn't retry
      res.json({ received: true });
    } catch (err) {
      console.error('[STRIPE-NODE] Critical Webhook Error:', err);
      res.status(500).send(`Server Error: ${err.message}`);
    }
  });

  // ── Health Probe ───────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', node: 'stripe-node', ts: Date.now() }));

  const PORT = process.env.SDM_STRIPE_PORT || 4001;
  app.listen(PORT, () => console.log(`[STRIPE-NODE] Live. Listening for Stripe webhooks on port ${PORT}. Signature verification: ${WEBHOOK_SECRET ? 'ENABLED' : 'DISABLED (dev mode)'}`));
}

module.exports = { start };
