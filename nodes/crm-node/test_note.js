require('dotenv').config();
const copilot = require('./adapters/copilot');

async function testOutbox() {
  const identifier = "matt dougan"; // Name or Email to search for in findContact
  console.log(`[TEST] Searching for ${identifier}...`);
  try {
    const result = await copilot.addNote(identifier, "SDM Test", "This is an empirical integration test triggered by the Sovereign Domain Mesh via the V1 Node adapter.");
    console.log('[TEST] Note Result:', result);
  } catch(err) {
    console.error('[TEST] Failed:', err);
  }
}
testOutbox();
