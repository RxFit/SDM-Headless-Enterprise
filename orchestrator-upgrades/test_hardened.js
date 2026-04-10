const assert = require('assert');

// --- TEST 1: extractJSONFromMarkdown ---
function extractJSONFromMarkdown(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match && match[1]) return match[1].trim();

  // Fallback if no fence but it looks like JSON
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0].trim();

  return text.trim();
}

const aiResponse = `Here is your route decision based on the event:

\`\`\`json
{
  "decision": "DISPATCH",
  "target": "jade-commands",
  "reasoning": "Standard routing command for jade nodes."
}
\`\`\`

Hopefully this provides clarity.`;

const extracted = extractJSONFromMarkdown(aiResponse);
const parsed = JSON.parse(extracted);

console.log('--- TEST 1: AI JSON Parsers ---');
console.log('Extracted JSON strictly isolates block:', parsed.target === 'jade-commands' ? 'PASS' : 'FAIL');

// --- TEST 2: Flapping Monitor Window ---
console.log('\n--- TEST 2: Monitor Flapping Debounce ---');
const now = Date.now();
const threshold = 90000;
const debounce = 300000;

const lastSeen = now - 95000; // silent for 95s
const isSilent = (now - lastSeen) > threshold;

const lastUpdatedFlapping = now - 120000; // recovered 2 mins ago
const isFlapping = (isSilent && true && (now - lastUpdatedFlapping) < debounce);
console.log('Node flapping detected (< 5 mins since recovery):', isFlapping ? 'PASS' : 'FAIL');

const lastUpdatedNotFlapping = now - 400000; // recovered 6.6 mins ago
const isNotFlapping = (isSilent && true && (now - lastUpdatedNotFlapping) < debounce);
console.log('Node legit death detected (> 5 mins since recovery):', isNotFlapping === false ? 'PASS' : 'FAIL');

// --- TEST 3: DB Transient Logic ---
console.log('\n--- TEST 3: Transient DB Error Catches ---');
const err1 = new Error('terminating connection due to administrator command');
const err2 = new Error('connect ECONNREFUSED 127.0.0.1:5432');
const err3 = new Error('syntax error at or near "SELECT"');

const checkFastFail = (err) => err.message.includes('ECONNREFUSED') || err.message.includes('terminating connection');

console.log('Catches terminating connection:', checkFastFail(err1) ? 'PASS' : 'FAIL');
console.log('Catches ECONNREFUSED:', checkFastFail(err2) ? 'PASS' : 'FAIL');
console.log('Ignores standard syntax errors:', checkFastFail(err3) === false ? 'PASS' : 'FAIL');
