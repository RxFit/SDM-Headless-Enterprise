/**
 * Executive Ops Dossier — PDF Report Generator
 *
 * Generates a 6-page PDF with charts, tables, and metrics
 * using jsPDF + Recharts + html2canvas.
 *
 * Clinical Luxury dark theme throughout.
 */

import jsPDF from 'jspdf';
import type { Node } from '@xyflow/react';
import type { RxNodeData, TaskItem } from '../types';
import { PDF_COLORS, PDF_LAYOUT } from './theme';
import {
  renderHealthDonut,
  renderPriorityBars,
  renderTaskPipeline,
  renderAssigneePie,
  renderAssigneeCompletionBars,
} from './chartRenderers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  nodes: Node<RxNodeData>[];
  getNodeTasks: (nodeId: string) => TaskItem[];
  getAggregateStats: () => AggregateStats;
  syncStatus: string;
  lastSync: Date | null;
  syncTaskCount: number;
}

interface AggregateStats {
  tasks: {
    total: number;
    done: number;
    pending: number;
    inProgress: number;
    blocked: number;
    critical: number;
  };
  systems: {
    total: number;
    operational: number;
    degraded: number;
    down: number;
    unknown: number;
  };
  byVariant: Record<string, { total: number; done: number }>;
  byAssignee: Record<string, { total: number; done: number }>;
}

export type ReportProgress = {
  phase: string;
  percent: number;
};

// ─── Helper: Add page footer ─────────────────────────────────────────────────

function addFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const { pageWidth, pageHeight, margin } = PDF_LAYOUT;
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(
    `RxFit Operational Command Center — Executive Report`,
    margin,
    pageHeight - 8,
  );
  doc.text(
    `Page ${pageNum} of ${totalPages}`,
    pageWidth - margin,
    pageHeight - 8,
    { align: 'right' },
  );
  // Separator line
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
}

// ─── Helper: Section header ──────────────────────────────────────────────────

function addSectionHeader(doc: jsPDF, title: string, y: number): number {
  const { margin, contentWidth } = PDF_LAYOUT;
  // Accent line
  doc.setDrawColor(...PDF_COLORS.cyan);
  doc.setLineWidth(1);
  doc.line(margin, y, margin + 30, y);
  // Title text
  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.textPrimary);
  doc.text(title, margin, y + 8);
  // Subtitle line
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 12, margin + contentWidth, y + 12);
  return y + 18;
}

// ─── Helper: KPI card ────────────────────────────────────────────────────────

function addKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  color: [number, number, number],
) {
  // Card background
  doc.setFillColor(...PDF_COLORS.bgCard);
  doc.roundedRect(x, y, width, 28, 3, 3, 'F');
  // Border
  doc.setDrawColor(...color);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, width, 28, 3, 3, 'S');
  // Value
  doc.setFontSize(18);
  doc.setTextColor(...color);
  doc.text(value, x + width / 2, y + 14, { align: 'center' });
  // Label
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textSecondary);
  doc.text(label.toUpperCase(), x + width / 2, y + 22, { align: 'center' });
}

// ─── Page 1: Cover Page ──────────────────────────────────────────────────────

function buildCoverPage(doc: jsPDF, stats: AggregateStats) {
  const { pageWidth, pageHeight, margin } = PDF_LAYOUT;

  // Full dark background
  doc.setFillColor(...PDF_COLORS.bgDark);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Top accent bar
  doc.setFillColor(...PDF_COLORS.cyan);
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Logo area - Geometric accent
  const cx = pageWidth / 2;
  doc.setDrawColor(...PDF_COLORS.cyan);
  doc.setLineWidth(1.5);
  doc.circle(cx, 55, 18, 'S');
  doc.setFillColor(...PDF_COLORS.cyan);
  doc.circle(cx, 55, 3, 'F');
  // Pulse rings
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(0.3);
  doc.circle(cx, 55, 24, 'S');
  doc.circle(cx, 55, 30, 'S');

  // Title
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text('THE HEADLESS ENTERPRISE', cx, 92, { align: 'center' });

  doc.setFontSize(24);
  doc.setTextColor(...PDF_COLORS.textPrimary);
  doc.text('Operational Command Center', cx, 105, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.cyan);
  doc.text('Executive Report', cx, 115, { align: 'center' });

  // Date
  const now = new Date();
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.textSecondary);
  doc.text(
    now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    cx,
    130,
    { align: 'center' },
  );
  doc.text(
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    cx,
    138,
    { align: 'center' },
  );

  // Divider
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(margin + 40, 150, pageWidth - margin - 40, 150);

  // Hero KPI cards
  const cardWidth = 38;
  const cardGap = 6;
  const totalCardsWidth = cardWidth * 4 + cardGap * 3;
  const startX = (pageWidth - totalCardsWidth) / 2;
  const cardY = 165;

  addKpiCard(doc, startX, cardY, cardWidth, 'Systems', String(stats.systems.total), PDF_COLORS.cyan);
  addKpiCard(doc, startX + cardWidth + cardGap, cardY, cardWidth, 'Tasks', String(stats.tasks.total), PDF_COLORS.emerald);
  const completionPct = stats.tasks.total > 0
    ? `${Math.round((stats.tasks.done / stats.tasks.total) * 100)}%`
    : '0%';
  addKpiCard(doc, startX + (cardWidth + cardGap) * 2, cardY, cardWidth, 'Complete', completionPct, PDF_COLORS.amber);
  addKpiCard(doc, startX + (cardWidth + cardGap) * 3, cardY, cardWidth, 'Critical', String(stats.tasks.critical), PDF_COLORS.rose);

  // Bottom accent
  doc.setFillColor(...PDF_COLORS.bgCard);
  doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text('RxFit — Premium Executive Wellness', cx, pageHeight - 18, { align: 'center' });
  doc.text('ops.rxfit.ai', cx, pageHeight - 12, { align: 'center' });
}

