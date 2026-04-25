'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import {
  canApprovePromotionTransfer,
  canCreatePromotionTransfer,
  canDeletePromotionTransferRequest,
  canViewPromotionTransfer,
} from '@/lib/permissions';
import { toast } from 'react-toastify';
import {
  ArrowRightLeft,
  Check,
  Loader2,
  Plus,
  Search,
  TrendingUp,
  X,
  Eye,
  Trash2,
  Users,
  Filter,
  Ban,
  Pencil,
} from 'lucide-react';

type PayrollMonthOption = {
  payrollYear: number;
  payrollMonth: number;
  label: string;
  isOngoing?: boolean;
  periodStart?: string;
  periodEnd?: string;
  /** Human range from settings, e.g. "25 Mar 2024 – 25 Apr 2024" */
  periodRangeDisplay?: string;
  rangeStartDate?: string;
  rangeEndDate?: string;
  paidDays?: number;
  totalDaysInMonth?: number;
};

type PtRequest = {
  _id: string;
  requestType: 'promotion' | 'demotion' | 'transfer' | 'increment';
  emp_no: string;
  status: string;
  remarks?: string;
  newGrossSalary?: number;
  previousGrossSalary?: number | null;
  /** Set for requestType increment */
  incrementAmount?: number;
  effectivePayrollYear?: number;
  effectivePayrollMonth?: number;
  createdAt?: string;
  employeeId?: {
    employee_name?: string;
    emp_no?: string;
    gross_salary?: number;
    _id?: string;
    division_id?: { _id?: string; name?: string } | string;
    department_id?: { _id?: string; name?: string } | string;
    designation_id?: { _id?: string; name?: string } | string;
    employee_group_id?: { _id?: string; name?: string } | string;
  };
  requestedBy?: { _id?: string; name?: string };
  proposedDesignationId?: { name?: string };
  fromDivisionId?: { name?: string };
  fromDepartmentId?: { name?: string };
  fromDesignationId?: { name?: string };
  toDivisionId?: { name?: string };
  toDepartmentId?: { name?: string };
  toDesignationId?: { name?: string };
  workflow?: {
    nextApproverRole?: string;
    currentStepRole?: string;
    isCompleted?: boolean;
    approvalChain?: Array<{
      stepOrder?: number;
      role?: string;
      label?: string;
      status?: string;
      comments?: string;
      actionByName?: string;
      actionByRole?: string;
      updatedAt?: string;
      isCurrent?: boolean;
    }>;
    history?: Array<{
      step?: string;
      action?: 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'updated' | string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      timestamp?: string;
    }>;
  };
};

/** Aligns with backend `promotionWorkflowUtils.chainStepLabel` / generic “Level N” steps. */
const PT_GENERIC_LEVEL_STEP = /^level\s*\d+\s*approval$/i;

const PT_ROLE_DISPLAY: Record<string, string> = {
  reporting_manager: 'Reporting manager',
  hod: 'Department head (HOD)',
  manager: 'Division manager',
  hr: 'HR',
  super_admin: 'Administrator',
  final_authority: 'HR (final authority)',
};

