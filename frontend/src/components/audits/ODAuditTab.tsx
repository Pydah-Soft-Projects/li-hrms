'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
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
  draft:                        { label: 'Draft',           className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  pending:                      { label: 'Pending',         className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  reporting_manager_approved:   { label: 'RM Approved',     className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  reporting_manager_rejected:   { label: 'RM Rejected',     className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  hod_approved:                 { label: 'HOD Approved',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  hod_rejected:                 { label: 'HOD Rejected',    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  manager_approved:             { label: 'Mgr Approved',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  manager_rejected:             { label: 'Mgr Rejected',    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  hr_approved:                  { label: 'HR Approved',     className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  hr_rejected:                  { label: 'HR Rejected',     className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  approved:                     { label: 'Approved',        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected:                     { label: 'Rejected',        className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled:                    { label: 'Cancelled',       className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
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
  if (status === 'skipped')  return <span className="h-3.5 w-3.5 shrink-0 text-center text-[10px] text-slate-400">—</span>;
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
                          className="rounded-md px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
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
          </table>
        )}
      </div>
    </div>
  );
}

const OD_VIEW_TABS = [
  { id: 'records', label: 'OD Records', icon: List, activeBg: 'bg-indigo-600' },
  { id: 'aggregates', label: 'Aggregates', icon: BarChart3, activeBg: 'bg-violet-600' },
  { id: 'pending-by-user', label: 'Pending by User', icon: Users, activeBg: 'bg-amber-600' },
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
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[11px] ${
                      step.status === 'approved'  ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                      : step.status === 'rejected' ? 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20'
                      : step.isCurrent            ? 'border-yellow-300 bg-yellow-50/80 dark:border-yellow-700 dark:bg-yellow-950/20'
                      :                             'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50'
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
  const empNo   = emp?.emp_no || od.emp_no;
  const dept    = emp?.department_id?.name || '—';
  const desig   = emp?.designation_id?.name || '';
  const chain   = od.workflow?.approvalChain || [];

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
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
              seg.id === 'co'    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200'
              : seg.id === 'hours' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200'
              :                      'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
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
              const isCurrent  = step.isCurrent;
              return (
                <div
                  key={i}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold ${
                    isApproved  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : isRejected ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                    : isCurrent  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300'
                    :              'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  }`}
                >
                  {isApproved  ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                   : isRejected ? <XCircle className="h-3 w-3 shrink-0" />
                   : isCurrent  ? <Clock className="h-3 w-3 shrink-0" />
                   :              <Clock className="h-3 w-3 shrink-0 opacity-40" />}
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

function SegmentBlock({ seg, ods }: { seg: SegmentConfig; ods: ODRecord[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const COL_COUNT = 9;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            seg.id === 'co'    ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
            : seg.id === 'hours' ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300'
            :                      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}>
            {seg.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{seg.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                seg.id === 'co'    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                : seg.id === 'hours' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                :                      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {ods.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{seg.description}</p>
          </div>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          : <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {ods.length === 0 ? (
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

export default function ODAuditTab() {
  const [payCycleStartDay, setPayCycleStartDay] = useState(1);
  const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState(() => getDefaultDateRange(1));
  const [search, setSearch]             = useState('');
  const [status, setStatus]             = useState('');
  const [divisionIds, setDivisionIds]   = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [divisions, setDivisions]       = useState<Division[]>([]);
  const [departments, setDepartments]   = useState<Department[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [statsOds, setStatsOds] = useState<ODRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<OdViewTabId>('records');
  const [ods, setOds]                   = useState<ODRecord[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
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
        const [divRes, deptRes, startRes, endRes] = await Promise.all([
          api.getDivisions(),
          api.getDepartments(),
          api.getSetting('payroll_cycle_start_day'),
          api.getSetting('payroll_cycle_end_day'),
        ]);
        if (divRes.success) setDivisions(divRes.data || []);
        if (deptRes.success) setDepartments(deptRes.data || []);
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
      }
    })();
  }, []);

  const loadODs = useCallback(async (pg = 1) => {
    const filters = {
      fromDate: dateRange.from || undefined,
      toDate: dateRange.to || undefined,
      search: search.trim() || undefined,
      status: status || undefined,
      division: divisionIds.length ? divisionIds : undefined,
      department: departmentIds.length ? departmentIds : undefined,
    };

    try {
      setLoading(true);
      const res = await api.getODs({ ...filters, page: pg, limit });
      if (res.success) {
        setOds(res.data || []);
        setTotal(res.total || 0);
        setPage(pg);

        if (pg === 1) {
          setStatsOds([]);
          const statTotal = res.total || 0;
          if (statTotal <= limit) {
            setStatsOds(res.data || []);
          } else {
            setLoadingStats(true);
            try {
              const statRes = await api.getODs({ ...filters, page: 1, limit: statTotal });
              if (statRes.success) setStatsOds(statRes.data || []);
            } catch (err) {
              console.error(err);
            } finally {
              setLoadingStats(false);
            }
          }
        }
      } else {
        toast.error(res.message || 'Failed to load OD records');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load OD records');
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, search, status, divisionIds, departmentIds]);

  useEffect(() => {
    if (!loadingFilters && settingsLoaded) loadODs(1);
  }, [loadODs, loadingFilters, settingsLoaded]);

  const handleExportPdf = async () => {
    const toastId = toast.loading('Generating PDF…');
    setExportingPdf(true);
    try {
      const exportLimit = Math.max(total, ods.length, 5000);
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

  const totalPages = Math.ceil(total / limit);

  // Segment buckets (current page)
  const segmentedODs = useMemo(() => {
    const buckets: Record<string, ODRecord[]> = { co: [], hours: [], regular: [] };
    for (const od of ods) buckets[segmentOf(od)].push(od);
    return buckets;
  }, [ods]);

  // Full-dataset stats for breakdown cards & modal
  const statusBreakdown = useMemo(() => buildOdStatusBreakdown(statsOds), [statsOds]);
  const segmentBreakdown = useMemo(() => buildOdSegmentBreakdown(statsOds), [statsOds]);
  const pendingByUser = useMemo(() => buildOdPendingByUser(statsOds), [statsOds]);

  if (loadingFilters) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-5">

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
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
            className="bg-transparent text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 focus:outline-none min-w-[130px] max-w-[180px] cursor-pointer"
          >
            <option value="__custom__">Custom range…</option>
            {payPeriodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]"
          />
          <span className="text-slate-400 text-xs">→</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]">
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <MultiSelect options={divisions.map((d) => ({ id: d._id, name: d.name }))} selectedIds={divisionIds}
            onChange={setDivisionIds} placeholder="All Divisions" className="min-w-[120px] max-w-[160px]" pill />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <MultiSelect options={filteredDepartments.map((d) => ({ id: d._id, name: d.name }))} selectedIds={departmentIds}
            onChange={setDepartmentIds} placeholder="All Departments" className="min-w-[120px] max-w-[160px]" pill />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadODs(1)} placeholder="Search name or emp #"
            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none min-w-[150px]" />
        </div>
        <button type="button" onClick={() => loadODs(1)} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 transition-all">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={loading || exportingPdf || total === 0}
          title="Export filtered OD records as PDF"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 shadow-sm text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          {exportingPdf ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      {/* ── Status breakdown ── */}
      {!loading && total > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status breakdown</h2>
            {loadingStats && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating totals…
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">
                <Clock3 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-none text-amber-700 dark:text-amber-300">
                  {loadingStats ? '…' : statusBreakdown.pending}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">Pending</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300">
                <CheckCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-none text-emerald-700 dark:text-emerald-300">
                  {loadingStats ? '…' : statusBreakdown.approved}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Approved</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 shadow-sm dark:border-red-800 dark:bg-red-950/20">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
                <XCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-none text-red-700 dark:text-red-300">
                  {loadingStats ? '…' : statusBreakdown.rejected}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">Rejected</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                <Ban className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-none text-slate-700 dark:text-slate-200">
                  {loadingStats ? '…' : statusBreakdown.cancelled}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cancelled</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Segment summary ── */}
      {!loading && total > 0 && (
        <div>
          <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">By type</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Total */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums leading-none text-slate-900 dark:text-white">{total}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total ODs</div>
            </div>
          </div>
          {/* CO Eligible */}
          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 shadow-sm dark:border-violet-800 dark:bg-violet-950/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300">
              <Gift className="h-4 w-4" />
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums leading-none text-violet-700 dark:text-violet-300">
                {loadingStats ? '…' : segmentBreakdown.co}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-400">CO Eligible</div>
            </div>
          </div>
          {/* Hour-Based */}
          <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 shadow-sm dark:border-sky-800 dark:bg-sky-950/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300">
              <Timer className="h-4 w-4" />
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums leading-none text-sky-700 dark:text-sky-300">
                {loadingStats ? '…' : segmentBreakdown.hours}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400">Hour-Based</div>
            </div>
          </div>
          {/* Regular */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums leading-none text-slate-700 dark:text-slate-200">
                {loadingStats ? '…' : segmentBreakdown.regular}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Regular</div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ── OD Audit sub-tabs (Reports-style pills) ── */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {OD_VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeViewTab === tab.id;
            const badge =
              tab.id === 'pending-by-user' && !loadingStats && pendingByUser.length > 0
                ? pendingByUser.length
                : null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveViewTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? `${tab.activeBg} text-white shadow-md scale-[1.02]`
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {badge != null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                      isActive ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
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
          loading={loading || loadingStats}
        />
      ) : activeViewTab === 'pending-by-user' ? (
        <PendingByUserPanel rows={pendingByUser} loading={loading || loadingStats} />
      ) : loading ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-slate-500">Loading OD records…</p>
        </div>
      ) : ods.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No OD records found for the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {SEGMENTS.map((seg) => (
            <SegmentBlock key={seg.id} seg={seg} ods={segmentedODs[seg.id]} />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs text-slate-500">Page {page} of {totalPages} · {total} records</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => loadODs(page - 1)} disabled={page <= 1 || loading}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">← Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = Math.max(1, page - 2) + i;
                  if (pg > totalPages) return null;
                  return (
                    <button key={pg} type="button" onClick={() => loadODs(pg)} disabled={loading}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${pg === page ? 'bg-indigo-600 border-indigo-600 text-white' : 'hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                      {pg}
                    </button>
                  );
                })}
                <button type="button" onClick={() => loadODs(page + 1)} disabled={page >= totalPages || loading}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
