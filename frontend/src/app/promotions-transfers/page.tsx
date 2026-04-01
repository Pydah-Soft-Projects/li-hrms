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
} from 'lucide-react';

type PayrollMonthOption = {
  payrollYear: number;
  payrollMonth: number;
  label: string;
  periodStart?: string;
  periodEnd?: string;
  paidDays?: number;
  totalDaysInMonth?: number;
};

type PtRequest = {
  _id: string;
  requestType: 'promotion' | 'demotion' | 'transfer';
  emp_no: string;
  status: string;
  remarks?: string;
  newGrossSalary?: number;
  previousGrossSalary?: number | null;
  /** @deprecated legacy API */
  incrementAmount?: number;
  effectivePayrollYear?: number;
  effectivePayrollMonth?: number;
  createdAt?: string;
  employeeId?: {
    employee_name?: string;
    emp_no?: string;
    gross_salary?: number;
    division_id?: { name?: string };
    department_id?: { name?: string };
    designation_id?: { name?: string };
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
    history?: Array<{ action?: string; actionByName?: string; comments?: string; timestamp?: string }>;
  };
};

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
    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 rounded-xl overflow-hidden">
      <p className="text-xs uppercase font-bold text-slate-400 mb-4 tracking-wider">Approval Timeline</p>
      <div className="mb-6">
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
          const label = step.label || String(stepRole).replace(/_/g, ' ');
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
            <div key={`${step.stepOrder ?? idx}-${stepRole}`} className="relative pb-6 last:pb-0">
              <div
                className={`absolute -left-[29px] top-0.5 w-4 h-4 rounded-full ${nodeColor} border-2 border-white dark:border-slate-900 shadow-sm`}
              />
              <div className="ml-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white capitalize">{label}</span>
                  {isApproved && (
                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">
                      {step.status === 'skipped' ? '○ Skipped' : '✓ Approved'}
                    </span>
                  )}
                  {isRejected && (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">✗ Rejected</span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">⏳ Your turn</span>
                  )}
                  {isPending && !isCurrent && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase">○ Pending</span>
                  )}
                </div>
                {(isApproved || isRejected) && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {step.actionByName || 'Unknown'} ({step.actionByRole || stepRole})
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

function formatSalary(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n));
}

function promotionDelta(prev: number | null | undefined, next: number | null | undefined) {
  if (next == null || !Number.isFinite(Number(next))) return null;
  if (prev == null || !Number.isFinite(Number(prev))) return null;
  return Number(next) - Number(prev);
}

function statusClass(s: string) {
  switch (s) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'rejected':
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

function normalizeId(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v._id || v.id || '');
  return '';
}

interface BulkPtRow {
  employee: any;
  requestType: 'promotion' | 'demotion' | 'transfer';
  newGrossSalary: number;
  selectedMonthLabel: string;
  toDivisionId: string;
  toDepartmentId: string;
  toDesignationId: string;
  remarks: string;
}

