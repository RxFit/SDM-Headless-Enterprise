/**
 * Google Sheets Data Source Registry
 *
 * Add new living documents here. The system will poll each enabled
 * source on its configured interval and merge tasks into the
 * Command Center automatically.
 *
 * SETUP GUIDE (3 minutes):
 * 1. Open the Google Sheet → Extensions → Apps Script
 * 2. Paste the doGet() function from APPS_SCRIPT_TEMPLATE below
 * 3. Deploy → New Deployment → Web App → Execute as: Me → Access: Anyone
 * 4. Copy the URL and paste it into the `proxyUrl` field below
 */

export interface SheetDataSource {
  /** Unique identifier for this source */
  id: string;
  /** Human-readable name */
  name: string;
  /** Google Spreadsheet ID (from the URL) */
  sheetId: string;
  /** Deployed Apps Script Web App URL (preferred method) */
  proxyUrl: string;
  /** Sheet tab name to read (default: first sheet) */
  sheetTab?: string;
  /** Column header → TaskItem field mapping overrides */
  columnMap?: Partial<ColumnMapping>;
  /**
   * How to map tasks to Command Center nodes:
   * - 'auto': use a "System" or "Node" column from the sheet
   * - string: assign all tasks to this specific node ID
   */
  nodeMapping: string;
  /** Whether this source is active */
  enabled: boolean;
  /** Polling interval in milliseconds (default: 5 min) */
  refreshIntervalMs: number;
}

/** Maps spreadsheet column headers → TaskItem fields */
export interface ColumnMapping {
  title: string;
  status: string;
  priority: string;
  assignee: string;
  system: string;
  dueDate: string;
}

/** Default column mapping — handles common header variations */
export const DEFAULT_COLUMN_MAP: ColumnMapping = {
  title: 'Task',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Owner',
  system: 'Category/LOE/Department',
  dueDate: 'Deadline',
};

/**
 * Fuzzy header matcher: tries common variations for each field.
 * Used when exact column names don't match the default map.
 */
export const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  title: ['task', 'title', 'task title', 'task name', 'name', 'item'],
  status: ['status', 'state', 'progress', 'done', 'complete', 'completed'],
  priority: ['priority', 'prio', 'p', 'urgency', 'importance', 'level'],
  assignee: ['owner', 'assignee', 'assigned to', 'responsible', 'who', 'person', 'agent'],
  system: ['category/loe/department', 'category', 'system', 'node', 'component', 'area', 'module', 'group', 'team', 'department', 'loe'],
  dueDate: ['deadline', 'due date', 'due', 'target date', 'date'],
};

/**
 * Map of human-readable system names → Command Center node IDs.
 * Used when nodeMapping is 'auto' to resolve the "System" column.
 */
export const SYSTEM_TO_NODE_ID: Record<string, string> = {
  // Core systems
  'command center': 'cc',
  'rxfit command center': 'cc',
  'concierge': 'cc',
  'virtual services': 'virtual',
  'virtual': 'virtual',

  // Data layer
  'google drive': 'drive',
  'drive': 'drive',
  'github': 'github',
  'calendar': 'calendar',
  'google calendar': 'calendar',

  // Agentic layer
  'jade': 'jade',
  'jade v3': 'jade',
  'rxfit-mcp': 'jade',
  'antigravity': 'antigravity',
  'wrap-ups': 'wrapups',
  'wrapups': 'wrapups',

  // Communications
  'twilio': 'twilio',
  'google chat': 'gchat',
  'gchat': 'gchat',

  // Finance
  'stripe': 'stripe',
  'billing': 'billing-engine',
  'billing sync': 'billing-engine',
  'billing engine': 'billing-engine',
  'payroll': 'payroll',

  // Marketing / SEO
  'seo': 'seo',
  'seo agent': 'seo',
  'website': 'website',
  'rxfit.co': 'website',
  'oscar crm': 'oscar',
  'crm': 'oscar',
  'audits': 'audits',
  'weekly audits': 'audits',

  // People
  'exec': 'exec',
  'exec team': 'exec',
  'trainers': 'trainers',
  'clients': 'clients',

  // Sheet categories → node ID mapping
  // (from the "CATEGORY/LOE/DEPARTMENT" column)
  'operations': 'cc',
  'sales': 'oscar',
  'personal training': 'trainers',
  'corporate wellness': 'virtual',
  'marketing': 'website',
  'technology': 'github',
  'tech': 'github',
  'finance': 'billing-engine',
  'hr': 'exec',
  'human resources': 'exec',
  'content': 'seo',
};

