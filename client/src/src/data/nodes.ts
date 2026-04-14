import type { Node } from '@xyflow/react';
import type { RxNodeData } from '../types';

export const initialNodes: Node<RxNodeData>[] = [
  // ─────────────────────────────
  // GROUPS (Background Areas)
  // ─────────────────────────────
  {
    id: 'group-people',
    type: 'custom',
    position: { x: -350, y: 100 },
    data: { label: 'People & Operators', variant: 'group' },
    style: { width: 320, height: 400 },
    zIndex: -1,
  },
  {
    id: 'group-db',
    type: 'custom',
    position: { x: 50, y: -280 },
    data: { label: 'Data & Source of Truth', variant: 'group' },
    style: { width: 400, height: 340 },
    zIndex: -1,
  },
  {
    id: 'group-core',
    type: 'custom',
    position: { x: 50, y: 100 },
    data: { label: 'Client Services Interface', variant: 'group' },
    style: { width: 400, height: 400 },
    zIndex: -1,
  },
  {
    id: 'group-agent',
    type: 'custom',
    position: { x: 500, y: 100 },
    data: { label: 'Agentic Layer', variant: 'group' },
    style: { width: 380, height: 400 },
    zIndex: -1,
  },
  {
    id: 'group-comms',
    type: 'custom',
    position: { x: -350, y: 560 },
    data: { label: 'Heart of Communications', variant: 'group' },
    style: { width: 320, height: 380 },
    zIndex: -1,
  },
  {
    id: 'group-marketing',
    type: 'custom',
    position: { x: 500, y: 560 },
    data: { label: 'Top-of-Funnel (SEO/AEO)', variant: 'group' },
    style: { width: 380, height: 380 },
    zIndex: -1,
  },
  {
    id: 'group-billing',
    type: 'custom',
    position: { x: 50, y: 560 },
    data: { label: 'Tri-Pillar Billing System', variant: 'group' },
    style: { width: 400, height: 380 },
    zIndex: -1,
  },

  // ─────────────────────────────
  // DATABASE / SOURCE OF TRUTH
  // ─────────────────────────────
  {
    id: 'drive',
    type: 'custom',
    position: { x: 80, y: -220 },
    data: {
      label: 'Google Drive',
      description: 'Database/Brain Orchestrator',
      variant: 'data',
      icon: 'HardDrive',
      status: 'operational',
      url: 'https://drive.google.com',
      tasks: [
        { id: 't-drive-1', title: 'Audit Master Client List schema', status: 'pending', priority: 'medium', assignee: 'Danny', source: 'manual' },
        { id: 't-drive-2', title: 'Sync billing rates to Sheets', status: 'in-progress', priority: 'high', assignee: 'JADE', source: 'manual' },
      ],
    },
    parentId: 'group-db',
    extent: 'parent',
  },
  {
    id: 'github',
    type: 'custom',
    position: { x: 80, y: -110 },
    data: {
      label: 'GitHub',
      description: 'Rules & Systems Orchestrator',
      variant: 'data',
      icon: 'Github',
      status: 'operational',
      url: 'https://github.com/RxFit',
      tasks: [
        { id: 't-gh-1', title: 'Merge Jules audit PR backlog', status: 'pending', priority: 'medium', assignee: 'Antigravity', source: 'github' },
      ],
    },
    parentId: 'group-db',
    extent: 'parent',
  },
  {
    id: 'calendar',
    type: 'custom',
    position: { x: 80, y: 0 },
    data: {
      label: 'Google Calendar',
      description: 'Workload & Attendance Truth',
      variant: 'data',
      icon: 'CalendarDays',
      status: 'operational',
      url: 'https://calendar.google.com',
      tasks: [],
    },
    parentId: 'group-db',
    extent: 'parent',
  },

  // ─────────────────────────────
  // PEOPLE & OPERATORS
  // ─────────────────────────────
  {
    id: 'clients',
    type: 'custom',
    position: { x: 40, y: 60 },
    data: { label: 'Clients', description: 'End-users', variant: 'team', icon: 'Users', status: 'operational', tasks: [] },
    parentId: 'group-people',
    extent: 'parent',
  },
  {
    id: 'exec',
    type: 'custom',
    position: { x: 40, y: 160 },
    data: {
      label: 'Exec Team',
      description: 'Danny, Korab, Oscar',
      variant: 'team',
      icon: 'Briefcase',
      status: 'operational',
      tasks: [
        { id: 't-exec-1', title: 'Review weekly SEO audit results', status: 'pending', priority: 'high', assignee: 'Danny', source: 'manual' },
        { id: 't-exec-2', title: 'Finalize trainer onboarding SOP', status: 'pending', priority: 'medium', assignee: 'Korab', source: 'manual' },
      ],
    },
    parentId: 'group-people',
    extent: 'parent',
  },
  {
    id: 'trainers',
    type: 'custom',
    position: { x: 40, y: 260 },
    data: { label: 'Service Professionals', description: 'Trainers & Staff', variant: 'team', icon: 'Dumbbell', status: 'operational', tasks: [] },
    parentId: 'group-people',
    extent: 'parent',
  },

  // ─────────────────────────────
  // HEART OF COMMUNICATIONS
  // ─────────────────────────────
  {
    id: 'gchat',
    type: 'custom',
    position: { x: 40, y: 60 },
    data: { label: 'Google Chat', description: 'Admin/Trainer Internal Comms', variant: 'comms', icon: 'MessageCircle', status: 'operational', tasks: [] },
    parentId: 'group-comms',
    extent: 'parent',
  },
  {
    id: 'twilio',
    type: 'custom',
    position: { x: 40, y: 160 },
    data: {
      label: 'Twilio',
      description: 'Ops Comms & Remote Control',
      variant: 'comms',
      icon: 'MessageSquareShare',
      status: 'operational',
      url: 'https://console.twilio.com',
      tasks: [
        { id: 't-tw-1', title: 'Migrate to named tunnel (jade.rxfit.co)', status: 'in-progress', priority: 'critical', assignee: 'Danny', source: 'manual' },
        { id: 't-tw-2', title: 'Stabilize webhook auto-heal script', status: 'in-progress', priority: 'high', assignee: 'Antigravity', source: 'manual' },
      ],
    },
    parentId: 'group-comms',
    extent: 'parent',
  },
  {
    id: 'phone',
    type: 'custom',
    position: { x: 40, y: 260 },
    data: { label: "Danny's Phone", description: 'Ultimate Remote Control', variant: 'team', icon: 'Smartphone', status: 'operational', tasks: [] },
    parentId: 'group-comms',
    extent: 'parent',
  },

  // ─────────────────────────────
  // CLIENT SERVICES INTERFACE
  // ─────────────────────────────
  {
    id: 'cc',
    type: 'custom',
    position: { x: 80, y: 60 },
    data: {
      label: 'RxFit Command Center',
      description: 'RxFit Concierge',
      variant: 'core',
      icon: 'Laptop',
      status: 'operational',
      url: 'https://rxfit.app',
      tasks: [
        { id: 't-cc-1', title: 'Hydrate staff dashboard with live touchpoint data', status: 'in-progress', priority: 'high', assignee: 'Antigravity', source: 'manual' },
        { id: 't-cc-2', title: 'Implement social engagement layer (likes/comments)', status: 'pending', priority: 'medium', assignee: 'Antigravity', source: 'manual' },
        { id: 't-cc-3', title: 'PDF generation for clinical longevity dossiers', status: 'pending', priority: 'medium', assignee: 'Antigravity', source: 'manual' },
      ],
    },
    parentId: 'group-core',
    extent: 'parent',
  },
  {
    id: 'virtual',
    type: 'custom',
    position: { x: 80, y: 170 },
    data: { label: 'Virtual Services', description: 'Wellness App, Corporate', variant: 'core', icon: 'Globe', status: 'operational', tasks: [] },
    parentId: 'group-core',
    extent: 'parent',
  },
  {
    id: 'wrapped-chat',
    type: 'custom',
    position: { x: 80, y: 280 },
    data: { label: 'Wrapped Google Chat', description: 'Embedded Communications', variant: 'comms', icon: 'MessageCirclePlus', status: 'operational', tasks: [] },
    parentId: 'group-core',
    extent: 'parent',
  },

  // ─────────────────────────────
  // AGENTIC LAYER
  // ─────────────────────────────
  {
    id: 'jade',
    type: 'custom',
    position: { x: 40, y: 60 },
    data: {
      label: 'RxFit-MCP (JADE v3)',
      description: 'Operations Engine',
      variant: 'agent',
      icon: 'Bot',
      status: 'operational',
      tasks: [
        { id: 't-jade-1', title: 'Fix seo_action_blogger job handler imports', status: 'pending', priority: 'high', assignee: 'Danny', source: 'manual' },
        { id: 't-jade-2', title: 'Fix seo_weekly_audit payload handling', status: 'pending', priority: 'high', assignee: 'Danny', source: 'manual' },
        { id: 't-jade-3', title: 'Resolve rxfit.co domain transfer for named tunnel', status: 'blocked', priority: 'critical', assignee: 'Danny', source: 'manual' },
      ],
    },
    parentId: 'group-agent',
    extent: 'parent',
  },
  {
    id: 'wrapups',
    type: 'custom',
    position: { x: 40, y: 170 },
    data: { label: 'Wrap-ups', description: 'Morning/EOD Tasks', variant: 'agent', icon: 'Workflow', status: 'operational', tasks: [] },
    parentId: 'group-agent',
    extent: 'parent',
  },
  {
    id: 'antigravity',
    type: 'custom',
    position: { x: 40, y: 280 },
    data: {
      label: 'Antigravity',
      description: 'Interchangeable Agent Tool',
      variant: 'agent',
      icon: 'Sparkles',
      status: 'operational',
      tasks: [
        { id: 't-ag-1', title: 'Harden Agent Brock orchestration', status: 'in-progress', priority: 'high', assignee: 'Antigravity', source: 'manual' },
      ],
    },
    parentId: 'group-agent',
    extent: 'parent',
  },

  // ─────────────────────────────
  // TRI-PILLAR BILLING SYSTEM
  // ─────────────────────────────
  {
    id: 'stripe',
    type: 'custom',
    position: { x: 80, y: 60 },
    data: { label: 'Stripe', description: 'Payment Verification', variant: 'finance', icon: 'CreditCard', status: 'operational', url: 'https://dashboard.stripe.com', tasks: [] },
    parentId: 'group-billing',
    extent: 'parent',
  },
  {
    id: 'billing-engine',
    type: 'custom',
    position: { x: 80, y: 170 },
    data: {
      label: 'Billing Sync Engine',
      description: 'Aggregator',
      variant: 'finance',
      icon: 'RefreshCw',
      status: 'unknown',
      tasks: [
        { id: 't-bill-1', title: 'Complete billing tri-pillar integration', status: 'pending', priority: 'high', assignee: 'Danny', source: 'manual' },
      ],
    },
    parentId: 'group-billing',
    extent: 'parent',
  },
  {
    id: 'payroll',
    type: 'custom',
    position: { x: 80, y: 280 },
    data: { label: 'Team Payroll', description: 'Determines Payouts', variant: 'finance', icon: 'CircleDollarSign', status: 'unknown', tasks: [] },
    parentId: 'group-billing',
    extent: 'parent',
  },

  // ─────────────────────────────
  // TOP-OF-FUNNEL (SEO/AEO)
  // ─────────────────────────────
  {
    id: 'website',
    type: 'custom',
    position: { x: 60, y: 60 },
    data: { label: 'rxfit.co Website', description: 'Traffic Hub', variant: 'core', icon: 'Layout', status: 'operational', url: 'https://rxfit.co', tasks: [] },
    parentId: 'group-marketing',
    extent: 'parent',
  },
  {
    id: 'seo',
    type: 'custom',
    position: { x: 60, y: 150 },
    data: {
      label: 'SEO Agent',
      description: 'Generates Audits',
      variant: 'agent',
      icon: 'Search',
      status: 'operational',
      tasks: [
        { id: 't-seo-1', title: 'Run weekly E-E-A-T audit', status: 'pending', priority: 'medium', assignee: 'JADE', source: 'manual' },
      ],
    },
    parentId: 'group-marketing',
    extent: 'parent',
  },
  {
    id: 'audits',
    type: 'custom',
    position: { x: 60, y: 230 },
    data: { label: 'Weekly Audits', description: 'Must-Dos / Recurring', variant: 'core', icon: 'FileText', status: 'operational', tasks: [] },
    parentId: 'group-marketing',
    extent: 'parent',
  },
  {
    id: 'oscar',
    type: 'custom',
    position: { x: 60, y: 310 },
    data: {
      label: 'Oscar CRM',
      description: 'Lead Processing',
      variant: 'core',
      icon: 'Database',
      status: 'operational',
      url: 'https://docs.google.com/spreadsheets',
      tasks: [
        { id: 't-osc-1', title: 'Inject SEO-enriched data into CRM sheet', status: 'pending', priority: 'medium', assignee: 'JADE', source: 'manual' },
      ],
    },
    parentId: 'group-marketing',
    extent: 'parent',
  },
];
