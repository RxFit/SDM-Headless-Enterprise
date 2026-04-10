/**
 * ORCHESTRATOR UPGRADES — Test Suite
 * 
 * Tests: Circuit Breaker, Credential Vault, Mutual Watchdog
 * (Alert Cascade is not tested here — requires live Google Chat/Email/Twilio)
 */

let passed = 0, failed = 0;
function assert(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ FAIL: ${label}`); failed++; }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('ORCHESTRATOR UPGRADES — TEST SUITE');
  console.log('═'.repeat(60));

  // --- CIRCUIT BREAKER ---
  console.log('\n[TEST 1] Circuit Breaker');

  // Create a fresh instance with low thresholds for testing
  process.env.CB_MAX_API_CALLS = '5';
  process.env.CB_MAX_NODE_EXECUTIONS = '200';
  process.env.CB_MAX_ENCLAVE_SPAWNS = '50';

  // Reimport with fresh state
  delete require.cache[require.resolve('./circuit_breaker')];
  // Mock the alert_cascade so it doesn't try to send real alerts
  require.cache[require.resolve('./alert_cascade')] = {
    id: require.resolve('./alert_cascade'),
    filename: require.resolve('./alert_cascade'),
    loaded: true,
    exports: { fireAlert: async () => ({ channels: { mock: 'SUCCESS' } }) },
  };

  const cb = require('./circuit_breaker');

  assert('Initially not halted', !cb.isHalted());

  // Record 4 API calls — should not trip
  for (let i = 0; i < 4; i++) cb.record('apiCalls');
  assert('4/5 calls — not tripped', !cb.isHalted());

  // 5th call — should trip
  const result = cb.record('apiCalls');
  assert('5th call trips the breaker', result.tripped === true);
  assert('Mesh is now halted', cb.isHalted());

  // Status check
  const status = cb.getStatus();
  assert('Status shows halted', status.halted === true);
  assert('Status shows 5 API calls', status.apiCalls.count === 5);

  // Reset
  cb.reset();
  assert('After reset — not halted', !cb.isHalted());

  // --- CREDENTIAL VAULT ---
  console.log('\n[TEST 2] Credential Vault');

  // Set a known encryption key for testing
  process.env.VAULT_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
  process.env.VAULT_TTL_MS = '5000'; // 5 seconds for testing

  delete require.cache[require.resolve('./credential_vault')];
  const vault = require('./credential_vault');

  // Issue a token
  const token = vault.issueToken('stripe-node', 'STRIPE_API_KEY', 'sk_test_1234567890');
  assert('Token issued with ID', !!token.tokenId);
  assert('Token has encrypted payload', !!token.encryptedPayload);
  assert('Token has expiry', token.expiresAt > Date.now());

  // Decrypt the token
  const decrypted = vault.decryptToken(token.encryptedPayload, process.env.VAULT_ENCRYPTION_KEY);
  assert('Decrypted value matches original', decrypted === 'sk_test_1234567890');

  // Token is valid
  assert('Token is valid before expiry', vault.isTokenValid(token.tokenId));

  // Revoke the token
  vault.revokeToken(token.tokenId);
  assert('Token is invalid after revocation', !vault.isTokenValid(token.tokenId));

  // Wait for expiry to test purge
  const token2 = vault.issueToken('test-node', 'TEST_KEY', 'test-value');
  assert('Second token is valid', vault.isTokenValid(token2.tokenId));

  // Vault status
  const vaultStatus = vault.getStatus();
  assert('Vault shows active tokens', vaultStatus.activeTokens >= 1);
  assert('Vault shows encryption configured', vaultStatus.encryptionConfigured);

  // --- MUTUAL WATCHDOG ---
  console.log('\n[TEST 3] Mutual Watchdog (Unit)');

  delete require.cache[require.resolve('./mutual_watchdog')];
  const watchdog = require('./mutual_watchdog');

  // Record a heartbeat
  watchdog.recordPartnerHeartbeat('jade');
  // Note: startWatchdog requires enqueueEvent so we test status getter only 
  const wdStatus = watchdog.getStatus();
  assert('Watchdog status is accessible', typeof wdStatus === 'object');

  // --- SUMMARY ---
  console.log('\n' + '═'.repeat(60));
  console.log(`ORCHESTRATOR TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
