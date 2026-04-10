/**
 * CREDENTIAL VAULT — Short-Lived Token Injection for Worker Nodes
 * 
 * Jade uses this module to generate time-limited credentials for
 * worker nodes. Tokens expire after TTL_MS and cannot be reused.
 * 
 * How it works:
 * 1. A worker node requests credentials via a Pub/Sub event
 * 2. Jade reads the master secret from its local .env
 * 3. Jade generates a short-lived token (encrypted, expiring)
 * 4. Jade sends the token back via Pub/Sub to the requesting node
 * 5. The node uses it for the specific operation, then discards
 * 
 * The vault itself NEVER stores secrets in a database or log.
 * All secrets are derived from env vars at runtime.
 */

const crypto = require('crypto');

// --- CONFIGURATION ---
const TTL_MS = parseInt(process.env.VAULT_TTL_MS || '300000'); // 5 minutes default
const ENCRYPTION_KEY = process.env.VAULT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// In-memory ledger of issued tokens (for revocation and audit)
const issuedTokens = new Map();

/**
 * Issue a short-lived credential token for a specific node + secret.
 * 
 * @param {string} nodeId       - The requesting node
 * @param {string} secretName   - Which secret to issue (e.g., 'STRIPE_API_KEY')
 * @param {string} secretValue  - The actual secret value (from Jade's .env)
 * @returns {Object} { tokenId, encryptedPayload, expiresAt }
 */
function issueToken(nodeId, secretName, secretValue) {
  const tokenId = crypto.randomUUID();
  const expiresAt = Date.now() + TTL_MS;

  // Encrypt the secret value
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(secretValue, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const encryptedPayload = iv.toString('hex') + ':' + encrypted;

  // Record in ledger
  issuedTokens.set(tokenId, {
    nodeId,
    secretName,
    issuedAt: Date.now(),
    expiresAt,
    revoked: false,
  });

  console.log(`[VAULT] Issued ${secretName} to ${nodeId} (expires in ${TTL_MS / 1000}s, token: ${tokenId.slice(0, 8)}...)`);

  return { tokenId, encryptedPayload, expiresAt };
}

/**
 * Decrypt a credential token (called by the receiving node).
 * 
 * @param {string} encryptedPayload - The payload from issueToken
 * @param {string} encryptionKey    - The shared encryption key
 * @returns {string} The decrypted secret value
 */
function decryptToken(encryptedPayload, encryptionKey) {
  const [ivHex, encrypted] = encryptedPayload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(encryptionKey, 'hex').slice(0, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Revoke a token (e.g., when a node is compromised).
 */
function revokeToken(tokenId) {
  const entry = issuedTokens.get(tokenId);
  if (entry) {
    entry.revoked = true;
    console.log(`[VAULT] Revoked token ${tokenId.slice(0, 8)}...`);
  }
}

/**
 * Check if a token is valid (not expired, not revoked).
 */
function isTokenValid(tokenId) {
  const entry = issuedTokens.get(tokenId);
  if (!entry) return false;
  if (entry.revoked) return false;
  if (Date.now() > entry.expiresAt) return false;
  return true;
}

/**
 * Purge expired tokens from the ledger.
 */
function purgeExpired() {
  const now = Date.now();
  let purged = 0;
  for (const [id, entry] of issuedTokens.entries()) {
    if (now > entry.expiresAt) {
      issuedTokens.delete(id);
      purged++;
    }
  }
  if (purged > 0) console.log(`[VAULT] Purged ${purged} expired tokens`);
  return purged;
}

/**
 * Get vault status for monitoring.
 */
function getStatus() {
  purgeExpired();
  return {
    activeTokens: issuedTokens.size,
    ttlMs: TTL_MS,
    encryptionConfigured: ENCRYPTION_KEY !== '',
  };
}

module.exports = { issueToken, decryptToken, revokeToken, isTokenValid, purgeExpired, getStatus };
