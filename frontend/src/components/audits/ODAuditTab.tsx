'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { api, Department, Division } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import Spinner from '@/components/Spinner';
import {
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Calendar,
  Building2,
  Building,
  Filter,
  User,
  Gift,
  Timer,
  Briefcase,
  AlertCircle,
  MoreVertical,
  FileDown,
  Clock3,
  Ban,
  CheckCircle,
  Users,
  List,
  BarChart3,
  TrendingUp,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  buildLeaveODPayPeriodOptions,
  matchLeaveODPayPeriodSelectValue,
} from '@/lib/payPeriodRange';
import { exportOdAuditPdf } from '@/lib/odAuditPdf';
import {
  buildOdPendingByUser,
  buildOdSegmentBreakdown,
  buildOdStatusBreakdown,
  buildOdDivisionAggregates,
  buildOdTrend,
  odSegmentOf,
  type OdUserPendingRow,
  buildOdUserWise,
  type OdUserWiseRow,
  buildOdApproverAnalytics,
  type OdApproverAnalyticsRow,
  odStatusBucket,
} from '@/lib/odAuditStats';
import ODAuditAggregatesPanel from '@/components/audits/ODAuditAggregatesPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalStep {
  stepOrder?: number;
  role?: string;
  label?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'skipped';
  isCurrent?: boolean;
  actionByName?: string;
  actionByRole?: string;
  comments?: string;
  updatedAt?: string;
}

interface WorkflowHistoryEntry {
  step?: string;
  action?: string;
  actionByName?: string;
  actionByRole?: string;
  comments?: string;
  timestamp?: string;
}

interface ODRecord {
  _id: string;
  emp_no: string;
  employeeId?: {
    _id?: string;
    employee_name?: string;
    emp_no?: string;
    department_id?: { name?: string };
    division_id?: { name?: string };
    designation_id?: { name?: string };
  };
  odType?: string;
  odType_extended?: 'full_day' | 'half_day' | 'hours' | null;
  fromDate?: string;
  toDate?: string;
  numberOfDays?: number;
  isHalfDay?: boolean;
  halfDayType?: string | null;
  odStartTime?: string | null;
  odEndTime?: string | null;
  durationHours?: number | null;
  purpose?: string;
  placeVisited?: string;
  contactNumber?: string;
  status?: string;
  isCOEligible?: boolean;
  isAssigned?: boolean;
  assignedByName?: string;
  workflow?: {
    currentStepRole?: string | null;
    approvalChain?: ApprovalStep[];
    history?: WorkflowHistoryEntry[];
    isCompleted?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
  division_name?: string;
  division_id?: { name?: string } | string;
  department?: { name?: string } | string;
  department_id?: { name?: string } | string;
  department_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(d); }
}

function formatDateTime(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return String(d); }
}

