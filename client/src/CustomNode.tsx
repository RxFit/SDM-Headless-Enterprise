import { Handle, Position } from '@xyflow/react';
import {
  HardDrive,
  Github,
  CalendarDays,
  Users,
  Briefcase,
  Dumbbell,
  MessageSquareShare,
  MessageCircle,
  Smartphone,
  Laptop,
  Globe,
  MessageCirclePlus,
  Bot,
  Workflow,
  Sparkles,
  CreditCard,
  RefreshCw,
  CircleDollarSign,
  Layout,
  Search,
  FileText,
  Database,
  Box,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { RxNodeData, SystemStatus } from './types';
import { statusColors } from './types';

const iconMap: Record<string, ElementType> = {
  HardDrive, Github, CalendarDays, Users, Briefcase, Dumbbell,
  MessageSquareShare, MessageCircle, Smartphone, Laptop, Globe,
  MessageCirclePlus, Bot, Workflow, Sparkles, CreditCard,
  RefreshCw, CircleDollarSign, Layout, Search, FileText, Database, Box,
};

export default function CustomNode({ data }: { data: RxNodeData }) {
  const IconComponent = (data.icon ? iconMap[data.icon] : null) || Box;
  const isGroup = data.variant === 'group';
  const status = data.status || 'unknown';
  const tasks = data.tasks || [];
  const pendingCount = tasks.filter((t) => t.status !== 'done').length;

  return (
    <div className={`rx-node ${data.variant || 'core'}`} style={{ cursor: isGroup ? 'default' : 'pointer' }}>
      <Handle type="target" position={Position.Top} id="top" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: 'transparent', border: 'none' }} />

      {/* Status indicator dot */}
      {!isGroup && (
        <div
          className="rx-node-status"
          style={{ background: statusColors[status as SystemStatus] }}
          title={`Status: ${status}`}
        />
      )}

      {/* Task count badge */}
      {!isGroup && pendingCount > 0 && (
        <div className="rx-node-badge" title={`${pendingCount} pending task${pendingCount > 1 ? 's' : ''}`}>
          {pendingCount}
        </div>
      )}

      <div className="rx-node-header">
        <div className="rx-node-icon">
          <IconComponent size={20} strokeWidth={1.5} />
        </div>
        <div className="rx-node-title">
          {data.label}
        </div>
      </div>

      {data.description ? (
        <div className="rx-node-desc">
          {data.description}
        </div>
      ) : null}

      {/* TARGET HANDLES */}
      <Handle type="target" position={Position.Top} id="t-top" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="t-bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="t-left" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="t-right" style={{ opacity: 0 }} />

      {/* SOURCE HANDLES */}
      <Handle type="source" position={Position.Top} id="s-top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} id="s-left" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ opacity: 0 }} />
    </div>
  );
}
