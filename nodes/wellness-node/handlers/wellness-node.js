/**
 * wellness-node Handler
 * 
 * Polls the SnapCalorie/AppSheet API every 15 minutes for client
 * wellness data. Detects actionable patterns and emits events:
 * 
 * - LOW_CALORIE_LOG:   Client logged < 1200 cal/day
 * - MISSED_THREE_DAYS: Client hasn't logged for 3+ days
 * - GOAL_ACHIEVED:     Client hit their weekly calorie target
 * 
 * These events flow through Pub/Sub → Jade → routing engine
 * for automated CRM enrichment and alert dispatch.
 */

const POLL_INTERVAL = parseInt(process.env.WELLNESS_POLL_INTERVAL_MS || '900000');

// Thresholds
const LOW_CAL_THRESHOLD = 1200;
const MISSED_DAYS_THRESHOLD = 3;

/**
 * F-DATA-02: Real Google Sheets data source.
 *
 * Pulls from WELLNESS_SHEET_ID (env var). Expected sheet structure:
 * Col A: ClientID  | Col B: ClientName  | Col C: CaloriesLogged (today)
 * Col D: LastLogDate (YYYY-MM-DD) | Col E: WeeklyTarget | Col F: WeeklyActual
 *
 * Service account auth via GOOGLE_SERVICE_ACCOUNT_KEY (JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS (key file path).
 */
const { GoogleAuth } = require('google-auth-library');

// 5-minute Sheets cache — prevents rate-limit on 15-min poll cycle
let _sheetsCache = null;
let _sheetsCacheExpiresAt = 0;
const SHEETS_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchWellnessData() {
  const sheetId = process.env.WELLNESS_SHEET_ID || process.env.MASTER_CLIENT_SHEET_ID;

  if (!sheetId) {
    // Not configured — return empty (DATA_STALE fires after 3 polls)
    console.warn('[WELLNESS-NODE] WELLNESS_SHEET_ID not configured. Set env var to enable real data.');
    return [];
  }

  // Cache hit
  if (_sheetsCache && Date.now() < _sheetsCacheExpiresAt) {
    return _sheetsCache;
  }

  const saKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const saKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!saKeyRaw && !saKeyFile) {
    console.warn('[WELLNESS-NODE] No Google auth configured (GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS). Returning empty.');
    return [];
  }

  try {
    let auth;
    if (saKeyRaw) {
      const credentials = JSON.parse(saKeyRaw);
      auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    } else {
      auth = new GoogleAuth({
        keyFilename: saKeyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Use the Sheets REST API directly (no googleapis dependency needed)
    const sheetRange = encodeURIComponent(
      process.env.WELLNESS_SHEET_RANGE || 'Wellness Log!A2:F'
    );
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}`;

    const fetch = require('node-fetch');
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token.token}` },
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Sheets API returned ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const json = await resp.json();
    const rows = json.values || [];

    const records = rows
      .filter(r => r[0] && r[1]) // must have clientId and clientName
      .map(r => ({
        clientId:      r[0]?.trim() || '',
        clientName:    r[1]?.trim() || '',
        caloriesLogged: r[2] ? parseInt(r[2], 10) : null,
        lastLogDate:   r[3]?.trim() || null,
        weeklyTarget:  r[4] ? parseInt(r[4], 10) : null,
        weeklyActual:  r[5] ? parseInt(r[5], 10) : null,
      }))
      .filter(r => r.clientId);

    console.log(`[WELLNESS-NODE] Sheets fetch: ${records.length} records from ${sheetId}`);

    // Cache results
    _sheetsCache = records;
    _sheetsCacheExpiresAt = Date.now() + SHEETS_CACHE_TTL_MS;

    return records;
  } catch (err) {
    console.error(`[WELLNESS-NODE] Sheets fetch failed: ${err.message}`);
    // Return stale cache if available on error
    if (_sheetsCache) {
      console.warn('[WELLNESS-NODE] Returning stale cache after fetch error');
      return _sheetsCache;
    }
    throw err; // propagate so poll() error counter increments
  }
}


/**
 * Analyze wellness data and detect actionable patterns.
 * Returns an array of events to emit.
 */
