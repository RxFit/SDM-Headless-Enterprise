import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
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
import { usePersistedPositions } from './hooks/usePersistedPositions';
import { useTaskState } from './hooks/useTaskState';
import { useGoogleSheetTasks } from './hooks/useGoogleSheetTasks';
import { useOrchestratorHealth } from './hooks/useOrchestratorHealth';
import { initialNodes } from './data/nodes';
import { initialEdges } from './data/edges';
import { variantColors } from './types';
import type { RxNodeData } from './types';
import { Activity } from 'lucide-react';
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

  const { nodes, onNodesChange, resetPositions } = usePersistedPositions<RxNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Google Drive live sync
  const {
    tasksByNode: externalTasks,
    status: syncStatus,
    lastSync: syncLastSync,
    taskCount: syncTaskCount,
    error: syncError,
    refresh: syncRefresh,
  } = useGoogleSheetTasks();

  // Task state management (3 layers: base + external + user)
  const { getNodeTasks, toggleTask, addTask, deleteTask, getAggregateStats } =
    useTaskState(initialNodes, externalTasks);

  // Detail panel state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<RxNodeData | null>(null);

  // Health dashboard state
  const [showHealth, setShowHealth] = useState(false);
  const { healthData } = useOrchestratorHealth();

  // ReactFlow instance for programmatic viewport control
  const rfInstance = useRef<ReactFlowInstance<Node<RxNodeData>, Edge> | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle node click → open detail panel
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const d = node.data as RxNodeData;
    if (d.variant === 'group') return;
    setSelectedNodeId(node.id);
    setSelectedNodeData(d);
  }, []);

  // Handle closing detail panel
  const onClosePanel = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeData(null);
  }, []);

  // Node selection from search bar
  const onNodeSelect = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const d = node.data as RxNodeData;
        if (d.variant === 'group') return;
        setSelectedNodeId(node.id);
        setSelectedNodeData(d);
      }
    },
    [nodes]
  );

  // Focus/pan to a node
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

  // Cross-app postMessage bridge (for Concierge iframe communication)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security Validation: Origin checking to prevent cross-site scripting
      const allowedOrigins = ['http://localhost:3000', 'https://rxfit.app', 'https://ops.rxfit.ai'];
      if (import.meta.env.MODE === 'production' && !allowedOrigins.includes(event.origin) && !event.origin.endsWith('.replit.dev')) {
        console.warn(`[ops.rxfit.ai] Blocked message from untrusted origin: ${event.origin}`);
        return;
      }

      if (!event.data || typeof event.data !== 'object') return;
      const { type, nodeId, query } = event.data;
      if (type === 'selectNode' && nodeId) {
        onNodeSelect(nodeId);
        onFocusNode(nodeId);
      } else if (type === 'search' && query) {
        // Future: programmatic search trigger
        console.log('[ops.rxfit.ai] Search requested:', query);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNodeSelect, onFocusNode]);

  return (
    <>
      {!isEmbedMode && (
        <div className="app-header">
          <div className="app-title">
            <div className="pulse-dot" />
            The Headless Enterprise: RxFit Operational Automation
          </div>
          <div className="app-header-actions">
            <SearchBar
              nodes={nodes}
              getNodeTasks={getNodeTasks}
              onNodeSelect={onNodeSelect}
              onFocusNode={onFocusNode}
            />
            <SyncIndicator
              status={syncStatus}
              lastSync={syncLastSync}
              taskCount={syncTaskCount}
              error={syncError}
              onRefresh={syncRefresh}
            />
            <PdfExportButton
              nodes={initialNodes}
              getNodeTasks={getNodeTasks}
              getAggregateStats={getAggregateStats}
              syncStatus={syncStatus}
              lastSync={syncLastSync}
              syncTaskCount={syncTaskCount}
            />
            <button
              className="health-toggle-btn"
              onClick={() => setShowHealth(true)}
              title="System Health Dashboard"
            >
              <Activity size={16} />
              Health
            </button>
            <button className="reset-btn" onClick={resetPositions} title="Reset node positions to defaults">
              ↺ Reset Layout
            </button>
          </div>
        </div>
      )}
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          onInit={(instance) => { rfInstance.current = instance; }}
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
        tasks={selectedNodeId ? getNodeTasks(selectedNodeId) : []}
        onClose={onClosePanel}
        onTaskToggle={toggleTask}
        onTaskAdd={addTask}
        onTaskDelete={deleteTask}
      />

      {/* Health Dashboard */}
      <HealthDashboard
        nodes={initialNodes}
        getNodeTasks={getNodeTasks}
        getAggregateStats={getAggregateStats}
        healthData={healthData}
        isOpen={showHealth}
        onClose={() => setShowHealth(false)}
      />
    </>
  );
}
