'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Spinner from '@/components/Spinner';
import {
  buildOdDepartmentsForDivision,
  buildOdDivisionAggregates,
  buildOdSegmentBreakdown,
  buildOdStatusBreakdown,
  buildOdTrend,
  pct,
  type OdAuditStatsRecord,
  type OdOrgAggregateRow,
} from '@/lib/odAuditStats';
import { ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  cancelled: '#94a3b8',
  other: '#cbd5e1',
};

const SEGMENT_COLORS = {
  co: '#8b5cf6',
  hours: '#0ea5e9',
  regular: '#64748b',
};

const PIE_COLORS = ['#f59e0b', '#10b981', '#ef4444', '#94a3b8', '#cbd5e1'];

type DivisionStatusChartRow = {
  name: string;
  fullName: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  pendingPct: number;
  approvedPct: number;
  rejectedPct: number;
  cancelledPct: number;
};

function trendLabelValue(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n);
}

function truncateLabel(label: string, max = 24): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function DivisionStatusShareTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DivisionStatusChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const items = [
    { label: 'Pending', count: row.pending, pct: row.pendingPct, color: STATUS_COLORS.pending },
    { label: 'Approved', count: row.approved, pct: row.approvedPct, color: STATUS_COLORS.approved },
    { label: 'Rejected', count: row.rejected, pct: row.rejectedPct, color: STATUS_COLORS.rejected },
    { label: 'Cancelled', count: row.cancelled, pct: row.cancelledPct, color: STATUS_COLORS.cancelled },
  ].filter((i) => i.count > 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-600 dark:bg-slate-900">
      <p className="max-w-[220px] text-xs font-bold text-slate-900 dark:text-white">{row.fullName}</p>
      <p className="mb-2 text-[10px] text-slate-500">{row.total} OD{row.total !== 1 ? 's' : ''} total</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: i.color }} />
              {i.label}
            </span>
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {i.count} <span className="font-normal text-slate-400">({i.pct}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DivisionStatusShareChart({ rows }: { rows: OdOrgAggregateRow[] }) {
  const data = useMemo((): DivisionStatusChartRow[] => {
    return rows
      .filter((r) => r.total > 0)
      .slice(0, 10)
      .map((r) => {
        const t = r.total;
        return {
          name: truncateLabel(r.name),
          fullName: r.name,
          total: t,
          pending: r.pending,
          approved: r.approved,
          rejected: r.rejected,
          cancelled: r.cancelled,
          pendingPct: pct(r.pending, t),
          approvedPct: pct(r.approved, t),
          rejectedPct: pct(r.rejected, t),
          cancelledPct: pct(r.cancelled, t),
        };
      });
  }, [rows]);

  const yAxisWidth = useMemo(() => {
    const longest = data.reduce((m, d) => Math.max(m, d.name.length), 0);
    return Math.min(160, Math.max(88, longest * 6.5));
  }, [data]);

  const chartHeight = Math.min(440, Math.max(220, data.length * 42 + 48));

  if (!data.length) {
    return (
      <p className="flex h-[200px] items-center justify-center text-sm text-slate-400">
        No division data for this period
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yAxisWidth}
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<DivisionStatusShareTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="pendingPct" name="Pending" stackId="status" fill={STATUS_COLORS.pending} minPointSize={3} />
          <Bar dataKey="approvedPct" name="Approved" stackId="status" fill={STATUS_COLORS.approved} minPointSize={3} />
          <Bar dataKey="rejectedPct" name="Rejected" stackId="status" fill={STATUS_COLORS.rejected} minPointSize={3} />
          <Bar
            dataKey="cancelledPct"
            name="Cancelled"
            stackId="status"
            fill={STATUS_COLORS.cancelled}
            minPointSize={3}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutDistribution({
  title,
  subtitle,
  entries,
  colors,
}: {
  title: string;
  subtitle: string;
  entries: Array<{ name: string; value: number; color?: string }>;
  colors?: string[];
}) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  const data = entries.filter((e) => e.value > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p>
      {total === 0 ? (
        <p className="flex h-[200px] items-center justify-center text-sm text-slate-400">No data</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative mx-auto h-[160px] w-[160px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={2} dataKey="value">
                  {data.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.color || colors?.[i] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [`${v} (${pct(v, total)}%)`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-slate-900 dark:text-white">{total}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {data.map((item, i) => (
              <li key={item.name} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color || colors?.[i] || PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate text-slate-600 dark:text-slate-300">{item.name}</span>
                </div>
                <span className="shrink-0 font-semibold text-slate-800 dark:text-slate-200">
                  {item.value} <span className="font-normal text-slate-400">({pct(item.value, total)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AggregateTable({
  title,
  subtitle,
  rows,
  showDivision,
  expandableDivision,
  allRecords,
}: {
  title: string;
  subtitle: string;
  rows: OdOrgAggregateRow[];
  showDivision?: boolean;
  expandableDivision?: boolean;
  allRecords?: OdAuditStatsRecord[];
}) {
  const [expandedDiv, setExpandedDiv] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/60">
              {expandableDivision && <th className="w-8 px-2 py-2" />}
              {showDivision && (
                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Division</th>
              )}
              <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {showDivision ? 'Department' : 'Division'}
              </th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Total</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-amber-600">Pending</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-emerald-600">Approved</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-red-600">Rejected</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500">Cancelled</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-violet-600">CO</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-sky-600">Hours</th>
              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-600">Regular</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={(expandableDivision ? 1 : 0) + (showDivision ? 2 : 1) + 8}
                  className="px-4 py-8 text-center text-sm text-slate-400"
                >
                  No records for this grouping
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isDivRow = expandableDivision && !showDivision;
                const expanded = isDivRow && expandedDiv === row.key;
                const deptRows =
                  expanded && allRecords ? buildOdDepartmentsForDivision(allRecords, row.name) : [];

                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40">
                      {expandableDivision && (
                        <td className="px-2 py-2 text-center">
                          {isDivRow && row.total > 0 ? (
                            <button
                              type="button"
                              onClick={() => setExpandedDiv(expanded ? null : row.key)}
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </td>
                      )}
                      {showDivision && (
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{row.division || '—'}</td>
                      )}
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{row.name}</td>
                      <td className="px-3 py-2 text-center font-black text-slate-800 dark:text-slate-100">{row.total}</td>
                      <td className="px-3 py-2 text-center text-amber-700 dark:text-amber-300">{row.pending}</td>
                      <td className="px-3 py-2 text-center text-emerald-700 dark:text-emerald-300">{row.approved}</td>
                      <td className="px-3 py-2 text-center text-red-700 dark:text-red-300">{row.rejected}</td>
                      <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">{row.cancelled}</td>
                      <td className="px-3 py-2 text-center text-violet-700 dark:text-violet-300">{row.co}</td>
                      <td className="px-3 py-2 text-center text-sky-700 dark:text-sky-300">{row.hours}</td>
                      <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">{row.regular}</td>
                    </tr>
                    {expanded &&
                      deptRows.map((d) => (
                        <tr
                          key={d.key}
                          className="border-b border-slate-100 bg-indigo-50/30 dark:border-slate-800 dark:bg-indigo-950/10"
                        >
                          <td className="px-2 py-2" />
                          <td className="px-3 py-2 pl-6 text-xs font-medium text-slate-700 dark:text-slate-300">{d.name}</td>
                          <td className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-200">{d.total}</td>
                          <td className="px-3 py-2 text-center text-amber-700">{d.pending}</td>
                          <td className="px-3 py-2 text-center text-emerald-700">{d.approved}</td>
                          <td className="px-3 py-2 text-center text-red-700">{d.rejected}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{d.cancelled}</td>
                          <td className="px-3 py-2 text-center text-violet-700">{d.co}</td>
                          <td className="px-3 py-2 text-center text-sky-700">{d.hours}</td>
                          <td className="px-3 py-2 text-center text-slate-700">{d.regular}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ODAuditAggregatesPanel({
  records,
  periodFrom,
  periodTo,
  loading,
}: {
  records: OdAuditStatsRecord[];
  periodFrom: string;
  periodTo: string;
  loading?: boolean;
}) {
  const statusBreakdown = useMemo(() => buildOdStatusBreakdown(records), [records]);
  const segmentBreakdown = useMemo(() => buildOdSegmentBreakdown(records), [records]);
  const divisionRows = useMemo(() => buildOdDivisionAggregates(records), [records]);
  const trend = useMemo(() => buildOdTrend(records, periodFrom, periodTo), [records, periodFrom, periodTo]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-sm text-slate-500">Building aggregates…</p>
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        No OD records in this period — adjust filters or date range.
      </div>
    );
  }

  const statusEntries = [
    { name: 'Pending', value: statusBreakdown.pending, color: STATUS_COLORS.pending },
    { name: 'Approved', value: statusBreakdown.approved, color: STATUS_COLORS.approved },
    { name: 'Rejected', value: statusBreakdown.rejected, color: STATUS_COLORS.rejected },
    { name: 'Cancelled', value: statusBreakdown.cancelled, color: STATUS_COLORS.cancelled },
    ...(statusBreakdown.other ? [{ name: 'Other', value: statusBreakdown.other, color: STATUS_COLORS.other }] : []),
  ];

  const segmentEntries = [
    { name: 'CO Eligible', value: segmentBreakdown.co, color: SEGMENT_COLORS.co },
    { name: 'Hour-Based', value: segmentBreakdown.hours, color: SEGMENT_COLORS.hours },
    { name: 'Regular', value: segmentBreakdown.regular, color: SEGMENT_COLORS.regular },
  ];

  return (
    <div className="space-y-5">
      <AggregateTable
        title="Division aggregates"
        subtitle="Expand a row to see department breakdown within that division"
        rows={divisionRows}
        expandableDivision
        allRecords={records}
      />

      {/* 100% distribution donuts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DonutDistribution title="Status mix" subtitle="100% breakdown of all ODs in period" entries={statusEntries} />
        <DonutDistribution title="Type mix" subtitle="CO eligible vs hour-based vs regular (100%)" entries={segmentEntries} />
      </div>

      {/* Trend + division 100% stacked */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">OD trend</h3>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            Applications by OD date {trend.length > 14 ? '(weekly)' : '(daily)'}
          </p>
          <div className="mt-3 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 22, right: 12, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }}>
                  <LabelList dataKey="total" position="top" offset={10} fontSize={9} fill="#6366f1" formatter={trendLabelValue} />
                </Line>
                <Line type="monotone" dataKey="pending" name="Pending" stroke={STATUS_COLORS.pending} strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="pending" position="bottom" offset={8} fontSize={8} fill={STATUS_COLORS.pending} formatter={trendLabelValue} />
                </Line>
                <Line type="monotone" dataKey="approved" name="Approved" stroke={STATUS_COLORS.approved} strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="approved" position="top" offset={4} fontSize={8} fill={STATUS_COLORS.approved} formatter={trendLabelValue} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Status share by division</h3>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            Each bar = 100% of that division&apos;s ODs (pending / approved / rejected / cancelled)
          </p>
          <div className="mt-3">
            <DivisionStatusShareChart rows={divisionRows} />
          </div>
        </div>
      </div>

      {/* Division bar comparison */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Division comparison</h3>
        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Total ODs and type split by division</p>
        <div className="mt-3 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={divisionRows.slice(0, 12)} margin={{ top: 8, right: 8, left: -8, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                angle={-30}
                textAnchor="end"
                height={56}
                interval={0}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="co" name="CO" stackId="type" fill={SEGMENT_COLORS.co} />
              <Bar dataKey="hours" name="Hours" stackId="type" fill={SEGMENT_COLORS.hours} />
              <Bar dataKey="regular" name="Regular" stackId="type" fill={SEGMENT_COLORS.regular} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