export default function PromotionsTransfersPage() {
  const [user, setUser] = useState<ReturnType<typeof auth.getUser>>(null);
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<PtRequest[]>([]);
  const [pendingList, setPendingList] = useState<PtRequest[]>([]);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<'promotion' | 'demotion' | 'transfer'>('promotion');
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [empSearchResults, setEmpSearchResults] = useState<{ emp_no: string; employee_name: string }[]>([]);
  const [empSearchLoading, setEmpSearchLoading] = useState(false);
  const [selectedEmpNo, setSelectedEmpNo] = useState('');
  const [payrollMonths, setPayrollMonths] = useState<PayrollMonthOption[]>([]);
  const [selectedMonthLabel, setSelectedMonthLabel] = useState('');
  const [newGrossSalaryInput, setNewGrossSalaryInput] = useState('');
  const [allDesignations, setAllDesignations] = useState<{ _id: string; name: string }[]>([]);
  const [divisions, setDivisions] = useState<{ _id: string; name: string }[]>([]);
  const [masterDepartments, setMasterDepartments] = useState<{ _id: string; name: string; division_id?: any }[]>([]);
  const [modalDepartments, setModalDepartments] = useState<{ _id: string; name: string; division_id?: any }[]>([]);
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

  const [detail, setDetail] = useState<PtRequest | null>(null);
  const [detailProrationRows, setDetailProrationRows] = useState<any[]>([]);
  const [detailProrationLoading, setDetailProrationLoading] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bulk operations state
  const [bulkSectionOpen, setBulkSectionOpen] = useState(false);
  const [bulkType, setBulkType] = useState<'promotion' | 'demotion' | 'transfer'>('promotion');
  const [bulkDivisionId, setBulkDivisionId] = useState('');
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkPtRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

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

  const promotionComparison = useMemo(() => {
    if (formType === 'transfer') return null;
    const prevRaw = currentEmp?.gross_salary;
    const prev = prevRaw == null || prevRaw === '' ? null : Number(prevRaw);
    const next = parseFloat(newGrossSalaryInput);
    if (!Number.isFinite(next)) return null;
    const delta = prev != null && Number.isFinite(prev) ? next - prev : null;
    return { prev, next, delta };
  }, [formType, currentEmp?.gross_salary, newGrossSalaryInput]);

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
        requestType: 'promotion', // default
        newGrossSalary: 0,
        selectedMonthLabel: '',
        toDivisionId: normalizeId(emp.division_id),
        toDepartmentId: normalizeId(emp.department_id),
        toDesignationId: normalizeId(emp.designation_id),
        remarks: '',
      }));
      setBulkRows(rows);
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
      if (next[index]) next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleBulkSave = async () => {
    const toCreate = bulkRows.filter((r) => {
      const type = r.requestType;
      // For promotion/demotion, check if gross salary changed and is > 0
      if (type === 'promotion' || type === 'demotion') {
        const nextGross = Number(r.newGrossSalary);
        const prevGross = Number(r.employee.gross_salary) || 0;
        const delta = nextGross - prevGross;
        
        if (nextGross <= 0) return false;
        if (type === 'promotion' && delta <= 0) return false;
        if (type === 'demotion' && delta >= 0) return false;
        return true;
      }
      
      // For transfer, check if any org field changed relative to current
      const tDiv = r.toDivisionId;
      const tDept = r.toDepartmentId;
      const tDesig = r.toDesignationId;

      const hasDivChange = tDiv && normalizeId(r.employee.division_id) !== tDiv;
      const hasDeptChange = tDept && normalizeId(r.employee.department_id) !== tDept;
      const hasDesigChange = tDesig && normalizeId(r.employee.designation_id) !== tDesig;

      return !!(hasDivChange || hasDeptChange || hasDesigChange);
    });

    if (toCreate.length === 0) {
      toast.warn('No valid changes detected for any row. Check if promotion/demotion salaries follow the > or < rules.');
      return;
    }

    setBulkSaving(true);
    try {
      const settled = await Promise.allSettled(
        toCreate.map((r) => {
          const body: any = {
            requestType: bulkType,
            emp_no: r.employee.emp_no,
            remarks: (r.remarks || headerRemarks || `Bulk ${bulkType}`).trim(),
          };

          if (r.requestType === 'promotion' || r.requestType === 'demotion') {
            const opt = payrollMonths.find((p) => p.label === r.selectedMonthLabel);
            if (!opt) throw new Error(`Invalid month for ${r.employee.emp_no}`);
            body.newGrossSalary = Number(r.newGrossSalary);
            body.effectivePayrollYear = opt.payrollYear;
            body.effectivePayrollMonth = opt.payrollMonth;
            
            // Optional org structure change alongside promotion
            if (r.toDivisionId && normalizeId(r.employee.division_id) !== r.toDivisionId) body.toDivisionId = r.toDivisionId;
            if (r.toDepartmentId && normalizeId(r.employee.department_id) !== r.toDepartmentId) body.toDepartmentId = r.toDepartmentId;
            if (r.toDesignationId && normalizeId(r.employee.designation_id) !== r.toDesignationId) {
              body.proposedDesignationId = r.toDesignationId;
              body.toDesignationId = r.toDesignationId;
            }
          } else {
            // For transfer, backend requires all three
            body.toDivisionId = r.toDivisionId || normalizeId(r.employee.division_id);
            body.toDepartmentId = r.toDepartmentId || normalizeId(r.employee.department_id);
            body.toDesignationId = r.toDesignationId || normalizeId(r.employee.designation_id);
          }
          return api.createPromotionTransferRequest(body);
        })
      );

      const successCount = settled.filter((x) => x.status === 'fulfilled' && (x.value as any)?.success).length;
      const failedCount = settled.length - successCount;

      if (successCount > 0) {
        toast.success(`${successCount} request(s) created successfully`);
        loadData();
        // Clear submitted rows from the local state
        setBulkRows((prev) =>
          prev.filter((r) => {
            // Find if this row was one we tried to create
            const matched = toCreate.find(tc => tc.employee._id === r.employee._id);
            if (!matched) return true; // Keep rows we didn't touch
            
            // If it was in toCreate, check if THAT specific request succeeded
            const idx = toCreate.indexOf(matched);
            const res = settled[idx];
            return !(res.status === 'fulfilled' && (res.value as any)?.success);
          })
        );
      }

      if (failedCount > 0) {
        const firstError = settled.find(x => x.status === 'fulfilled' && !(x.value as any)?.success);
        const errorMsg = firstError ? (firstError as any).value.message : 'Some requests failed';
        toast.error(`${failedCount} error(s). e.g.: ${errorMsg}`);
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
    api.getPromotionTransferPayrollMonths({ past: 5, future: 5 }).then((r: any) => { if (r?.success && r?.data) setPayrollMonths(r.data); }).catch(() => {});
  }, [user, canView, loadData]);

  const openCreateModal = async () => {
    setFormType('promotion');
    setSelectedEmpNo('');
    setSelectedMonthLabel('');
    setNewGrossSalaryInput('');
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
      const [pm, des, divs] = await Promise.all([
        api.getPromotionTransferPayrollMonths({ past: 5, future: 5 }),
        api.getAllDesignations(true),
        api.getDivisions(true, undefined, true),
      ]);
      if (pm?.success && Array.isArray(pm.data)) setPayrollMonths(pm.data);
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
          if (emp) {
            const div = normalizeId(emp?.division_id);
            const dept = normalizeId(emp?.department_id);
            const des = normalizeId(emp?.designation_id);
            setToDiv(div);
            setToDept(dept);
            setToDesig(des);
            if (div) {
              try {
                const d = await api.getDepartments(true, div, true);
                const rows = d?.data ?? d;
                setModalDepartments(Array.isArray(rows) ? rows : []);
              } catch {
                setModalDepartments([]);
              }
            }
          }
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

  const payrollMonthsWithPaidDays = useMemo(() => {
    return payrollMonths.map((p) => {
      const rec = paidDaysByMonth[p.label];
      return {
        ...p,
        paidDays: rec ? rec.paidDays : undefined,
        totalDaysInMonth: rec ? rec.totalDays : undefined,
      };
    });
  }, [payrollMonths, paidDaysByMonth]);

  const currentPayrollCycleLabel = useMemo(() => {
    const now = new Date();
    const hit = payrollMonths.find((p) => {
      if (!p.periodStart || !p.periodEnd) return false;
      const s = new Date(p.periodStart);
      const e = new Date(p.periodEnd);
      return now >= s && now <= e;
    });
    return hit?.label || '';
  }, [payrollMonths]);

  // Arrears-style proration: effective month → current payroll cycle
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
    const nextGross = parseFloat(newGrossSalaryInput);
    if (!Number.isFinite(nextGross) || nextGross <= 0) {
      setProrationRows([]);
      return;
    }
    const baseGross = Number(currentEmp?.gross_salary);
    if (!Number.isFinite(baseGross)) {
      setProrationRows([]);
      return;
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
    if (!selectedMonthLabel || !currentPayrollCycleLabel) {
      setProrationRows([]);
      return;
    }

    let cancelled = false;
    setProrationLoading(true);
    api
      .getAttendanceDataRange(String(currentEmp._id), String(selectedMonthLabel), String(currentPayrollCycleLabel))
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
  }, [modalOpen, formType, currentEmp?._id, newGrossSalaryInput, selectedMonthLabel, currentPayrollCycleLabel]);

  useEffect(() => {
    if (!modalOpen) return;
    if (!toDiv) {
      setModalDepartments([]);
      return;
    }
    (async () => {
      try {
        const d = await api.getDepartments(true, toDiv, true);
        const rows = d?.data ?? d;
        setModalDepartments(Array.isArray(rows) ? rows : []);
      } catch {
        setModalDepartments([]);
      }
    })();
  }, [modalOpen, toDiv]);

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
      const div = normalizeId(emp?.division_id);
      const dept = normalizeId(emp?.department_id);
      const des = normalizeId(emp?.designation_id);

      setToDiv(div);
      setToDept(dept);
      setToDesig(des);

      // Ensure department dropdown has options for the employee's division
      if (div) {
        try {
          const d = await api.getDepartments(true, div, true);
          const rows = d?.data ?? d;
          setModalDepartments(Array.isArray(rows) ? rows : []);
        } catch {
          setModalDepartments([]);
        }
      } else {
        setModalDepartments([]);
      }
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
        const nextGross = parseFloat(newGrossSalaryInput);
        if (!Number.isFinite(nextGross) || nextGross <= 0) {
          toast.error('Enter a valid new gross salary');
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
        const body: any = {
          requestType: formType,
          emp_no: selectedEmpNo,
          newGrossSalary: nextGross,
          effectivePayrollYear: opt.payrollYear,
          effectivePayrollMonth: opt.payrollMonth,
          remarks,
        };
        if (toDiv) body.toDivisionId = toDiv;
        if (toDept) body.toDepartmentId = toDept;
        if (toDesig) {
          // Use a single designation selector; backend expects proposedDesignationId for promotion/demotion designation change.
          body.proposedDesignationId = toDesig;
          body.toDesignationId = toDesig;
        }
        const res = await api.createPromotionTransferRequest(body);
        if (!res?.success) throw new Error(res?.message || 'Failed');
        toast.success(formType === 'promotion' ? 'Promotion request submitted' : 'Demotion request submitted');
      }
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const src = tab === 'pending' ? pendingList : list;
    const q = search.trim().toLowerCase();
    if (!q) return src;
    return src.filter((r) => {
      const name = r.employeeId?.employee_name?.toLowerCase() || '';
      return r.emp_no.toLowerCase().includes(q) || name.includes(q);
    });
  }, [list, pendingList, tab, search]);

  const openDetail = async (id: string) => {
    try {
      setDetailProrationRows([]);
      const res = await api.getPromotionTransferRequest(id);
      const d = res?.data ?? res;
      setDetail(d);
      setActionComment('');

      // Fetch proration for promotion/demotion
      if (d && (d.requestType === 'promotion' || d.requestType === 'demotion') && d.employeeId?._id) {
        const startLabel = `${d.effectivePayrollYear}-${String(d.effectivePayrollMonth || '').padStart(2, '0')}`;
        const endLabel = currentPayrollCycleLabel;
        
        if (startLabel && endLabel) {
          setDetailProrationLoading(true);
          try {
            const attRes = await api.getAttendanceDataRange(String(d.employeeId._id), startLabel, endLabel);
            const attRows = attRes?.success && Array.isArray(attRes?.data) ? attRes.data : [];
            const nextG = d.newGrossSalary ?? (d.previousGrossSalary != null && d.incrementAmount != null ? d.previousGrossSalary + d.incrementAmount : 0);
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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
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
                    {masterDepartments.filter(d => !bulkDivisionId || normalizeId(d.division_id) === bulkDivisionId).map((d: any) => (
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
                          <th className="px-3 py-3 text-left w-64">Target Org</th>
                          <th className="px-3 py-3 text-left min-w-[200px]">Details & Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {bulkRows.map((row, idx) => (
                          <tr key={row.employee._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors align-top">
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
                                onChange={(e) => updateBulkRow(idx, 'requestType', e.target.value as any)}
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-medium"
                              >
                                <option value="promotion">Promotion</option>
                                <option value="demotion">Demotion</option>
                                <option value="transfer">Transfer</option>
                              </select>
                            </td>
                            <td className="px-3 py-4 space-y-2">
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
                                  {masterDepartments.filter(d => !row.toDivisionId || normalizeId(d.division_id) === row.toDivisionId).map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
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
                            </td>
                            <td className="px-3 py-4 space-y-3">
                              {(row.requestType === 'promotion' || row.requestType === 'demotion') && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase ml-0.5 text-indigo-600">New Gross (₹)</p>
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
                            </td>
                          </tr>
                        ))}
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
                        onClick={() => setBulkRows([])}
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

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'all'
              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          All
        </button>
        {canApprove && (
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'pending'
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            Pending my action
          </button>
        )}
        <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            placeholder="Search emp no / name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-slate-500">No requests</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Summary</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {r.employeeId?.employee_name || r.emp_no}
                      </div>
                      <div className="text-xs text-slate-500">{r.emp_no}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{r.requestType}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {r.requestType === 'promotion' || r.requestType === 'demotion' ? (
                        <span className="text-xs leading-relaxed">
                          {r.newGrossSalary != null ? (
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
                            <span>+{formatSalary(r.incrementAmount)} (legacy)</span>
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
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDetail(r._id)}
                        className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      {canCancelRequest(r) && (
                        <button
                          type="button"
                          onClick={() => doCancel(r._id)}
                          className="block mt-1 text-xs text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                      {canDeleteRow(r) && (
                        <button
                          type="button"
                          disabled={deletingId === r._id}
                          onClick={() => doDelete(r._id)}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400 hover:underline disabled:opacity-50"
                        >
                          {deletingId === r._id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          Delete
                        </button>
                      )}
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

                  {(selectedMonthLabel && currentPayrollCycleLabel && parseFloat(newGrossSalaryInput) > 0 && formType !== 'transfer') ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/20 overflow-hidden">
                      <div className="px-3 py-2 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Paid-days proration
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {selectedMonthLabel} → {currentPayrollCycleLabel}
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
                                const newGross = parseFloat(newGrossSalaryInput);
                                const safeNewGross = Number.isFinite(newGross) ? newGross : baseGross;

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
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Request type</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                >
                  <option value="promotion">Promotion</option>
                  <option value="demotion">Demotion</option>
                  <option value="transfer">Transfer</option>
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
                          {p.paidDays != null && p.totalDaysInMonth != null
                            ? ` — ${p.paidDays}/${p.totalDaysInMonth} paid days`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Shows the last 5 completed payroll months and the next 5 upcoming months (per your payroll cycle).
                      {paidDaysLoading ? ' Loading paid days…' : ''}
                    </p>
                  </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">To division</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    value={toDiv}
                    onChange={(e) => {
                      setToDiv(e.target.value);
                      setToDept('');
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
                disabled={submitting}
                onClick={submitRequest}
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
        <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold">Request detail</h2>
              <button type="button" onClick={() => setDetail(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Type</span>
                <span className="font-medium capitalize">{detail.requestType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(detail.status)}`}>{detail.status}</span>
              </div>
              {(detail.requestType === 'promotion' || detail.requestType === 'demotion') && (
                <>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Previous gross</span>
                      <span className="font-medium">{formatSalary(detail.previousGrossSalary)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">New gross</span>
                      <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-right">
                        {detail.newGrossSalary != null ? (
                          formatSalary(detail.newGrossSalary)
                        ) : detail.incrementAmount != null ? (
                          <span className="text-amber-800 dark:text-amber-200 text-xs font-normal">
                            Legacy: +{formatSalary(detail.incrementAmount)} (computed on approval)
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
                  <div className="flex justify-between">
                    <span className="text-slate-500">Effective month</span>
                    <span>
                      {detail.effectivePayrollYear}-{String(detail.effectivePayrollMonth || '').padStart(2, '0')}
                    </span>
                  </div>
                  {detail.proposedDesignationId?.name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Proposed designation</span>
                      <span>{detail.proposedDesignationId.name}</span>
                    </div>
                  )}

                  {detailProrationRows.length > 0 && (
                    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Proration Breakdown (Extra Pay)</h4>
                      </div>
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/40 text-[10px] text-slate-400 font-semibold text-left border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="px-3 py-2">Month</th>
                            <th className="px-3 py-2 text-center">Attendance</th>
                            <th className="px-3 py-2 text-right">Curr. (Prorat.)</th>
                            <th className="px-3 py-2 text-right">New. (Prorat.)</th>
                            <th className="px-3 py-2 text-right">Extra Pay</th>
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
                            <td colSpan={4} className="px-3 py-2 text-slate-500 uppercase text-[9px] tracking-wider text-right text-xs">Total Extra Pay Estim.</td>
                            <td className="px-3 py-2 text-right text-indigo-700 dark:text-indigo-400">
                              {formatSalary(detailProrationRows.reduce((a, b) => a + b.proratedAmount, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {detailProrationLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center text-xs text-slate-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading calculated proration…
                    </div>
                  )}
                </>
              )}
              {detail.requestType === 'transfer' && (
                <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg">
                  <div>
                    From: {detail.fromDivisionId?.name} / {detail.fromDepartmentId?.name} / {detail.fromDesignationId?.name}
                  </div>
                  <div>
                    To: {detail.toDivisionId?.name} / {detail.toDepartmentId?.name} / {detail.toDesignationId?.name}
                  </div>
                </div>
              )}
              {detail.workflow?.approvalChain && detail.workflow.approvalChain.length > 0 && (
                <PromotionApprovalTimeline workflow={detail.workflow} />
              )}
              {detail.status === 'pending' && canApprove && (
                <>
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
              {detail && canDeleteRow(detail) && (
                <button
                  type="button"
                  disabled={deletingId === detail._id}
                  onClick={() => doDelete(detail._id)}
                  className="w-full mt-2 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 font-medium text-sm inline-flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  {deletingId === detail._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete request permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
