import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { RxNodeData, TaskItem } from './types';
import { variantColors } from './types';

interface SearchBarProps {
  nodes: Node<RxNodeData>[];
  getNodeTasks: (nodeId: string) => TaskItem[];
  onNodeSelect: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
}

interface SearchResult {
  type: 'node' | 'task';
  nodeId: string;
  nodeLabel: string;
  nodeVariant: string;
  taskTitle?: string;
  taskStatus?: string;
  taskPriority?: string;
}

export default function SearchBar({ nodes, getNodeTasks, onNodeSelect, onFocusNode }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build searchable index
  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const matches: SearchResult[] = [];
    for (const node of nodes) {
      if (node.data.variant === 'group') continue;

      const label = node.data.label.toLowerCase();
      const desc = (node.data.description || '').toLowerCase();
      const variant = node.data.variant;
      const tasks = getNodeTasks(node.id);

      // Match on node
      if (label.includes(q) || desc.includes(q) || variant.includes(q)) {
        matches.push({
          type: 'node',
          nodeId: node.id,
          nodeLabel: node.data.label,
          nodeVariant: variant,
        });
      }

      // Match on tasks
      for (const task of tasks) {
        const title = task.title.toLowerCase();
        const assignee = (task.assignee || '').toLowerCase();
        if (title.includes(q) || assignee.includes(q) || task.priority.includes(q)) {
          matches.push({
            type: 'task',
            nodeId: node.id,
            nodeLabel: node.data.label,
            nodeVariant: variant,
            taskTitle: task.title,
            taskStatus: task.status,
            taskPriority: task.priority,
          });
        }
      }
    }

    return matches.slice(0, 12); // Cap at 12 results
  }, [query, nodes, getNodeTasks]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onFocusNode(result.nodeId);
      onNodeSelect(result.nodeId);
      setIsOpen(false);
      setQuery('');
    },
    [onNodeSelect, onFocusNode]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIdx]) {
        e.preventDefault();
        handleSelect(results[selectedIdx]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    },
    [results, selectedIdx, handleSelect]
  );

  const priorityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#0ea5e9',
    low: '#64748b',
  };

  return (
    <div className="search-container" ref={containerRef}>
      <div className="search-input-wrapper">
        <Search size={16} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search nodes & tasks… (Ctrl+K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            className="search-clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
        <kbd className="search-kbd">⌘K</kbd>
      </div>

      {isOpen && results.length > 0 && (
        <div className="search-results">
          {results.map((result, idx) => (
            <button
              key={`${result.nodeId}-${result.taskTitle || 'node'}-${idx}`}
              className={`search-result-item ${idx === selectedIdx ? 'selected' : ''}`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <div
                className="search-result-dot"
                style={{ background: variantColors[result.nodeVariant] || '#64748b' }}
              />
              <div className="search-result-content">
                {result.type === 'node' ? (
                  <span className="search-result-title">{result.nodeLabel}</span>
                ) : (
                  <>
                    <span className="search-result-title">{result.taskTitle}</span>
                    <span className="search-result-meta">
                      <span style={{ color: variantColors[result.nodeVariant] }}>{result.nodeLabel}</span>
                      {result.taskPriority && (
                        <span
                          className="search-result-priority"
                          style={{ color: priorityColors[result.taskPriority] }}
                        >
                          {result.taskPriority.toUpperCase()}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
              <ChevronRight size={14} className="search-result-arrow" />
            </button>
          ))}
        </div>
      )}

      {isOpen && query && results.length === 0 && (
        <div className="search-results">
          <div className="search-empty">No results for "{query}"</div>
        </div>
      )}
    </div>
  );
}