function promotionApproverRoleLabel(role: string | undefined) {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  if (!r) return 'Approver';
  if (PT_ROLE_DISPLAY[r]) return PT_ROLE_DISPLAY[r];
  return r
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function promotionApprovalStepHeadline(step: NonNullable<NonNullable<PtRequest['workflow']>['approvalChain']>[number]) {
  const roleHuman = promotionApproverRoleLabel(step.role);
  const raw = (step.label || '').trim();
  if (raw && !PT_GENERIC_LEVEL_STEP.test(raw)) return raw;
  return roleHuman;
}

function promotionApprovalStepRoleSubline(
  step: NonNullable<NonNullable<PtRequest['workflow']>['approvalChain']>[number]
) {
  const roleHuman = promotionApproverRoleLabel(step.role);
  const raw = (step.label || '').trim();
  if (raw && !PT_GENERIC_LEVEL_STEP.test(raw) && raw !== roleHuman) {
    return `Approver type: ${roleHuman}`;
  }
  return null;
}

/** Matches leave/OD detail “Approval Timeline” (workspace leaves page). */
function PromotionApprovalTimeline({ workflow }: { workflow: NonNullable<PtRequest['workflow']> }) {
  const chain = [...(workflow.approvalChain || [])].sort(
    (a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0)
  );
  if (chain.length === 0) return null;

  const approvedCount = chain.filter((s) => s.status === 'approved' || s.status === 'skipped').length;
  const total = chain.length;
  const progressPct = total > 0 ? (approvedCount / total) * 100 : 0;
  const nextRole = workflow.nextApproverRole;

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-5 rounded-xl overflow-hidden">
      <p className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Approval timeline</p>
      <div className="mb-5">
        <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
          <span>
            {approvedCount} of {total} step{total === 1 ? '' : 's'} completed
          </span>
        </div>
        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700 ml-1">
        {chain.map((step, idx) => {
          const stepRole = step.role || 'step';
          const headline = promotionApprovalStepHeadline(step);
          const roleSub = promotionApprovalStepRoleSubline(step);
          const roleHuman = promotionApproverRoleLabel(step.role);
          const isApproved = step.status === 'approved' || step.status === 'skipped';
          const isRejected = step.status === 'rejected';
          const isPending = step.status === 'pending';
          const isCurrent =
            isPending &&
            (step.isCurrent === true ||
              String(nextRole || '').toLowerCase() === String(stepRole).toLowerCase());
          const nodeColor = isApproved
            ? 'bg-green-500 ring-4 ring-green-200 dark:ring-green-900/50'
            : isRejected
              ? 'bg-red-500 ring-4 ring-red-200 dark:ring-red-900/50'
              : isCurrent
                ? 'bg-blue-500 ring-4 ring-blue-200 dark:ring-blue-900/50'
                : 'bg-slate-300 dark:bg-slate-600';

          return (
            <div key={`${step.stepOrder ?? idx}-${stepRole}`} className="relative pb-5 last:pb-0">
              <div
                className={`absolute -left-[29px] top-0.5 w-4 h-4 rounded-full ${nodeColor} border-2 border-white dark:border-slate-900 shadow-sm`}
              />
              <div className="ml-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{headline}</span>
                  {step.stepOrder != null && (
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">
                      Step {step.stepOrder}
                    </span>
                  )}
                  {isApproved && (
                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">
                      {step.status === 'skipped' ? '○ Skipped' : '✓ Stage approved'}
                    </span>
                  )}
                  {isRejected && (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">✗ Rejected</span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">⏳ Your turn</span>
                  )}
                  {isPending && !isCurrent && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase">○ Awaiting (not started)</span>
                  )}
                </div>
                {roleSub && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-snug">{roleSub}</p>
                )}
                {isPending && step.role === 'reporting_manager' && !roleSub && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    Uses the employee&apos;s reporting manager from their profile.
                  </p>
                )}
                {(isApproved || isRejected) && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {step.actionByName || 'Unknown'} (
                    {promotionApproverRoleLabel(step.actionByRole || step.role || stepRole)})
                    {step.updatedAt && (
                      <span className="ml-1 inline-block">· {new Date(step.updatedAt).toLocaleString()}</span>
                    )}
                  </p>
                )}
                {(isApproved || isRejected) && step.comments && (
                  <p className="text-xs text-slate-500 italic mt-0.5">&quot;{step.comments}&quot;</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Headline for Activity & history rows — uses workflow `step` (hod, manager, …) when present. */
function ptWorkflowHistoryHeadline(h: NonNullable<NonNullable<PtRequest['workflow']>['history']>[number]) {
  const action = String(h.action || '').toLowerCase();
  const stepRaw = String(h.step || '').trim();
  const stepKey = stepRaw.toLowerCase();

  if (action === 'submitted' || stepKey === 'submitted') {
    return 'Request submitted';
  }
  if (action === 'updated') {
    return 'Updated by super admin';
  }
  if (action === 'cancelled') {
    return 'Cancelled';
  }

  const roleToken =
    stepRaw && stepKey !== 'submitted'
      ? stepRaw.split(/[\s(]/)[0]
      : String(h.actionByRole || '')
          .split(/[\s(]/)[0]
          .toLowerCase();
  const short = roleToken ? ptRoleStatusShortLabel({ role: roleToken }) : 'Stage';

  if (action === 'approved') {
    return `${short} approved`;
  }
  if (action === 'rejected') {
    return `${short} rejected`;
  }
  if (action) {
    return String(h.action);
  }
  return 'Event';
}

function RequestActivityHistory({ history }: { history: NonNullable<PtRequest['workflow']>['history'] }) {
  if (!history || history.length === 0) return null;
  const rows = [...history].reverse();
  return (
    <div className="rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/40 p-3 sm:p-4">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Activity & history</p>
      <ul className="space-y-3">
        {rows.map((h, i) => (
          <li key={i} className="text-xs border-l-2 border-indigo-200/90 dark:border-indigo-800/60 pl-3">
            <div className="font-semibold text-slate-800 dark:text-slate-100">
              {ptWorkflowHistoryHeadline(h)}
              {h.actionByName ? (
                <span className="font-normal text-slate-600 dark:text-slate-300"> · {h.actionByName}</span>
              ) : null}
            </div>
            {h.timestamp && (
              <p className="text-[10px] text-slate-500 mt-0.5">{new Date(h.timestamp).toLocaleString()}</p>
            )}
            {h.comments && (
              <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap">{h.comments}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatSalary(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n));
}

/** YYYY-MM lexicographic order. */
function comparePayrollYm(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** One payroll month id (YYYY-MM) plus delta calendar months. */
function addPayrollMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function promotionDelta(prev: number | null | undefined, next: number | null | undefined) {
  if (next == null || !Number.isFinite(Number(next))) return null;
  if (prev == null || !Number.isFinite(Number(prev))) return null;
  return Number(next) - Number(prev);
}

function orgFieldName(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'name' in v && typeof (v as { name?: string }).name === 'string') {
    return (v as { name: string }).name || '—';
  }
  return '—';
}

function statusClass(s: string) {
  switch (s) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'in_approval':
      return 'bg-sky-100 text-sky-900 dark:bg-sky-900/45 dark:text-sky-200';
    case 'rejected':
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

/** Short label for status badge: "HOD", "Manager", etc. */
function ptRoleStatusShortLabel(step: { role?: string; label?: string; status?: string }) {
  const r = String(step.role || '')
    .toLowerCase()
    .trim();
  if (r === 'hod') return 'HOD';
  if (r === 'hr') return 'HR';
  if (r === 'manager') return 'Manager';
  if (r === 'super_admin') return 'Admin';
  if (r === 'reporting_manager') return 'Reporting mgr';
  const h = String(step.label || '').trim();
  if (h && h.length <= 20) return h;
  return promotionApproverRoleLabel(step.role);
}

/** e.g. "HOD approved" or "HOD · Manager approved" from completed chain steps. */
function ptApprovedStagesStatusLabel(chain: NonNullable<NonNullable<PtRequest['workflow']>['approvalChain']>) {
  const sorted = [...chain]
    .filter((s) => s.status === 'approved' || s.status === 'skipped')
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
  if (sorted.length === 0) return { label: '', title: '' };

  const longTitle = sorted
    .map((s) => {
      const line = promotionApprovalStepHeadline(s);
      if (s.status === 'skipped') {
        return `${line} (skipped by higher authority)`;
      }
      return `${line} — approved`;
    })
    .join(' → ');

  const names = sorted.map((s) => ptRoleStatusShortLabel(s));
  const onlySkipped = sorted.every((s) => s.status === 'skipped');
  if (onlySkipped) {
    return {
      label: names.length === 1 ? `${names[0]} (skipped)` : `${names.join(' · ')} (skipped)`,
      title: longTitle,
    };
  }
  const approvedNames = sorted.filter((s) => s.status === 'approved').map((s) => ptRoleStatusShortLabel(s));
  const mixed = approvedNames.length > 0 && sorted.some((s) => s.status === 'skipped');
  if (mixed) {
    const bits = sorted.map((s) => {
      const n = ptRoleStatusShortLabel(s);
      return s.status === 'skipped' ? `${n} (skipped)` : n;
    });
    return { label: `${bits.join(' · ')} — in review`, title: longTitle };
  }
  if (approvedNames.length === 1) {
    return { label: `${approvedNames[0]} approved`, title: longTitle };
  }
  if (approvedNames.length === 2) {
    return { label: `${approvedNames[0]} · ${approvedNames[1]} approved`, title: longTitle };
  }
  return {
    label: `${approvedNames.slice(0, 2).join(' · ')} · +${approvedNames.length - 2} approved`,
    title: longTitle,
  };
}

/** When document is still `pending` but at least one workflow step is already approved, show which stages completed (e.g. HOD approved). */
function ptRequestStatusPresentation(r: PtRequest) {
  const s = (r.status || '').toLowerCase();
  if (s !== 'pending') {
    return { label: r.status, className: statusClass(r.status), title: r.status };
  }
  const chain = r.workflow?.approvalChain;
  if (!Array.isArray(chain) || chain.length === 0) {
    return { label: 'Pending', className: statusClass('pending'), title: 'Awaiting first approval' };
  }
  const { label: byRole, title: byRoleTitle } = ptApprovedStagesStatusLabel(chain);
  if (byRole) {
    return {
      label: byRole,
      className: statusClass('in_approval'),
      title: byRoleTitle,
    };
  }
  return { label: 'Pending', className: statusClass('pending'), title: 'Awaiting first approval' };
}

function normalizeId(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v._id || v.id || '');
  return '';
}

/** Department documents use `divisions[]` (ObjectIds), not `division_id`. Bulk UI must filter on that or department options stay empty. */
function departmentBelongsToDivision(dept: any, divisionId: string): boolean {
  if (!divisionId) return true;
  const want = String(divisionId);
  const legacy = normalizeId(dept?.division_id);
  if (legacy && legacy === want) return true;
  const divs = dept?.divisions;
  if (!Array.isArray(divs) || divs.length === 0) return false;
  return divs.some((x: any) => {
    const id = normalizeId(x);
    if (id && id === want) return true;
    if (x && typeof x === 'object' && normalizeId(x._id) === want) return true;
    return false;
  });
}

function rowMatchesPtListFilters(
  r: PtRequest,
  f: {
    divisionId: string;
    departmentId: string;
    designationId: string;
    groupId: string;
    requestType: string;
  }
) {
  if (f.requestType && r.requestType !== f.requestType) return false;
  if (!f.divisionId && !f.departmentId && !f.designationId && !f.groupId) return true;
  const e = r.employeeId;
  if (!e) return false;
  if (f.divisionId && normalizeId(e.division_id) !== f.divisionId) return false;
  if (f.departmentId && normalizeId(e.department_id) !== f.departmentId) return false;
  if (f.designationId && normalizeId(e.designation_id) !== f.designationId) return false;
  if (f.groupId && normalizeId(e.employee_group_id) !== f.groupId) return false;
  return true;
}

/** Backend treats any sent to* as an org change; unchanged values must be omitted (else "must change when specified"). */
function orgDeltaForPromotionPayload(currentEmp: any, toDiv: string, toDept: string, toDesig: string) {
  const curDiv = normalizeId(currentEmp?.division_id);
  const curDept = normalizeId(currentEmp?.department_id);
  const curDes = normalizeId(currentEmp?.designation_id);
  const patch: { toDivisionId?: string; toDepartmentId?: string; toDesignationId?: string } = {};
  if (toDiv && toDiv !== curDiv) patch.toDivisionId = toDiv;
  if (toDept && toDept !== curDept) patch.toDepartmentId = toDept;
  if (toDesig && toDesig !== curDes) patch.toDesignationId = toDesig;
  return patch;
}

interface BulkPtRow {
  employee: any;
  requestType: 'promotion' | 'demotion' | 'transfer' | 'increment';
  /** For promotion/demotion: target gross. For increment: increment amount only. */
  newGrossSalary: number;
  selectedMonthLabel: string;
  toDivisionId: string;
  toDepartmentId: string;
  toDesignationId: string;
  remarks: string;
}

const bulkRowKey = (r: BulkPtRow) => String(r.employee?._id ?? r.employee?.emp_no ?? '');

/** True when a row is included in a batch submit (same rules as the bulk “toCreate” filter). */
function bulkRowIsToCreate(r: BulkPtRow): boolean {
  const type = r.requestType;
  if (type === 'promotion' || type === 'demotion') {
    const nextGross = Number(r.newGrossSalary);
    const prevGross = Number(r.employee.gross_salary) || 0;
    const delta = nextGross - prevGross;
    if (nextGross <= 0) return false;
    if (type === 'promotion' && delta <= 0) return false;
    if (type === 'demotion' && delta >= 0) return false;
    return true;
  }
  if (type === 'increment') {
    const inc = Number(r.newGrossSalary);
    if (!Number.isFinite(inc) || inc <= 0) return false;
    const prevGross = Number(r.employee.gross_salary);
    return Number.isFinite(prevGross);
  }
  const tDiv = r.toDivisionId;
  const tDept = r.toDepartmentId;
  const tDesig = r.toDesignationId;
  const hasDivChange = tDiv && normalizeId(r.employee.division_id) !== tDiv;
  const hasDeptChange = tDept && normalizeId(r.employee.department_id) !== tDept;
  const hasDesigChange = tDesig && normalizeId(r.employee.designation_id) !== tDesig;
  return !!(hasDivChange || hasDeptChange || hasDesigChange);
}

function validateBulkToCreateRow(r: BulkPtRow, monthOptions: PayrollMonthOption[]): string[] {
  const e: string[] = [];
  const t = r.requestType;
  if (t === 'promotion' || t === 'demotion' || t === 'increment') {
    const opt = monthOptions.find((p) => p.label === r.selectedMonthLabel);
    if (!opt) e.push('Select an effective pay month');
  }
  if (t === 'promotion' || t === 'demotion') {
    const nextGross = Number(r.newGrossSalary);
    if (!Number.isFinite(nextGross) || nextGross <= 0) e.push('Enter a valid new gross');
  }
  if (t === 'increment') {
    const inc = Number(r.newGrossSalary);
    if (!Number.isFinite(inc) || inc <= 0) e.push('Enter a valid increment amount (positive number)');
  }
  return e;
}

/** Hints for rows that are not yet in the submit set but look incomplete (e.g. salary set, no month). */
function bulkRowNotReadyHints(r: BulkPtRow, monthOptions: PayrollMonthOption[]): string[] {
  if (bulkRowIsToCreate(r)) return [];
  const h: string[] = [];
  if (r.requestType === 'promotion' || r.requestType === 'demotion' || r.requestType === 'increment') {
    const hasMonth = !!monthOptions.find((m) => m.label === r.selectedMonthLabel);
    if (r.requestType === 'increment') {
      const inc = Number(r.newGrossSalary);
      if (inc > 0 && !hasMonth) h.push('Select an effective pay month to submit');
    } else {
      const nextGross = Number(r.newGrossSalary);
      if (Number.isFinite(nextGross) && nextGross > 0 && !hasMonth) {
        h.push('Select an effective pay month to submit');
      }
    }
  }
  if (r.requestType === 'transfer') {
    if (!r.toDivisionId) h.push('Select a target division');
    if (!r.toDepartmentId) h.push('Select a target department');
    if (!r.toDesignationId) h.push('Select a target designation');
  }
  return h;
}

/** If the per-row create call failed, return the user-facing error text; else null. */
function settledResultErrorMessage(res: PromiseSettledResult<unknown>): string | null {
  if (res.status === 'rejected') {
    const r: any = res.reason;
    if (r?.message) return String(r.message);
    if (r != null) return String(r);
    return 'Request failed';
  }
  const v: any = res.value;
  if (v && v.success === true) return null;
  const t = v && (v.message || v.error);
  if (t && String(t).trim()) return String(t).trim();
  return 'Request failed';
}

export default function PromotionsTransfersPage() {
  const [user, setUser] = useState<ReturnType<typeof auth.getUser>>(null);
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<PtRequest[]>([]);
  const [pendingList, setPendingList] = useState<PtRequest[]>([]);
  const [search, setSearch] = useState('');
  const [filterDivisionId, setFilterDivisionId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('');
  const [filterDesignationId, setFilterDesignationId] = useState('');
  const [filterRequestType, setFilterRequestType] = useState<
    '' | 'promotion' | 'demotion' | 'transfer' | 'increment'
  >('');
  const [employeeGroups, setEmployeeGroups] = useState<{ _id: string; name: string }[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<'promotion' | 'demotion' | 'transfer' | 'increment'>('promotion');
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [empSearchResults, setEmpSearchResults] = useState<{ emp_no: string; employee_name: string }[]>([]);
  const [empSearchLoading, setEmpSearchLoading] = useState(false);
  const [selectedEmpNo, setSelectedEmpNo] = useState('');
  const [payrollMonths, setPayrollMonths] = useState<PayrollMonthOption[]>([]);
  /** Server-derived; drives ongoing marker and proration (see `ongoingLabel` vs `containingKey`). */
  const [promotionPayroll, setPromotionPayroll] = useState<{
    /** Operational ongoing pay month (only previous month vs current is evaluated on the server). */
    ongoingLabel: string;
    incompleteOngoingLabel?: string;
    arrearProrationEndLabel: string;
    currentCycleLabel: string;
    /** Pay run (batch id) that contains today’s date in IST. */
    containingKey?: string;
    containingRangeDisplay?: string;
    containingRangeStart?: string;
    containingRangeEnd?: string;
    settingsStartDay?: number;
    settingsEndDay?: number;
  } | null>(null);
  const [selectedMonthLabel, setSelectedMonthLabel] = useState('');
  const [newGrossSalaryInput, setNewGrossSalaryInput] = useState('');
  const [incrementAmountInput, setIncrementAmountInput] = useState('');
  const [allDesignations, setAllDesignations] = useState<{ _id: string; name: string }[]>([]);
  const [divisions, setDivisions] = useState<{ _id: string; name: string }[]>([]);
  const [masterDepartments, setMasterDepartments] = useState<{ _id: string; name: string; divisions?: any[]; division_id?: any }[]>([]);
  const [modalDepartments, setModalDepartments] = useState<{ _id: string; name: string; divisions?: any[]; division_id?: any }[]>([]);
  const [toDiv, setToDiv] = useState('');
  const [toDept, setToDept] = useState('');
  const [toDesig, setToDesig] = useState('');
  const [currentEmp, setCurrentEmp] = useState<any>(null);
  const [paidDaysByMonth, setPaidDaysByMonth] = useState<Record<string, { paidDays: number; totalDays: number }>>({});
  const [paidDaysLoading, setPaidDaysLoading] = useState(false);
  const [prorationRows, setProrationRows] = useState<
    Array<{ month: string; totalDays: number; paidDays: number; amount: number; proratedAmount: number; hasRecord: boolean }>
  >([]);
  const [prorationLoading, setProrationLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remarks, setRemarks] = useState('');
  /** Pending PT row for selected employee (blocks duplicate until approved/rejected/cancelled). */
  const [activePendingRequest, setActivePendingRequest] = useState<{
    _id: string;
    requestType: string;
    createdAt?: string;
  } | null>(null);
  const [activePendingLoading, setActivePendingLoading] = useState(false);

  const [detail, setDetail] = useState<PtRequest | null>(null);
  const [detailProrationRows, setDetailProrationRows] = useState<any[]>([]);
  const [detailProrationLoading, setDetailProrationLoading] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailEditSaving, setDetailEditSaving] = useState(false);
  const [detailEditRemarks, setDetailEditRemarks] = useState('');
  const [detailEditNewGross, setDetailEditNewGross] = useState('');
  const [detailEditIncrement, setDetailEditIncrement] = useState('');
  const [detailEditMonthLabel, setDetailEditMonthLabel] = useState('');
  const [detailEditProposedId, setDetailEditProposedId] = useState('');
  const [detailEditToDiv, setDetailEditToDiv] = useState('');
  const [detailEditToDept, setDetailEditToDept] = useState('');
  const [detailEditToDesig, setDetailEditToDesig] = useState('');
  const [detailEditNote, setDetailEditNote] = useState('');
  const [detailEditPayrollMonths, setDetailEditPayrollMonths] = useState<PayrollMonthOption[]>([]);

  // Bulk operations state
  const [bulkSectionOpen, setBulkSectionOpen] = useState(false);
  const [bulkType, setBulkType] = useState<'promotion' | 'demotion' | 'transfer' | 'increment'>('promotion');
  const [bulkDivisionId, setBulkDivisionId] = useState('');
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkPtRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  /** Per-employee (key = employee _id) messages after failed bulk validation, pre-submit check, or API errors */
  const [bulkRowErrors, setBulkRowErrors] = useState<Record<string, string[]>>({});
  /** Whether a row was flagged by client checks vs a failed API call (drives red vs amber row styling). */
  const [bulkRowErrorSource, setBulkRowErrorSource] = useState<Record<string, 'client' | 'server'>>({});

  const clearAllBulkRowErrors = useCallback(() => {
    setBulkRowErrors({});
    setBulkRowErrorSource({});
  }, []);

  const setClientBulkRowErrors = useCallback((m: Record<string, string[]>) => {
    setBulkRowErrors(m);
    if (!m || !Object.keys(m).length) {
      setBulkRowErrorSource({});
      return;
    }
    setBulkRowErrorSource(
      Object.fromEntries(Object.keys(m).map((k) => [k, 'client' as const])) as Record<string, 'client'>
    );
  }, []);

  // Bulk header (apply-to-all) state
  const [headerEffectiveMonth, setHeaderEffectiveMonth] = useState('');
  const [headerToDiv, setHeaderToDiv] = useState('');
  const [headerToDept, setHeaderToDept] = useState('');
  const [headerToDesig, setHeaderToDesig] = useState('');
  const [headerRemarks, setHeaderRemarks] = useState('');

  const isEmployee = (user?.role || '').toLowerCase() === 'employee';

  const canCancelRequest = useCallback(
    (r: PtRequest) => {
      if (r.status !== 'pending' || !user) return false;
      if (['super_admin', 'sub_admin'].includes(String(user.role))) return true;
      const rid = (r.requestedBy as { _id?: string })?._id;
      if (rid && String(rid) === String(user.id)) return true;
      if (isEmployee && String(r.emp_no) === String(user.emp_no || user.employeeId || '').toUpperCase()) return true;
      return false;
    },
    [user, isEmployee]
  );

  const canView = useMemo(() => (user ? canViewPromotionTransfer(user as any) : false), [user]);
  const canCreate = useMemo(() => (user ? canCreatePromotionTransfer(user as any) : false), [user]);
  const canApprove = useMemo(() => (user ? canApprovePromotionTransfer(user as any) : false), [user]);
  const canDelete = useMemo(() => (user ? canDeletePromotionTransferRequest(user as any) : false), [user]);

  const canDeleteRow = useCallback(
    (r: PtRequest) => {
      if (!canDelete) return false;
      return ['pending', 'rejected', 'cancelled'].includes(r.status);
    },
    [canDelete]
  );

  /**
   * When set, GET /payroll-months checks only that employee’s division+department batch for ongoing
   * (not all company batches). HR: set when the create modal is open and an employee is chosen.
   */
  const empNoForPayroll = useMemo(() => {
    if (isEmployee) {
      const n = String(user?.emp_no || user?.employeeId || '').toUpperCase();
      return n || undefined;
    }
    if (modalOpen) {
      const n = String(selectedEmpNo || currentEmp?.emp_no || '').toUpperCase();
      return n || undefined;
    }
    return undefined;
  }, [isEmployee, user?.emp_no, user?.employeeId, modalOpen, selectedEmpNo, currentEmp?.emp_no]);

  /** Load department options for the modal without clearing the list when division is missing (employee may only have department). */
  const refreshModalDepartments = useCallback(async (divisionId: string, ensureDeptId: string) => {
    if (!divisionId) {
      if (ensureDeptId) {
        try {
          const single = await api.getDepartment(ensureDeptId);
          const sd: any = single?.data ?? single;
          setModalDepartments(sd?._id ? [sd] : []);
        } catch {
          setModalDepartments([]);
        }
      } else {
        setModalDepartments([]);
      }
      return;
    }
    try {
      const resp = await api.getDepartments(true, divisionId, true);
      const rows: any = resp?.data ?? resp;
      let list = Array.isArray(rows) ? rows : [];
      if (ensureDeptId && !list.some((x: any) => normalizeId(x._id) === ensureDeptId)) {
        try {
          const single = await api.getDepartment(ensureDeptId);
          const sd: any = single?.data ?? single;
          if (sd?._id) list = [...list, sd];
        } catch {
          /* ignore */
        }
      }
      setModalDepartments(list);
    } catch {
      setModalDepartments([]);
    }
  }, []);

  const applyEmployeeOrgToForm = useCallback(
    async (emp: any) => {
      if (!emp) return;
      let div = normalizeId(emp.division_id);
      const dept = normalizeId(emp.department_id);
      const des = normalizeId(emp.designation_id);

      if (!div && dept) {
        try {
          const dr: any = await api.getDepartment(dept);
          const d = dr?.data ?? dr;
          const divs = d?.divisions;
          if (Array.isArray(divs) && divs.length > 0) {
            div = normalizeId(divs[0]);
          }
        } catch {
          /* ignore */
        }
      }

      setToDiv(div);
      setToDept(dept);
      setToDesig(des);
      await refreshModalDepartments(div, dept);
    },
    [refreshModalDepartments]
  );

  const promotionComparison = useMemo(() => {
    if (formType === 'transfer') return null;
    const prevRaw = currentEmp?.gross_salary;
    const prev = prevRaw == null || prevRaw === '' ? null : Number(prevRaw);
    if (formType === 'increment') {
      const inc = parseFloat(incrementAmountInput);
      if (!Number.isFinite(inc) || inc <= 0) return null;
      const next = prev != null && Number.isFinite(prev) ? prev + inc : null;
      const delta = next != null ? inc : null;
      return { prev, next, delta };
    }
    const next = parseFloat(newGrossSalaryInput);
    if (!Number.isFinite(next)) return null;
    const delta = prev != null && Number.isFinite(prev) ? next - prev : null;
    return { prev, next, delta };
  }, [formType, currentEmp?.gross_salary, newGrossSalaryInput, incrementAmountInput]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, penRes] = await Promise.all([
        api.getPromotionTransferRequests(),
        canApprove
          ? api.getPromotionTransferPendingApprovals()
          : Promise.resolve({ success: true, data: [] as PtRequest[] }),
      ]);
      if (allRes?.success && Array.isArray(allRes.data)) setList(allRes.data as PtRequest[]);
      if (penRes?.success && Array.isArray(penRes.data)) setPendingList(penRes.data as PtRequest[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [canApprove]);

  const isSuperAdmin = useMemo(() => (user?.role || '').toLowerCase() === 'super_admin', [user?.role]);

  const canSuperAdminEditPendingRequest = useCallback(
    (r: PtRequest | null) => !!(r && isSuperAdmin && r.status === 'pending'),
    [isSuperAdmin]
  );

  useEffect(() => {
    if (!detail) setDetailEditMode(false);
  }, [detail]);

  useEffect(() => {
    if (!detailEditMode || !detail?.emp_no) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.getPromotionTransferPayrollMonths({
          past: 5,
          future: 5,
          emp_no: detail.emp_no,
        });
        if (cancelled) return;
        const rows = res?.data ?? res;
        setDetailEditPayrollMonths(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setDetailEditPayrollMonths([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailEditMode, detail?.emp_no]);

  const beginDetailEdit = useCallback(() => {
    if (!detail) return;
    setDetailEditRemarks(detail.remarks || '');
    setDetailEditNewGross(detail.newGrossSalary != null ? String(detail.newGrossSalary) : '');
    setDetailEditIncrement(detail.incrementAmount != null ? String(detail.incrementAmount) : '');
    const y = detail.effectivePayrollYear;
    const m = detail.effectivePayrollMonth;
    setDetailEditMonthLabel(y && m ? `${y}-${String(m).padStart(2, '0')}` : '');
    setDetailEditProposedId(normalizeId(detail.proposedDesignationId) || '');
    setDetailEditToDiv(normalizeId(detail.toDivisionId) || '');
    setDetailEditToDept(normalizeId(detail.toDepartmentId) || '');
    setDetailEditToDesig(normalizeId(detail.toDesignationId) || '');
    setDetailEditNote('');
    setDetailEditMode(true);
  }, [detail]);

  const saveDetailEdit = useCallback(async () => {
    if (!detail) return;
    setDetailEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        remarks: detailEditRemarks,
        ...(detailEditNote.trim() ? { editNote: detailEditNote.trim() } : {}),
      };
      if (detail.requestType === 'transfer') {
        body.toDivisionId = detailEditToDiv;
        body.toDepartmentId = detailEditToDept;
        body.toDesignationId = detailEditToDesig;
      } else {
        const parts = detailEditMonthLabel.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!y || m < 1 || m > 12) throw new Error('Select a valid effective payroll month');
        body.effectivePayrollYear = y;
        body.effectivePayrollMonth = m;
        if (detail.requestType === 'increment') {
          body.incrementAmount = Number(detailEditIncrement);
        } else {
          body.newGrossSalary = Number(detailEditNewGross);
        }
        if (detail.requestType === 'promotion' || detail.requestType === 'demotion') {
          body.proposedDesignationId = detailEditProposedId || null;
        }
        body.toDivisionId = detailEditToDiv || '';
        body.toDepartmentId = detailEditToDept || '';
        body.toDesignationId = detailEditToDesig || '';
      }
      const res: any = await api.updatePromotionTransferRequest(detail._id, body);
      if (!res?.success) throw new Error(res?.message || 'Update failed');
      const next = res.data ?? res;
      toast.success('Request updated');
      setDetail(next);
      setDetailEditMode(false);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setDetailEditSaving(false);
    }
  }, [
    detail,
    detailEditRemarks,
    detailEditNote,
    detailEditToDiv,
    detailEditToDept,
    detailEditToDesig,
    detailEditMonthLabel,
    detailEditIncrement,
    detailEditNewGross,
    detailEditProposedId,
    loadData,
  ]);

  const loadBulkEmployees = async () => {
    setBulkLoading(true);
    try {
      const filters: any = { is_active: true, limit: 500 };
      if (bulkDivisionId) filters.division_id = bulkDivisionId;
      if (bulkDepartmentId) filters.department_id = bulkDepartmentId;
      const r: any = await api.getEmployees(filters);
      const list = (r?.data ?? r) || [];
      const rows: BulkPtRow[] = list.map((emp: any) => ({
        employee: emp,
        requestType: bulkType,
        newGrossSalary: 0,
        selectedMonthLabel: '',
        toDivisionId: normalizeId(emp.division_id),
        toDepartmentId: normalizeId(emp.department_id),
        toDesignationId: normalizeId(emp.designation_id),
        remarks: '',
      }));
      setBulkRows(rows);
      clearAllBulkRowErrors();
      toast.info(rows.length ? `Loaded ${rows.length} employees` : 'No employees match filters');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load employees');
    } finally {
      setBulkLoading(false);
    }
  };

  const updateBulkRow = (index: number, field: keyof BulkPtRow, value: any) => {
    setBulkRows((prev) => {
      const next = [...prev];
      if (next[index]) {
        const k = bulkRowKey(next[index]);
        if (k) {
          setBulkRowErrors((er) => {
            if (!er || !er[k]) return er;
            const o = { ...er };
            delete o[k];
            return o;
          });
          setBulkRowErrorSource((s) => {
            if (!s || !s[k]) return s;
            const o = { ...s };
            delete o[k];
            return o;
          });
        }
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const handleBulkSave = async () => {
    const toCreate = bulkRows.filter(bulkRowIsToCreate);
    const errMap: Record<string, string[]> = {};

    for (const r of toCreate) {
      const rowErrs = validateBulkToCreateRow(r, payrollMonths);
      if (rowErrs.length) errMap[bulkRowKey(r)] = rowErrs;
    }

    if (toCreate.length === 0) {
      for (const r of bulkRows) {
        const hint = bulkRowNotReadyHints(r, payrollMonths);
        if (hint.length) errMap[bulkRowKey(r)] = hint;
      }
      if (Object.keys(errMap).length) {
        setClientBulkRowErrors(errMap);
        toast.error(
          `No row is ready to submit. Fix the issues highlighted in ${Object.keys(errMap).length} row(s), or add valid salary/org changes.`
        );
        return;
      }
      clearAllBulkRowErrors();
      toast.warn('No valid changes detected for any row. Check salaries, increment amounts, and transfer org changes.');
      return;
    }

    if (Object.keys(errMap).length) {
      setClientBulkRowErrors(errMap);
      toast.error(
        `Please fix the highlighted issues in ${Object.keys(errMap).length} row(s) before submitting.`
      );
      return;
    }

    clearAllBulkRowErrors();

    const buildRowBody = (r: BulkPtRow): any => {
      const body: any = {
        requestType: r.requestType,
        emp_no: r.employee.emp_no,
        remarks: (r.remarks || headerRemarks || `Bulk ${r.requestType}`).trim(),
      };
      if (r.requestType === 'promotion' || r.requestType === 'demotion' || r.requestType === 'increment') {
        const opt = payrollMonths.find((p) => p.label === r.selectedMonthLabel);
        if (!opt) {
          return null;
        }
        body.effectivePayrollYear = opt.payrollYear;
        body.effectivePayrollMonth = opt.payrollMonth;
        if (r.requestType === 'increment') {
          body.incrementAmount = Number(r.newGrossSalary);
        } else {
          body.newGrossSalary = Number(r.newGrossSalary);
          if (r.toDivisionId && normalizeId(r.employee.division_id) !== r.toDivisionId) body.toDivisionId = r.toDivisionId;
          if (r.toDepartmentId && normalizeId(r.employee.department_id) !== r.toDepartmentId) body.toDepartmentId = r.toDepartmentId;
          if (r.toDesignationId && normalizeId(r.employee.designation_id) !== r.toDesignationId) {
            body.proposedDesignationId = r.toDesignationId;
            body.toDesignationId = r.toDesignationId;
          }
        }
      } else {
        body.toDivisionId = r.toDivisionId || normalizeId(r.employee.division_id);
        body.toDepartmentId = r.toDepartmentId || normalizeId(r.employee.department_id);
        body.toDesignationId = r.toDesignationId || normalizeId(r.employee.designation_id);
      }
      return body;
    };

    setBulkSaving(true);
    try {
      const settled = await Promise.allSettled(
        toCreate.map((r) => {
          const body = buildRowBody(r);
          if (!body) {
            return Promise.resolve({ success: false, message: 'Invalid row after validation' });
          }
          return api.createPromotionTransferRequest(body);
        })
      );

      const successCount = settled.filter((x) => x.status === 'fulfilled' && (x.value as any)?.success).length;
      const failedCount = settled.length - successCount;

      const serverErrMap: Record<string, string[]> = {};
      toCreate.forEach((r, i) => {
        const errText = settledResultErrorMessage(settled[i]);
        if (errText) {
          const k = bulkRowKey(r);
          if (k) serverErrMap[k] = [errText];
        }
      });

      if (Object.keys(serverErrMap).length) {
        setBulkRowErrors(serverErrMap);
        setBulkRowErrorSource(
          Object.fromEntries(Object.keys(serverErrMap).map((k) => [k, 'server' as const])) as Record<
            string,
            'server'
          >
        );
        if (failedCount > 1) {
          toast.error(
            `${failedCount} request(s) failed. Each affected employee is highlighted in the list with the server message.`
          );
        } else {
          toast.error(Object.values(serverErrMap)[0][0] || 'Request failed');
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} request(s) created successfully`);
        loadData();
        // Clear submitted rows from the local state
        setBulkRows((prev) =>
          prev.filter((r) => {
            // Find if this row was one we tried to create
            const matched = toCreate.find((tc) => tc.employee._id === r.employee._id);
            if (!matched) return true; // Keep rows we didn't touch

            // If it was in toCreate, check if THAT specific request succeeded
            const idx = toCreate.indexOf(matched);
            const res = settled[idx];
            return !(res.status === 'fulfilled' && (res.value as any)?.success);
          })
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Bulk create failed');
    } finally {
      setBulkSaving(false);
    }
  };

  useEffect(() => {
    setUser(auth.getUser());
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canView) {
      toast.error('You do not have access to Promotions & Transfers');
      return;
    }
    loadData();
    // Pre-load data needed for bulk operations and standard forms
    api.getDivisions(true, undefined, true).then((r: any) => { if (r?.success && r?.data) setDivisions(r.data); }).catch(() => {});
    api.getDepartments(true, undefined, true).then((r: any) => { if (r?.success && r?.data) setMasterDepartments(r.data); }).catch(() => {});
    api.getAllDesignations(true).then((r: any) => { if (r?.success && r?.data) setAllDesignations(r.data); }).catch(() => {});
    api.getEmployeeGroups(true).then((r: any) => { if (r?.success && Array.isArray(r.data)) setEmployeeGroups(r.data); }).catch(() => {});
  }, [user, canView, loadData]);

  useEffect(() => {
    if (!user || !canView) return;
    const opts: { past: number; future: number; emp_no?: string } = { past: 5, future: 5 };
    if (empNoForPayroll) opts.emp_no = empNoForPayroll;
    api
      .getPromotionTransferPayrollMonths(opts)
      .then((r: any) => {
        if (r?.success && r?.data) setPayrollMonths(r.data);
        if (r?.success && r?.promotionPayroll) setPromotionPayroll(r.promotionPayroll);
      })
      .catch(() => {});
  }, [user, canView, empNoForPayroll]);

  const openCreateModal = async () => {
    setFormType('promotion');
    setSelectedEmpNo('');
    setSelectedMonthLabel('');
    setNewGrossSalaryInput('');
    setIncrementAmountInput('');
    setToDiv('');
    setToDept('');
    setToDesig('');
    setCurrentEmp(null);
    setRemarks('');
    setEmpSearchQuery('');
    setEmpSearchResults([]);
    setPaidDaysByMonth({});
    setModalOpen(true);
    try {
      const [des, divs] = await Promise.all([api.getAllDesignations(true), api.getDivisions(true, undefined, true)]);
      if (des?.success && Array.isArray(des.data)) setAllDesignations(des.data);
      else if (Array.isArray(des?.data)) setAllDesignations(des.data);
      if (divs?.success && Array.isArray(divs.data)) setDivisions(divs.data);

      if (!isEmployee) {
        /* employee list loaded via search input (debounced) */
      } else {
        const u = auth.getUser();
        const selfNo = u?.emp_no || u?.employeeId;
        if (selfNo) {
          setSelectedEmpNo(String(selfNo).toUpperCase());
          const one = await api.getEmployee(String(selfNo).toUpperCase());
          const emp = one?.data ?? one;
          if (emp) setCurrentEmp(emp);
          if (emp) await applyEmployeeOrgToForm(emp);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load form data');
    }
  };

  // Fetch paid days for the selected employee across the shown payroll cycles (same source as Arrears proration).
  useEffect(() => {
    if (!modalOpen) return;
    if (!currentEmp?._id) return;
    if (!payrollMonths || payrollMonths.length === 0) return;
    const startMonth = payrollMonths[0]?.label;
    const endMonth = payrollMonths[payrollMonths.length - 1]?.label;
    if (!startMonth || !endMonth) return;

    let cancelled = false;
    setPaidDaysLoading(true);
    api
      .getAttendanceDataRange(String(currentEmp._id), String(startMonth), String(endMonth))
      .then((res: any) => {
        if (cancelled) return;
        const rows = res?.success && Array.isArray(res?.data) ? res.data : [];
        const map: Record<string, { paidDays: number; totalDays: number }> = {};
        for (const r of rows) {
          const key = String(r.month);
          const paid = Number(r?.attendance?.totalPaidDays) || 0;
          const total = Number(r?.totalDaysInMonth) || 0;
          map[key] = { paidDays: paid, totalDays: total };
        }
        setPaidDaysByMonth(map);
      })
      .catch(() => {
        if (!cancelled) setPaidDaysByMonth({});
      })
      .finally(() => {
        if (!cancelled) setPaidDaysLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modalOpen, currentEmp?._id, payrollMonths]);

  useEffect(() => {
    if (!modalOpen || !selectedEmpNo) {
      setActivePendingRequest(null);
      setActivePendingLoading(false);
      return;
    }
    const emp = String(selectedEmpNo).trim().toUpperCase();
    if (!emp) {
      setActivePendingRequest(null);
      return;
    }
    let cancelled = false;
    setActivePendingLoading(true);
    void api
      .getPromotionTransferRequests({ emp_no: emp })
      .then((res: any) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        const p = rows.find((r: any) => String(r?.status || '').toLowerCase() === 'pending');
        if (p && p._id) {
          setActivePendingRequest({
            _id: String(p._id),
            requestType: String(p.requestType || 'request'),
            createdAt: p.createdAt,
          });
        } else {
          setActivePendingRequest(null);
        }
      })
      .catch(() => {
        if (!cancelled) setActivePendingRequest(null);
      })
      .finally(() => {
        if (!cancelled) setActivePendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, selectedEmpNo]);

  const payrollMonthsWithPaidDays = useMemo(() => {
    const on = promotionPayroll?.ongoingLabel;
    return payrollMonths.map((p) => {
      const rec = paidDaysByMonth[p.label];
      return {
        ...p,
        paidDays: rec ? rec.paidDays : undefined,
        totalDaysInMonth: rec ? rec.totalDays : undefined,
        /** Prefer server `ongoingLabel` so we do not infer ongoing from scanning the list. */
        isOngoing: on != null && on !== '' ? p.label === on : p.isOngoing,
      };
    });
  }, [payrollMonths, paidDaysByMonth, promotionPayroll?.ongoingLabel]);

  /**
   * Last closed month for server-side auto-arrears (not used for the on-screen proration range end).
   */
  const arrearProrationEndLabel = useMemo(() => {
    if (promotionPayroll?.arrearProrationEndLabel) return promotionPayroll.arrearProrationEndLabel;
    return '';
  }, [promotionPayroll]);

  /**
   * Operational ongoing pay month — always from `promotionPayroll.ongoingLabel` (not `containingKey`,
   * and not from scanning the cycles array). May be the month before the current run when that month is still open.
   */
  const ongoingPayMonthLabel = useMemo(() => {
    if (promotionPayroll?.ongoingLabel) return promotionPayroll.ongoingLabel;
    return '';
  }, [promotionPayroll?.ongoingLabel]);

  /**
   * Inclusive end month for paid-days proration: through the pay month **before** the ongoing run (exclude ongoing).
   * If effective is the ongoing month or later, no in-range proration.
   */
  const prorationFetchEndLabel = useMemo(() => {
    if (!selectedMonthLabel) return '';
    const ongoing = ongoingPayMonthLabel;
    if (ongoing) {
      const beforeOngoing = addPayrollMonths(ongoing, -1);
      if (comparePayrollYm(selectedMonthLabel, beforeOngoing) > 0) {
        return '';
      }
      return beforeOngoing;
    }
    if (arrearProrationEndLabel) {
      if (comparePayrollYm(selectedMonthLabel, arrearProrationEndLabel) > 0) return selectedMonthLabel;
      return arrearProrationEndLabel;
    }
    return selectedMonthLabel;
  }, [selectedMonthLabel, ongoingPayMonthLabel, arrearProrationEndLabel]);

  const prorationUsesSingleMonthOnly = useMemo(() => {
    if (!selectedMonthLabel || !prorationFetchEndLabel) return false;
    return comparePayrollYm(selectedMonthLabel, prorationFetchEndLabel) === 0;
  }, [selectedMonthLabel, prorationFetchEndLabel]);

  /** Chosen effective is the ongoing month or after — proration by policy excludes the ongoing month. */
  const prorationExcludedByOngoing = useMemo(() => {
    if (!selectedMonthLabel || !ongoingPayMonthLabel) return false;
    return comparePayrollYm(selectedMonthLabel, addPayrollMonths(ongoingPayMonthLabel, -1)) > 0;
  }, [selectedMonthLabel, ongoingPayMonthLabel]);

  useEffect(() => {
    if (!modalOpen) return;
    if (formType === 'transfer') return;
    if (selectedMonthLabel) return;
    const def = (promotionPayroll?.ongoingLabel || promotionPayroll?.containingKey) as string | undefined;
    if (def) {
      setSelectedMonthLabel(def);
    }
  }, [modalOpen, formType, selectedMonthLabel, promotionPayroll?.containingKey, promotionPayroll?.ongoingLabel]);

  // Paid-days proration: effective month → month *before* ongoing (exclude current pay run from the sum)
  useEffect(() => {
    if (!modalOpen) return;
    if (formType === 'transfer') {
      setProrationRows([]);
      return;
    }
    if (!currentEmp?._id) {
      setProrationRows([]);
      return;
    }
    const baseGross = Number(currentEmp?.gross_salary);
    if (!Number.isFinite(baseGross)) {
      setProrationRows([]);
      return;
    }
    let nextGross: number;
    if (formType === 'increment') {
      const inc = parseFloat(incrementAmountInput);
      if (!Number.isFinite(inc) || inc <= 0) {
        setProrationRows([]);
        return;
      }
      nextGross = baseGross + inc;
    } else {
      nextGross = parseFloat(newGrossSalaryInput);
      if (!Number.isFinite(nextGross) || nextGross <= 0) {
        setProrationRows([]);
        return;
      }
    }
    const delta = nextGross - baseGross;
    if (formType === 'promotion' && delta <= 0) {
      setProrationRows([]);
      return;
    }
    if (formType === 'demotion' && delta >= 0) {
      setProrationRows([]);
      return;
    }
    if (!selectedMonthLabel || !prorationFetchEndLabel) {
      setProrationRows([]);
      return;
    }
    if (comparePayrollYm(selectedMonthLabel, prorationFetchEndLabel) > 0) {
      setProrationRows([]);
      return;
    }

    let cancelled = false;
    setProrationLoading(true);
    api
      .getAttendanceDataRange(String(currentEmp._id), String(selectedMonthLabel), String(prorationFetchEndLabel))
      .then((res: any) => {
        if (cancelled) return;
        const rows = res?.success && Array.isArray(res?.data) ? res.data : [];
        const baseGross = Number(currentEmp?.gross_salary) || 0;
        const breakdown = rows.map((r: any) => {
          const month = String(r.month);
          const totalDays = Number(r.totalDaysInMonth) || 0;
          const paidDays = Number(r?.attendance?.totalPaidDays) || 0;
          
          const proratedPrev = totalDays > 0 ? (baseGross / totalDays) * paidDays : 0;
          const proratedNext = totalDays > 0 ? (nextGross / totalDays) * paidDays : 0;
          const proratedAmount = proratedNext - proratedPrev;

          return {
            month,
            totalDays,
            paidDays,
            proratedPrev,
            proratedNext,
            proratedAmount,
            hasRecord: true,
          };
        });
        setProrationRows(breakdown);
      })
      .catch(() => {
        if (!cancelled) setProrationRows([]);
      })
      .finally(() => {
        if (!cancelled) setProrationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modalOpen, formType, currentEmp?._id, newGrossSalaryInput, incrementAmountInput, selectedMonthLabel, prorationFetchEndLabel]);

  useEffect(() => {
    if (!modalOpen || isEmployee) return;
    const q = empSearchQuery.trim();
    if (q.length < 2) {
      setEmpSearchResults([]);
      setEmpSearchLoading(false);
      return;
    }
    let cancelled = false;
    setEmpSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.getEmployees({ search: q, is_active: true, limit: 50, page: 1 });
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setEmpSearchResults(
          rows.map((r: any) => ({
            emp_no: r.emp_no,
            employee_name: r.employee_name || r.name || r.emp_no,
          }))
        );
      } catch {
        if (!cancelled) setEmpSearchResults([]);
      } finally {
        if (!cancelled) setEmpSearchLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [empSearchQuery, modalOpen, isEmployee]);

  const onEmpChange = async (empNo: string) => {
    setSelectedEmpNo(empNo);
    // Reset search UI after selecting so users can search a fresh employee again.
    setEmpSearchQuery('');
    setEmpSearchResults([]);
    if (!empNo) {
      setCurrentEmp(null);
      return;
    }
    try {
      const one = await api.getEmployee(empNo);
      const emp = one?.data ?? one;
      setCurrentEmp(emp);
      await applyEmployeeOrgToForm(emp);
    } catch {
      setCurrentEmp(null);
    }
  };

  const submitRequest = async () => {
    if (!selectedEmpNo) {
      toast.error('Select employee');
      return;
    }
    setSubmitting(true);
    try {
      if (formType === 'transfer') {
        if (!toDiv || !toDept || !toDesig) {
          toast.error('Select target division, department, and designation');
          setSubmitting(false);
          return;
        }
        const res = await api.createPromotionTransferRequest({
          requestType: 'transfer',
          emp_no: selectedEmpNo,
          toDivisionId: toDiv,
          toDepartmentId: toDept,
          toDesignationId: toDesig,
          remarks,
        });
        if (!res?.success) throw new Error(res?.message || 'Failed');
        toast.success('Transfer request submitted');
      } else {
        const opt = payrollMonths.find((p) => p.label === selectedMonthLabel);
        if (!opt) {
          toast.error('Select effective payroll month');
          setSubmitting(false);
          return;
        }
        const prevG = currentEmp?.gross_salary;
        if (prevG == null || prevG === '' || !Number.isFinite(Number(prevG))) {
          toast.error('Current gross salary is missing for this employee');
          setSubmitting(false);
          return;
        }
        const prev = Number(prevG);
        const body: any = {
          requestType: formType,
          emp_no: selectedEmpNo,
          effectivePayrollYear: opt.payrollYear,
          effectivePayrollMonth: opt.payrollMonth,
          remarks,
        };
        if (formType === 'increment') {
          const inc = parseFloat(incrementAmountInput);
          if (!Number.isFinite(inc) || inc <= 0) {
            toast.error('Enter a valid increment amount (greater than zero)');
            setSubmitting(false);
            return;
          }
          body.incrementAmount = inc;
        } else {
          const nextGross = parseFloat(newGrossSalaryInput);
          if (!Number.isFinite(nextGross) || nextGross <= 0) {
            toast.error('Enter a valid new gross salary');
            setSubmitting(false);
            return;
          }
          const delta = nextGross - prev;
          if (formType === 'promotion' && delta <= 0) {
            toast.error('Promotion requires a higher gross salary than current');
            setSubmitting(false);
            return;
          }
          if (formType === 'demotion' && delta >= 0) {
            toast.error('Demotion requires a lower gross salary than current');
            setSubmitting(false);
            return;
          }
          body.newGrossSalary = nextGross;
        }
        if (formType !== 'increment') {
          const orgPatch = orgDeltaForPromotionPayload(currentEmp, toDiv, toDept, toDesig);
          if (orgPatch.toDivisionId) body.toDivisionId = orgPatch.toDivisionId;
          if (orgPatch.toDepartmentId) body.toDepartmentId = orgPatch.toDepartmentId;
          if (orgPatch.toDesignationId) {
            body.proposedDesignationId = orgPatch.toDesignationId;
            body.toDesignationId = orgPatch.toDesignationId;
          }
        }
        const res = await api.createPromotionTransferRequest(body);
        if (!res?.success) throw new Error(res?.message || 'Failed');
        const submittedLabel =
          formType === 'promotion'
            ? 'Promotion request submitted'
            : formType === 'demotion'
              ? 'Demotion request submitted'
              : 'Increment request submitted';
        toast.success(submittedLabel);
      }
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const listFilters = useMemo(
    () => ({
      divisionId: filterDivisionId,
      departmentId: filterDepartmentId,
      designationId: filterDesignationId,
      groupId: filterGroupId,
      requestType: filterRequestType,
    }),
    [filterDivisionId, filterDepartmentId, filterDesignationId, filterGroupId, filterRequestType]
  );

  const filtered = useMemo(() => {
    const src = tab === 'pending' ? pendingList : list;
    const q = search.trim().toLowerCase();
    return src.filter((r) => {
      if (!rowMatchesPtListFilters(r, listFilters)) return false;
      if (!q) return true;
      const name = r.employeeId?.employee_name?.toLowerCase() || '';
      return r.emp_no.toLowerCase().includes(q) || name.includes(q);
    });
  }, [list, pendingList, tab, search, listFilters]);

  const showBulkTargetOrgColumn = useMemo(
    () => bulkRows.some((r) => r.requestType !== 'increment'),
    [bulkRows]
  );

  const openDetail = async (id: string) => {
    try {
      setDetailEditMode(false);
      setDetailProrationRows([]);
      const res = await api.getPromotionTransferRequest(id);
      const d = res?.data ?? res;
      setDetail(d);
      setActionComment('');

      // Fetch proration for promotion/demotion/increment
      if (
        d &&
        (d.requestType === 'promotion' || d.requestType === 'demotion' || d.requestType === 'increment') &&
        d.employeeId?._id
      ) {
        const startLabel = `${d.effectivePayrollYear}-${String(d.effectivePayrollMonth || '').padStart(2, '0')}`;
        let ongoingLabel = '';
        let arrearEnd = arrearProrationEndLabel;
        try {
          const pm: any = await api.getPromotionTransferPayrollMonths({
            past: 5,
            future: 5,
            ...(d.emp_no ? { emp_no: d.emp_no } : {}),
          });
          if (pm?.success && pm?.promotionPayroll) {
            setPromotionPayroll(pm.promotionPayroll);
            ongoingLabel = pm.promotionPayroll.ongoingLabel || '';
            arrearEnd = pm.promotionPayroll.arrearProrationEndLabel || arrearEnd;
          }
        } catch {
          /* use state */
        }

        let fetchEnd = startLabel;
        if (ongoingLabel) {
          const beforeOngoing = addPayrollMonths(ongoingLabel, -1);
          fetchEnd = comparePayrollYm(startLabel, beforeOngoing) > 0 ? '' : beforeOngoing;
        } else if (arrearEnd) {
          fetchEnd = comparePayrollYm(startLabel, arrearEnd) > 0 ? startLabel : arrearEnd;
        }

        if (startLabel && fetchEnd && comparePayrollYm(startLabel, fetchEnd) <= 0) {
          setDetailProrationLoading(true);
          try {
            const attRes = await api.getAttendanceDataRange(String(d.employeeId._id), startLabel, fetchEnd);
            const attRows = attRes?.success && Array.isArray(attRes?.data) ? attRes.data : [];
            const nextG =
              d.newGrossSalary ??
              (d.previousGrossSalary != null && d.incrementAmount != null
                ? Number(d.previousGrossSalary) + Number(d.incrementAmount)
                : 0);
            const prevG = d.previousGrossSalary || 0;
            const delta = nextG - prevG;

            const breakdown = attRows.map((r: any) => {
              const month = String(r.month);
              const totalDays = Number(r.totalDaysInMonth) || 0;
              const paidDays = Number(r?.attendance?.totalPaidDays) || 0;
              
              const proratedPrev = totalDays > 0 ? (prevG / totalDays) * paidDays : 0;
              const proratedNext = totalDays > 0 ? (nextG / totalDays) * paidDays : 0;
              const proratedAmount = proratedNext - proratedPrev;

              return {
                month,
                totalDays,
                paidDays,
                proratedPrev,
                proratedNext,
                proratedAmount,
                hasRecord: true,
              };
            });
            setDetailProrationRows(breakdown);
          } catch (err) {
            console.error('Failed to fetch detail proration:', err);
          } finally {
            setDetailProrationLoading(false);
          }
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load detail');
    }
  };

  const doAction = async (action: 'approve' | 'reject') => {
    if (!detail?._id) return;
    setActionLoading(true);
    try {
      const res = await api.promotionTransferAction(detail._id, { action, comments: actionComment });
      if (!res?.success) throw new Error(res?.message || 'Action failed');
      toast.success(action === 'approve' ? 'Processed' : 'Rejected');
      setDetail(null);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const doCancel = async (id: string) => {
    try {
      const res = await api.cancelPromotionTransferRequest(id, {});
      if (!res?.success) throw new Error(res?.message || 'Cancel failed');
      toast.success('Cancelled');
      setDetail((d) => (d?._id === id ? null : d));
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Cancel failed');
    }
  };

  const doDelete = async (id: string) => {
    if (
      !confirm(
        'Delete this request permanently? This cannot be undone. Approved requests cannot be deleted from the server.'
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await api.deletePromotionTransferRequest(id);
      if (!res?.success) throw new Error(res?.message || 'Delete failed');
      toast.success('Request deleted');
      setDetail((d) => (d?._id === id ? null : d));
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (!user || !canView) {
    return (
      <div className="p-6 text-center text-slate-600 dark:text-slate-400">
        {!user ? 'Loading…' : 'You do not have access to this module.'}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="w-7 h-7 text-indigo-600" />
            Promotions & Transfers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Payroll-cycle promotions and internal transfers with approval workflow.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            New request
          </button>
        )}
      </div>

      {/* Bulk create section */}
      {canCreate && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <button
            type="button"
            onClick={() => setBulkSectionOpen((o) => !o)}
            className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1">Bulk create requests</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-normal"> Load employees to submit multiple promotions or transfers at once.</p>
              </div>
            </div>
            <span className="text-slate-400 transition-transform duration-200" style={{ transform: bulkSectionOpen ? 'rotate(180deg)' : 'none' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </span>
          </button>
          {bulkSectionOpen && (
            <div className="border-t border-slate-100 dark:border-slate-800 p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Request Type</label>
                  <select
                    value={bulkType}
                    onChange={(e) => setBulkType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                  >
                    <option value="promotion">Promotion</option>
                    <option value="demotion">Demotion</option>
                    <option value="transfer">Transfer</option>
                    <option value="increment">Increment</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Filter Division</label>
                  <select
                    value={bulkDivisionId}
                    onChange={(e) => { setBulkDivisionId(e.target.value); setBulkDepartmentId(''); }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                  >
                    <option value="">All Divisions</option>
                    {divisions.map((d: any) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Filter Department</label>
                  <select
                    value={bulkDepartmentId}
                    onChange={(e) => setBulkDepartmentId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                  >
                    <option value="">All Departments</option>
                    {masterDepartments.filter((d) => departmentBelongsToDivision(d, bulkDivisionId)).map((d: any) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={loadBulkEmployees}
                  disabled={bulkLoading}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                >
                  {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Load List
                </button>
              </div>

              {bulkRows.length > 0 && (
                <div className="space-y-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-3 py-3 text-left w-64">Employee</th>
                          <th className="px-3 py-3 text-left w-32">Type</th>
                          {showBulkTargetOrgColumn && (
                            <th className="px-3 py-3 text-left w-64">Target Org</th>
                          )}
                          <th className="px-3 py-3 text-left min-w-[200px]">Details & Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {bulkRows.map((row, idx) => {
                          const rKey = bulkRowKey(row);
                          const rowErrs = bulkRowErrors[rKey] || [];
                          const hasErr = rowErrs.length > 0;
                          const isServerErr = hasErr && bulkRowErrorSource[rKey] === 'server';
                          return (
                          <tr
                            key={row.employee._id}
                            className={`align-top transition-colors ${
                              hasErr
                                ? isServerErr
                                  ? 'bg-red-50/95 dark:bg-red-950/25 ring-1 ring-red-300 dark:ring-red-800/60'
                                  : 'bg-amber-50/90 dark:bg-amber-950/20 ring-1 ring-amber-300/80 dark:ring-amber-700/50'
                                : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <td className="px-3 py-4">
                              <div className="font-bold text-slate-900 dark:text-white mb-0.5">{row.employee.employee_name}</div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 font-medium">
                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded uppercase">{row.employee.emp_no}</span>
                                <span className="line-clamp-1 truncate">{row.employee.designation_id?.name || 'No Desig'}</span>
                              </div>
                              <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-2 flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                Current Gross: ₹{formatSalary(row.employee.gross_salary)}
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <select
                                value={row.requestType}
                                onChange={(e) => {
                                  const v = e.target.value as BulkPtRow['requestType'];
                                  const rk = bulkRowKey(row);
                                  if (rk) {
                                    setBulkRowErrors((er) => {
                                      if (!er || !er[rk]) return er;
                                      const o = { ...er };
                                      delete o[rk];
                                      return o;
                                    });
                                    setBulkRowErrorSource((s) => {
                                      if (!s || !s[rk]) return s;
                                      const o = { ...s };
                                      delete o[rk];
                                      return o;
                                    });
                                  }
                                  setBulkRows((prev) => {
                                    const next = [...prev];
                                    const cur = next[idx];
                                    if (!cur) return prev;
                                    next[idx] = {
                                      ...cur,
                                      requestType: v,
                                      ...(v === 'increment'
                                        ? { toDivisionId: '', toDepartmentId: '', toDesignationId: '' }
                                        : {}),
                                    };
                                    return next;
                                  });
                                }}
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-medium"
                              >
                                <option value="promotion">Promotion</option>
                                <option value="demotion">Demotion</option>
                                <option value="transfer">Transfer</option>
                                <option value="increment">Increment</option>
                              </select>
                            </td>
                            {showBulkTargetOrgColumn && (
                              <td className="px-3 py-4 space-y-2 align-top">
                                {row.requestType === 'increment' ? (
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                                ) : (
                                  <>
                                    <div className="space-y-0.5">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5">Division</p>
                                      <select
                                        value={row.toDivisionId}
                                        onChange={(e) => {
                                          updateBulkRow(idx, 'toDivisionId', e.target.value);
                                          updateBulkRow(idx, 'toDepartmentId', '');
                                        }}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none transition-all truncate"
                                      >
                                        <option value="">Select Division…</option>
                                        {divisions.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                      </select>
                                    </div>
                                    <div className="space-y-0.5">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5">Department</p>
                                      <select
                                        value={row.toDepartmentId}
                                        onChange={(e) => updateBulkRow(idx, 'toDepartmentId', e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none transition-all truncate"
                                      >
                                        <option value="">Select Department…</option>
                                        {masterDepartments.filter((d) => departmentBelongsToDivision(d, row.toDivisionId)).map((d) => (
                                          <option key={d._id} value={d._id}>{d.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="space-y-0.5">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5">Designation</p>
                                      <select
                                        value={row.toDesignationId}
                                        onChange={(e) => updateBulkRow(idx, 'toDesignationId', e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none transition-all truncate"
                                      >
                                        <option value="">Select Designation…</option>
                                        {allDesignations.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                      </select>
                                    </div>
                                  </>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-4 space-y-3">
                              {(row.requestType === 'promotion' || row.requestType === 'demotion' || row.requestType === 'increment') && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5 text-indigo-600">
                                      {row.requestType === 'increment' ? 'Increment (₹)' : 'New Gross (₹)'}
                                    </p>
                                    <input
                                      type="number"
                                      value={row.newGrossSalary || ''}
                                      onChange={(e) => updateBulkRow(idx, 'newGrossSalary', parseFloat(e.target.value) || 0)}
                                      placeholder="0"
                                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-bold text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5 text-indigo-600">Effective Month</p>
                                    <select
                                      value={row.selectedMonthLabel || ''}
                                      onChange={(e) => updateBulkRow(idx, 'selectedMonthLabel', e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                    >
                                      <option value="">Select…</option>
                                      {payrollMonths.map(m => <option key={m.label} value={m.label}>{m.label}</option>)}
                                    </select>
                                  </div>
                                </div>
                              )}
                              <div className="space-y-0.5">
                                <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5">Remarks</p>
                                <textarea
                                  value={row.remarks || ''}
                                  onChange={(e) => updateBulkRow(idx, 'remarks', e.target.value)}
                                  placeholder="Enter justification…"
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[10px] min-h-[46px] focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                />
                              </div>
                              {rowErrs.length > 0 && (
                                <div
                                  className={
                                    isServerErr
                                      ? 'mt-2 rounded-md border border-red-300 dark:border-red-800/60 bg-red-100/60 dark:bg-red-900/30 px-2.5 py-1.5 space-y-0.5'
                                      : 'mt-2 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-100/50 dark:bg-amber-900/20 px-2.5 py-1.5 space-y-0.5'
                                  }
                                >
                                  {isServerErr && (
                                    <p className="text-[9px] font-bold uppercase text-red-700 dark:text-red-300 tracking-wide">
                                      Server
                                    </p>
                                  )}
                                  {rowErrs.map((msg) => (
                                    <p
                                      key={`${row.employee.emp_no}-${msg}`}
                                      className={
                                        isServerErr
                                          ? 'text-[10px] text-red-900 dark:text-red-100 font-medium leading-tight'
                                          : 'text-[10px] text-amber-900 dark:text-amber-200 font-medium leading-tight'
                                      }
                                    >
                                      {msg}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-4">
                    <p className="text-xs text-slate-500 italic">
                      {bulkRows.length} employee(s) loaded. Clear rows with no changes before submitting.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkRows([]);
                          clearAllBulkRowErrors();
                        }}
                        className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-wider px-2"
                      >
                        Clear list
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkSave}
                        disabled={bulkSaving || bulkRows.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50"
                      >
                        {bulkSaving ? 'Saving batch…' : 'Submit Batch Requests'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur-sm p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 h-10 shrink-0">
            <Filter className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">Filters</span>
          </div>
          <div className="relative min-w-[min(100%,16rem)] flex-1 sm:min-w-[14rem] sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              placeholder="Search emp no / name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-10 w-full min-w-[8.5rem] sm:min-w-[7.5rem] sm:max-w-[11rem] sm:w-auto sm:flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium px-3"
            value={filterRequestType}
            onChange={(e) =>
              setFilterRequestType(
                (e.target.value || '') as '' | 'promotion' | 'demotion' | 'transfer' | 'increment'
              )
            }
            title="Request type"
          >
            <option value="">All types</option>
            <option value="promotion">Promotion</option>
            <option value="demotion">Demotion</option>
            <option value="transfer">Transfer</option>
            <option value="increment">Increment</option>
          </select>
          <select
            className="h-10 w-full min-w-[9rem] sm:min-w-[7.5rem] sm:max-w-[10rem] sm:w-auto sm:flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium px-3"
            value={filterDivisionId}
            onChange={(e) => {
              setFilterDivisionId(e.target.value);
              setFilterDepartmentId('');
            }}
          >
            <option value="">All divisions</option>
            {divisions.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 w-full min-w-[9rem] sm:min-w-[7.5rem] sm:max-w-[10rem] sm:w-auto sm:flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium px-3"
            value={filterDepartmentId}
            onChange={(e) => setFilterDepartmentId(e.target.value)}
          >
            <option value="">All departments</option>
            {masterDepartments
              .filter((d) => departmentBelongsToDivision(d, filterDivisionId))
              .map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
          </select>
          <select
            className="h-10 w-full min-w-[8rem] sm:min-w-[6.5rem] sm:max-w-[9rem] sm:w-auto sm:flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium px-3"
            value={filterGroupId}
            onChange={(e) => setFilterGroupId(e.target.value)}
          >
            <option value="">All groups</option>
            {employeeGroups.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 w-full min-w-[8rem] sm:min-w-[6.5rem] sm:max-w-[9rem] sm:w-auto sm:flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium px-3"
            value={filterDesignationId}
            onChange={(e) => setFilterDesignationId(e.target.value)}
          >
            <option value="">All designations</option>
            {allDesignations.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 shrink-0 w-full min-[900px]:w-auto min-[900px]:ml-auto">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold ${
                tab === 'all'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All
            </button>
            {canApprove && (
              <button
                type="button"
                onClick={() => setTab('pending')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap ${
                  tab === 'pending'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Pending my action
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-slate-500">No requests</p>
        ) : (
          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-sm min-w-[960px]">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[160px]">Employee</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[100px]">Division</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[100px]">Department</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[100px]">Group</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[100px]">Designation</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold w-24">Type</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[180px]">Summary</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold min-w-[10rem] w-36">Status</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold w-24 min-w-[6.5rem]">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-3 sm:px-4 py-3 align-top">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {r.employeeId?.employee_name || r.emp_no}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{r.emp_no}</div>
                    </td>
                    <td
                      className="px-3 sm:px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate"
                      title={orgFieldName(r.employeeId?.division_id)}
                    >
                      {orgFieldName(r.employeeId?.division_id)}
                    </td>
                    <td
                      className="px-3 sm:px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate"
                      title={orgFieldName(r.employeeId?.department_id)}
                    >
                      {orgFieldName(r.employeeId?.department_id)}
                    </td>
                    <td
                      className="px-3 sm:px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate"
                      title={orgFieldName(r.employeeId?.employee_group_id)}
                    >
                      {orgFieldName(r.employeeId?.employee_group_id)}
                    </td>
                    <td
                      className="px-3 sm:px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate"
                      title={orgFieldName(r.employeeId?.designation_id)}
                    >
                      {orgFieldName(r.employeeId?.designation_id)}
                    </td>
                    <td className="px-3 sm:px-4 py-3 capitalize text-xs">{r.requestType}</td>
                    <td className="px-3 sm:px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                      {r.requestType === 'promotion' || r.requestType === 'demotion' || r.requestType === 'increment' ? (
                        <span className="text-xs leading-relaxed">
                          {r.requestType === 'increment' && r.incrementAmount != null ? (
                            <>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {formatSalary(r.previousGrossSalary)} → {formatSalary(r.newGrossSalary)}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {' '}
                                (+{formatSalary(r.incrementAmount)} increment)
                              </span>
                            </>
                          ) : r.newGrossSalary != null ? (
                            <>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {formatSalary(r.previousGrossSalary)} → {formatSalary(r.newGrossSalary)}
                              </span>
                              {promotionDelta(r.previousGrossSalary, r.newGrossSalary) != null && (
                                <span className="text-slate-500 dark:text-slate-400">
                                  {' '}
                                  (
                                  {promotionDelta(r.previousGrossSalary, r.newGrossSalary)! >= 0 ? '+' : ''}
                                  {formatSalary(promotionDelta(r.previousGrossSalary, r.newGrossSalary)!)})
                                </span>
                              )}
                            </>
                          ) : r.incrementAmount != null ? (
                            <span>+{formatSalary(r.incrementAmount)}</span>
                          ) : (
                            <span>—</span>
                          )}
                          <span className="text-slate-400"> · </span>
                          {r.effectivePayrollYear}-{String(r.effectivePayrollMonth || '').padStart(2, '0')}
                        </span>
                      ) : (
                        <span className="text-xs">
                          {r.fromDepartmentId?.name || '—'} → {r.toDepartmentId?.name || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 max-w-[13rem]">
                      {(() => {
                        const st = ptRequestStatusPresentation(r);
                        return (
                          <span
                            className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-left text-xs font-medium ${st.className}`}
                            title={st.title}
                          >
                            <span className="line-clamp-2 break-words">{st.label}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 sm:px-4 py-3 align-middle w-24 min-w-[6.5rem]">
                      <button
                        type="button"
                        onClick={() => openDetail(r._id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200/90 dark:border-indigo-700/80 bg-indigo-50/95 dark:bg-indigo-950/45 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 dark:text-indigo-200 shadow-sm hover:bg-indigo-100/90 dark:hover:bg-indigo-900/55 transition-colors whitespace-nowrap"
                        title="Open full details, approvals, cancel and delete"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-lg">New request</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-4">
                  {!isEmployee ? (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Employee</label>
                      <div className="relative mt-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="search"
                          autoComplete="off"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm"
                          placeholder="Search by name or employee number…"
                          value={empSearchQuery}
                          onChange={(e) => setEmpSearchQuery(e.target.value)}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Type at least 2 characters. Results respect your data scope.
                      </p>
                      {empSearchLoading && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Searching…
                        </div>
                      )}
                      {selectedEmpNo && (
                        <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2 text-xs">
                          <span className="text-slate-500">Selected: </span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{selectedEmpNo}</span>
                          {currentEmp?.employee_name && (
                            <span className="text-slate-700 dark:text-slate-300"> — {currentEmp.employee_name}</span>
                          )}
                        </div>
                      )}
                      {!empSearchLoading && empSearchQuery.trim().length >= 2 && empSearchResults.length === 0 && (
                        <p className="mt-2 text-xs text-slate-500">No employees found.</p>
                      )}
                      {empSearchResults.length > 0 && (
                        <ul
                          className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800"
                          role="listbox"
                        >
                          {empSearchResults.map((e) => (
                            <li key={e.emp_no}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={selectedEmpNo === e.emp_no}
                                onClick={() => onEmpChange(e.emp_no)}
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                                  selectedEmpNo === e.emp_no
                                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                                }`}
                              >
                                <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{e.emp_no}</span>
                                <span className="block font-medium text-slate-900 dark:text-white">{e.employee_name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Employee: <strong>{selectedEmpNo}</strong>
                    </div>
                  )}

                  {activePendingLoading && selectedEmpNo && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
                      Checking for an existing open request…
                    </p>
                  )}
                  {!activePendingLoading && activePendingRequest && (
                    <div
                      className="rounded-xl border border-amber-300 bg-amber-50/95 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-3 text-sm text-amber-950 dark:text-amber-50"
                      role="status"
                    >
                      <p className="font-semibold text-amber-900 dark:text-amber-100">Open request already exists</p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
                        This employee has a pending{' '}
                        <span className="capitalize font-medium">{activePendingRequest.requestType}</span> that is not fully approved.
                        Finish the workflow (approve/reject) or cancel it before submitting a new one. Once a request is fully approved, you
                        can raise another.
                      </p>
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 underline underline-offset-2 hover:text-indigo-900 dark:hover:text-indigo-100"
                        onClick={() => {
                          const id = activePendingRequest._id;
                          setModalOpen(false);
                          void openDetail(id);
                        }}
                      >
                        View existing request
                      </button>
                    </div>
                  )}

                  {currentEmp && (
                    <div className="text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1">
                      <div>
                        Current division: <strong>{currentEmp.division_id?.name || '—'}</strong>
                      </div>
                      <div>
                        Current department: <strong>{currentEmp.department_id?.name || '—'}</strong>
                      </div>
                      <div>
                        Current designation: <strong>{currentEmp.designation_id?.name || '—'}</strong>
                      </div>
                      {formType !== 'transfer' && (
                        <div>
                          Current gross: <strong>{currentEmp.gross_salary ?? '—'}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedMonthLabel &&
                    (prorationFetchEndLabel || prorationExcludedByOngoing) &&
                    formType !== 'transfer' &&
                    (formType === 'increment'
                      ? parseFloat(incrementAmountInput) > 0
                      : parseFloat(newGrossSalaryInput) > 0)) ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/20 overflow-hidden">
                      {prorationExcludedByOngoing && !prorationFetchEndLabel ? (
                        <div className="px-3 py-3 text-xs text-amber-800 dark:text-amber-200/90 bg-amber-50/80 dark:bg-amber-950/30">
                          Paid-days proration does not include the <strong>ongoing</strong> pay month (
                          {ongoingPayMonthLabel}
                          ). Use an effective month on or before{' '}
                          <strong>{ongoingPayMonthLabel ? addPayrollMonths(ongoingPayMonthLabel, -1) : '—'}</strong> to
                          see the month breakdown.
                        </div>
                      ) : (
                        <>
                      <div className="px-3 py-2 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Paid-days proration
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {selectedMonthLabel} → {prorationFetchEndLabel}
                            <span className="text-slate-400">
                              {prorationUsesSingleMonthOnly
                                ? ' (single month in range)'
                                : ' (through the month before the ongoing pay run — ongoing excluded)'}
                            </span>
                          </div>
                        </div>
                        {prorationLoading ? (
                          <div className="text-xs text-slate-500 inline-flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading…
                          </div>
                        ) : null}
                      </div>

                      {prorationRows.length === 0 && !prorationLoading ? (
                        <div className="px-3 py-3 text-xs text-slate-500">
                          No pay-register/payroll data found for this range.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white dark:bg-slate-900">
                              <tr className="text-slate-500">
                                <th className="text-left px-3 py-2 font-semibold">Month</th>
                                <th className="text-left px-3 py-2 font-semibold">Paid days</th>
                                <th className="text-right px-3 py-2 font-semibold">Paid (current)</th>
                                <th className="text-right px-3 py-2 font-semibold">Extra pay</th>
                                <th className="text-right px-3 py-2 font-semibold">Paid (after change)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {prorationRows.map((r) => {
                                const baseGross = Number(currentEmp?.gross_salary) || 0;
                                let safeNewGross = baseGross;
                                if (formType === 'increment') {
                                  const inc = parseFloat(incrementAmountInput);
                                  if (Number.isFinite(inc) && inc > 0) safeNewGross = baseGross + inc;
                                } else {
                                  const newGross = parseFloat(newGrossSalaryInput);
                                  if (Number.isFinite(newGross)) safeNewGross = newGross;
                                }

                                const paidDays = Number(r.paidDays) || 0;
                                const totalDays = Number(r.totalDays) || 0;
                                const paidCurrent = totalDays > 0 ? (baseGross / totalDays) * paidDays : 0;
                                const paidAfter = totalDays > 0 ? (safeNewGross / totalDays) * paidDays : 0;
                                return (
                                  <tr key={r.month}>
                                    <td className="px-3 py-2 font-mono">{r.month}</td>
                                    <td className="px-3 py-2">
                                      {r.paidDays}/{r.totalDays}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      ₹{paidCurrent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold">
                                      {r.proratedAmount < 0 ? '-' : ''}₹
                                      {Math.abs(r.proratedAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold">
                                      ₹{paidAfter.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-slate-800/40">
                              <tr>
                                <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" colSpan={2}>
                                  Total (prorated)
                                </td>
                                <td className="px-3 py-2 text-right font-bold">
                                  {(() => {
                                    const total = prorationRows.reduce((s, x) => s + (Number(x.proratedAmount) || 0), 0);
                                    return `${total < 0 ? '-' : ''}₹${Math.abs(total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                                  })()}
                                </td>
                                <td className="px-3 py-2" />
                                <td className="px-3 py-2" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Request type</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={formType}
                  onChange={(e) => {
                    const v = e.target.value as typeof formType;
                    setFormType(v);
                    if (v === 'increment') {
                      setToDiv('');
                      setToDept('');
                      setToDesig('');
                    }
                  }}
                >
                  <option value="promotion">Promotion</option>
                  <option value="demotion">Demotion</option>
                  <option value="transfer">Transfer</option>
                  <option value="increment">Increment</option>
                </select>
              </div>

              {formType !== 'transfer' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Effective payroll month (cycle)</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      value={selectedMonthLabel}
                      onChange={(e) => setSelectedMonthLabel(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {payrollMonthsWithPaidDays.map((p) => (
                        <option key={p.label} value={p.label}>
                          {p.label}
                          {p.periodRangeDisplay ? ` · ${p.periodRangeDisplay}` : ''}
                          {p.isOngoing ? ' (ONGOING)' : ''}
                          {p.paidDays != null && p.totalDaysInMonth != null
                            ? ` — ${p.paidDays}/${p.totalDaysInMonth} paid days`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Pay period dates use payroll start/end day from settings. Each value is the batch month id (YYYY-MM) for that run.
                      {promotionPayroll?.containingRangeDisplay ? (
                        <>
                          {' '}
                          Today in IST: <strong>{promotionPayroll.containingRangeDisplay}</strong>
                          {promotionPayroll.containingKey ? (
                            <span> (id {promotionPayroll.containingKey})</span>
                          ) : null}
                          {promotionPayroll.settingsStartDay != null && promotionPayroll.settingsEndDay != null ? (
                            <span>
                              {' '}
                              — cycle {promotionPayroll.settingsStartDay}–{promotionPayroll.settingsEndDay} (day of month)
                            </span>
                          ) : null}
                          .{' '}
                        </>
                      ) : null}
                      {promotionPayroll?.ongoingLabel &&
                      promotionPayroll.ongoingLabel !== promotionPayroll.containingKey ? (
                        <span> Operational ongoing pay month: {promotionPayroll.ongoingLabel} (today&apos;s run: {promotionPayroll.containingKey}).</span>
                      ) : null}
                      {paidDaysLoading ? ' Loading paid days…' : ''}
                    </p>
                  </div>
                  {formType === 'increment' ? (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Increment amount (₹)</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        value={incrementAmountInput}
                        onChange={(e) => setIncrementAmountInput(e.target.value)}
                        placeholder="Amount to add to current gross"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        New gross is calculated as current gross plus this amount (you do not enter the full new gross).
                      </p>
                      {promotionComparison && promotionComparison.next != null && Number.isFinite(promotionComparison.next) && (
                        <div className="mt-2 rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2 text-xs space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500 dark:text-slate-400">Current gross</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {promotionComparison.prev != null && Number.isFinite(promotionComparison.prev)
                                ? formatSalary(promotionComparison.prev)
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500 dark:text-slate-400">New gross (after increment)</span>
                            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                              {formatSalary(promotionComparison.next)}
                            </span>
                          </div>
                          {promotionComparison.delta != null && (
                            <div className="flex justify-between gap-2 pt-1 border-t border-indigo-200/60 dark:border-indigo-800/60">
                              <span className="text-slate-500 dark:text-slate-400">Increment</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                +{formatSalary(promotionComparison.delta)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">New gross salary</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        value={newGrossSalaryInput}
                        onChange={(e) => setNewGrossSalaryInput(e.target.value)}
                        placeholder="e.g. 85000"
                      />
                      {promotionComparison && Number.isFinite(promotionComparison.next) && (
                        <div className="mt-2 rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2 text-xs space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500 dark:text-slate-400">Current gross</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {promotionComparison.prev != null && Number.isFinite(promotionComparison.prev)
                                ? formatSalary(promotionComparison.prev)
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500 dark:text-slate-400">New gross</span>
                            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                              {formatSalary(promotionComparison.next)}
                            </span>
                          </div>
                          {promotionComparison.delta != null && (
                            <div className="flex justify-between gap-2 pt-1 border-t border-indigo-200/60 dark:border-indigo-800/60">
                              <span className="text-slate-500 dark:text-slate-400">Change</span>
                              <span
                                className={`font-bold ${
                                  promotionComparison.delta >= 0
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {promotionComparison.delta >= 0 ? '+' : ''}
                                {formatSalary(promotionComparison.delta)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </>
              )}

              {formType === 'transfer' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Amount (optional)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    value={newGrossSalaryInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewGrossSalaryInput(val);
                      const num = parseFloat(val);
                      if (Number.isFinite(num) && num > 0 && formType === 'transfer') {
                        setFormType('promotion');
                      }
                    }}
                    placeholder="Enter amount to convert this to a promotion"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    If you enter an amount greater than 0, this request will be treated as a promotion.
                  </p>
                </div>
              )}

              {formType !== 'increment' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">To division</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      value={toDiv}
                      onChange={(e) => {
                        const v = e.target.value;
                        setToDiv(v);
                        setToDept('');
                        void refreshModalDepartments(v, '');
                      }}
                    >
                      <option value="">No change</option>
                      {divisions.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">To department</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      value={toDept}
                      onChange={(e) => setToDept(e.target.value)}
                    >
                      <option value="">No change</option>
                      {modalDepartments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">To designation</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      value={toDesig}
                      onChange={(e) => setToDesig(e.target.value)}
                    >
                      <option value="">No change</option>
                      {allDesignations.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Remarks</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[72px]"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              <button
                type="button"
                disabled={submitting || activePendingLoading || !!activePendingRequest}
                onClick={submitRequest}
                title={
                  activePendingRequest
                    ? 'Resolve the existing pending request before submitting a new one'
                    : undefined
                }
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Submit
              </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 sm:px-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-[min(100%,calc(100vw-1.5rem))] sm:max-w-[90rem] sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="font-semibold text-base sm:text-lg min-w-0 truncate">Request detail</h2>
              <div className="flex items-center gap-2 shrink-0">
                {canSuperAdminEditPendingRequest(detail) && !detailEditMode && (
                  <button
                    type="button"
                    onClick={beginDetailEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-900/50"
                    title="Super admin: edit while this request is still pending"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
                {canSuperAdminEditPendingRequest(detail) && detailEditMode && (
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 px-1">Editing</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDetail(null);
                    setDetailEditMode(false);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 -mr-0.5"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col text-sm">
              {/* Row 1: summary (left) + workflow & actions (right) */}
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 min-w-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
                <div className="min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5 lg:pr-6 space-y-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Employee</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {detail.employeeId?.employee_name || detail.emp_no}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{detail.emp_no}</p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500">Division: </span>
                        <span className="text-slate-800 dark:text-slate-200">{orgFieldName(detail.employeeId?.division_id)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Department: </span>
                        <span className="text-slate-800 dark:text-slate-200">{orgFieldName(detail.employeeId?.department_id)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Group: </span>
                        <span className="text-slate-800 dark:text-slate-200">{orgFieldName(detail.employeeId?.employee_group_id)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Designation: </span>
                        <span className="text-slate-800 dark:text-slate-200">{orgFieldName(detail.employeeId?.designation_id)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Type</span>
                    <span className="font-medium capitalize">{detail.requestType}</span>
                  </div>
                  <div className="flex justify-between gap-2 items-start">
                    <span className="text-slate-500 shrink-0">Status</span>
                    {(() => {
                      const st = ptRequestStatusPresentation(detail);
                      return (
                        <span
                          className={`max-w-[min(100%,14rem)] text-right px-2 py-0.5 rounded-full text-xs font-medium ${st.className}`}
                          title={st.title}
                        >
                          {st.label}
                        </span>
                      );
                    })()}
                  </div>
                  {(detail.requestType === 'promotion' ||
                    detail.requestType === 'demotion' ||
                    detail.requestType === 'increment') && (
                    <>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Previous gross</span>
                          <span className="font-medium">{formatSalary(detail.previousGrossSalary)}</span>
                        </div>
                        {detail.requestType === 'increment' && detail.incrementAmount != null && (
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Increment amount</span>
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              +{formatSalary(detail.incrementAmount)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">New gross</span>
                          <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-right">
                            {detail.newGrossSalary != null ? (
                              formatSalary(detail.newGrossSalary)
                            ) : detail.incrementAmount != null ? (
                              <span className="text-amber-800 dark:text-amber-200 text-xs font-normal">
                                +{formatSalary(detail.incrementAmount)} (derived on save)
                              </span>
                            ) : (
                              '—'
                            )}
                          </span>
                        </div>
                        {promotionDelta(detail.previousGrossSalary, detail.newGrossSalary) != null && (
                          <div className="flex justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                            <span className="text-slate-500">Comparison (change)</span>
                            <span
                              className={
                                promotionDelta(detail.previousGrossSalary, detail.newGrossSalary)! >= 0
                                  ? 'font-bold text-emerald-700 dark:text-emerald-400'
                                  : 'font-bold text-amber-700 dark:text-amber-400'
                              }
                            >
                              {promotionDelta(detail.previousGrossSalary, detail.newGrossSalary)! >= 0 ? '+' : ''}
                              {formatSalary(promotionDelta(detail.previousGrossSalary, detail.newGrossSalary)!)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">Effective month</span>
                        <span>
                          {detail.effectivePayrollYear}-{String(detail.effectivePayrollMonth || '').padStart(2, '0')}
                        </span>
                      </div>
                      {detail.requestType !== 'increment' && detail.proposedDesignationId?.name && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Proposed designation</span>
                          <span className="text-right">{detail.proposedDesignationId.name}</span>
                        </div>
                      )}
                    </>
                  )}
                  {detail.requestType === 'transfer' && (
                    <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg">
                      <div>
                        From: {detail.fromDivisionId?.name} / {detail.fromDepartmentId?.name} /{' '}
                        {detail.fromDesignationId?.name}
                      </div>
                      <div>
                        To: {detail.toDivisionId?.name} / {detail.toDepartmentId?.name} / {detail.toDesignationId?.name}
                      </div>
                    </div>
                  )}
                  <RequestActivityHistory history={detail.workflow?.history} />
                </div>

                <div className="min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5 lg:pl-6 space-y-4">
                  {canSuperAdminEditPendingRequest(detail) && detailEditMode && (
                    <div className="rounded-xl border border-violet-200/90 dark:border-violet-800/80 bg-violet-50/50 dark:bg-violet-950/20 p-4 sm:p-5 space-y-4 text-sm">
                      <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                        Super admin — edit
                      </p>
                      <div>
                        <label className="text-xs font-semibold text-slate-500">Remarks</label>
                        <textarea
                          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[64px]"
                          value={detailEditRemarks}
                          onChange={(e) => setDetailEditRemarks(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500">Audit note (optional)</label>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          placeholder="Reason for this change (stored in history)"
                          value={detailEditNote}
                          onChange={(e) => setDetailEditNote(e.target.value)}
                        />
                      </div>
                      {detail.requestType === 'transfer' ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 min-w-0">
                          <div className="min-w-0">
                            <label className="text-xs font-semibold text-slate-500">To division</label>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                              value={detailEditToDiv}
                              onChange={(e) => {
                                setDetailEditToDiv(e.target.value);
                                setDetailEditToDept('');
                              }}
                            >
                              {divisions.map((d) => (
                                <option key={d._id} value={d._id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="min-w-0">
                            <label className="text-xs font-semibold text-slate-500">To department</label>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                              value={detailEditToDept}
                              onChange={(e) => setDetailEditToDept(e.target.value)}
                            >
                              {masterDepartments
                                .filter((d) => departmentBelongsToDivision(d, detailEditToDiv))
                                .map((d) => (
                                  <option key={d._id} value={d._id}>
                                    {d.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="min-w-0">
                            <label className="text-xs font-semibold text-slate-500">To designation</label>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                              value={detailEditToDesig}
                              onChange={(e) => setDetailEditToDesig(e.target.value)}
                            >
                              {allDesignations.map((d) => (
                                <option key={d._id} value={d._id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <>
                          {detail.requestType === 'increment' ? (
                            <div>
                              <label className="text-xs font-semibold text-slate-500">Increment amount</label>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={detailEditIncrement}
                                onChange={(e) => setDetailEditIncrement(e.target.value)}
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="text-xs font-semibold text-slate-500">New gross salary</label>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={detailEditNewGross}
                                onChange={(e) => setDetailEditNewGross(e.target.value)}
                              />
                            </div>
                          )}
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Effective payroll month</label>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                              value={detailEditMonthLabel}
                              onChange={(e) => setDetailEditMonthLabel(e.target.value)}
                            >
                              {detailEditMonthLabel &&
                                !detailEditPayrollMonths.some((o) => o.label === detailEditMonthLabel) && (
                                  <option value={detailEditMonthLabel}>{detailEditMonthLabel} (current)</option>
                                )}
                              {detailEditPayrollMonths.map((opt) => (
                                <option key={opt.label} value={opt.label}>
                                  {opt.label}
                                  {opt.isOngoing ? ' (ongoing)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          {(detail.requestType === 'promotion' || detail.requestType === 'demotion') && (
                            <div>
                              <label className="text-xs font-semibold text-slate-500">Proposed designation</label>
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={detailEditProposedId}
                                onChange={(e) => setDetailEditProposedId(e.target.value)}
                              >
                                <option value="">None / no change in title</option>
                                {allDesignations.map((d) => (
                                  <option key={d._id} value={d._id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-500">
                            Optional org target — clear all three to keep the request unchanged.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 min-w-0">
                            <div className="min-w-0">
                              <label className="text-xs font-semibold text-slate-500">Division</label>
                              <select
                                className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                                value={detailEditToDiv}
                                onChange={(e) => {
                                  setDetailEditToDiv(e.target.value);
                                  setDetailEditToDept('');
                                }}
                              >
                                <option value="">—</option>
                                {divisions.map((d) => (
                                  <option key={d._id} value={d._id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-0">
                              <label className="text-xs font-semibold text-slate-500">Department</label>
                              <select
                                className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                                value={detailEditToDept}
                                onChange={(e) => setDetailEditToDept(e.target.value)}
                              >
                                <option value="">—</option>
                                {masterDepartments
                                  .filter((d) => departmentBelongsToDivision(d, detailEditToDiv))
                                  .map((d) => (
                                    <option key={d._id} value={d._id}>
                                      {d.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="min-w-0">
                              <label className="text-xs font-semibold text-slate-500">Designation</label>
                              <select
                                className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                                value={detailEditToDesig}
                                onChange={(e) => setDetailEditToDesig(e.target.value)}
                              >
                                <option value="">—</option>
                                {allDesignations.map((d) => (
                                  <option key={d._id} value={d._id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={detailEditSaving}
                          onClick={saveDetailEdit}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white font-medium px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
                        >
                          {detailEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Save changes
                        </button>
                        <button
                          type="button"
                          disabled={detailEditSaving}
                          onClick={() => {
                            setDetailEditMode(false);
                            setDetailEditNote('');
                          }}
                          className="rounded-xl border border-slate-200 dark:border-slate-600 px-4 py-2 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {detail.workflow?.approvalChain && detail.workflow.approvalChain.length > 0 && (
                    <div className={detailEditMode ? 'opacity-50 pointer-events-none' : ''}>
                      <PromotionApprovalTimeline workflow={detail.workflow} />
                    </div>
                  )}
                  {detail.status === 'pending' && canApprove && !detailEditMode && (
                    <>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your decision</p>
                      <textarea
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        placeholder="Comment (optional)"
                        value={actionComment}
                        onChange={(e) => setActionComment(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => doAction('approve')}
                          className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-medium inline-flex items-center justify-center gap-1"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => doAction('reject')}
                          className="flex-1 py-2 rounded-xl bg-red-600 text-white font-medium inline-flex items-center justify-center gap-1"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                  {(canCancelRequest(detail) || canDeleteRow(detail)) && !detailEditMode && (
                    <div className="space-y-2 pt-1 border-t border-slate-200/80 dark:border-slate-700/80">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Request actions</p>
                      {canCancelRequest(detail) && (
                        <button
                          type="button"
                          onClick={() => doCancel(detail._id)}
                          className="w-full py-2 rounded-xl border border-amber-200/90 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 font-medium text-sm inline-flex items-center justify-center gap-2 hover:bg-amber-100/90 dark:hover:bg-amber-900/40 transition-colors"
                        >
                          <Ban className="w-4 h-4 shrink-0" />
                          Cancel request
                        </button>
                      )}
                      {canDeleteRow(detail) && (
                        <button
                          type="button"
                          disabled={deletingId === detail._id}
                          onClick={() => doDelete(detail._id)}
                          className="w-full py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 font-medium text-sm inline-flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                        >
                          {deletingId === detail._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Delete request permanently
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: wide proration strip (scrolls independently) */}
              {(detail.requestType === 'promotion' ||
                detail.requestType === 'demotion' ||
                detail.requestType === 'increment') &&
                (detailProrationRows.length > 0 || detailProrationLoading) && (
                  <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 max-h-[38vh] min-h-0 overflow-y-auto px-4 py-3">
                    {detailProrationLoading && detailProrationRows.length === 0 && (
                      <div className="flex items-center gap-2 py-6 justify-center text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading calculated proration…
                      </div>
                    )}
                    {detailProrationRows.length > 0 && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                        <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Proration breakdown (extra pay)
                          </h4>
                        </div>
                        <table className="w-full text-[11px]">
                          <thead className="bg-slate-50/50 dark:bg-slate-800/40 text-[10px] text-slate-400 font-semibold text-left border-b border-slate-100 dark:border-slate-800">
                            <tr>
                              <th className="px-3 py-2">Month</th>
                              <th className="px-3 py-2 text-center">Attendance</th>
                              <th className="px-3 py-2 text-right">Curr. (Prorat.)</th>
                              <th className="px-3 py-2 text-right">New. (Prorat.)</th>
                              <th className="px-3 py-2 text-right">Extra pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                            {detailProrationRows.map((p) => (
                              <tr key={p.month} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{p.month}</td>
                                <td className="px-3 py-2 text-center text-slate-500 whitespace-nowrap">
                                  <span className="font-medium text-slate-700 dark:text-slate-200">{p.paidDays}</span>
                                  <span className="mx-0.5">/</span>
                                  <span>{p.totalDays}</span>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-500 font-mono text-[10px]">{formatSalary(p.proratedPrev)}</td>
                                <td className="px-3 py-2 text-right text-slate-500 font-mono text-[10px]">{formatSalary(p.proratedNext)}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                  +{formatSalary(p.proratedAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-indigo-50/30 dark:bg-indigo-900/10 border-t border-slate-100 dark:border-slate-800 font-semibold">
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-2 text-slate-500 uppercase text-[9px] tracking-wider text-right text-xs"
                              >
                                Total extra pay estim.
                              </td>
                              <td className="px-3 py-2 text-right text-indigo-700 dark:text-indigo-400">
                                {formatSalary(detailProrationRows.reduce((a, b) => a + b.proratedAmount, 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                    {detailProrationLoading && detailProrationRows.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        Refreshing proration…
                      </p>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
