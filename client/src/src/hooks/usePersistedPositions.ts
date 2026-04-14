import { useCallback, useEffect, useState } from 'react';
import type { Node, NodeChange } from '@xyflow/react';

const STORAGE_KEY = 'rxfit-node-positions';

interface SavedPositions {
  [nodeId: string]: { x: number; y: number };
}

/**
 * Custom hook: persists node positions to localStorage.
 * Wolverine Clause: auto-heals corrupted localStorage by falling back to defaults.
 */
export function usePersistedPositions<T extends Record<string, unknown>>(
  defaultNodes: Node<T>[]
): {
  nodes: Node<T>[];
  onNodesChange: (changes: NodeChange<Node<T>>[]) => void;
  resetPositions: () => void;
} {
  const [initialized, setInitialized] = useState(false);

  // Merge saved positions into default nodes
  const getInitialNodes = useCallback((): Node<T>[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultNodes;

      const saved: SavedPositions = JSON.parse(raw);
      if (typeof saved !== 'object' || saved === null) {
        // Auto-heal: corrupted data
        localStorage.removeItem(STORAGE_KEY);
        return defaultNodes;
      }

      return defaultNodes.map((node) => {
        const pos = saved[node.id];
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          return { ...node, position: { x: pos.x, y: pos.y } };
        }
        return node;
      });
    } catch {
      // Auto-heal: JSON parse failure
      localStorage.removeItem(STORAGE_KEY);
      return defaultNodes;
    }
  }, [defaultNodes]);

  const [nodes, setNodes] = useState<Node<T>[]>(() => getInitialNodes());

  // Sync on first mount only
  useEffect(() => {
    if (!initialized) {
      setNodes(getInitialNodes());
      setInitialized(true);
    }
  }, [initialized, getInitialNodes]);

  // Save positions to localStorage on drag end
  const savePositions = useCallback((currentNodes: Node<T>[]) => {
    const positions: SavedPositions = {};
    for (const node of currentNodes) {
      positions[node.id] = { x: node.position.x, y: node.position.y };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {
      // Storage full — silent fail, non-critical
    }
  }, []);

  // Handle node changes (drag, select, etc.) and persist
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<T>>[]) => {
      setNodes((nds) => {
        // Apply changes manually using applyNodeChanges-like logic
        let updated = [...nds];
        for (const change of changes) {
          if (change.type === 'position' && change.id) {
            updated = updated.map((n) => {
              if (n.id === change.id) {
                const newNode = { ...n };
                if (change.position) {
                  newNode.position = change.position;
                }
                if ('dragging' in change) {
                  newNode.dragging = change.dragging;
                }
                return newNode;
              }
              return n;
            });
            // Save when drag ends
            if ('dragging' in change && change.dragging === false) {
              // Defer save to after state update
              requestAnimationFrame(() => savePositions(updated));
            }
          } else if (change.type === 'select' && change.id) {
            updated = updated.map((n) =>
              n.id === change.id ? { ...n, selected: change.selected } : n
            );
          } else if (change.type === 'dimensions' && change.id) {
            updated = updated.map((n) => {
              if (n.id === change.id && change.dimensions) {
                return {
                  ...n,
                  measured: { width: change.dimensions.width, height: change.dimensions.height },
                };
              }
              return n;
            });
          }
        }
        return updated;
      });
    },
    [savePositions]
  );

  // Reset to default positions
  const resetPositions = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setNodes(defaultNodes);
  }, [defaultNodes]);

  return { nodes, onNodesChange, resetPositions };
}
