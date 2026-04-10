/**
 * STRIPE NODE — Production Handler
 * 
 * Listens for Stripe webhook events on port 4001. When a payment
 * fails or a subscription changes, enqueues a domain-routed event
 * to Jade via the transactional outbox.
 * 
 * Stripe webhook → Express → enqueueEvent → outbox → Pub/Sub → Jade
 */

const express = require('express');

const STRIPE_PORT = process.env.PORT || parseInt(process.env.STRIPE_PORT || '4001');

/**
 * @param {Object} ctx
 * @param {Object|null} ctx.directives - GitHub-loaded behavioral rules
 * @param {Function} ctx.enqueueEvent  - Enqueue an event to the outbox
 */
async function start({ directives, enqueueEvent, app }) {
  // Global Sentinel app injected directly

  async function syncMrrToCommandCenter(event, eventType) {
    try {
      const CC_URL = process.env.COMMAND_CENTER_URL || 'http://localhost:5000';
      // Stripe subscription data structure
      const sub = event.data?.object;
      if (!sub) return;

      const stripeCustomerId = sub.customer;
      const amountInCents = sub.plan?.amount || (sub.items?.data?.[0]?.price?.unit_amount) || 0;
      
      const payload = {
        stripeCustomerId,
        subscriptionId: sub.id,
        eventType,
        amountInCents,
        month: new Date().toISOString().slice(0, 7), // YYYY-MM
        timestamp: new Date().toISOString()
      };

      const res = await fetch(`${CC_URL}/api/kpi/sync-mrr-snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sdm-internal-key': process.env.SDM_INTERNAL_KEY || ''
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.warn(`[STRIPE] Failed to sync MRR to CC. Status: ${res.status}`, errJson);
      } else {
        console.log(`[STRIPE] Synced MRR event ${eventType} for ${stripeCustomerId} to CC`);
      }
    } catch (err) {
      console.error(`[STRIPE] CC MRR Sync Exception:`, err.message);
    }
  }

  // Stripe sends raw body for signature verification
  app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf; },
  }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'alive', node: 'stripe-node', uptime: process.uptime() });
  });

  // Stripe webhook endpoint
  app.post('/stripe-webhook', async (req, res) => {
    let event;

    // Signature verification (production mode)
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret && req.rawBody) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
        event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], webhookSecret);
        console.log(`[STRIPE] Signature verified: ${event.type}`);
      } catch (err) {
        console.error(`[STRIPE] Signature verification failed: ${err.message}`);
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else {
      // Development mode — no signature verification
      event = req.body;
      console.log(`[STRIPE] Event received (dev mode, no sig check): ${event.type}`);
    }

    try {
      switch (event.type) {
        case 'invoice.payment_failed':
          await enqueueEvent({
            domain: 'billing',
            eventType: 'PAYMENT_FAILED',
            payload: {
              customerId: event.data?.object?.customer,
              invoiceId: event.data?.object?.id,
              amountDue: event.data?.object?.amount_due,
              attemptCount: event.data?.object?.attempt_count,
              currency: event.data?.object?.currency,
              stripeEventId: event.id,
            },
            target: 'jade',
          });
          console.log(`[STRIPE] → Enqueued PAYMENT_FAILED for ${event.data?.object?.customer}`);
          break;

        case 'customer.subscription.deleted':
          await enqueueEvent({
            domain: 'billing',
            eventType: 'SUBSCRIPTION_CANCELLED',
            payload: {
              customerId: event.data?.object?.customer,
              subscriptionId: event.data?.object?.id,
              canceledAt: event.data?.object?.canceled_at,
              stripeEventId: event.id,
            },
            target: 'jade',
          });
          console.log(`[STRIPE] → Enqueued SUBSCRIPTION_CANCELLED`);
          await syncMrrToCommandCenter(event, event.type);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          // In real production, we track billing domain events for these too, 
          // but for now we mainly need them for KPI MRR tracking.
          console.log(`[STRIPE] processing ${event.type}`);
          await syncMrrToCommandCenter(event, event.type);
          break;

        case 'invoice.payment_succeeded':
          await enqueueEvent({
            domain: 'billing',
            eventType: 'PAYMENT_SUCCEEDED',
            payload: {
              customerId: event.data?.object?.customer,
              invoiceId: event.data?.object?.id,
              amountPaid: event.data?.object?.amount_paid,
              stripeEventId: event.id,
            },
            target: 'jade',
          });
          console.log(`[STRIPE] → Enqueued PAYMENT_SUCCEEDED`);
          break;

        default:
          console.log(`[STRIPE] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error(`[STRIPE] Error processing ${event.type}: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Listen handled globally by node.js Sentinel
  console.log(`[STRIPE-NODE] Webhook listener mapped cleanly. Monitoring: payment_failed, subscription_deleted, payment_succeeded`);
}

module.exports = { start };