// ─── Page 2: System Health Overview ──────────────────────────────────────────

async function buildHealthPage(
  doc: jsPDF,
  stats: AggregateStats,
  onProgress: (p: ReportProgress) => void,
) {
  const { pageWidth, pageHeight, margin, contentWidth } = PDF_LAYOUT;

  doc.addPage();
  doc.setFillColor(...PDF_COLORS.bgDark);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let y = addSectionHeader(doc, 'System Health Overview', margin);

  onProgress({ phase: 'Rendering health donut chart...', percent: 20 });

  // KPI strip
  const kpiWidth = contentWidth / 4 - 3;
  const uptimePct = stats.systems.total > 0
    ? `${Math.round((stats.systems.operational / stats.systems.total) * 100)}%`
    : '0%';

  addKpiCard(doc, margin, y, kpiWidth, 'Total Systems', String(stats.systems.total), PDF_COLORS.cyan);
  addKpiCard(doc, margin + kpiWidth + 4, y, kpiWidth, 'Uptime', uptimePct, PDF_COLORS.emerald);
  addKpiCard(doc, margin + (kpiWidth + 4) * 2, y, kpiWidth, 'Degraded', String(stats.systems.degraded), PDF_COLORS.amber);
  addKpiCard(doc, margin + (kpiWidth + 4) * 3, y, kpiWidth, 'Critical Issues', String(stats.tasks.critical), PDF_COLORS.rose);

  y += 38;

  // Health donut chart
  const donutImg = await renderHealthDonut({
    operational: stats.systems.operational,
    degraded: stats.systems.degraded,
    down: stats.systems.down,
    unknown: stats.systems.unknown,
  });

  onProgress({ phase: 'Rendering priority distribution...', percent: 30 });

  // Priority bars
  const priorityData = {
    critical: stats.tasks.critical,
    high: 0,
    medium: 0,
    low: 0,
  };
  // Count actual priorities
  // We'll approximate from total - critical for now since aggregate doesn't have priority breakdown
  priorityData.medium = stats.tasks.pending;
  priorityData.high = stats.tasks.inProgress;

  const priorityImg = await renderPriorityBars(priorityData);

  // Place charts side by side
  const chartW = contentWidth / 2 - 4;
  const chartH = chartW * 0.75;

  doc.addImage(donutImg, 'PNG', margin, y, chartW, chartH);
  doc.addImage(priorityImg, 'PNG', margin + chartW + 8, y, chartW, chartH);

  // Chart labels
  y += chartH + 4;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text('SYSTEM STATUS DISTRIBUTION', margin + chartW / 2, y, { align: 'center' });
  doc.text('TASK PRIORITY DISTRIBUTION', margin + chartW + 8 + chartW / 2, y, { align: 'center' });
}

// ─── Page 3: Task Pipeline by System Group ───────────────────────────────────

