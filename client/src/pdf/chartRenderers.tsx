/**
 * Chart Renderers — Offscreen Recharts components for PDF capture
 *
 * These render into a hidden container, get captured via html2canvas,
 * then injected as images into the jsPDF document.
 */

import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import {
  STATUS_CHART_COLORS,
  PRIORITY_CHART_COLORS,
  TASK_STATUS_CHART_COLORS,
  VARIANT_CHART_COLORS,
  ASSIGNEE_COLORS,
} from './theme';

// ─── Utility: Render a React component to a PNG data URL ──────────────────────

async function renderChartToImage(
  element: React.ReactElement,
  width: number,
  height: number,
): Promise<string> {
  // Create a hidden container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.background = '#0a0f19';
  container.style.padding = '16px';
  container.style.borderRadius = '12px';
  document.body.appendChild(container);

  // Render the React element
  const root = createRoot(container);
  root.render(element);

  // Wait for render + recharts animations to settle
  await new Promise((r) => setTimeout(r, 800));

  // Capture as canvas
  const canvas = await html2canvas(container, {
    backgroundColor: '#0a0f19',
    scale: 2, // Retina quality
    useCORS: true,
    logging: false,
  });

  // Cleanup
  root.unmount();
  document.body.removeChild(container);

  return canvas.toDataURL('image/png');
}

// ─── Chart 1: System Health Donut ─────────────────────────────────────────────

interface HealthDonutData {
  operational: number;
  degraded: number;
  down: number;
  unknown: number;
}

function SystemHealthDonut({ data }: { data: HealthDonutData }) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value,
      color: STATUS_CHART_COLORS[key as keyof typeof STATUS_CHART_COLORS],
    }));

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        textAlign: 'center', color: '#f8fafc', fontFamily: 'monospace', zIndex: 10,
      }}>
        <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{total}</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px' }}>Systems</div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px' }}
            itemStyle={{ color: '#f8fafc' }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export async function renderHealthDonut(data: HealthDonutData): Promise<string> {
  return renderChartToImage(<SystemHealthDonut data={data} />, 420, 320);
}

// ─── Chart 2: Priority Distribution Bar ──────────────────────────────────────

interface PriorityBarData {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function PriorityDistribution({ data }: { data: PriorityBarData }) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    count: value,
    fill: PRIORITY_CHART_COLORS[key as keyof typeof PRIORITY_CHART_COLORS],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}
          axisLine={{ stroke: '#1e293b' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}
          axisLine={{ stroke: '#1e293b' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px' }}
          itemStyle={{ color: '#f8fafc' }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={50}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export async function renderPriorityBars(data: PriorityBarData): Promise<string> {
  return renderChartToImage(<PriorityDistribution data={data} />, 420, 320);
}

// ─── Chart 3: Task Pipeline by Variant (Stacked Horizontal Bar) ───────────────

interface VariantTaskData {
  variant: string;
  done: number;
  inProgress: number;
  pending: number;
  blocked: number;
}

function TaskPipeline({ data }: { data: VariantTaskData[] }) {
  const displayData = data.map(d => ({
    ...d,
    variant: d.variant.charAt(0).toUpperCase() + d.variant.slice(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={displayData} layout="vertical" margin={{ top: 10, right: 30, bottom: 10, left: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}
          axisLine={{ stroke: '#1e293b' }}
          allowDecimals={false}
        />
        <YAxis
          dataKey="variant"
          type="category"
          tick={{ fill: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}
          axisLine={{ stroke: '#1e293b' }}
          width={55}
        />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px' }}
          itemStyle={{ color: '#f8fafc' }}
        />
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }} />
        <Bar dataKey="done" stackId="a" fill={TASK_STATUS_CHART_COLORS.done} name="Done" radius={[0, 0, 0, 0]} />
        <Bar dataKey="inProgress" stackId="a" fill={TASK_STATUS_CHART_COLORS['in-progress']} name="In Progress" />
        <Bar dataKey="pending" stackId="a" fill={TASK_STATUS_CHART_COLORS.pending} name="Pending" />
        <Bar dataKey="blocked" stackId="a" fill={TASK_STATUS_CHART_COLORS.blocked} name="Blocked" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export async function renderTaskPipeline(data: VariantTaskData[]): Promise<string> {
  return renderChartToImage(<TaskPipeline data={data} />, 500, 340);
}

// ─── Chart 4: Assignee Distribution Pie ───────────────────────────────────────

interface AssigneeData {
  name: string;
  total: number;
  done: number;
}

function AssigneePie({ data }: { data: AssigneeData[] }) {
  const chartData = data.map((d, i) => ({
    name: d.name,
    value: d.total,
    color: ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px' }}
          itemStyle={{ color: '#f8fafc' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export async function renderAssigneePie(data: AssigneeData[]): Promise<string> {
  return renderChartToImage(<AssigneePie data={data} />, 420, 320);
}

// ─── Chart 5: Assignee Completion Rate Bar ────────────────────────────────────

function AssigneeCompletionBars({ data }: { data: AssigneeData[] }) {
  const chartData = data.map((d, i) => ({
    name: d.name,
    rate: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
    fill: ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}
          axisLine={{ stroke: '#1e293b' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}
          axisLine={{ stroke: '#1e293b' }}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px' }}
          formatter={(value) => [`${value}%`, 'Completion']}
        />
        <Bar dataKey="rate" radius={[6, 6, 0, 0]} barSize={40}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export async function renderAssigneeCompletionBars(data: AssigneeData[]): Promise<string> {
  return renderChartToImage(<AssigneeCompletionBars data={data} />, 420, 320);
}

// ─── Unused but available: Variant breakdown for Health Dashboard page ────────

export { VARIANT_CHART_COLORS };
