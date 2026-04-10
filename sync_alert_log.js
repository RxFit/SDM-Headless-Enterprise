const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'alert_log.jsonl');
const COMMAND_CENTER_URL = 'https://rxfit.app';
const SDM_INTERNAL_KEY = 'S+tDvAuBLyfIxzyDgoLj6bLEfWTSLGQzrjUtViCxeDM=';

async function pushLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('[Sync] No alert_log.jsonl found.');
    return;
  }

  const raw = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  
  console.log(`[Sync] Found ${lines.length} lines. Pushing last 25 to Command Center...`);
  const last25 = lines.slice(-25); // Only seed 25

  let success = 0;
  for (const line of last25) {
    try {
      const parsed = JSON.parse(line);
      const res = await fetch(`${COMMAND_CENTER_URL}/api/internal/alert-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sdm-key': SDM_INTERNAL_KEY
        },
        body: JSON.stringify({
          timestamp: parsed.timestamp,
          level: parsed.level || 'INFO',
          title: parsed.title || 'Unknown Event',
          body: parsed.body || '',
          passed: parsed.passed,
          channels: parsed.channels || {}
        })
      });

      if (res.ok) success++;
      else console.error(`[Sync] Failed to push log: ${res.statusText}`);
    } catch (err) {
      console.error('[Sync] Error parsing/pushing line:', err.message);
    }
  }

  console.log(`[Sync] Successfully pushed ${success}/${last25.length} logs.`);
}

pushLogs();