/** Convert decimal hours (e.g. 0.333) → "H:MM" (e.g. "0:20") */
function fmtHours(h?: number | null): string {
  if (h == null) return '—';
  const totalMins = Math.round(h * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hrs}:${String(mins).padStart(2, '0')}`;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  reporting_manager_approved: { label: 'RM Approved', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  reporting_manager_rejected: { label: 'RM Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  hod_approved: { label: 'HOD Approved', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  hod_rejected: { label: 'HOD Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  manager_approved: { label: 'Mgr Approved', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  manager_rejected: { label: 'Mgr Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  hr_approved: { label: 'HR Approved', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  hr_rejected: { label: 'HR Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

function StatusBadge({ status }: { status?: string }) {
  const meta = STATUS_META[status || ''] ?? { label: status || '—', className: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function StepIcon({ status }: { status?: string }) {
  if (status === 'approved') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (status === 'rejected') return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
  if (status === 'skipped') return <span className="h-3.5 w-3.5 shrink-0 text-center text-[10px] text-slate-400">—</span>;
  return <Clock className="h-3.5 w-3.5 shrink-0 text-yellow-500" />;
}

// ─── Segment: one flavour's table ─────────────────────────────────────────────

type SegmentConfig = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  headerClass: string;       // thead bg
  accentClass: string;       // section border-left / badge
  rowHighlight: string;      // tr hover
  emptyMsg: string;
};

const SEGMENTS: SegmentConfig[] = [
  {
    id: 'co',
    label: 'CO Eligible ODs',
    description: 'On-duty requests applied on a holiday or week-off — employee may be entitled to a Compensatory Off.',
    icon: <Gift className="h-4 w-4" />,
    headerClass: 'bg-violet-50 dark:bg-violet-950/30',
    accentClass: 'border-l-4 border-violet-400',
    rowHighlight: 'hover:bg-violet-50/50 dark:hover:bg-violet-950/20',
    emptyMsg: 'No CO-eligible ODs in this range.',
  },
  {
    id: 'hours',
    label: 'Hour-Based ODs',
    description: 'ODs recorded for a specific time window (start time → end time) rather than a full or half day.',
    icon: <Timer className="h-4 w-4" />,
    headerClass: 'bg-sky-50 dark:bg-sky-950/30',
    accentClass: 'border-l-4 border-sky-400',
    rowHighlight: 'hover:bg-sky-50/50 dark:hover:bg-sky-950/20',
    emptyMsg: 'No hour-based ODs in this range.',
  },
  {
    id: 'regular',
    label: 'Regular ODs',
    description: 'Standard full-day or half-day on-duty requests.',
    icon: <Briefcase className="h-4 w-4" />,
    headerClass: 'bg-slate-50 dark:bg-slate-800/60',
    accentClass: 'border-l-4 border-slate-300 dark:border-slate-600',
    rowHighlight: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
    emptyMsg: 'No regular ODs in this range.',
  },
];

function segmentOf(od: ODRecord): 'co' | 'hours' | 'regular' {
  return odSegmentOf(od);
}

// ─── Pending by user table (second OD Audit sub-tab) ─────────────────────────

function PendingByUserPanel({
  rows,
  loading,
}: {
  rows: OdUserPendingRow[];
  loading?: boolean;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
        <p className="text-sm text-slate-500">Loading pending breakdown…</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pending ODs by Employee</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {rows.length} employee{rows.length !== 1 ? 's' : ''} with in-workflow OD requests — CO, hour-based &amp; regular counts for the selected period
        </p>
      </div>

      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No pending OD requests for the selected filters.</p>
        ) : (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-amber-50/80 dark:border-slate-700 dark:bg-amber-950/20">
                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Employee</th>
                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Department</th>
                <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-violet-500">CO</th>
                <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-sky-500">Hours</th>
                <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500">Regular</th>
                <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Total</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedKey === row.key;
                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{row.empName}</div>
                        <div className="text-[10px] text-slate-400">{row.empNo}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{row.department}</td>
                      <td className="px-3 py-2.5 text-center">
                        {row.co > 0 ? (
                          <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{row.co}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {row.hours > 0 ? (
                          <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{row.hours}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {row.regular > 0 ? (
                          <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{row.regular}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm font-black text-amber-700 dark:text-amber-300">{row.total}</td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedKey(expanded ? null : row.key)}
                          className="rounded-md px-2 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                          {expanded ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="space-y-2">
                            {row.records.map((od) => (
                              <div
                                key={od._id}
                                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                              >
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{od.odType || '—'}</span>
                                <span className="text-slate-500">{formatDate(od.fromDate)}{od.toDate && od.fromDate !== od.toDate ? ` → ${formatDate(od.toDate)}` : ''}</span>
                                {od.isCOEligible && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">CO</span>}
                                {od.odType_extended === 'hours' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">Hours</span>}
                                <StatusBadge status={od.status} />
                                <span className="max-w-[200px] truncate text-slate-400">{od.purpose}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {/* Overall Totals Footer */}
            {rows.length > 0 && (() => {
              const tot = rows.reduce(
                (acc, r) => ({
                  co: acc.co + r.co,
                  hours: acc.hours + r.hours,
                  regular: acc.regular + r.regular,
                  total: acc.total + r.total,
                }),
                { co: 0, hours: 0, regular: 0, total: 0 }
              );
              return (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100/80 dark:bg-slate-800/60 font-bold">
                    <td colSpan={2} className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      Totals
                      <span className="ml-2 rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:text-slate-200">{rows.length} emp</span>
                    </td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-violet-700 dark:text-violet-300">{tot.co || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-sky-700 dark:text-sky-300">{tot.hours || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">{tot.regular || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20">{tot.total || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5" />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        )}
      </div>
    </div>
  );
}

// ─── User wise OD table (New sub-tab) ─────────────────────────────────────────

function UserWiseODPanel({
  rows,
  loading,
}: {
  rows: OdUserWiseRow[];
  loading?: boolean;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
        <p className="text-sm text-slate-500">Loading user-wise breakdown…</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">User wise OD Summary</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {rows.length} employee{rows.length !== 1 ? 's' : ''} with OD requests — split by status (Approved, Rejected, Pending) and type for the selected period
        </p>
      </div>

      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No OD requests found for the selected filters.</p>
        ) : (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              {/* Main Headers */}
              <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/30">
                <th rowSpan={2} className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Employee</th>
                <th rowSpan={2} className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Department</th>
                <th colSpan={4} className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Approved</th>
                <th colSpan={4} className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">Rejected</th>
                <th colSpan={4} className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-500">Pending</th>
                <th rowSpan={2} className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 align-middle">Total</th>
                <th rowSpan={2} className="w-10 px-2 py-2 align-middle" />
              </tr>
              {/* Sub Headers */}
              <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/20">
                {/* Approved Sub-columns */}
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-violet-500 border-r border-slate-100 dark:border-slate-800">CO</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-sky-500 border-r border-slate-100 dark:border-slate-800">Hours</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 dark:border-slate-800">Reg</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 border-r border-slate-200 dark:border-slate-700">Tot</th>

                {/* Rejected Sub-columns */}
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-violet-500 border-r border-slate-100 dark:border-slate-800">CO</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-sky-500 border-r border-slate-100 dark:border-slate-800">Hours</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 dark:border-slate-800">Reg</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-red-700 dark:text-red-300 border-r border-slate-200 dark:border-slate-700">Tot</th>

                {/* Pending Sub-columns */}
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-violet-500 border-r border-slate-100 dark:border-slate-800">CO</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-sky-500 border-r border-slate-100 dark:border-slate-800">Hours</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 dark:border-slate-800">Reg</th>
                <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 border-r border-slate-200 dark:border-slate-700">Tot</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedKey === row.key;
                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      {/* Employee details */}
                      <td className="px-3 py-2.5 border-r border-slate-100 dark:border-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-white">{row.empName}</div>
                        <div className="text-[10px] text-slate-400">{row.empNo}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">{row.department}</td>

                      {/* Approved counts */}
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.approved.co > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{row.approved.co}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.approved.hours > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{row.approved.hours}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.approved.regular > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{row.approved.regular}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10 border-r border-slate-200 dark:border-slate-700">
                        {row.approved.total > 0 ? row.approved.total : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                      </td>

                      {/* Rejected counts */}
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.rejected.co > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{row.rejected.co}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.rejected.hours > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{row.rejected.hours}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.rejected.regular > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{row.rejected.regular}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-red-600 dark:text-red-400 bg-red-50/20 dark:bg-red-950/10 border-r border-slate-200 dark:border-slate-700">
                        {row.rejected.total > 0 ? row.rejected.total : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                      </td>

                      {/* Pending counts */}
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.pending.co > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{row.pending.co}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.pending.hours > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{row.pending.hours}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                        {row.pending.regular > 0 ? (
                          <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{row.pending.regular}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-amber-600 dark:text-amber-500 bg-amber-50/20 dark:bg-amber-950/10 border-r border-slate-200 dark:border-slate-700">
                        {row.pending.total > 0 ? row.pending.total : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                      </td>

                      {/* Overall Total count */}
                      <td className="px-2 py-2.5 text-center font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50/30 dark:bg-indigo-950/15 border-r border-slate-200 dark:border-slate-700">
                        {row.total > 0 ? row.total : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                      </td>

                      {/* Expand details button */}
                      <td className="px-2 py-2.5 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => setExpandedKey(expanded ? null : row.key)}
                          className="rounded-md px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                        >
                          {expanded ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded details */}
                    {expanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30">
                        <td colSpan={16} className="px-4 py-3">
                          <div className="space-y-2">
                            {row.records.map((od) => (
                              <div
                                key={od._id}
                                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                              >
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{od.odType || '—'}</span>
                                <span className="text-slate-500">{formatDate(od.fromDate)}{od.toDate && od.fromDate !== od.toDate ? ` → ${formatDate(od.toDate)}` : ''}</span>
                                {od.isCOEligible && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">CO</span>}
                                {od.odType_extended === 'hours' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">Hours</span>}
                                <StatusBadge status={od.status} />
                                <span className="max-w-[200px] truncate text-slate-400">{od.purpose}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {/* Overall Totals Footer */}
            {rows.length > 0 && (() => {
              const tot = rows.reduce(
                (acc, r) => ({
                  appCo: acc.appCo + r.approved.co,
                  appHours: acc.appHours + r.approved.hours,
                  appReg: acc.appReg + r.approved.regular,
                  appTot: acc.appTot + r.approved.total,
                  rejCo: acc.rejCo + r.rejected.co,
                  rejHours: acc.rejHours + r.rejected.hours,
                  rejReg: acc.rejReg + r.rejected.regular,
                  rejTot: acc.rejTot + r.rejected.total,
                  penCo: acc.penCo + r.pending.co,
                  penHours: acc.penHours + r.pending.hours,
                  penReg: acc.penReg + r.pending.regular,
                  penTot: acc.penTot + r.pending.total,
                }),
                { appCo: 0, appHours: 0, appReg: 0, appTot: 0, rejCo: 0, rejHours: 0, rejReg: 0, rejTot: 0, penCo: 0, penHours: 0, penReg: 0, penTot: 0 }
              );
              const grandTotal = tot.appTot + tot.rejTot + tot.penTot;
              return (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100/80 dark:bg-slate-800/60 font-bold">
                    <td colSpan={2} className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      Totals
                      <span className="ml-2 rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:text-slate-200">{rows.length} emp</span>
                      <span className="ml-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">Grand Total: {grandTotal}</span>
                    </td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-violet-700 dark:text-violet-300">{tot.appCo || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-sky-700 dark:text-sky-300">{tot.appHours || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">{tot.appReg || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">{tot.appTot || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-violet-700 dark:text-violet-300">{tot.rejCo || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-sky-700 dark:text-sky-300">{tot.rejHours || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">{tot.rejReg || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-300 bg-red-50/40 dark:bg-red-950/20">{tot.rejTot || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-violet-700 dark:text-violet-300">{tot.penCo || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-sky-700 dark:text-sky-300">{tot.penHours || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">{tot.penReg || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20">{tot.penTot || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20 font-black">
                      {grandTotal || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                    </td>
                    <td className="px-2 py-2.5" />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Approver Analytics table (New sub-tab) ───────────────────────────────────

function ApproverAnalyticsPanel({
  rows,
  loading,
}: {
  rows: import('@/lib/odAuditStats').OdApproverAnalyticsRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
        <p className="text-sm text-slate-500">Loading approver analytics…</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Approver Analytics</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Flow of OD stages across {rows.length} approvers in their respective scopes
        </p>
      </div>

      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No approvers or OD records found for the selected filters.</p>
        ) : (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/30">
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Approver</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Department</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 align-middle">Total Scope ODs</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Pending Before Stage</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-500 align-middle">Pending At Stage</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 align-middle">Approved By Them</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-500 align-middle">Rejected By Them</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Total Pending (User Scope)</th>
                <th className="border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 align-middle">Total Approved (User Scope)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2.5 border-r border-slate-100 dark:border-slate-800">
                    <div className="font-semibold text-slate-900 dark:text-white">{row.approverName}</div>
                    <div className="text-[10px] uppercase text-slate-400">{row.approverRole.replace('_', ' ')}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">{row.department}</td>

                  <td className="px-2 py-2.5 text-center font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50/30 dark:bg-indigo-950/15 border-r border-slate-200 dark:border-slate-700">
                    {row.scopeTotal > 0 ? row.scopeTotal : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                  </td>

                  <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                    {row.pendingBeforeStage > 0 ? (
                      <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{row.pendingBeforeStage}</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-center font-bold text-amber-600 dark:text-amber-500 bg-amber-50/20 dark:bg-amber-950/10 border-r border-slate-200 dark:border-slate-700">
                    {row.pendingAtStage > 0 ? row.pendingAtStage : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                  </td>

                  <td className="px-2 py-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10 border-r border-slate-200 dark:border-slate-700">
                    {row.approvedByThem > 0 ? row.approvedByThem : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                  </td>

                  <td className="px-2 py-2.5 text-center font-bold text-rose-600 dark:text-rose-500 bg-rose-50/20 dark:bg-rose-950/10 border-r border-slate-200 dark:border-slate-700">
                    {row.rejectedByThem > 0 ? row.rejectedByThem : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                  </td>

                  <td className="px-2 py-2.5 text-center font-bold text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">
                    {row.totalPending > 0 ? row.totalPending : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                  </td>

                  <td className="px-2 py-2.5 text-center font-bold text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">
                    {row.totalApproved > 0 ? row.totalApproved : <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Overall Totals Footer */}
            {rows.length > 0 && (() => {
              const tot = rows.reduce(
                (acc, r) => ({
                  scopeTot: acc.scopeTot + r.scopeTotal,
                  penBef: acc.penBef + r.pendingBeforeStage,
                  penAt: acc.penAt + r.pendingAtStage,
                  appBy: acc.appBy + r.approvedByThem,
                  rejBy: acc.rejBy + r.rejectedByThem,
                  totPen: acc.totPen + r.totalPending,
                  totApp: acc.totApp + r.totalApproved,
                }),
                { scopeTot: 0, penBef: 0, penAt: 0, appBy: 0, rejBy: 0, totPen: 0, totApp: 0 }
              );
              return (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100/80 dark:bg-slate-800/60 font-bold">
                    <td colSpan={2} className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      Totals
                      <span className="ml-2 rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:text-slate-200">{rows.length} approvers</span>
                    </td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20">{tot.scopeTot || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">{tot.penBef || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20">{tot.penAt || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">{tot.appBy || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20">{tot.rejBy || <span className="text-slate-300 dark:text-slate-700 font-normal">—</span>}</td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-200/40 dark:bg-slate-700/20"><span className="text-slate-300 dark:text-slate-700 font-normal">—</span></td>
                    <td className="px-2 py-2.5 text-center border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-200/40 dark:bg-slate-700/20"><span className="text-slate-300 dark:text-slate-700 font-normal">—</span></td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        )}
      </div>
    </div>
  );
}

const OD_VIEW_TABS = [
  { id: 'records', label: 'OD Records', icon: List, activeBg: 'bg-emerald-600' },
  { id: 'aggregates', label: 'Aggregates', icon: BarChart3, activeBg: 'bg-emerald-600' },
  { id: 'pending-by-user', label: 'Pending by User', icon: Users, activeBg: 'bg-emerald-600' },
  { id: 'user-wise', label: 'User wise OD', icon: User, activeBg: 'bg-emerald-600' },
  { id: 'approver-analytics', label: 'Approver Analytics', icon: TrendingUp, activeBg: 'bg-emerald-600' },
] as const;

type OdViewTabId = (typeof OD_VIEW_TABS)[number]['id'];

// ─── Expanded detail panel ────────────────────────────────────────────────────

function ExpandedDetail({ od, colSpan }: { od: ODRecord; colSpan: number }) {
  const emp = od.employeeId;
  const division = emp?.division_id?.name || '—';
  const chain = od.workflow?.approvalChain || [];
  const history = od.workflow?.history || [];

  return (
    <tr className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/80">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="grid gap-5 md:grid-cols-3">

          {/* ── OD details ── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <h5 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">OD Details</h5>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">OD Type</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{od.odType || '—'}</dd>
              </div>
              {od.odType_extended && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">Mode</dt>
                  <dd className="font-semibold capitalize text-slate-800 dark:text-slate-200">{od.odType_extended.replace('_', ' ')}</dd>
                </div>
              )}
              {od.odType_extended === 'hours' && od.odStartTime && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">Time window</dt>
                  <dd className="font-semibold text-sky-700 dark:text-sky-300">{od.odStartTime} – {od.odEndTime} ({fmtHours(od.durationHours)})</dd>
                </div>
              )}
              {od.isHalfDay && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">Half day</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-200">{od.halfDayType === 'first_half' ? '1st half' : '2nd half'}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Duration</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">
                  {od.odType_extended === 'hours' ? fmtHours(od.durationHours) : `${od.numberOfDays} day${(od.numberOfDays ?? 1) !== 1 ? 's' : ''}`}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">CO Eligible</dt>
                <dd className={`font-bold ${od.isCOEligible ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}>
                  {od.isCOEligible ? 'Yes' : 'No'}
                </dd>
              </div>
              {od.isAssigned && od.assignedByName && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">Assigned by</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-200">{od.assignedByName}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Division</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{division}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Contact</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{od.contactNumber || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Applied</dt>
                <dd className="text-slate-600 dark:text-slate-300">{formatDateTime(od.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Updated</dt>
                <dd className="text-slate-600 dark:text-slate-300">{formatDateTime(od.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          {/* ── Approval chain ── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <h5 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Approval Chain</h5>
            {chain.length === 0 ? (
              <p className="text-[11px] text-slate-400">No approval chain configured.</p>
            ) : (
              <div className="space-y-2">
                {chain.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[11px] ${step.status === 'approved' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                      : step.status === 'rejected' ? 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20'
                        : step.isCurrent ? 'border-yellow-300 bg-yellow-50/80 dark:border-yellow-700 dark:bg-yellow-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50'
                      }`}
                  >
                    <StepIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {step.label || step.role}
                        {step.isCurrent && (
                          <span className="ml-2 rounded-sm bg-yellow-200 px-1 text-[9px] font-black uppercase text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-300">Awaiting</span>
                        )}
                      </div>
                      {step.actionByName && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          <span className="capitalize">{step.status}</span> by {step.actionByName}
                          {step.actionByRole && ` (${step.actionByRole})`}
                          {step.updatedAt && ` · ${formatDateTime(step.updatedAt)}`}
                        </div>
                      )}
                      {step.comments && (
                        <div className="mt-0.5 italic text-[10px] text-slate-500">"{step.comments}"</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Workflow history ── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <h5 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Workflow History</h5>
            {history.length === 0 ? (
              <p className="text-[11px] text-slate-400">No history available.</p>
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {history.map((h, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold capitalize text-slate-800 dark:text-slate-200">{h.action}</span>
                      {h.step && <span className="text-slate-400">· {h.step}</span>}
                    </div>
                    {h.actionByName && (
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        by {h.actionByName}{h.actionByRole && ` (${h.actionByRole})`}
                      </div>
                    )}
                    {h.comments && <div className="mt-0.5 italic text-[10px] text-slate-400">"{h.comments}"</div>}
                    {h.timestamp && <div className="mt-0.5 text-[10px] text-slate-400">{formatDateTime(h.timestamp)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Single OD row ────────────────────────────────────────────────────────────

function ODRow({ od, seg, colSpan }: { od: ODRecord; seg: SegmentConfig; colSpan: number }) {
  const [expanded, setExpanded] = useState(false);

  const emp = od.employeeId;
  const empName = emp?.employee_name || od.emp_no;
  const empNo = emp?.emp_no || od.emp_no;
  const dept = emp?.department_id?.name || '—';
  const desig = emp?.designation_id?.name || '';
  const chain = od.workflow?.approvalChain || [];

  const durationLabel = useMemo(() => {
    if (od.odType_extended === 'hours' && od.durationHours != null) return fmtHours(od.durationHours);
    if (od.isHalfDay) return `½ day (${od.halfDayType === 'first_half' ? '1st' : '2nd'})`;
    return `${od.numberOfDays ?? '—'} day${(od.numberOfDays ?? 1) !== 1 ? 's' : ''}`;
  }, [od]);

  return (
    <>
      <tr className={`border-b border-slate-100 dark:border-slate-800 ${seg.rowHighlight} ${seg.accentClass}`}>
        {/* Employee — circular avatar + name + emp_no */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${seg.id === 'co' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200'
              : seg.id === 'hours' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
              }`}>
              {initials(empName)}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-slate-900 dark:text-white leading-tight truncate max-w-[130px]">{empName}</div>
              <div className="text-[10px] text-slate-400">{empNo}</div>
              <div className="mt-0.5 text-[10px] text-blue-500 dark:text-blue-400 truncate max-w-[130px]">{dept}{desig ? ` · ${desig}` : ''}</div>
            </div>
          </div>
        </td>

        {/* OD Type + special badges */}
        <td className="px-3 py-2.5">
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{od.odType || '—'}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {od.isCOEligible && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                <Gift className="h-2.5 w-2.5" /> CO
              </span>
            )}
            {od.odType_extended === 'hours' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                <Timer className="h-2.5 w-2.5" /> Hours
              </span>
            )}
            {od.isHalfDay && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                ½ Day
              </span>
            )}
            {od.isAssigned && (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Assigned
              </span>
            )}
          </div>
        </td>

        {/* Dates / time — date bold + green H:MM badge inline for hour-type */}
        <td className="whitespace-nowrap px-3 py-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
              {formatDate(od.fromDate)}
            </span>
            {od.toDate && od.fromDate !== od.toDate && (
              <span className="text-[10px] text-slate-400">→ {formatDate(od.toDate)}</span>
            )}
            {od.odType_extended === 'hours' && od.odStartTime && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {fmtHours(od.durationHours)}
              </span>
            )}
          </div>
          {od.odType_extended === 'hours' && od.odStartTime ? (
            <div className="mt-0.5 text-[9px] font-medium text-slate-400 tabular-nums">
              {od.odStartTime} – {od.odEndTime}
            </div>
          ) : (
            <div className="mt-0.5 text-[10px] text-slate-400">{durationLabel}</div>
          )}
        </td>

        {/* Place */}
        <td className="max-w-[140px] px-3 py-2.5">
          <div className="flex items-start gap-1 text-[11px] text-slate-600 dark:text-slate-400">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            <span className="line-clamp-2">{od.placeVisited || '—'}</span>
          </div>
        </td>

        {/* Purpose */}
        <td className="max-w-[180px] px-3 py-2.5 text-[11px] text-slate-600 dark:text-slate-400">
          <p className="line-clamp-2">{od.purpose || '—'}</p>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <StatusBadge status={od.status} />
        </td>

        {/* Approval chain — full-width colored badge per step: ✓ HOD Approval – NAME */}
        <td className="px-3 py-2.5 min-w-[160px]">
          <div className="flex flex-col gap-0.5">
            {chain.map((step, i) => {
              const roleLabel = step.label || step.role || '—';
              const isApproved = step.status === 'approved';
              const isRejected = step.status === 'rejected';
              const isCurrent = step.isCurrent;
              return (
                <div
                  key={i}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold ${isApproved ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : isRejected ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                      : isCurrent ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}
                >
                  {isApproved ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                    : isRejected ? <XCircle className="h-3 w-3 shrink-0" />
                      : isCurrent ? <Clock className="h-3 w-3 shrink-0" />
                        : <Clock className="h-3 w-3 shrink-0 opacity-40" />}
                  <span className="truncate">
                    {roleLabel}
                    {step.actionByName ? ` – ${step.actionByName}` : ''}
                  </span>
                </div>
              );
            })}
            {chain.length === 0 && <span className="text-[10px] text-slate-400">—</span>}
          </div>
        </td>

        {/* Applied */}
        <td className="whitespace-nowrap px-3 py-2.5 text-[10px] text-slate-400">{formatDate(od.createdAt)}</td>

        {/* Three-dot menu / expand toggle */}
        <td className="px-2 py-2.5 text-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            title={expanded ? 'Hide details' : 'View details'}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {expanded && <ExpandedDetail od={od} colSpan={colSpan} />}
    </>
  );
}

// ─── Segment block ────────────────────────────────────────────────────────────

function SegmentBlock({
  seg,
  ods,
  total,
  page,
  loading,
  onPageChange,
}: {
  seg: SegmentConfig;
  ods: ODRecord[];
  total: number;
  page: number;
  loading: boolean;
  onPageChange: (pg: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const COL_COUNT = 9;
  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${seg.id === 'co' ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
            : seg.id === 'hours' ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}>
            {seg.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{seg.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${seg.id === 'co' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                : seg.id === 'hours' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                {total}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{seg.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          {collapsed
            ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            : <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {loading && ods.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-6 py-5 text-sm text-slate-400 dark:text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading {seg.label}…
            </div>
          ) : ods.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-5 text-sm text-slate-400 dark:text-slate-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {seg.emptyMsg}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className={`border-b border-slate-200 dark:border-slate-700 ${seg.headerClass}`}>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Employee</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">OD Type</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Dates / Duration</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Place Visited</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Purpose</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Approval Chain</th>
                    <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Applied</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ods.map((od) => (
                    <ODRow key={od._id} od={od} seg={seg} colSpan={COL_COUNT} />
                  ))}
                </tbody>
              </table>

              {/* Segment specific pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <span className="text-xs text-slate-500">Page {page} of {totalPages} · {total} records</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">← Prev</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pg = Math.max(1, page - 2) + i;
                      if (pg > totalPages) return null;
                      return (
                        <button key={pg} type="button" onClick={() => onPageChange(pg)} disabled={loading}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${pg === page ? 'bg-emerald-600 border-emerald-600 text-white' : 'hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                          {pg}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter bar options ───────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { id: '', name: 'All statuses' },
  { id: 'pending', name: 'Pending' },
  { id: 'approved', name: 'Approved' },
  { id: 'rejected', name: 'Rejected' },
  { id: 'cancelled', name: 'Cancelled' },
  { id: 'hr_approved', name: 'HR Approved' },
  { id: 'hod_approved', name: 'HOD Approved' },
  { id: 'reporting_manager_approved', name: 'RM Approved' },
];

// ─── Main component ───────────────────────────────────────────────────────────

function getDefaultDateRange(startDay: number = 1) {
  const now = new Date();
  const today = now.getDate();
  const startDate = new Date(now);
  if (startDay > 1 && today < startDay) {
    startDate.setMonth(startDate.getMonth() - 1);
  }
  startDate.setDate(startDay);
  const format = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: format(startDate), to: format(now) };
}

export default function ODAuditTab({ active = true }: { active?: boolean } = {}) {
  const [payCycleStartDay, setPayCycleStartDay] = useState(1);
  const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState(() => getDefaultDateRange(1));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [statsOds, setStatsOds] = useState<ODRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [approvers, setApprovers] = useState<any[]>([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<OdViewTabId>('records');
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // CO Segment state
  const [coOds, setCoOds] = useState<ODRecord[]>([]);
  const [coTotal, setCoTotal] = useState(0);
  const [coPage, setCoPage] = useState(1);
  const [loadingCo, setLoadingCo] = useState(false);

  // Hours Segment state
  const [hoursOds, setHoursOds] = useState<ODRecord[]>([]);
  const [hoursTotal, setHoursTotal] = useState(0);
  const [hoursPage, setHoursPage] = useState(1);
  const [loadingHours, setLoadingHours] = useState(false);

  // Regular Segment state
  const [regularOds, setRegularOds] = useState<ODRecord[]>([]);
  const [regularTotal, setRegularTotal] = useState(0);
  const [regularPage, setRegularPage] = useState(1);
  const [loadingRegular, setLoadingRegular] = useState(false);

  const limit = 50;

  const payPeriodOptions = useMemo(
    () =>
      buildLeaveODPayPeriodOptions({
        payrollCycleStartDay: payCycleStartDay,
        payrollCycleEndDay: payCycleEndDay,
        monthsBack: 18,
        getDefaultRange: () => getDefaultDateRange(payCycleStartDay),
        defaultLabel: 'Current period (default)',
      }),
    [payCycleStartDay, payCycleEndDay]
  );

  const payPeriodSelectValue = useMemo(
    () =>
      matchLeaveODPayPeriodSelectValue(dateRange, payPeriodOptions, () =>
        getDefaultDateRange(payCycleStartDay)
      ),
    [dateRange.from, dateRange.to, payPeriodOptions, payCycleStartDay]
  );

  const filteredDepartments = useMemo(() => {
    if (!divisionIds.length) return departments;
    return departments.filter((d) => {
      const raw = (d as Department & { division_id?: string | { _id?: string } }).division_id;
      const divId = typeof raw === 'object' && raw ? String(raw._id || '') : String(raw || '');
      return divisionIds.includes(divId);
    });
  }, [departments, divisionIds]);

  useEffect(() => {
    (async () => {
      try {
        setLoadingApprovers(true);
        const [divRes, deptRes, startRes, endRes, usersRes] = await Promise.all([
          api.getDivisions(),
          api.getDepartments(),
          api.getSetting('payroll_cycle_start_day'),
          api.getSetting('payroll_cycle_end_day'),
          api.getUsers({ limit: 1000, isActive: true }),
        ]);
        if (divRes.success) setDivisions(divRes.data || []);
        if (deptRes.success) setDepartments(deptRes.data || []);
        if (usersRes.success && Array.isArray(usersRes.data?.users || usersRes.data)) {
          const userList = usersRes.data?.users || usersRes.data;
          setApprovers(userList.filter((u: any) => u.role !== 'employee'));
        }
        if (startRes?.data?.value) {
          const startDay = parseInt(startRes.data.value, 10);
          if (!isNaN(startDay) && startDay >= 1 && startDay <= 31) {
            setPayCycleStartDay(startDay);
            setDateRange(getDefaultDateRange(startDay));
          }
        }
        if (endRes?.data?.value) {
          const endDay = parseInt(endRes.data.value, 10);
          if (!isNaN(endDay) && endDay >= 1 && endDay <= 31) {
            setPayCycleEndDay(endDay);
          }
        }
      } catch (err) { console.error(err); }
      finally {
        setLoadingFilters(false);
        setSettingsLoaded(true);
        setLoadingApprovers(false);
      }
    })();
  }, []);

  const loadSegmentODs = useCallback(async (segment: 'co' | 'hours' | 'regular', pg = 1) => {
    const filters = {
      fromDate: dateRange.from || undefined,
      toDate: dateRange.to || undefined,
      search: search.trim() || undefined,
      status: status || undefined,
      division: divisionIds.length ? divisionIds : undefined,
      department: departmentIds.length ? departmentIds : undefined,
      segment,
    };

    try {
      if (segment === 'co') setLoadingCo(true);
      else if (segment === 'hours') setLoadingHours(true);
      else setLoadingRegular(true);

      const res = await api.getODs({ ...filters, page: pg, limit });
      if (res.success) {
        if (segment === 'co') {
          setCoOds(res.data || []);
          setCoTotal(res.total || 0);
          setCoPage(pg);
        } else if (segment === 'hours') {
          setHoursOds(res.data || []);
          setHoursTotal(res.total || 0);
          setHoursPage(pg);
        } else {
          setRegularOds(res.data || []);
          setRegularTotal(res.total || 0);
          setRegularPage(pg);
        }
      } else {
        toast.error(res.message || `Failed to load ${segment} records`);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to load ${segment} records`);
    } finally {
      if (segment === 'co') setLoadingCo(false);
      else if (segment === 'hours') setLoadingHours(false);
      else setLoadingRegular(false);
    }
  }, [dateRange.from, dateRange.to, search, status, divisionIds, departmentIds]);

  const loadAll = useCallback(async () => {
    const filters = {
      fromDate: dateRange.from || undefined,
      toDate: dateRange.to || undefined,
      search: search.trim() || undefined,
      status: status || undefined,
      division: divisionIds.length ? divisionIds : undefined,
      department: departmentIds.length ? departmentIds : undefined,
    };

    // Load first page for all segments
    Promise.all([
      loadSegmentODs('co', 1),
      loadSegmentODs('hours', 1),
      loadSegmentODs('regular', 1),
    ]);

    // Load full dataset for summary and PDF export
    setLoadingStats(true);
    try {
      const res = await api.getODs({ ...filters, page: 1, limit: 10000 });
      if (res.success) {
        setStatsOds(res.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }, [dateRange.from, dateRange.to, search, status, divisionIds, departmentIds, loadSegmentODs]);

  useEffect(() => {
    if (!loadingFilters && settingsLoaded) loadAll();
  }, [loadAll, loadingFilters, settingsLoaded]);

  const handleExportPdf = async () => {
    const toastId = toast.loading('Generating PDF…');
    setExportingPdf(true);
    try {
      const exportLimit = Math.max(statsOds.length, 5000);
      const res = await api.getODs({
        fromDate: dateRange.from || undefined,
        toDate: dateRange.to || undefined,
        search: search.trim() || undefined,
        status: status || undefined,
        division: divisionIds.length ? divisionIds : undefined,
        department: departmentIds.length ? departmentIds : undefined,
        page: 1,
        limit: exportLimit,
      });
      if (!res.success) throw new Error(res.message || 'Failed to load OD records');
      const allOds: ODRecord[] = res.data || [];
      const statusBreakdown = buildOdStatusBreakdown(allOds);
      const segmentBreakdown = buildOdSegmentBreakdown(allOds);
      const pendingByUser = buildOdPendingByUser(allOds);
      const divisionAggregates = buildOdDivisionAggregates(allOds);
      const trend = buildOdTrend(allOds, dateRange.from, dateRange.to);
      const statusLabel = STATUS_OPTIONS.find((s) => s.id === status)?.name;
      exportOdAuditPdf(
        {
          period: { from: dateRange.from, to: dateRange.to },
          total: res.total ?? allOds.length,
          coCount: segmentBreakdown.co,
          hoursCount: segmentBreakdown.hours,
          regularCount: segmentBreakdown.regular,
          statusBreakdown,
          pendingByUser,
          divisionAggregates,
          trend,
          statusLabel: status ? statusLabel : undefined,
        },
        allOds
      );
      toast.success('PDF downloaded', { id: toastId });
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF', { id: toastId });
    } finally {
      setExportingPdf(false);
    }
  };

  // Full-dataset stats for breakdown cards & modal
  const statusBreakdown = useMemo(() => buildOdStatusBreakdown(statsOds), [statsOds]);
  const pendingByUser = useMemo(() => buildOdPendingByUser(statsOds), [statsOds]);
  const userWiseRows = useMemo(() => buildOdUserWise(statsOds), [statsOds]);
  const approverAnalyticsRows = useMemo(() => buildOdApproverAnalytics(statsOds, approvers), [statsOds, approvers]);

  if (loadingFilters) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner /></div>;
  }

  const filtersBar = (
    <div className="flex flex-nowrap w-max min-w-full items-center gap-2 pb-1.5">
      <div className="relative flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <select
          aria-label="Pay period"
          value={payPeriodSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') return;
            if (v === '__default__') {
              setDateRange(getDefaultDateRange(payCycleStartDay));
              return;
            }
            const opt = payPeriodOptions.find((o) => o.value === v);
            if (opt) setDateRange({ from: opt.range.from, to: opt.range.to });
          }}
          className="appearance-none bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px] max-w-[140px] cursor-pointer pr-8 w-full"
        >
          <option value="__custom__" className="bg-white dark:bg-slate-900">Custom range…</option>
          {payPeriodOptions.map((o) => (
            <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-slate-400" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
          className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[90px] sm:min-w-[100px]"
        />
        <span className="text-slate-400 text-xs">→</span>
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
          className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[90px] sm:min-w-[100px]"
        />
      </div>
      <div className="relative flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="appearance-none bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[90px] max-w-[110px] cursor-pointer pr-8 w-full">
          {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900">{s.name}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-slate-400" />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <MultiSelect options={divisions.map((d) => ({ id: d._id, name: d.name }))} selectedIds={divisionIds}
          onChange={setDivisionIds} placeholder="All Divisions" className="min-w-[100px] max-w-[130px]" pill />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <MultiSelect options={filteredDepartments.map((d) => ({ id: d._id, name: d.name }))} selectedIds={departmentIds}
          onChange={setDepartmentIds} placeholder="All Departments" className="min-w-[100px] max-w-[130px]" pill />
      </div>
      <div className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all duration-300 hover:border-emerald-300 ${searchFocused ? 'w-[200px] sm:w-[260px]' : 'w-[120px]'}`}>
        <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && loadAll()} placeholder="Search name or emp #"
          className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none w-full" />
      </div>
      <button type="button" onClick={() => loadAll()} disabled={loadingCo || loadingHours || loadingRegular}
        className="flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50 transition-all">
        {loadingCo || loadingHours || loadingRegular ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {loadingCo || loadingHours || loadingRegular ? 'Loading…' : 'Refresh'}
      </button>
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={loadingCo || loadingHours || loadingRegular || exportingPdf || (coTotal + hoursTotal + regularTotal) === 0}
        title="Export filtered OD records as PDF"
        className="flex shrink-0 items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 shadow-sm text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
      >
        {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
        {exportingPdf ? 'Exporting…' : 'Export PDF'}
      </button>
    </div>
  );

  const portalTarget = active && mounted ? document.getElementById('audit-header-filters') : null;

  return (
    <div className="w-full max-w-full space-y-5">
      {portalTarget ? createPortal(filtersBar, portalTarget) : filtersBar}

      {/* ── Status breakdown ── */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-400 dark:bg-slate-800">
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status breakdown</h2>
          {loadingStats && (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Updating totals…
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Pending */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 border-b-[3px] border-b-amber-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
              <Clock3 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 leading-tight">Pending</p>
              {loadingStats ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {statusBreakdown.pending}
                </p>
              )}
            </div>
          </div>
          {/* Approved */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 border-b-[3px] border-b-emerald-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 leading-tight">Approved</p>
              {loadingStats ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {statusBreakdown.approved}
                </p>
              )}
            </div>
          </div>
          {/* Rejected */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 border-b-[3px] border-b-red-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <XCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 leading-tight">Rejected</p>
              {loadingStats ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {statusBreakdown.rejected}
                </p>
              )}
            </div>
          </div>
          {/* Cancelled */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 border-b-[3px] border-b-zinc-400 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800/40 dark:text-zinc-400">
              <Ban className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">Cancelled</p>
              {loadingStats ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {statusBreakdown.cancelled}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Segment summary ── */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">By type</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Total */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0 overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-indigo-500/10 to-transparent pointer-events-none dark:from-indigo-500/5" />
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">Total ODs</p>
              {loadingCo || loadingHours || loadingRegular ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {coTotal + hoursTotal + regularTotal}
                </p>
              )}
            </div>
          </div>
          {/* CO Eligible */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0 overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-violet-500/10 to-transparent pointer-events-none dark:from-violet-500/5" />
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400">
              <Gift className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">CO Eligible</p>
              {loadingCo ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {coTotal}
                </p>
              )}
            </div>
          </div>
          {/* Hour-Based */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0 overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-sky-500/10 to-transparent pointer-events-none dark:from-sky-500/5" />
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400">
              <Timer className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">Hour-Based</p>
              {loadingHours ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {hoursTotal}
                </p>
              )}
            </div>
          </div>
          {/* Regular */}
          <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex items-center gap-4 min-h-[82px] min-w-0 overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-emerald-500/10 to-transparent pointer-events-none dark:from-emerald-500/5" />
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">Regular</p>
              {loadingRegular ? (
                <div className="mt-2 h-5 w-10 bg-zinc-200 dark:bg-zinc-850 animate-pulse rounded" />
              ) : (
                <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white leading-none">
                  {regularTotal}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── OD Audit sub-tabs (Reports-style pills) ── */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {OD_VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeViewTab === tab.id;
            const badge =
              tab.id === 'pending-by-user' && !loadingStats && pendingByUser.length > 0
                ? pendingByUser.length
                : tab.id === 'user-wise' && !loadingStats && userWiseRows.length > 0
                  ? userWiseRows.length
                  : null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveViewTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap ${isActive
                  ? `${tab.activeBg} text-white shadow-md scale-[1.02]`
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {badge != null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${isActive ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      {activeViewTab === 'aggregates' ? (
        <ODAuditAggregatesPanel
          records={statsOds}
          periodFrom={dateRange.from}
          periodTo={dateRange.to}
          loading={loadingCo || loadingHours || loadingRegular || loadingStats}
        />
      ) : activeViewTab === 'pending-by-user' ? (
        <PendingByUserPanel rows={pendingByUser} loading={loadingCo || loadingHours || loadingRegular || loadingStats} />
      ) : activeViewTab === 'user-wise' ? (
        <UserWiseODPanel rows={userWiseRows} loading={loadingCo || loadingHours || loadingRegular || loadingStats} />
      ) : activeViewTab === 'approver-analytics' ? (
        <ApproverAnalyticsPanel
          rows={approverAnalyticsRows}
          loading={loadingStats || loadingApprovers}
        />
      ) : (loadingCo || loadingHours || loadingRegular) && (coOds.length === 0 && hoursOds.length === 0 && regularOds.length === 0) ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-slate-500">Loading OD records…</p>
        </div>
      ) : (coTotal + hoursTotal + regularTotal) === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No OD records found for the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          <SegmentBlock
            seg={SEGMENTS[0]}
            ods={coOds}
            total={coTotal}
            page={coPage}
            loading={loadingCo}
            onPageChange={(pg) => loadSegmentODs('co', pg)}
          />
          <SegmentBlock
            seg={SEGMENTS[1]}
            ods={hoursOds}
            total={hoursTotal}
            page={hoursPage}
            loading={loadingHours}
            onPageChange={(pg) => loadSegmentODs('hours', pg)}
          />
          <SegmentBlock
            seg={SEGMENTS[2]}
            ods={regularOds}
            total={regularTotal}
            page={regularPage}
            loading={loadingRegular}
            onPageChange={(pg) => loadSegmentODs('regular', pg)}
          />
        </div>
      )}
    </div>
  );
}
