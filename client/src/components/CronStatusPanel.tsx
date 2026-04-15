/**
 * CronStatusPanel.tsx — Jade CoS Cron Job Status Panel (TASK_D11)
 * Fetches from GET /api/health/cron and shows live status.
 */

import { useState, useEffect } from 'react';
import type { CronStatusEntry } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

const STATUS_COLOR: Record<string, string> = {
  success: '#4ade80',
  failure: '#f87171',
  running: '#fbbf24',
  skipped: '#94a3b8',
};

const STATUS_ICON: Record<string, string> = {
  success: '✅',
  failure: '❌',
  running: '⏳',
  skipped: '⏭️',
};

export function CronStatusPanel() {
  const [jobs, setJobs] = useState<CronStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health/cron`, {
        headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { cron_jobs: CronStatusEntry[] };
      setJobs(data.cron_jobs ?? []);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Refresh every 30 seconds
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const failCount = jobs.filter(j => j.status === 'failure').length;
  const runningCount = jobs.filter(j => j.status === 'running').length;

  return (
    <div className="cron-panel">
      <div className="cron-header">
        <span className="cron-icon">⚙️</span>
        <span className="cron-title">Cron Jobs</span>
        {failCount > 0 && <span className="cron-badge fail">{failCount} failed</span>}
        {runningCount > 0 && <span className="cron-badge running">{runningCount} running</span>}
        <button className="cron-refresh" onClick={() => void load()} title="Refresh">↻</button>
      </div>

      {loading && <div className="cron-loading">Loading cron statuses…</div>}
      {error && <div className="cron-error">⚠️ {error}</div>}

      {!loading && !error && jobs.length === 0 && (
        <div className="cron-empty">No cron reports received yet.</div>
      )}

      {jobs.map(job => (
        <div key={job.job_name} className={`cron-job ${job.status}`}>
          <div className="cron-job-icon">{STATUS_ICON[job.status] || '📋'}</div>
          <div className="cron-job-body">
            <div className="cron-job-name">{job.job_name}</div>
            <div className="cron-job-meta">
              {job.duration_ms !== undefined && (
                <span className="meta-chip">{job.duration_ms}ms</span>
              )}
              <span className="meta-chip" style={{ color: STATUS_COLOR[job.status] || '#94a3b8' }}>
                {job.status}
              </span>
            </div>
            {job.error && <div className="cron-job-error">{job.error}</div>}
          </div>
          <div className="cron-job-time">
            {new Date(job.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}

      {lastRefresh && (
        <div className="cron-footer">
          Updated {lastRefresh.toLocaleTimeString()}
        </div>
      )}

      <style>{`
        .cron-panel {
          background: #0d0d1a; border: 1px solid #1e2030;
          border-radius: 8px; overflow: hidden;
        }
        .cron-header {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; background: #111122;
          border-bottom: 1px solid #1e2030;
        }
        .cron-icon { font-size: 14px; }
        .cron-title { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; flex: 1; }
        .cron-badge {
          font-size: 10px; font-weight: 700; border-radius: 10px;
          padding: 1px 7px; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .cron-badge.fail { background: rgba(248,113,113,0.15); color: #f87171; }
        .cron-badge.running { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .cron-refresh {
          background: none; border: none; color: #475569;
          cursor: pointer; font-size: 14px; padding: 2px 6px;
          border-radius: 4px; transition: color 0.2s;
        }
        .cron-refresh:hover { color: #6366f1; }
        .cron-job {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 14px; border-bottom: 1px solid #111122;
          transition: background 0.15s;
        }
        .cron-job:hover { background: #111122; }
        .cron-job.failure { border-left: 2px solid #f87171; }
        .cron-job.running { border-left: 2px solid #fbbf24; }
        .cron-job-icon { font-size: 14px; margin-top: 1px; }
        .cron-job-body { flex: 1; }
        .cron-job-name { font-size: 12px; font-weight: 600; color: #e2e8f0; }
        .cron-job-meta { display: flex; gap: 6px; margin-top: 3px; }
        .meta-chip {
          font-size: 10px; color: #475569; background: #1a1a2e;
          border-radius: 4px; padding: 1px 6px;
        }
        .cron-job-error { font-size: 10px; color: #f87171; margin-top: 3px; font-family: monospace; }
        .cron-job-time { font-size: 10px; color: #374151; flex-shrink: 0; margin-top: 1px; }
        .cron-footer { padding: 6px 14px; font-size: 10px; color: #374151; text-align: right; }
        .cron-loading, .cron-empty { padding: 16px 14px; font-size: 12px; color: #475569; }
        .cron-error { padding: 16px 14px; font-size: 12px; color: #f87171; }
      `}</style>
    </div>
  );
}
