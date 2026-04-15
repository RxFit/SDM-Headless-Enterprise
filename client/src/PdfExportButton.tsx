/**
 * PDF Export Button — Header component that triggers the Executive Ops Dossier
 *
 * Shows a progress overlay during generation with phase descriptions.
 */

import { useCallback, useState } from 'react';
import { FileDown, Loader2, CheckCircle2 } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { RxNodeData, TaskItem } from './types';
import type { ReportProgress } from './pdf/generateReport';

interface AggregateStats {
  tasks: { total: number; done: number; pending: number; inProgress: number; blocked: number; critical: number };
  systems: { total: number; operational: number; degraded: number; down: number; unknown: number };
  byVariant: Record<string, { total: number; done: number }>;
  byAssignee: Record<string, { total: number; done: number }>;
}

interface PdfExportButtonProps {
  nodes: Node<RxNodeData>[];
  getNodeTasks: (nodeId: string) => TaskItem[];
  getAggregateStats: () => AggregateStats;
  syncStatus: string;
  lastSync: Date | null;
  syncTaskCount: number;
}

export default function PdfExportButton({
  nodes,
  getNodeTasks,
  getAggregateStats,
  syncStatus,
  lastSync,
  syncTaskCount,
}: PdfExportButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<ReportProgress | null>(null);
  const [done, setDone] = useState(false);

  const handleExport = useCallback(async () => {
    if (generating) return;

    setGenerating(true);
    setDone(false);
    setProgress({ phase: 'Initializing...', percent: 0 });

    try {
      const { generateReport } = await import('./pdf/generateReport');
      await generateReport(
        {
          nodes,
          getNodeTasks,
          getAggregateStats,
          syncStatus,
          lastSync,
          syncTaskCount,
        },
        (p: ReportProgress) => setProgress(p),
      );

      setDone(true);
      setTimeout(() => {
        setDone(false);
        setGenerating(false);
        setProgress(null);
      }, 2000);
    } catch (err) {
      console.error('PDF generation failed:', err);
      setProgress({ phase: `Error: ${err instanceof Error ? err.message : 'Unknown'}`, percent: 0 });
      setTimeout(() => {
        setGenerating(false);
        setProgress(null);
      }, 3000);
    }
  }, [generating, nodes, getNodeTasks, getAggregateStats, syncStatus, lastSync, syncTaskCount]);

  return (
    <>
      <button
        className="pdf-export-btn"
        onClick={handleExport}
        disabled={generating}
        title="Export Executive Ops Dossier (PDF)"
      >
        {generating ? (
          <Loader2 size={16} className="pdf-export-spinner" />
        ) : done ? (
          <CheckCircle2 size={16} />
        ) : (
          <FileDown size={16} />
        )}
        {generating ? 'Generating…' : done ? 'Downloaded!' : 'Export PDF'}
      </button>

      {/* Progress overlay */}
      {generating && progress && (
        <div className="pdf-progress-overlay">
          <div className="pdf-progress-card">
            <div className="pdf-progress-title">
              <FileDown size={18} />
              Executive Ops Dossier
            </div>
            <div className="pdf-progress-bar-track">
              <div
                className="pdf-progress-bar-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="pdf-progress-phase">{progress.phase}</div>
            <div className="pdf-progress-percent">{progress.percent}%</div>
          </div>
        </div>
      )}
    </>
  );
}
