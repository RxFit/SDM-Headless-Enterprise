/**
 * PDF Theme — Clinical Luxury Dark Palette
 *
 * All colors, fonts, and spacing constants for the
 * Executive Ops Dossier PDF export.
 */

// ─── Colors (RGB tuples for jsPDF) ────────────────────────────────────────────

export const PDF_COLORS = {
  // Backgrounds
  bgDark: [10, 15, 25] as [number, number, number],
  bgCard: [17, 24, 39] as [number, number, number],
  bgCardAlt: [22, 30, 48] as [number, number, number],

  // Accent colors (matching app theme)
  cyan: [14, 165, 233] as [number, number, number],
  cyanLight: [56, 189, 248] as [number, number, number],
  emerald: [16, 185, 129] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  rose: [239, 68, 68] as [number, number, number],
  pink: [236, 72, 153] as [number, number, number],
  yellow: [234, 179, 8] as [number, number, number],
  slate: [100, 116, 139] as [number, number, number],

  // Text
  textPrimary: [248, 250, 252] as [number, number, number],
  textSecondary: [148, 163, 184] as [number, number, number],
  textMuted: [100, 116, 139] as [number, number, number],

  // Priority colors
  critical: [239, 68, 68] as [number, number, number],
  high: [245, 158, 11] as [number, number, number],
  medium: [14, 165, 233] as [number, number, number],
  low: [100, 116, 139] as [number, number, number],

  // Status colors
  operational: [16, 185, 129] as [number, number, number],
  degraded: [245, 158, 11] as [number, number, number],
  down: [239, 68, 68] as [number, number, number],
  unknown: [100, 116, 139] as [number, number, number],

  // Variant colors
  core: [14, 165, 233] as [number, number, number],
  data: [16, 185, 129] as [number, number, number],
  agent: [245, 158, 11] as [number, number, number],
  comms: [236, 72, 153] as [number, number, number],
  finance: [234, 179, 8] as [number, number, number],
  team: [100, 116, 139] as [number, number, number],

  // Borders
  border: [30, 41, 59] as [number, number, number],
  borderAccent: [14, 165, 233] as [number, number, number],

  // White for contrast
  white: [255, 255, 255] as [number, number, number],
} as const;

// ─── Chart colors (hex for Recharts) ──────────────────────────────────────────

export const CHART_COLORS = {
  cyan: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#ef4444',
  pink: '#ec4899',
  yellow: '#eab308',
  slate: '#64748b',
  purple: '#8b5cf6',
  teal: '#14b8a6',
  orange: '#f97316',
} as const;

export const STATUS_CHART_COLORS = {
  operational: '#10b981',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#64748b',
} as const;

export const PRIORITY_CHART_COLORS = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#0ea5e9',
  low: '#64748b',
} as const;

export const TASK_STATUS_CHART_COLORS = {
  done: '#10b981',
  'in-progress': '#0ea5e9',
  pending: '#64748b',
  blocked: '#ef4444',
} as const;

export const VARIANT_CHART_COLORS: Record<string, string> = {
  core: '#0ea5e9',
  data: '#10b981',
  agent: '#f59e0b',
  comms: '#ec4899',
  finance: '#eab308',
  team: '#64748b',
};

// ─── Assignee colors (cycle through for pie chart) ────────────────────────────

export const ASSIGNEE_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#eab308',
] as const;

// ─── PDF Layout Constants ─────────────────────────────────────────────────────

export const PDF_LAYOUT = {
  pageWidth: 210,   // A4 mm
  pageHeight: 297,
  margin: 15,
  contentWidth: 180, // pageWidth - 2*margin
  headerHeight: 25,
  footerHeight: 12,
  lineHeight: 6,
  chartWidth: 180,
  chartHeight: 100,
  halfChartWidth: 85,
} as const;
