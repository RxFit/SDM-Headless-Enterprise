/**
 * App.tsx — SDM Headless Enterprise Client (TASK_D05)
 *
 * Migrated from localStorage/static data to live API hooks:
 * - useApiTasks  (replaces useTaskState + useGoogleSheetTasks)
 * - useApiNodes  (replaces hardcoded initialNodes)
 * - useApiEdges  (replaces hardcoded initialEdges)
 * - useWebSocket (replaces polling — real-time updates)
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import DetailPanel from './DetailPanel';
import SearchBar from './SearchBar';
import HealthDashboard from './HealthDashboard';
import SyncIndicator from './SyncIndicator';
import PdfExportButton from './PdfExportButton';
import { CronStatusPanel } from './components/CronStatusPanel';
import { UnassignedTasks } from './components/UnassignedTasks';
import { useApiTasks } from './hooks/useApiTasks';
import { useApiNodes } from './hooks/useApiNodes';
import { useApiEdges } from './hooks/useApiEdges';
import { useWebSocket } from './hooks/useWebSocket';
import { variantColors } from './types';
import type { NodeData, EnterpriseTask } from './types';
import { Activity, Layers, Settings } from 'lucide-react';
import { SettingsPanel } from './components/SettingsPanel';
import './index.css';

const nodeTypes = {
  custom: CustomNode,
};

export default function App() {
  // Detect embed mode for iframe integration
  const isEmbedMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === 'true';
  }, []);

  // ─── App UI state ──────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  // ─── API-backed state ──────────────────────────────────
  const { tasks, loading: tasksLoading, createTask, updateTask, deleteTask } = useApiTasks();
  const { nodes: apiNodes, loading: nodesLoading, updateNode } = useApiNodes();
  const { edges: apiEdges, loading: edgesLoading } = useApiEdges();
  const { connected: wsConnected } = useWebSocket();

  // ─── ReactFlow state ───────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(apiNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(apiEdges);

  // Sync API data into ReactFlow state when loaded
  useEffect(() => {
    if (!nodesLoading && apiNodes.length > 0) setNodes(apiNodes);
  }, [apiNodes, nodesLoading, setNodes]);

  useEffect(() => {
    if (!edgesLoading && apiEdges.length > 0) setEdges(apiEdges);
  }, [apiEdges, edgesLoading, setEdges]);

  // Persist node position changes back to API
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // Debounce position writes
      changes.forEach(change => {
        if (change.type === 'position' && change.dragging === false && change.position) {
          void updateNode(change.id, { position: change.position });
        }
      });
    },
    [onNodesChange, updateNode]
  );

  // ─── Panel state ────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // ─── SDK ─────────────────────────────────────────────────
  const rfInstance = useRef<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Node click → detail panel
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const d = node.data as NodeData;
    if (d.variant === 'group') return;
    setSelectedNodeId(node.id);
    setSelectedNodeData(d);
  }, []);

  const onClosePanel = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeData(null);
  }, []);

  // Search → select + focus node
  const onNodeSelect = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const d = node.data as NodeData;
        if (d.variant === 'group') return;
        setSelectedNodeId(node.id);
        setSelectedNodeData(d);
      }
    },
    [nodes]
  );

  const onFocusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && rfInstance.current) {
        rfInstance.current.setCenter(
          node.position.x + 110,
          node.position.y + 50,
          { zoom: 1.2, duration: 600 }
        );
      }
    },
    [nodes]
  );

  // Task helpers derived from API data
  const getNodeTasks = useCallback(
    (nodeId: string): EnterpriseTask[] => tasks.filter(t => t.node_id === nodeId),
    [tasks]
  );

  const getAggregateStats = useCallback(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const critical = tasks.filter(t => t.priority === 'critical').length;
    const byVariant: Record<string, { total: number; done: number }> = {};
    const byAssignee: Record<string, { total: number; done: number }> = {};
    tasks.forEach(t => {
      const v = (t as any).variant || 'general';
      if (!byVariant[v]) byVariant[v] = { total: 0, done: 0 };
      byVariant[v].total++;
      if (t.status === 'completed') byVariant[v].done++;
      const a = t.assignee || 'unassigned';
      if (!byAssignee[a]) byAssignee[a] = { total: 0, done: 0 };
      byAssignee[a].total++;
      if (t.status === 'completed') byAssignee[a].done++;
    });
    return {
      tasks: { total, done, pending, inProgress, blocked, critical },
      systems: { total: nodes.length, operational: nodes.filter(n => (n.data as any).status === 'healthy').length, degraded: nodes.filter(n => (n.data as any).status === 'degraded').length, down: nodes.filter(n => (n.data as any).status === 'down').length, unknown: nodes.filter(n => !(n.data as any).status || (n.data as any).status === 'unknown').length },
      byVariant,
      byAssignee,
    };
  }, [tasks, nodes]);

  // Task add from detail panel
  const onTaskAdd = useCallback(
    async (nodeId: string, title: string, priority: EnterpriseTask['priority'], assignee?: string) => {
      await createTask({ node_id: nodeId, title, priority, assignee, source: 'manual', status: 'pending' });
    },
    [createTask]
  );

  // Task toggle (pending ↔ completed)
  const onTaskToggle = useCallback(
    async (nodeId: string, taskId: string) => {
      const task = tasks.find(t => t.id === taskId && t.node_id === nodeId);
      if (!task) return;
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await updateTask(taskId, { status: newStatus });
    },
    [tasks, updateTask]
  );

  // Task delete
  const onTaskDelete = useCallback(
    async (_nodeId: string, taskId: string) => {
      await deleteTask(taskId);
    },
    [deleteTask]
  );

  // postMessage bridge (Concierge iframe)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const allowedOrigins = ['http://localhost:3000','https://rxfit.app','https://ops.rxfit.ai'];
      if (
        import.meta.env.MODE === 'production' &&
        !allowedOrigins.includes(event.origin) &&
        !event.origin.endsWith('.replit.dev')
      ) return;
      if (!event.data || typeof event.data !== 'object') return;
      const { type, nodeId, query } = event.data as { type: string; nodeId?: string; query?: string };
      if (type === 'selectNode' && nodeId) { onNodeSelect(nodeId); onFocusNode(nodeId); }
      else if (type === 'search' && query) console.log('[sdm] Search:', query);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNodeSelect, onFocusNode]);

  const isLoading = tasksLoading || nodesLoading || edgesLoading;
  const nodeIds = nodes.map(n => n.id);
  const unassignedTasks = tasks.filter(t => !t.node_id);

  return (
    <>
      {!isEmbedMode && (
        <div className="app-header">
          <div className="app-title">
            <div className={`pulse-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
            The Headless Enterprise: RxFit Operational Automation
            {isLoading && <span className="loading-badge">Loading…</span>}
          </div>
          <div className="app-header-actions">
            <SearchBar
              nodes={nodes}
              getNodeTasks={(id) => getNodeTasks(id).map(t => ({
                id: t.id, title: t.title, status: t.status === 'completed' ? 'done' : t.status,
                priority: t.priority, assignee: t.assignee, source: t.source,
              }))}
              onNodeSelect={onNodeSelect}
              onFocusNode={onFocusNode}
            />
            <SyncIndicator
              status={wsConnected ? 'synced' : 'disconnected'}
              lastSync={null}
              taskCount={tasks.length}
              error={null}
              onRefresh={() => window.location.reload()}
            />
            <PdfExportButton
              nodes={nodes}
              getNodeTasks={(id) => getNodeTasks(id).map(t => ({
                id: t.id, title: t.title, status: t.status === 'completed' ? 'done' : t.status,
                priority: t.priority, assignee: t.assignee, source: t.source,
              }))}
              getAggregateStats={getAggregateStats}
              syncStatus={wsConnected ? 'synced' : 'disconnected'}
              lastSync={null}
              syncTaskCount={tasks.length}
            />
            <button
              className="health-toggle-btn"
              onClick={() => setShowHealth(true)}
              title="System Health Dashboard"
            >
              <Activity size={16} />
              Health
            </button>
            <button
              className="health-toggle-btn"
              onClick={() => setShowSettings(true)}
              title="Mesh Settings"
              style={{ color: '#C4A24C', borderColor: 'rgba(196,162,76,0.2)' }}
            >
              <Settings size={16} />
              Settings
            </button>
            {unassignedTasks.length > 0 && (
              <button
                className="sidebar-toggle-btn"
                onClick={() => setShowSidebar(v => !v)}
                title="Unassigned Tasks"
              >
                <Layers size={16} />
                Inbox ({unassignedTasks.length})
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          onInit={(inst) => { rfInstance.current = inst; }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          attributionPosition="bottom-right"
        >
          <Background color="rgba(255, 255, 255, 0.05)" gap={24} size={2} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const variant = n.data?.variant as string;
              if (variant === 'group') return 'rgba(255,255,255,0.05)';
              return variantColors[variant] || '#10b981';
            }}
          />
        </ReactFlow>
      </div>

      {/* Detail Panel */}
      <DetailPanel
        nodeId={selectedNodeId}
        data={selectedNodeData}
        tasks={getNodeTasks(selectedNodeId || '').map(t => ({
          id: t.id, title: t.title,
          status: t.status === 'completed' ? 'done' : t.status as 'pending' | 'in-progress' | 'done' | 'blocked',
          priority: t.priority, assignee: t.assignee, source: t.source,
        }))}
        allTasks={tasks}
        onClose={onClosePanel}
        onTaskToggle={(nid, tid) => void onTaskToggle(nid, tid)}
        onTaskAdd={(nid, title, prio, assignee) => void onTaskAdd(nid, title, prio, assignee)}
        onTaskDelete={(nid, tid) => void onTaskDelete(nid, tid)}
      />

      {/* Health Dashboard */}
      <HealthDashboard
        nodes={nodes}
        getNodeTasks={(id) => getNodeTasks(id).map(t => ({
          id: t.id, title: t.title,
          status: t.status === 'completed' ? 'done' : t.status as 'pending' | 'in-progress' | 'done' | 'blocked',
          priority: t.priority, assignee: t.assignee, source: t.source,
        }))}
        getAggregateStats={getAggregateStats}
        healthData={null}
        isOpen={showHealth}
        onClose={() => setShowHealth(false)}
      />

      {/* Sidebar: Unassigned Tasks + Cron Panel */}
      {showSidebar && (
        <div className="sidebar-panel">
          <div className="sidebar-header">
            <span>📥 SDM Inbox</span>
            <button className="sidebar-close" onClick={() => setShowSidebar(false)}>✕</button>
          </div>
          <div className="sidebar-body">
            <UnassignedTasks
              tasks={tasks}
              nodeIds={nodeIds}
              onTaskAssigned={() => {}}
            />
            <div style={{ marginTop: 16 }}>
              <CronStatusPanel />
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        nodeCount={nodes.length}
        taskCount={tasks.length}
        wsConnected={wsConnected}
        showInbox={showSidebar}
        onToggleInbox={() => setShowSidebar(v => !v)}
      />

      <style>{`
        .loading-badge {
          font-size: 11px; color: #6366f1; background: rgba(99,102,241,0.1);
          border-radius: 4px; padding: 1px 8px; margin-left: 8px;
          animation: pulse 1.2s infinite;
        }
        .pulse-dot.disconnected { background: #f87171; }
        .sidebar-toggle-btn {
          display: flex; align-items: center; gap: 6px;
          background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);
          color: #a5b4fc; padding: 6px 12px; border-radius: 6px;
          cursor: pointer; font-size: 12px; font-weight: 600;
          transition: background 0.2s;
        }
        .sidebar-toggle-btn:hover { background: rgba(99,102,241,0.25); }
        .sidebar-panel {
          position: fixed; top: 0; right: 0; bottom: 0; width: 360px;
          background: #0d0d1a; border-left: 1px solid #1e2030;
          z-index: 200; display: flex; flex-direction: column;
          box-shadow: -12px 0 40px rgba(0,0,0,0.4);
        }
        .sidebar-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid #1e2030;
          font-size: 14px; font-weight: 700; color: #e2e8f0;
        }
        .sidebar-close {
          background: none; border: none; color: #64748b;
          cursor: pointer; font-size: 16px; padding: 4px 8px;
          border-radius: 4px; transition: color 0.2s;
        }
        .sidebar-close:hover { color: #e2e8f0; }
        .sidebar-body { flex: 1; overflow-y: auto; padding: 16px; }
      `}</style>
    </>
  );
}