function analyzeWellnessData(records) {
  const events = [];
  const now = new Date();

  for (const record of records) {
    const { clientId, clientName, caloriesLogged, lastLogDate, weeklyTarget, weeklyActual } = record;

    // Check for low calorie intake
    if (caloriesLogged && caloriesLogged < LOW_CAL_THRESHOLD) {
      events.push({
        domain: 'wellness',
        eventType: 'LOW_CALORIE_LOG',
        payload: {
          clientId,
          clientName,
          caloriesLogged,
          threshold: LOW_CAL_THRESHOLD,
          date: new Date().toISOString(),
        }
      });
    }

    // Check for missed logging days
    if (lastLogDate) {
      const daysSinceLog = Math.floor((now - new Date(lastLogDate)) / (1000 * 60 * 60 * 24));
      if (daysSinceLog >= MISSED_DAYS_THRESHOLD) {
        events.push({
          domain: 'wellness',
          eventType: 'MISSED_THREE_DAYS',
          payload: {
            clientId,
            clientName,
            daysSinceLastLog: daysSinceLog,
            lastLogDate,
          }
        });
      }
    }

    // Check for goal achievement
    if (weeklyTarget && weeklyActual && weeklyActual >= weeklyTarget) {
      events.push({
        domain: 'wellness',
        eventType: 'GOAL_ACHIEVED',
        payload: {
          clientId,
          clientName,
          weeklyTarget,
          weeklyActual,
          achievementDate: new Date().toISOString(),
        }
      });
    }
  }

  return events;
}

/**
 * Main polling loop.
 * Called by node.js boot sequence.
 */
async function start({ directives, enqueueEvent }) {
  console.log(`[WELLNESS-NODE] Polling every ${POLL_INTERVAL / 1000}s`);
  console.log(`[WELLNESS-NODE] Thresholds: LOW_CAL=${LOW_CAL_THRESHOLD} kcal, MISSED=${MISSED_DAYS_THRESHOLD} days`);

  // W-DATA-03: Liveness guard — track consecutive zero-data polls
  let consecutiveEmptyPolls = 0;
  const EMPTY_POLL_ALERT_THRESHOLD = 3;

  // W-OPS-02: Error counter — track consecutive fetch failures
  let consecutiveErrors = 0;
  const ERROR_ALERT_THRESHOLD = 3;

  async function poll() {
    try {
      const records = await fetchWellnessData();

      // W-OPS-02: Reset error counter on successful fetch
      consecutiveErrors = 0;

      if (records.length === 0) {
        consecutiveEmptyPolls++;
        // W-DATA-03: Fire alert if data source has been dark for too long
        if (consecutiveEmptyPolls === EMPTY_POLL_ALERT_THRESHOLD) {
          console.warn(`[WELLNESS-NODE] DATA STALE: ${EMPTY_POLL_ALERT_THRESHOLD} consecutive polls returned 0 records`);
          await enqueueEvent({
            domain: 'wellness',
            eventType: 'DATA_STALE',
            payload: {
              consecutiveEmptyPolls,
              pollIntervalMs: POLL_INTERVAL,
              staleDurationMin: Math.round((consecutiveEmptyPolls * POLL_INTERVAL) / 60000),
              message: `Wellness data source returned 0 records for ${consecutiveEmptyPolls} consecutive polls`,
            },
          });
        }
        return;
      }

      // Data arrived — reset stale counter
      consecutiveEmptyPolls = 0;

      const events = analyzeWellnessData(records);
      console.log(`[WELLNESS-NODE] Polled ${records.length} records → ${events.length} events detected`);

      for (const event of events) {
        await enqueueEvent(event);
        console.log(`[WELLNESS-NODE] Emitted: ${event.eventType} for client ${event.payload.clientId}`);
      }
    } catch (err) {
      consecutiveErrors++;
      console.error(`[WELLNESS-NODE] Poll error (${consecutiveErrors}/${ERROR_ALERT_THRESHOLD}): ${err.message}`);

      // W-OPS-02: Fire alert after consecutive failures
      if (consecutiveErrors === ERROR_ALERT_THRESHOLD) {
        console.error(`[WELLNESS-NODE] FETCH_ERROR: ${ERROR_ALERT_THRESHOLD} consecutive API failures`);
        try {
          await enqueueEvent({
            domain: 'wellness',
            eventType: 'FETCH_ERROR',
            payload: {
              consecutiveErrors,
              lastError: err.message,
              message: `Wellness API has failed ${consecutiveErrors} consecutive times`,
            },
          });
        } catch (_) {} // Don't crash the poll loop on alert failure
      }
    }
  }

  // Initial poll
  await poll();

  // Recurring poll
  setInterval(poll, POLL_INTERVAL);

  // W-HTTP-01: Dummy Express server is now handled natively by node.js Sentinel
}

module.exports = { start, analyzeWellnessData, fetchWellnessData };