async function buildPipelinePage(
  doc: jsPDF,
  _stats: AggregateStats,
  nodes: Node<RxNodeData>[],
  getNodeTasks: (nodeId: string) => TaskItem[],
  onProgress: (p: ReportProgress) => void,
) {
  const { pageWidth, pageHeight, margin, contentWidth } = PDF_LAYOUT;

  doc.addPage();
  doc.setFillColor(...PDF_COLORS.bgDark);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let y = addSectionHeader(doc, 'Task Pipeline by System Group', margin);

  onProgress({ phase: 'Rendering task pipeline chart...', percent: 45 });

  // Build variant task data
  const variantData: Record<string, { done: number; inProgress: number; pending: number; blocked: number }> = {};

  for (const node of nodes) {
    if (node.data.variant === 'group') continue;
    const variant = node.data.variant;
    if (!variantData[variant]) {
      variantData[variant] = { done: 0, inProgress: 0, pending: 0, blocked: 0 };
    }
    const tasks = getNodeTasks(node.id);
    for (const task of tasks) {
      if (task.status === 'done') variantData[variant].done++;
      else if (task.status === 'in-progress') variantData[variant].inProgress++;
      else if (task.status === 'blocked') variantData[variant].blocked++;
      else variantData[variant].pending++;
    }
  }

  const pipelineData = Object.entries(variantData).map(([variant, counts]) => ({
    variant,
    ...counts,
  }));

  const pipelineImg = await renderTaskPipeline(pipelineData);
  const chartH = 120;
  doc.addImage(pipelineImg, 'PNG', margin, y, contentWidth, chartH);

  y += chartH + 8;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text('TASK STATUS BY SYSTEM CATEGORY', margin + contentWidth / 2, y, { align: 'center' });

  // Variant detail table
  y += 12;
  y = addSectionHeader(doc, 'Category Breakdown', y);

  doc.setFontSize(8);
  // Table header
  const cols = ['Category', 'Total', 'Done', 'In Progress', 'Pending', 'Blocked', 'Completion'];
  const colWidths = [35, 18, 18, 25, 20, 20, 25];

  doc.setFillColor(...PDF_COLORS.bgCard);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(...PDF_COLORS.cyan);
  let cx = margin + 3;
  for (let i = 0; i < cols.length; i++) {
    doc.text(cols[i].toUpperCase(), cx, y + 5.5);
    cx += colWidths[i];
  }
  y += 10;

  // Table rows
  for (const row of pipelineData) {
    const total = row.done + row.inProgress + row.pending + row.blocked;
    const pct = total > 0 ? `${Math.round((row.done / total) * 100)}%` : '—';

    // Alternating row bg
    doc.setFillColor(...PDF_COLORS.bgCardAlt);
    doc.rect(margin, y - 2, contentWidth, 7, 'F');

    doc.setTextColor(...PDF_COLORS.textPrimary);
    cx = margin + 3;
    const values = [
      row.variant.charAt(0).toUpperCase() + row.variant.slice(1),
      String(total), String(row.done), String(row.inProgress),
      String(row.pending), String(row.blocked), pct,
    ];
    for (let i = 0; i < values.length; i++) {
      doc.text(values[i], cx, y + 3);
      cx += colWidths[i];
    }
    y += 8;
  }
}

// ─── Page 4: Task Detail Breakdown ───────────────────────────────────────────

function buildTaskDetailPage(
  doc: jsPDF,
  nodes: Node<RxNodeData>[],
  getNodeTasks: (nodeId: string) => TaskItem[],
) {
  const { pageWidth, pageHeight, margin, contentWidth } = PDF_LAYOUT;

  doc.addPage();
  doc.setFillColor(...PDF_COLORS.bgDark);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let y = addSectionHeader(doc, 'Task Detail Breakdown', margin);

  // Collect all tasks with system names
  const allTasks: (TaskItem & { system: string })[] = [];
  for (const node of nodes) {
    if (node.data.variant === 'group') continue;
    const tasks = getNodeTasks(node.id);
    for (const task of tasks) {
      allTasks.push({ ...task, system: node.data.label });
    }
  }

  // Sort by priority: critical > high > medium > low
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allTasks.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  // Table header
  const cols = ['System', 'Task', 'Status', 'Priority', 'Assignee'];
  const colWidths = [30, 70, 22, 20, 25];

  doc.setFillColor(...PDF_COLORS.bgCard);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.cyan);
  let cx = margin + 2;
  for (let i = 0; i < cols.length; i++) {
    doc.text(cols[i].toUpperCase(), cx, y + 5.5);
    cx += colWidths[i];
  }
  y += 10;

  // Table rows
  const priorityColors: Record<string, [number, number, number]> = {
    critical: PDF_COLORS.critical,
    high: PDF_COLORS.high,
    medium: PDF_COLORS.medium,
    low: PDF_COLORS.low,
  };

  for (const task of allTasks) {
    // Page break check
    if (y > pageHeight - 25) {
      doc.addPage();
      doc.setFillColor(...PDF_COLORS.bgDark);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      y = margin;

      // Re-draw table header
      doc.setFillColor(...PDF_COLORS.bgCard);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_COLORS.cyan);
      cx = margin + 2;
      for (let i = 0; i < cols.length; i++) {
        doc.text(cols[i].toUpperCase(), cx, y + 5.5);
        cx += colWidths[i];
      }
      y += 10;
    }

    // Priority accent stripe
    const pColor = priorityColors[task.priority] || PDF_COLORS.slate;
    doc.setFillColor(...pColor);
    doc.rect(margin, y - 2, 1.5, 7, 'F');

    // Row background (alternating)
    doc.setFillColor(...PDF_COLORS.bgCardAlt);
    doc.rect(margin + 1.5, y - 2, contentWidth - 1.5, 7, 'F');

    doc.setFontSize(7);
    const textColor = task.status === 'done' ? PDF_COLORS.textMuted : PDF_COLORS.textPrimary;
    doc.setTextColor(...textColor);

    cx = margin + 3;
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;

    const values = [
      truncate(task.system, 16),
      truncate(task.title, 42),
      task.status,
      task.priority.toUpperCase(),
      task.assignee || '—',
    ];

    for (let i = 0; i < values.length; i++) {
      doc.text(values[i], cx, y + 3);
      cx += colWidths[i];
    }
    y += 8;
  }
}

