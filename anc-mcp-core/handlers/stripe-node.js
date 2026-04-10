/**
 * STRIPE NODE — Handler Example
 * 
 * This is a skeleton showing how to create a node-specific handler.
 * Clone anc-mcp-core, rename this file to match your NODE_NAME env var,
 * and implement the start() function with your domain logic.
 * 
 * The node.js boot sequence will call start() after loading directives,
 * starting the dispatcher, and starting the heartbeat.
 */

/**
 * @param {Object} ctx
 * @param {Object|null} ctx.directives - GitHub-loaded behavioral rules
 * @param {Function} ctx.enqueueEvent  - Enqueue an event to the outbox
 */
async function start({ directives, enqueueEvent }) {
  console.log('[STRIPE-NODE] Handler started');

  // Example: Listen for Stripe webhooks on a local Express server.
  // When a payment fails, enqueue an event for the orchestrator.

  // const express = require('express');
  // const app = express();
  // app.use(express.json());
  //
  // app.post('/stripe-webhook', async (req, res) => {
  //   const event = req.body;
  //   if (event.type === 'invoice.payment_failed') {
  //     await enqueueEvent({
  //       domain: 'billing',
  //       eventType: 'PAYMENT_FAILED',
  //       payload: {
  //         customerId: event.data.object.customer,
  //         invoiceId: event.data.object.id,
  //         amount: event.data.object.amount_due,
  //       },
  //       target: 'jade',
  //     });
  //   }
  //   res.json({ received: true });
  // });
  //
  // app.listen(4001, () => console.log('[STRIPE-NODE] Webhook listener on :4001'));
}

module.exports = { start };
