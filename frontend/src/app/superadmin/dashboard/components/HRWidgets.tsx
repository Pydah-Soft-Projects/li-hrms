'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ComposedChart,
} from 'recharts';

const GREEN = '#10b981';
const GREEN_LIGHT = '#d1fae5';
const ORANGE = '#f97316';
const CHART_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669', '#047857'];

function MiniSparkline({ data, color = GREEN, type = 'area' }: { data: number[]; color?: string; type?: 'area' | 'bar' }) {
  const chartData = data.map((v, i) => ({ i, v }));
  if (chartData.every((d) => d.v === 0)) chartData[chartData.length - 1] = { i: chartData.length - 1, v: 1 };

  return (
    <div className="h-10 w-20 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
          <BarChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} dot={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function DonutProgress({ percent, size = 48 }: { percent: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={GREEN}
        strokeWidth={5}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniDualSparkline({
  leaveData,
  odData,
}: {
  leaveData: number[];
  odData: number[];
}) {
  const chartData = leaveData.map((leave, i) => ({
    i,
    leave,
    od: odData[i] ?? 0,
  }));

  return (
    <div className="h-10 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="leave" fill={GREEN} radius={[1, 1, 0, 0]} barSize={3} />
          <Bar dataKey="od" fill="#3b82f6" radius={[1, 1, 0, 0]} barSize={3} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LeaveOdTodayCard({
  onLeave,
  onOd,
  trackerData = [],
  icon,
}: {
  onLeave: number;
  onOd: number;
  trackerData?: Array<{ leave?: number; od?: number }>;
  icon: React.ReactNode;
}) {
  const leaveSpark = (trackerData ?? []).map((d) => d.leave || 0);
  const odSpark = (trackerData ?? []).map((d) => d.od || 0);

  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          {icon}
        </div>
        <p className="text-xs font-medium text-zinc-500">On Leave &amp; OD Today</p>
        <div className="mt-1 flex items-baseline gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{onLeave}</p>
            <p className="text-[10px] font-medium text-emerald-600">On Leave</p>
          </div>
          <div className="text-lg font-light text-zinc-300">|</div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{onOd}</p>
            <p className="text-[10px] font-medium text-blue-600">On OD</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <MiniDualSparkline leaveData={leaveSpark} odData={odSpark} />
        <div className="flex gap-2 text-[9px] text-zinc-400">
          <span className="flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-sm bg-emerald-500" /> Leave
          </span>
          <span className="flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" /> OD
          </span>
        </div>
      </div>
    </div>
  );
}

export function PendingApprovalsCard({
  pendingLeaves,
  pendingODs,
  trackerData = [],
  icon,
}: {
  pendingLeaves: number;
  pendingODs: number;
  trackerData?: Array<{ pendingLeave?: number; pendingOd?: number }>;
  icon: React.ReactNode;
}) {
  const total = pendingLeaves + pendingODs;
  const leaveSpark = (trackerData ?? []).map((d) => d.pendingLeave || 0);
  const odSpark = (trackerData ?? []).map((d) => d.pendingOd || 0);

  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          {icon}
        </div>
        <p className="text-xs font-medium text-zinc-500">Pending Approvals</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{total}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px]">
          <span className="font-medium text-emerald-600">{pendingLeaves} Leave</span>
          <span className="text-zinc-300">|</span>
          <span className="font-medium text-blue-600">{pendingODs} OD</span>
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-400">Requires your action</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <MiniDualSparkline leaveData={leaveSpark} odData={odSpark} />
        <div className="flex gap-2 text-[9px] text-zinc-400">
          <span className="flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-sm bg-emerald-500" /> Leave
          </span>
          <span className="flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" /> OD
          </span>
        </div>
      </div>
    </div>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  sparkData,
  sparkColor,
  sparkType,
  trailing,
}: {
  title: string;
  value: string | number;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  sparkData?: number[];
  sparkColor?: string;
  sparkType?: 'area' | 'bar';
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          {icon}
        </div>
        <p className="text-xs font-medium text-zinc-500">{title}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{value}</p>
        {subtitle && <div className="mt-1 text-[11px] text-zinc-500">{subtitle}</div>}
      </div>
      <div className="flex flex-col items-end gap-1">
        {trailing}
        {sparkData && sparkData.length > 0 && (
          <MiniSparkline data={sparkData} color={sparkColor} type={sparkType} />
        )}
      </div>
    </div>
  );
}

export function AttendanceOverview({
  data,
  activeEmployees,
}: {
  data: Array<{ label: string; present?: number; leave?: number; od?: number; date?: string }>;
  activeEmployees: number;
}) {
  const chartData = useMemo(
    () =>
      (data || []).map((d) => ({
        ...d,
        presentCount: d.present || 0,
        rate: activeEmployees > 0 ? Math.round(((d.present || 0) / activeEmployees) * 1000) / 10 : 0,
      })),
    [data, activeEmployees],
  );

  const maxPresent = useMemo(
    () => Math.max(...chartData.map((d) => d.presentCount), activeEmployees, 1),
    [chartData, activeEmployees],
  );

  return (
    <div className="w-full">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="attendanceGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={GREEN} stopOpacity={0.2} />
                <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
            <YAxis
              yAxisId="rate"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              width={36}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              domain={[0, maxPresent]}
              allowDecimals={false}
              width={32}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as { presentCount?: number; rate?: number };
                return (
                  <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="mb-1 font-semibold text-zinc-700">{label}</p>
                    <p className="text-emerald-600">
                      <span className="font-bold">{point.presentCount ?? 0}</span> employees present
                    </p>
                    <p className="text-zinc-500">
                      <span className="font-bold">{point.rate ?? 0}%</span> of {activeEmployees} active
                    </p>
                  </div>
                );
              }}
            />
            <Area
              yAxisId="rate"
              type="monotone"
              dataKey="rate"
              stroke={GREEN}
              strokeWidth={2.5}
              fill="url(#attendanceGreen)"
              dot={{ r: 4, fill: GREEN, strokeWidth: 2, stroke: '#fff' }}
            />
            <Line
              yAxisId="count"
              type="monotone"
              dataKey="presentCount"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-4 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-emerald-500" /> Attendance %
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" /> Employees present
        </span>
      </div>
    </div>
  );
}

export function LeaveSummaryDonut({ data }: { data: Record<string, number> }) {
  const chartData = useMemo(() => {
    const entries = Object.entries(data || {}).map(([name, value]) => ({ name, value }));
    const total = entries.reduce((s, e) => s + e.value, 0);
    return { entries, total };
  }, [data]);

  if (chartData.entries.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-zinc-400">
        No leave data for this period
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-[160px] w-[160px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData.entries}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={72}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.entries.map((_e, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-zinc-900">{chartData.total}</span>
          <span className="text-[10px] text-zinc-500">Total Leaves</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {chartData.entries.map((item, i) => {
          const pct = chartData.total > 0 ? ((item.value / chartData.total) * 100).toFixed(1) : '0';
          return (
            <li key={item.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="truncate text-zinc-600">{item.name}</span>
              </div>
              <span className="shrink-0 font-semibold text-zinc-800">
                {item.value}{' '}
                <span className="font-normal text-zinc-400">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EmployeeGrowthChart({ data }: { data: Array<{ label: string; total: number }> }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)' }} />
          <Line type="monotone" dataKey="total" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3, fill: GREEN }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function JoinResignChart({ data }: { data: Array<{ label: string; joined: number; resigned: number }> }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)' }} />
          <Bar dataKey="joined" fill={GREEN} radius={[3, 3, 0, 0]} barSize={10} />
          <Bar dataKey="resigned" fill={ORANGE} radius={[3, 3, 0, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export { DonutProgress, MiniSparkline, GREEN, GREEN_LIGHT };