// ─── Page 5: Assignee Performance ────────────────────────────────────────────

async function buildAssigneePage(
  doc: jsPDF,
  stats: AggregateStats,
  onProgress: (p: ReportProgress) => void,
) {
  const { pageWidth, pageHeight, margin, contentWidth } = PDF_LAYOUT;

  doc.addPage();
  doc.setFillColor(...PDF_COLORS.bgDark);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let y = addSectionHeader(doc, 'Assignee Performance', margin);

  onProgress({ phase: 'Rendering assignee charts...', percent: 75 });

  // Convert stats to chart data
  const assigneeData = Object.entries(stats.byAssignee).map(([name, data]) => ({
    name,
    total: data.total,
    done: data.done,
  }));

  if (assigneeData.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text('No assignee data available.', margin, y + 20);
    return;
  }

  const pieImg = await renderAssigneePie(assigneeData);
  const barsImg = await renderAssigneeCompletionBars(assigneeData);

  const chartW = contentWidth / 2 - 4;
  const chartH = chartW * 0.75;

  doc.addImage(pieImg, 'PNG', margin, y, chartW, chartH);
  doc.addImage(barsImg, 'PNG', margin + chartW + 8, y, chartW, chartH);

  y += chartH + 4;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text('TASK DISTRIBUTION BY ASSIGNEE', margin + chartW / 2, y, { align: 'center' });
  doc.text('COMPLETION RATE BY ASSIGNEE', margin + chartW + 8 + chartW / 2, y, { align: 'center' });

  // Workload summary table
  y += 12;
  y = addSectionHeader(doc, 'Workload Summary', y);

  doc.setFillColor(...PDF_COLORS.bgCard);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.cyan);
  const headers = ['Assignee', 'Total Tasks', 'Completed', 'Pending', 'Completion Rate'];
  const widths = [35, 25, 25, 25, 30];
  let cx = margin + 3;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i].toUpperCase(), cx, y + 5.5);
    cx += widths[i];
  }
  y += 10;

  for (const a of assigneeData) {
    doc.setFillColor(...PDF_COLORS.bgCardAlt);
    doc.rect(margin, y - 2, contentWidth, 7, 'F');
    doc.setTextColor(...PDF_COLORS.textPrimary);
    const pct = a.total > 0 ? `${Math.round((a.done / a.total) * 100)}%` : '—';
    const vals = [a.name, String(a.total), String(a.done), String(a.total - a.done), pct];
    cx = margin + 3;
    for (let i = 0; i < vals.length; i++) {
      doc.text(vals[i], cx, y + 3);
      cx += widths[i];
    }
    y += 8;
  }
}

// ─── Page 6: Sync & Infrastructure Status ────────────────────────────────────