// ─────────────────────────────────────────────────────────
// DATA SOURCES REGISTRY — ADD NEW LIVING DOCS HERE
// ─────────────────────────────────────────────────────────

export const dataSources: SheetDataSource[] = [
  {
    id: 'master-tasks',
    name: 'Master Task Board',
    sheetId: '1MzjPNs8nt8FxmN9YUkWjNreEsT63MPs2qvfZD7fgnr0',
    proxyUrl: 'https://script.google.com/macros/s/AKfycbwUV_o6Q8LVWsSnwLICQYdVkBDIyWa-vCDOVWMK7OMTh7MIzGSjKixA3hHu02WJVv6u/exec',
    sheetTab: 'Layer 2: Task Management Tracker',
    columnMap: {
      title: 'TASK',
      status: 'STATUS',
      priority: 'PRIORITY',
      assignee: 'OWNER',
      system: 'CATEGORY/LOE/DEPARTMENT',
      dueDate: 'DEADLINE',
    },
    nodeMapping: 'auto',
    enabled: true,
    refreshIntervalMs: 5 * 60 * 1000, // 5 minutes
  },
];

// ─────────────────────────────────────────────────────────
// APPS SCRIPT TEMPLATE — Deploy this in the Google Sheet
// ─────────────────────────────────────────────────────────

export const APPS_SCRIPT_TEMPLATE = `
// ═══════════════════════════════════════════════════════════
// RxFit Command Center — Google Sheets Bridge
// Deploy: New Deployment → Web App → Execute as: Me → Anyone
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = e && e.parameter && e.parameter.sheet ? e.parameter.sheet : null;
  var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];

  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Sheet not found', rows: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({ headers: data[0] || [], rows: [], lastUpdated: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // Skip completely empty rows
    if (row.every(function(cell) { return cell === '' || cell === null || cell === undefined; })) continue;
    // Skip instruction/template rows (row 2 in Layer 2 is instructional)
    var firstCell = String(row[0]).trim().toLowerCase();
    if (firstCell.startsWith('every task') || firstCell.startsWith('example')) continue;
    var obj = {};
    obj['_rowIndex'] = i + 1; // 1-indexed Sheet row for doPost write-back
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] !== undefined && row[j] !== null ? String(row[j]).trim() : '';
    }
    rows.push(obj);
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      sheetName: sheet.getName(),
      headers: headers,
      rows: rows,
      rowCount: rows.length,
      lastUpdated: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// doPost — Write-back from Command Center
// Supports: addRow, updateCell, updateRow
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = payload.sheet || null;
    var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];

    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'Sheet not found', success: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var action = payload.action;

    if (action === 'addRow') {
      // Add a new row at the bottom
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var newRow = headers.map(function(h) {
        var key = String(h).trim();
        return payload.data[key] || '';
      });
      sheet.appendRow(newRow);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, action: 'addRow', row: sheet.getLastRow() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'updateCell') {
      // Update a specific cell: { row, col, value } or { row, header, value }
      var row = payload.row;
      var col = payload.col;
      if (!col && payload.header) {
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        for (var i = 0; i < headers.length; i++) {
          if (String(headers[i]).trim().toUpperCase() === String(payload.header).trim().toUpperCase()) {
            col = i + 1;
            break;
          }
        }
      }
      if (row && col) {
        sheet.getRange(row, col).setValue(payload.value);
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, action: 'updateCell', row: row, col: col }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'Missing row/col', success: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'updateRow') {
      // Update an entire row by row number: { row, data: { Header: value, ... } }
      var row = payload.row;
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      for (var i = 0; i < headers.length; i++) {
        var key = String(headers[i]).trim();
        if (payload.data.hasOwnProperty(key)) {
          sheet.getRange(row, i + 1).setValue(payload.data[key]);
        }
      }
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, action: 'updateRow', row: row }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unknown action: ' + action, success: false }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString(), success: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;
