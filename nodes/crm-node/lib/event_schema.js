/**
 * EVENT SCHEMA — Universal Event Envelope
 * 
 * Every event in the Sovereign Domain Mesh MUST conform to this schema.
 * Both outbound (node → orchestrator) and inbound (orchestrator → node)
 * messages are validated against this structure.
 * 
 * Schema Version: 1.0
 */

const crypto = require('crypto');

const VALID_DOMAINS = [
  'billing',
  'seo',
  'marketing',
  'infrastructure',
  'client-ops',
  'scheduling',
  'internal-ops',
  'security',
  'test',
];

const VALID_STATUSES = ['PENDING', 'DISPATCHED', 'FAILED'];

/**
 * Create a standardized event envelope.
 * 
 * @param {Object} opts
 * @param {string} opts.domain       - Routing domain (must be in VALID_DOMAINS)
 * @param {string} opts.eventType    - Event type, e.g. 'PAYMENT_FAILED'
 * @param {Object} [opts.payload={}] - Arbitrary JSON payload
 * @param {string} [opts.target]     - Target orchestrator/node, null = use domain routing
 * @param {string} [opts.source]     - Source node (auto-filled from NODE_NAME env)
 * @returns {Object} Validated event envelope
 */
function createEvent({ domain, eventType, payload = {}, target = null, source = null }) {
  if (!domain || !eventType) {
    throw new Error('createEvent requires both domain and eventType');
  }

  if (!VALID_DOMAINS.includes(domain)) {
    throw new Error(`Invalid domain "${domain}". Valid: ${VALID_DOMAINS.join(', ')}`);
  }

  return {
    eventId: crypto.randomUUID(),
    source: source || process.env.NODE_NAME || 'unknown',
    target: target || null,
    domain,
    eventType,
    payload,
    schemaVersion: '1.0',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate an inbound event envelope.
 * Returns { valid: true, event } or { valid: false, error }.
 */
function validateEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Event is not an object' };
  }
  if (!raw.eventId || !raw.domain || !raw.eventType || !raw.schemaVersion) {
    return { valid: false, error: 'Missing required fields (eventId, domain, eventType, schemaVersion)' };
  }
  if (!VALID_DOMAINS.includes(raw.domain)) {
    return { valid: false, error: `Invalid domain "${raw.domain}"` };
  }
  return { valid: true, event: raw };
}

module.exports = { createEvent, validateEvent, VALID_DOMAINS };