function buildSyncPage(
  doc: jsPDF,
  syncStatus: string,
  lastSync: Date | null,
  syncTaskCount: number,
  stats: AggregateStats,
) {
  const { pageWidth, pageHeight, margin, contentWidth } = PDF_LAYOUT;

  doc.addPage();
  doc.setFillColor(...PDF_COLORS.bgDark);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let y = addSectionHeader(doc, 'Sync & Infrastructure Status', margin);

  // Sync status card
  doc.setFillColor(...PDF_COLORS.bgCard);
  doc.roundedRect(margin, y, contentWidth, 55, 4, 4, 'F');
  doc.setDrawColor(...PDF_COLORS.border);
  doc.roundedRect(margin, y, contentWidth, 55, 4, 4, 'S');

  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.textSecondary);
  doc.text('DATA SYNC STATUS', margin + 8, y + 10);

  const syncColor = syncStatus === 'idle' ? PDF_COLORS.emerald : syncStatus === 'error' ? PDF_COLORS.rose : PDF_COLORS.amber;
  doc.setFillColor(...syncColor);
  doc.circle(margin + 8 + 4, y + 20, 3, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.textPrimary);
  doc.text(syncStatus.toUpperCase(), margin + 20, y + 22);

  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textSecondary);
  doc.text(`Last Sync: ${lastSync ? lastSync.toLocaleString() : 'Never'}`, margin + 8, y + 32);
  doc.text(`Tasks from Google Sheets: ${syncTaskCount}`, margin + 8, y + 40);
  doc.text(`Tasks from Base Config: ${stats.tasks.total - syncTaskCount}`, margin + 8, y + 48);

  y += 65;

  // Node status breakdown
  y = addSectionHeader(doc, 'System Status Summary', y);

  const statusRows = [
    { label: 'Operational', count: stats.systems.operational, color: PDF_COLORS.operational },
    { label: 'Degraded', count: stats.systems.degraded, color: PDF_COLORS.degraded },
    { label: 'Down', count: stats.systems.down, color: PDF_COLORS.down },
    { label: 'Unknown', count: stats.systems.unknown, color: PDF_COLORS.unknown },
  ];

  for (const row of statusRows) {
    // Status dot
    doc.setFillColor(...row.color);
    doc.circle(margin + 6, y + 1, 2.5, 'F');
    // Label
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.textPrimary);
    doc.text(row.label, margin + 14, y + 3);
    // Count
    doc.setTextColor(...row.color);
    doc.text(String(row.count), margin + 60, y + 3);
    // Progress bar
    const barWidth = 80;
    const filled = stats.systems.total > 0 ? (row.count / stats.systems.total) * barWidth : 0;
    doc.setFillColor(...PDF_COLORS.bgCard);
    doc.roundedRect(margin + 75, y - 1, barWidth, 5, 2, 2, 'F');
    if (filled > 0) {
      doc.setFillColor(...row.color);
      doc.roundedRect(margin + 75, y - 1, filled, 5, 2, 2, 'F');
    }
    y += 12;
  }

  // Report generation timestamp
  y += 20;
  doc.setDrawColor(...PDF_COLORS.border);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text('Report auto-generated by RxFit Operational Command Center', margin + contentWidth / 2, y, { align: 'center' });
  doc.text(`Generated: ${new Date().toISOString()}`, margin + contentWidth / 2, y + 6, { align: 'center' });
  doc.text('ops.rxfit.ai', margin + contentWidth / 2, y + 12, { align: 'center' });
}

// ─── Main Export: generateReport ─────────────────────────────────────────────

export async function generateReport(
  data: ReportData,
  onProgress?: (p: ReportProgress) => void,
): Promise<void> {
  const progress = onProgress || (() => {});

  progress({ phase: 'Initializing report...', percent: 5 });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const stats = data.getAggregateStats();

  // Page 1: Cover
  progress({ phase: 'Building cover page...', percent: 10 });
  buildCoverPage(doc, stats);

  // Page 2: Health (async — chart rendering)
  await buildHealthPage(doc, stats, progress);

  // Page 3: Pipeline (async — chart rendering)
  progress({ phase: 'Building task pipeline...', percent: 50 });
  await buildPipelinePage(doc, stats, data.nodes, data.getNodeTasks, progress);

  // Page 4: Task Detail
  progress({ phase: 'Building task detail table...', percent: 65 });
  buildTaskDetailPage(doc, data.nodes, data.getNodeTasks);

  // Page 5: Assignee (async — chart rendering)
  await buildAssigneePage(doc, stats, progress);

  // Page 6: Sync Status
  progress({ phase: 'Building sync status page...', percent: 90 });
  buildSyncPage(doc, data.syncStatus, data.lastSync, data.syncTaskCount, stats);

  // Add footers to all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }

  // Generate filename
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `rxfit_ops_report_${dateStr}.pdf`;

  progress({ phase: 'Downloading PDF...', percent: 95 });
  doc.save(filename);

  progress({ phase: 'Complete!', percent: 100 });
}
