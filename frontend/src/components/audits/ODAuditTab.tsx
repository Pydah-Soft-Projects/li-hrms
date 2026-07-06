'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  if (od.isCOEligible) return 'co';
  if (od.odType_extended === 'hours') return 'hours';
  return 'regular';
}

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

export default function ODAuditTab() {
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [fromDate, setFromDate]         = useState(firstOfMonth);
  const [toDate, setToDate]             = useState(lastOfMonth);
  const [search, setSearch]             = useState('');
  const [status, setStatus]             = useState('');
  const [divisionIds, setDivisionIds]   = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [divisions, setDivisions]       = useState<Division[]>([]);
  const [departments, setDepartments]   = useState<Department[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loading, setLoading]           = useState(false);
  const [ods, setOds]                   = useState<ODRecord[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const limit = 50;

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
        const [divRes, deptRes] = await Promise.all([api.getDivisions(), api.getDepartments()]);
        if (divRes.success) setDivisions(divRes.data || []);
        if (deptRes.success) setDepartments(deptRes.data || []);
      } catch (err) { console.error(err); }
      finally { setLoadingFilters(false); }
    })();
  }, []);

  const loadODs = useCallback(async (pg = 1) => {
    try {
      setLoading(true);
      const res = await api.getODs({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search.trim() || undefined,
        status: status || undefined,
        division: divisionIds.length ? divisionIds : undefined,
        department: departmentIds.length ? departmentIds : undefined,
        page: pg,
        limit,
      });
      if (res.success) {
        setOds(res.data || []);
        setTotal(res.total || 0);
        setPage(pg);
      } else {
        toast.error(res.message || 'Failed to load OD records');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load OD records');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, search, status, divisionIds, departmentIds]);

  useEffect(() => {
    if (!loadingFilters) loadODs(1);
  }, [loadODs, loadingFilters]);

  const totalPages = Math.ceil(total / limit);

  // Segment buckets
  const segmentedODs = useMemo(() => {
    const buckets: Record<string, ODRecord[]> = { co: [], hours: [], regular: [] };
    for (const od of ods) buckets[segmentOf(od)].push(od);
    return buckets;
  }, [ods]);

  // Summary counts
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const od of ods) { const s = od.status || 'unknown'; c[s] = (c[s] || 0) + 1; }
    return c;
  }, [ods]);

  if (loadingFilters) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-5">

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]" />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-indigo-300">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]" />
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
      </div>

      {/* ── Summary stat cards ── */}
      {!loading && ods.length > 0 && (
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
              <div className="text-2xl font-black tabular-nums leading-none text-violet-700 dark:text-violet-300">{segmentedODs.co.length}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-400">CO Eligible</div>
            </div>
          </div>
          {/* Hour-Based */}
          <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 shadow-sm dark:border-sky-800 dark:bg-sky-950/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300">
              <Timer className="h-4 w-4" />
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums leading-none text-sky-700 dark:text-sky-300">{segmentedODs.hours.length}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400">Hour-Based</div>
            </div>
          </div>
          {/* Regular */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums leading-none text-slate-700 dark:text-slate-200">{segmentedODs.regular.length}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Regular</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
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
