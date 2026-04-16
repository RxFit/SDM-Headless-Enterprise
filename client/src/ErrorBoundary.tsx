/**
 * ErrorBoundary — SOL-4
 *
 * Catches React render errors and displays a recovery UI
 * instead of a blank white screen. Wolverine Clause: self-heals
 * by clearing localStorage on retry (corrupted state is #1 crash cause).
 */

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReset = () => {
    // Wolverine Clause: clear potentially corrupted localStorage
    try {
      localStorage.removeItem('rxfit-node-positions');
      localStorage.removeItem('rxfit-task-overrides');
      localStorage.removeItem('rxfit-added-tasks');
      localStorage.removeItem('rxfit-gdrive-cache');
    } catch { /* non-critical */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: '#0b0f19',
          color: '#fff',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '20px',
            padding: '40px',
            maxWidth: '480px',
            textAlign: 'center',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Dashboard Error
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              The Command Center encountered an unexpected error.
              {this.state.error && (
                <span style={{
                  display: 'block',
                  marginTop: '8px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#ef4444',
                  opacity: 0.8,
                }}>
                  {this.state.error.message}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  background: 'rgba(14, 165, 233, 0.1)',
                  border: '1px solid rgba(14, 165, 233, 0.3)',
                  borderRadius: '10px',
                  color: '#0ea5e9',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <RefreshCw size={14} />
                Retry
              </button>
              <button
                onClick={this.handleHardReset}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  color: '#ef4444',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Hard Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
