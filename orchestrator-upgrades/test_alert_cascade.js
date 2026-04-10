/**
 * ALERT CASCADE — Live Integration Test
 * 
 * Tests all 3 channels: Google Chat (expected to fail gracefully),
 * Email (via Gmail API), and SMS (via Twilio).
 * 
 * Reads credentials from RxFit-MCP/automation/context_config.json
 * and jade_token.json (existing Jade infrastructure).
 */

const fs = require('fs');
const path = require('path');

// Load credentials from existing Jade config
const configPath = path.join(__dirname, '..', '..', 'RxFit-MCP', 'automation', 'context_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Inject env vars that the alert_cascade module expects
process.env.TWILIO_ACCOUNT_SID = config.twilio_account_sid;
process.env.TWILIO_AUTH_TOKEN = config.twilio_auth_token;
process.env.TWILIO_FROM_NUMBER = config.twilio_toll_free;
process.env.GOOGLE_CHAT_WEBHOOK = 'https://chat.googleapis.com/v1/spaces/AAQAJnbfgSY/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=8AnF1nwX8GOzGN_l7fhVwoJU82mvgqUvBK0keejQdLQ';

const { fireAlert } = require('./alert_cascade');

async function run() {
  console.log('═'.repeat(60));
  console.log('ALERT CASCADE — LIVE INTEGRATION TEST');
  console.log('═'.repeat(60));
  console.log(`Twilio SID: ${config.twilio_account_sid.slice(0, 8)}...`);
  console.log(`From:       ${config.twilio_toll_free}`);
  console.log(`To (Danny): +1${config.danny_phone_number}`);
  console.log();

  const results = await fireAlert({
    level: 'INFO',
    title: 'SDM Alert Cascade Test — Phase 1 Complete',
    body: 'This is a live test of the Sovereign Domain Mesh alert cascade.\n\n' +
          'Phase 1 is complete. All systems operational.\n' +
          `Timestamp: ${new Date().toISOString()}`,
  });

  console.log('\n' + '═'.repeat(60));
  console.log('CASCADE RESULTS:');
  console.log('═'.repeat(60));
  console.log(JSON.stringify(results, null, 2));

  // Score
  const channels = Object.entries(results.channels);
  const succeeded = channels.filter(([_, v]) => v === 'SUCCESS').length;
  const failed = channels.filter(([_, v]) => v !== 'SUCCESS').length;
  console.log(`\n  Channels: ${succeeded} succeeded, ${failed} failed (${channels.length} total)`);

  // Google Chat is expected to fail (no webhook configured)
  if (results.channels.googleChat?.includes('FAILED')) {
    console.log('  (Google Chat failure is expected — no webhook configured yet)');
  }
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
