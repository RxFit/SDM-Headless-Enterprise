/**
 * GOOGLE SHEETS HELPER — Sovereign Domain Mesh
 * Transpiled and adapted from RxFit-MCP.
 */
const { google } = require('googleapis');

async function getSheetsClient() {
  // Use GOOGLE_APPLICATION_CREDENTIALS if set
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let options = {
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    };
    
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        options.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }
    
    const auth = new google.auth.GoogleAuth(options);
    return google.sheets({ version: 'v4', auth });
  }

  // Fallback to Replit Connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('[googleSheets] No auth available.');
  }

  const conn = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-drive`,
    { headers: { Accept: 'application/json', X_REPLIT_TOKEN: xReplitToken } }
  ).then(r => r.json()).then(d => d.items?.[0]);

  const accessToken = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
  if (!accessToken) throw new Error('[googleSheets] Replit Google Drive connector not connected');

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2 });
}

const HEADER_ALIASES = {
  clientName:      ['client name', 'name', 'client'],
  firstName:       ['first name', 'firstname', 'first'],
  lastName:        ['last name', 'lastname', 'last'],
  email:           ['email', 'email address'],
  phone:           ['phone', 'phone number'],
  trainerId:       ['trainer id', 'trainer email'],
  trainerName:     ['trainer name', 'trainer'],
  status:          ['status', 'account status', 'client status'],
  paymentStatus:   ['payment status', 'payment'],
  billingRate:     ['price per session', 'price/session', 'client rate', 'rate', 'session price', 'billing rate'],
  sessionsPerWeek: ['sessions per week', 'sessions/week', 'frequency'],
  startDate:       ['start date', 'started', 'joined'],
  lastSessionDate: ['last session', 'last session date'],
  notes:           ['notes', 'comments'],
  stripeId:        ['stripe id', 'stripeid', 'stripe customer id', 'stripe account id'],
};

function buildColMap(headers) {
  const normalised = headers.map(h => (h || '').trim().toLowerCase());
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalised.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function parseRow(raw, colMap, rowIndex) {
  const get = (field) => {
    const idx = colMap[field];
    return idx !== undefined && raw[idx] !== undefined ? String(raw[idx]).trim() : null;
  };

  const email = (get('email') || '').toLowerCase();
  // We need either email or clientName to consider it a valid row
  if (!email && !get('clientName') && !get('firstName')) return null;

  const parseDollars = (rawStr) => {
    if (!rawStr) return null;
    const n = parseFloat(rawStr.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : Math.round(n * 100);
  };

  return {
    driveRowIndex: rowIndex + 1, // 1-based for Sheets API
    clientName: get('clientName') || `${get('firstName') || ''} ${get('lastName') || ''}`.trim(),
    email: email || null,
    phone: get('phone'),
    trainerId: get('trainerId'),
    trainerName: get('trainerName'),
    status: get('status') || 'active',
    paymentStatus: get('paymentStatus') || 'current',
    billingRate: parseDollars(get('billingRate')),
    sessionsPerWeek: parseInt(get('sessionsPerWeek'), 10) || null,
    startDate: get('startDate'),
    lastSessionDate: get('lastSessionDate'),
    notes: get('notes'),
    stripeCustomerId: get('stripeId'),
  };
}

async function getSheetNameAndSheets(spreadsheetId) {
  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetName = spreadsheet.data.sheets[0].properties.title;
  return { sheets, sheetName };
}

async function readMasterClientList() {
  const spreadsheetId = process.env.MASTER_CLIENT_LIST_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('[googleSheets] MASTER_CLIENT_LIST_SPREADSHEET_ID missing');
  
  const { sheets, sheetName } = await getSheetNameAndSheets(spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0].map(String);
  const colMap = buildColMap(headers);

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const parsed = parseRow(rows[i], colMap, i);
    if (parsed) results.push(parsed);
  }
  return { results, headers, colMap };
}

async function updateSheetCell(rowIndex, columnName, value) {
  const spreadsheetId = process.env.MASTER_CLIENT_LIST_SPREADSHEET_ID;
  const { sheets, sheetName } = await getSheetNameAndSheets(spreadsheetId);

  // First fetch headers to know the column index
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });
  
  const headers = response.data.values?.[0] || [];
  const colMap = buildColMap(headers);
  const targetColIndex = colMap[columnName];

  if (targetColIndex === undefined) {
    throw new Error(`[googleSheets] Column ${columnName} not found in headers.`);
  }

  // Convert column index (0-based) to letter (A, B, C...)
  // Assuming <= 26 columns for simplicity, A-Z.
  const colLetter = String.fromCharCode(65 + targetColIndex);
  const range = `${sheetName}!${colLetter}${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
  console.log(`[googleSheets] Successfully updated row ${rowIndex}, column ${columnName} to ${value}`);
}

module.exports = {
  getSheetsClient,
  readMasterClientList,
  updateSheetCell
};
