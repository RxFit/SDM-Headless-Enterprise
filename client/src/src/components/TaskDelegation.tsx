/**
 * TaskDelegation.tsx — Task Delegation Modal (TASK_D07)
 * Delegate a task to a named recipient via email or other channel.
 */

import { useState } from 'react';
import type { EnterpriseTask } from '../types';

const API_BASE = import.meta.env.VITE_SDM_API_URL || 'http://localhost:8095';
const API_KEY = import.meta.env.VITE_SDM_API_KEY || '';

interface TaskDelegationProps {
  task: EnterpriseTask;
  onClose: () => void;
  onDelegated?: (task: EnterpriseTask) => void;
}

type DelegationMethod = 'email' | 'slack' | 'sms';

export function TaskDelegation({ task, onClose, onDelegated }: TaskDelegationProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState<DelegationMethod>('email');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDelegate = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Recipient name and email are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${task.id}/delegate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ name, email, method, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updated = await res.json() as EnterpriseTask;
      setSuccess(true);
      onDelegated?.(updated);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon">📬</span>
          <h3>Delegate Task</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-task-info">
          <span className="task-badge">{task.priority}</span>
          <span className="task-title">{task.title}</span>
        </div>

        {success ? (
          <div className="modal-success">
            ✅ Delegated to {name}
          </div>
        ) : (
          <div className="modal-body">
            <label>
              Recipient Name
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Korab Guri"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="korab@rxfit.ai"
              />
            </label>
            <label>
              Method
              <select value={method} onChange={e => setMethod(e.target.value as DelegationMethod)}>
                <option value="email">📧 Email</option>
                <option value="slack">💬 Slack</option>
                <option value="sms">📱 SMS</option>
              </select>
            </label>
            <label>
              Note (optional)
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Context for the delegate..."
                rows={3}
              />
            </label>
            {error && <div className="modal-error">⚠️ {error}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={() => void handleDelegate()} disabled={loading}>
                {loading ? 'Delegating...' : 'Delegate →'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .modal-card {
          background: #1a1a2e; border: 1px solid #2d2d4e;
          border-radius: 12px; width: 420px; max-width: 95vw;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        }
        .modal-header {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 20px; border-bottom: 1px solid #2d2d4e;
        }
        .modal-icon { font-size: 20px; }
        .modal-header h3 { flex: 1; margin: 0; font-size: 16px; color: #e2e8f0; }
        .modal-close {
          background: none; border: none; color: #64748b;
          cursor: pointer; font-size: 16px; padding: 4px 8px;
          border-radius: 4px; transition: background 0.2s;
        }
        .modal-close:hover { background: #2d2d4e; color: #e2e8f0; }
        .modal-task-info {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 20px; background: #0f0f1e;
        }
        .task-badge {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          background: #6366f1; color: white; padding: 2px 8px;
          border-radius: 4px; letter-spacing: 0.05em;
        }
        .task-title { font-size: 13px; color: #94a3b8; }
        .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .modal-body label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #64748b; font-weight: 600; }
        .modal-body input, .modal-body select, .modal-body textarea {
          background: #0d0d1a; border: 1px solid #2d2d4e; border-radius: 6px;
          padding: 8px 12px; color: #e2e8f0; font-size: 13px;
          transition: border-color 0.2s;
        }
        .modal-body input:focus, .modal-body select:focus, .modal-body textarea:focus {
          outline: none; border-color: #6366f1;
        }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
        .btn-primary {
          background: linear-gradient(135deg, #6366f1, #7c3aed);
          color: white; border: none; padding: 8px 20px;
          border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;
          transition: opacity 0.2s;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.85; }
        .btn-primary:disabled { opacity: 0.4; cursor: default; }
        .btn-secondary {
          background: #2d2d4e; color: #94a3b8; border: none;
          padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;
          transition: background 0.2s;
        }
        .btn-secondary:hover { background: #3d3d5e; }
        .modal-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #f87171; }
        .modal-success { padding: 40px; text-align: center; font-size: 18px; color: #4ade80; }
      `}</style>
    </div>
  );
}
