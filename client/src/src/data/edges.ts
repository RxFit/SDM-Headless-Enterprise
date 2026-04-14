import type { Edge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

export const initialEdges: Edge[] = [
  // Drive & GitHub
  { id: 'e-drive-github', source: 'drive', target: 'github', animated: true, style: { strokeDasharray: '5' } },

  // Infinite Context Wrapups
  { id: 'e-drive-wrapups', source: 'drive', target: 'wrapups', sourceHandle: 's-right', targetHandle: 't-left', animated: true, label: 'Infinite Context', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-github-wrapups', source: 'github', target: 'wrapups', sourceHandle: 's-right', targetHandle: 't-left', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },

  // Wrapups Assigning Tasks
  { id: 'e-wrapups-exec', source: 'wrapups', target: 'exec', targetHandle: 't-right', label: 'Assigns Tasks', markerEnd: { type: MarkerType.ArrowClosed } },

  // Clients to Services
  { id: 'e-clients-cc', source: 'clients', target: 'cc', sourceHandle: 's-right', targetHandle: 't-left', label: 'In-Person', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-clients-virtual', source: 'clients', target: 'virtual', sourceHandle: 's-right', targetHandle: 't-left', label: 'Remote', markerEnd: { type: MarkerType.ArrowClosed } },

  // Wrapped Chat
  { id: 'e-cc-wrapped', source: 'cc', target: 'wrapped-chat', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-wrapped-gchat', source: 'wrapped-chat', target: 'gchat', sourceHandle: 's-right', animated: true },

  // Comms
  { id: 'e-exec-gchat', source: 'exec', target: 'gchat', label: 'Work Comms' },
  { id: 'e-trainers-gchat', source: 'trainers', target: 'gchat' },

  // Phone -> Twilio -> JADE
  { id: 'e-phone-twilio', source: 'phone', target: 'twilio', label: 'Voice/Text Control', markerEnd: { type: MarkerType.ArrowClosed }, animated: true },
  { id: 'e-twilio-jade', source: 'twilio', target: 'jade', label: 'Remote Execution', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-jade-twilio', source: 'jade', target: 'twilio', sourceHandle: 's-left', targetHandle: 't-right', label: 'Alerts', animated: true },

  // Marketing
  { id: 'e-seo-audits', source: 'seo', target: 'audits', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-audits-exec', source: 'audits', target: 'exec', targetHandle: 't-right', label: 'Emails exec' },
  { id: 'e-exec-website', source: 'exec', target: 'website', sourceHandle: 's-right', targetHandle: 't-left', label: 'Updates' },
  { id: 'e-website-oscar', source: 'website', target: 'oscar', markerEnd: { type: MarkerType.ArrowClosed }, label: 'Feeds Leads' },
  { id: 'e-oscar-twilio', source: 'oscar', target: 'twilio', sourceHandle: 's-left', targetHandle: 't-right', label: 'Texts Leads' },

  // Billing
  { id: 'e-cc-billing', source: 'cc', target: 'billing-engine', sourceHandle: 's-right', targetHandle: 't-left', label: 'Rates/Intent', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-calendar-billing', source: 'calendar', target: 'billing-engine', sourceHandle: 's-right', targetHandle: 't-top', label: 'Attendance', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-stripe-billing', source: 'stripe', target: 'billing-engine', markerEnd: { type: MarkerType.ArrowClosed }, label: 'Payment Verify' },
  { id: 'e-billing-payroll', source: 'billing-engine', target: 'payroll', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-payroll-trainers', source: 'payroll', target: 'trainers', sourceHandle: 's-left', targetHandle: 't-right', label: 'Payouts', animated: true },

  // People & Data
  { id: 'e-trainers-calendar', source: 'trainers', target: 'calendar', sourceHandle: 's-right', targetHandle: 't-bottom' },
  { id: 'e-exec-calendar', source: 'exec', target: 'calendar', sourceHandle: 's-right', targetHandle: 't-left' },
];
