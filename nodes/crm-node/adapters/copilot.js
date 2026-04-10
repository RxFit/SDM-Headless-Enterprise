/**
 * COPILOT ADAPTER — CoPilot/GoHighLevel CRM Integration
 * 
 * Implements the CRM adapter interface for LeadConnectorHQ.
 * Pattern extracted from ltv_ultimate_merger.js (proven).
 * 
 * TEMPORARY: This adapter will be replaced by gdrive_crm.js
 * when the custom Google Drive-based CRM is ready.
 */

const https = require('https');

const API_HOST = 'rest.gohighlevel.com';
const API_KEY = process.env.COPILOT_API_KEY;
const LOCATION_ID = process.env.COPILOT_LOCATION_ID;

/**
 * Make an authenticated API call to CoPilot (LeadConnectorHQ).
 */
function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`CoPilot API ${res.statusCode}: ${parsed.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`CoPilot response parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Look up a contact by Stripe customer ID or email.
 */
async function findContact(identifier) {
  // Try by email first
  const result = await apiCall('GET',
    `/v1/contacts/?query=${encodeURIComponent(identifier)}&limit=1`
  );
  return result.contacts?.[0] || null;
}

/**
 * Flag a client as payment-at-risk.
 * Adds a tag and updates a custom field.
 */
async function flagClient(customerId, reason) {
  const contact = await findContact(customerId);
  if (!contact) {
    console.log(`[COPILOT] Contact not found for ${customerId}`);
    return { success: false, error: 'Contact not found' };
  }

  // V1 API maps PUT directly to /v1/contacts/{id}
  await apiCall('PUT', `/v1/contacts/${contact.id}`, {
    tags: [...(contact.tags || []), 'payment-at-risk'],
    customFields: [
      { key: 'payment_status', value: 'AT_RISK' },
      { key: 'payment_risk_reason', value: reason },
      { key: 'payment_risk_date', value: new Date().toISOString() },
    ],
  });

  console.log(`[COPILOT] Flagged ${contact.firstName} ${contact.lastName} as payment-at-risk`);
  return { success: true, contactId: contact.id, name: `${contact.firstName} ${contact.lastName}` };
}

/**
 * Archive a client (move to canceled/archived status).
 */
async function archiveClient(customerId, reason) {
  const contact = await findContact(customerId);
  if (!contact) {
    return { success: false, error: 'Contact not found' };
  }

  await apiCall('PUT', `/v1/contacts/${contact.id}`, {
    tags: [...(contact.tags || []).filter(t => t !== 'active'), 'archived'],
    customFields: [
      { key: 'client_status', value: 'ARCHIVED' },
      { key: 'archive_reason', value: reason },
      { key: 'archive_date', value: new Date().toISOString() },
    ],
  });

  console.log(`[COPILOT] Archived ${contact.firstName} ${contact.lastName}`);
  return { success: true, contactId: contact.id };
}

/**
 * Enrich a client's CRM record with external data.
 */
async function enrichClient(customerId, data) {
  const contact = await findContact(customerId);
  if (!contact) {
    return { success: false, error: 'Contact not found' };
  }

  const customFields = Object.entries(data).map(([key, value]) => ({ key, value: String(value) }));

  await apiCall('PUT', `/v1/contacts/${contact.id}`, { customFields });

  console.log(`[COPILOT] Enriched ${contact.firstName} ${contact.lastName} with ${customFields.length} fields`);
  return { success: true, contactId: contact.id, fieldsUpdated: customFields.length };
}

/**
 * Add a timeline note to a contact.
 */
async function addNote(customerId, title, body) {
  const contact = await findContact(customerId);
  if (!contact) return { success: false, error: 'Contact not found' };

  await apiCall('POST', `/v1/contacts/${contact.id}/notes/`, {
    body: `[${title}] ${body}`
  });
  
  console.log(`[COPILOT] Added note to ${contact.firstName} ${contact.lastName}`);
  return { success: true, contactId: contact.id };
}

/**
 * Add a tag to a contact.
 */
async function addTag(customerId, tagName) {
  const contact = await findContact(customerId);
  if (!contact) return { success: false, error: 'Contact not found' };
  
  const currentTags = contact.tags || [];
  if (currentTags.includes(tagName)) return { success: true };

  await apiCall('POST', `/v1/contacts/${contact.id}/tags/`, {
    tags: [tagName]
  });
  
  console.log(`[COPILOT] Added tag ${tagName} to ${contact.firstName} ${contact.lastName}`);
  return { success: true, contactId: contact.id };
}

/**
 * Fetch a paginated list of contacts (used by Nightly Healer).
 */
async function listContacts(limit = 100, queryParams = '') {
  const query = `/v1/contacts/?limit=${limit}${queryParams ? `&${queryParams}` : ''}`;
  const result = await apiCall('GET', query);
  return { contacts: result.contacts || [], meta: result.meta || {} };
}

module.exports = { flagClient, archiveClient, enrichClient, addNote, addTag, listContacts };
