import { RefreshCw, Cloud, CloudOff, Loader2 } from 'lucide-react';
import type { SyncStatus } from './hooks/useGoogleSheetTasks';

interface SyncIndicatorProps {
  status: SyncStatus;
  lastSync: Date | null;
  taskCount: number;
  error: string | null;
  onRefresh: () => void;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function SyncIndicator({
  status,
  lastSync,
  taskCount,
  error,
  onRefresh,
}: SyncIndicatorProps) {
  if (status === 'disabled') {
    return (
      <button
        className="sync-indicator sync-disabled"
        title="Google Drive sync not configured. Add a proxyUrl to dataSources.ts"
        onClick={onRefresh}
      >
        <CloudOff size={14} />
        <span className="sync-text">No sync</span>
      </button>
    );
  }

  if (status === 'loading') {
    return (
      <div className="sync-indicator sync-loading">
        <Loader2 size={14} className="sync-spinner" />
        <span className="sync-text">Syncing…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <button
        className="sync-indicator sync-error"
        onClick={onRefresh}
        title={`Sync error: ${error}\nUsing cached data. Click to retry.`}
      >
        <CloudOff size={14} />
        <span className="sync-text">Offline{lastSync ? ` (${formatTimeAgo(lastSync)})` : ''}</span>
        <RefreshCw size={12} />
      </button>
    );
  }

  // idle — synced successfully
  return (
    <button
      className="sync-indicator sync-idle"
      onClick={onRefresh}
      title={`${taskCount} tasks from Google Drive\nLast sync: ${lastSync?.toLocaleTimeString() || 'never'}\nClick to refresh`}
    >
      <Cloud size={14} />
      <span className="sync-text">
        {lastSync ? formatTimeAgo(lastSync) : 'Synced'}
      </span>
      {taskCount > 0 && <span className="sync-badge">{taskCount}</span>}
      <RefreshCw size={12} className="sync-refresh-icon" />
    </button>
  );
}
