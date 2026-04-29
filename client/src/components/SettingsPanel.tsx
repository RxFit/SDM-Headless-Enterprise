/**
 * SettingsPanel.tsx — SDM Mesh Settings Drawer
 *
 * Slide-in drawer triggered by the gear icon in the SDM header.
 * Provides extensibility controls for the mesh visualization.
 *
 * Initial version:
 *  - Node enable/disable toggles
 *  - Unassigned task inbox toggle
 *  - Copy internal API endpoint utility
 *  - Future hook: theme selector, node add/remove
 */

import { useState } from 'react';
import {
  X,
  Settings,
  Copy,
  CheckCheck,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Inbox,
  Network,
} from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  nodeCount: number;
  taskCount: number;
  wsConnected: boolean;
  /** Toggle the unassigned tasks inbox sidebar */
  showInbox: boolean;
  onToggleInbox: () => void;
}

export function SettingsPanel({
  open,
  onClose,
  nodeCount,
  taskCount,
  wsConnected,
  showInbox,
  onToggleInbox,
}: SettingsPanelProps) {
  const [copied, setCopied] = useState(false);

  function copyEndpoint() {
    const endpoint = `${window.location.origin}/api/v1`;
    navigator.clipboard.writeText(endpoint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="settings-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 9998,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '340px',
          height: '100vh',
          background: 'var(--sdm-panel-bg, #0f1117)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={16} style={{ color: '#C4A24C' }} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#C4A24C',
              }}
            >
              Mesh Settings
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Status overview */}
        <div
          style={{
            margin: '16px 20px',
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '9px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              marginBottom: '10px',
            }}
          >
            Mesh Status
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <StatItem label="Nodes" value={String(nodeCount)} icon={<Network size={12} />} />
            <StatItem label="Tasks" value={String(taskCount)} icon={<Inbox size={12} />} />
            <StatItem
              label="WS"
              value={wsConnected ? 'Live' : 'Off'}
              icon={
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: wsConnected ? '#39B339' : '#ef4444',
                  }}
                />
              }
            />
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SectionLabel>Visualization</SectionLabel>

          {/* Inbox toggle */}
          <ToggleRow
            label="Unassigned Task Inbox"
            description="Show floating inbox for tasks with no node"
            enabled={showInbox}
            onToggle={onToggleInbox}
          />

          <SectionLabel style={{ marginTop: '16px' }}>API &amp; Integration</SectionLabel>

          {/* Copy endpoint */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div>
              <div
                style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}
              >
                Internal API Endpoint
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                {window.location.origin}/api/v1
              </div>
            </div>
            <button
              onClick={copyEndpoint}
              title="Copy API endpoint"
              style={{
                background: copied ? 'rgba(57,179,57,0.12)' : 'rgba(196,162,76,0.1)',
                border: `1px solid ${copied ? 'rgba(57,179,57,0.3)' : 'rgba(196,162,76,0.2)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                color: copied ? '#39B339' : '#C4A24C',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '10px',
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
                transition: 'all 0.15s',
              }}
            >
              {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* SDM Dashboard link */}
          <a
            href="https://ops.rx-fit.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'background 0.15s',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>
                Open Full Dashboard
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>ops.rx-fit.com</div>
            </div>
            <ExternalLink size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </a>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            padding: '16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            fontSize: '9px',
            color: 'rgba(255,255,255,0.2)',
            letterSpacing: '0.1em',
            textAlign: 'center',
          }}
        >
          SDM Headless Enterprise • ops.rx-fit.com
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: '9px',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)',
        marginBottom: '4px',
        paddingLeft: '2px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={{ color: 'rgba(255,255,255,0.3)' }}>{icon}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#C4A24C' }}>{value}</div>
      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{description}</div>
      </div>
      <div style={{ color: enabled ? '#39B339' : 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
        {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </div>
    </div>
  );
}
