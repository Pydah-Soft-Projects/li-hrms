'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { toast } from 'react-toastify';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  BookOpen,
  Loader2,
  User,
  Building2,
  Layers,
  CalendarRange,
  Shield,
  Info,
} from 'lucide-react';

type MonthLeaveBucket = {
  credited?: number;
  used?: number;
  locked?: number | null;
  transfer?: number | null;
};

type RegisterMonthLite = {
  payrollMonthIndex?: number;
  label?: string;
  month: number;
  year: number;
  payPeriodStart?: string | null;
  payPeriodEnd?: string | null;
  scheduledCl?: number | null;
  /** Cumulative scheduled CL from policy period 1 through this period (FY order). */
  scheduledClYtd?: number | null;
  scheduledEl?: number | null;
  scheduledCco?: number | null;
  lockedCredits?: number | null;
  clBalance?: number | null;
  elBalance?: number | null;
  cclBalance?: number | null;
  transactionCount?: number;
  /** min(scheduled CL+CCL[+EL per policy], monthly application cap when enabled) */
  monthlyApplyLimit?: number | null;
  /** max(0, monthlyApplyLimit − days already counting toward cap incl. in-flight & approved). */
  monthlyApplyRemaining?: number | null;
  /** Days counting toward the period cap (approved + in-flight), per policy rules. */
  capConsumedDays?: number | null;
  /** Subtotal: in-flight (locked) days toward the period cap. */
  capLockedDays?: number | null;
  /** Subtotal: final-approved days toward the period cap. */
  capApprovedDays?: number | null;
  cl?: MonthLeaveBucket;
  ccl?: MonthLeaveBucket;
  el?: MonthLeaveBucket;
};

type ListRow = {
  employee: {
    id?: string;
    _id?: string;
    empNo?: string;
    name?: string;
    designation?: string;
    department?: string;
    division?: string;
    status?: string;
  };
  summary: {
    clBalance: number;
    elBalance: number;
    cclBalance: number;
    totalPaidBalance: number;
    monthlyAllowedLimit?: number;
  };
  yearSnapshot?: {
    financialYear?: string;
    casualBalance?: number;
    compensatoryOffBalance?: number;
    earnedLeaveBalance?: number;
    resetAt?: string;
  } | null;
  registerMonths?: RegisterMonthLite[];
  payrollMonthsCovered: number;
  transactionCount: number;
  firstPeriod: { month: number; year: number } | null;
  lastPeriod: { month: number; year: number } | null;
};

function formatNum(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function formatNullableNum(n: unknown): string {
  if (n == null) return '—';
  return formatNum(n);
}

function computeFinancialYearNameFromPolicy(settings: any, date: Date): string {
  const fy = settings?.financialYear || {};
  const useCalendarYear = !!fy?.useCalendarYear;

  if (useCalendarYear) {
    return `${date.getFullYear()}`;
  }

  const startMonth = Number.isFinite(Number(fy?.startMonth)) ? Number(fy.startMonth) : 4; // April
  const startDay = Number.isFinite(Number(fy?.startDay)) ? Number(fy.startDay) : 1;
  const month1Based = date.getMonth() + 1;
  const day = date.getDate();

  // Matches backend DateCycleService.getFinancialYearForDate.
  const fyStartYear =
    month1Based > startMonth || (month1Based === startMonth && day >= startDay)
      ? date.getFullYear()
      : date.getFullYear() - 1;

  return `${fyStartYear}-${fyStartYear + 1}`;
}

function buildFinancialYearOptions(settings: any, date: Date): string[] {
  const fy = settings?.financialYear || {};
  const useCalendarYear = !!fy?.useCalendarYear;
  const current = computeFinancialYearNameFromPolicy(settings, date);

  if (useCalendarYear) {
    const currentYear = Number(current) || date.getFullYear();
    return [
      currentYear - 5,
      currentYear - 4,
      currentYear - 3,
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
    ]
      .map((y) => String(y))
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }

  const currentStartYear = Number(String(current).split('-')[0]) || date.getFullYear();
  return [
    currentStartYear - 5,
    currentStartYear - 4,
    currentStartYear - 3,
    currentStartYear - 2,
    currentStartYear - 1,
    currentStartYear,
    currentStartYear + 1,
  ]
    .map((y) => `${y}-${y + 1}`)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

export type LeaveRegisterPageVariant = 'default' | 'superadmin';

export type LeaveRegisterPageProps = {
  /** Superadmin gets grouped filters, results toolbar, and stronger visual hierarchy. */
  variant?: LeaveRegisterPageVariant;
  /** HR / sub-admin / super-admin: edit FY month scheduled pool (requires financial year filter). Default: superadmin variant only. */
  allowAdminMonthEdits?: boolean;
};

export default function LeaveRegisterPage({
  variant = 'default',
  allowAdminMonthEdits,
}: LeaveRegisterPageProps) {
  const isSuperadmin = variant === 'superadmin';
  const currentUser = useMemo(() => auth.getUser(), []);
  const hasMonthEditPrivilege = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    const fc = Array.isArray(currentUser.featureControl) ? currentUser.featureControl : [];
    return fc.includes('LEAVE_REGISTER_MONTH_EDIT:write') || fc.includes('LEAVE_REGISTER_MONTH_EDIT');
  }, [currentUser]);
  const canEditMonths = (allowAdminMonthEdits ?? isSuperadmin) && hasMonthEditPrivilege;
  const now = useMemo(() => new Date(), []);
  const fallbackFinancialYear = useMemo(
    () =>
      computeFinancialYearNameFromPolicy(
        { financialYear: { useCalendarYear: false, startMonth: 4, startDay: 1 } },
        now
      ),
    [now]
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [financialYear, setFinancialYear] = useState(fallbackFinancialYear);
  const [financialYearOptions, setFinancialYearOptions] = useState<string[]>([fallbackFinancialYear]);
  const [divisionId, setDivisionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [divisions, setDivisions] = useState<{ _id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ _id: string; name: string }[]>([]);
  const PAGE_SIZE = 25;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [rowDetailLoading, setRowDetailLoading] = useState<Record<string, boolean>>({});
  const detailCacheRef = useRef<Map<string, unknown>>(new Map());
  const detailInflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const [monthModal, setMonthModal] = useState<{
    open: boolean;
    employeeId: string;
    employeeName: string;
    month: number;
    year: number;
    label: string;
    transactions: any[];
    loading: boolean;
  } | null>(null);

  const [registerListRefresh, setRegisterListRefresh] = useState(0);
  const [slotEditModal, setSlotEditModal] = useState<{
    open: boolean;
    employeeId: string;
    employeeName: string;
    /** FY string sent to API (from filter and/or row year snapshot). */
    financialYearForApi: string;
    payrollCycleMonth: number;
    payrollCycleYear: number;
    label: string;
    clCredits: string;
    compensatoryOffs: string;
    elCredits: string;
    lockedCredits: string;
    validateWithRecords: boolean;
    carryUnusedToNextMonth: boolean;
    clUsed: string;
    compensatoryOffsUsed: string;
    elUsed: string;
    reason: string;
    saving: boolean;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      try {
        const [divRes, deptRes] = await Promise.all([
          api.getDivisions(true),
          api.getDepartments(true, divisionId || undefined),
        ]);
        if (divRes.success && Array.isArray(divRes.data)) {
          setDivisions(divRes.data.map((d: any) => ({ _id: d._id, name: d.name })));
        }
        if (deptRes.success && Array.isArray(deptRes.data)) {
          setDepartments(deptRes.data.map((d: any) => ({ _id: d._id, name: d.name })));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [divisionId]);

  useEffect(() => {
    // Auto-select current financial year from backend policy settings.
    // If the user already changed FY away from the fallback, we won't overwrite.
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getLeavePolicySettings();
        if (cancelled || !res?.success) return;
        const computed = computeFinancialYearNameFromPolicy(res.data, now);
        const options = buildFinancialYearOptions(res.data, now);
        setFinancialYearOptions(options.length > 0 ? options : [computed]);
        setFinancialYear((prev) => {
          const t = prev.trim();
          if (options.includes(t)) return t;
          return computed;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fallbackFinancialYear, now]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, financialYear, departmentId, divisionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.listLeaveRegister({
          financialYear: financialYear.trim() || undefined,
          departmentId: departmentId || undefined,
          divisionId: divisionId || undefined,
          search: debouncedSearch || undefined,
          page,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        if (!res.success) {
          toast.error(res.message || 'Failed to load leave register');
          setRows([]);
          return;
        }
        const data = res.data;
        setRows(data?.employees || []);
        if (data?.pagination) {
          setPagination({
            page: data.pagination.page,
            limit: data.pagination.limit,
            total: data.pagination.total,
            pages: data.pagination.pages,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || 'Failed to load leave register');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, financialYear, departmentId, divisionId, page]);

  useEffect(() => {
    detailCacheRef.current = new Map();
    detailInflightRef.current = new Map();
    setExpandedIds([]);
  }, [debouncedSearch, financialYear, departmentId, divisionId]);

  const prefetchRowDetail = async (employeeId: string) => {
    if (detailCacheRef.current.has(employeeId)) return;
    const existing = detailInflightRef.current.get(employeeId);
    if (existing) return existing;
    const p = (async () => {
      setRowDetailLoading((r) => ({ ...r, [employeeId]: true }));
      try {
        const res = await api.getEmployeeLeaveRegisterDetail(employeeId, {
          financialYear: financialYear.trim() || undefined,
        });
        if (res.success && res.data) {
          detailCacheRef.current.set(employeeId, res.data);
        } else {
          toast.error(res.message || 'Failed to load register detail');
        }
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load register detail');
      } finally {
        setRowDetailLoading((r) => ({ ...r, [employeeId]: false }));
        detailInflightRef.current.delete(employeeId);
      }
    })();
    detailInflightRef.current.set(employeeId, p);
    return p;
  };

  const toggleRowExpand = (employeeId: string) => {
    setExpandedIds((prev) => {
      const on = prev.includes(employeeId);
      const next = on ? prev.filter((id) => id !== employeeId) : [...prev, employeeId];
      if (!on) {
        void prefetchRowDetail(employeeId);
      }
      return next;
    });
  };

  const openMonthTransactions = async (
    employeeId: string,
    employeeName: string,
    m: RegisterMonthLite
  ) => {
    const label = m.label || `${m.month}/${m.year}`;
    setMonthModal({
      open: true,
      employeeId,
      employeeName,
      month: m.month,
      year: m.year,
      label,
      transactions: [],
      loading: true,
    });
    await prefetchRowDetail(employeeId);
    const data = detailCacheRef.current.get(employeeId) as any;
    const canonical = Array.isArray(data?.months)
      ? data.months.find(
          (row: any) =>
            Number(row.payrollCycleMonth) === Number(m.month) &&
            Number(row.payrollCycleYear) === Number(m.year)
        )
      : null;
    const ledger = data?.ledger;
    const sub = ledger?.monthlySubLedgers?.find(
      (s: any) => Number(s.month) === Number(m.month) && Number(s.year) === Number(m.year)
    );
    const txs =
      canonical && Array.isArray(canonical.transactions) && canonical.transactions.length > 0
        ? canonical.transactions
        : Array.isArray(sub?.transactions)
          ? sub.transactions
          : [];
    setMonthModal((prev) =>
      prev
        ? {
            ...prev,
            transactions: txs,
            loading: false,
          }
        : null
    );
  };

  const saveSlotEdit = async () => {
    if (!slotEditModal) return;
    const fy = slotEditModal.financialYearForApi.trim();
    if (!fy) {
      toast.error('Could not resolve financial year. Enter it in filters (e.g. 2025-2026).');
      return;
    }
    const reason = slotEditModal.reason.trim();
    if (!reason) {
      toast.error('Reason is required for audit.');
      return;
    }
    const body: {
      financialYear: string;
      payrollCycleMonth: number;
      payrollCycleYear: number;
      reason: string;
      clCredits?: number;
      compensatoryOffs?: number;
      elCredits?: number;
      lockedCredits?: number;
      validateWithRecords?: boolean;
      carryUnusedToNextMonth?: boolean;
      usedCl?: number;
      usedCcl?: number;
      usedEl?: number;
    } = {
      financialYear: fy,
      payrollCycleMonth: slotEditModal.payrollCycleMonth,
      payrollCycleYear: slotEditModal.payrollCycleYear,
      reason,
      validateWithRecords: !!slotEditModal.validateWithRecords,
      carryUnusedToNextMonth: !!slotEditModal.carryUnusedToNextMonth,
    };
    const push = (key: 'clCredits' | 'compensatoryOffs' | 'elCredits' | 'lockedCredits', raw: string) => {
      const t = raw.trim();
      if (t === '') return;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid number for ${key}`);
      }
      body[key] = n;
    };

    const pushUsed = (key: 'usedCl' | 'usedCcl' | 'usedEl', raw: string) => {
      const t = raw.trim();
      if (t === '') return;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid number for ${key}`);
      }
      body[key] = n;
    };
    try {
      push('clCredits', slotEditModal.clCredits);
      push('compensatoryOffs', slotEditModal.compensatoryOffs);
      push('elCredits', slotEditModal.elCredits);
      push('lockedCredits', slotEditModal.lockedCredits);
      pushUsed('usedCl', slotEditModal.clUsed);
      pushUsed('usedCcl', slotEditModal.compensatoryOffsUsed);
      pushUsed('usedEl', slotEditModal.elUsed);
    } catch (e: any) {
      toast.error(e?.message || 'Invalid input');
      return;
    }
    if (
      body.clCredits === undefined &&
      body.compensatoryOffs === undefined &&
      body.elCredits === undefined &&
      body.lockedCredits === undefined
    ) {
      toast.error('Enter at least one value to update (scheduled CL, CCL, EL, or policy lock).');
      return;
    }
    setSlotEditModal((m) => (m ? { ...m, saving: true } : null));
    const empId = slotEditModal.employeeId;
    try {
      const res = await api.patchLeaveRegisterYearMonthSlot(empId, body);
      if (!res.success) throw new Error(res.message || 'Update failed');
      toast.success('Month slot saved; apply ceiling refreshed from leaves.');
      setSlotEditModal(null);
      setRegisterListRefresh((x) => x + 1);
      detailCacheRef.current.delete(empId);
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
      setSlotEditModal((m) => (m ? { ...m, saving: false } : null));
    }
  };

  const syncSlotApplyOnly = async () => {
    if (!slotEditModal) return;
    const fy = slotEditModal.financialYearForApi.trim();
    if (!fy) {
      toast.error('Could not resolve financial year. Enter it in filters (e.g. 2025-2026).');
      return;
    }
    setSlotEditModal((m) => (m ? { ...m, saving: true } : null));
    const empId = slotEditModal.employeeId;
    try {
      const res = await api.syncLeaveRegisterYearMonthApply(empId, {
        financialYear: fy,
        payrollCycleMonth: slotEditModal.payrollCycleMonth,
        payrollCycleYear: slotEditModal.payrollCycleYear,
      });
      if (!res.success) throw new Error(res.message || 'Sync failed');
      toast.success('Monthly apply fields synced from leave applications.');
      setSlotEditModal(null);
      setRegisterListRefresh((x) => x + 1);
      detailCacheRef.current.delete(empId);
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
      setSlotEditModal((m) => (m ? { ...m, saving: false } : null));
    }
  };

  function rowDisplayBalances(row: ListRow) {
    const ys = row.yearSnapshot;
    const cl =
      ys != null && ys.casualBalance != null && Number.isFinite(Number(ys.casualBalance))
        ? Number(ys.casualBalance)
        : row.summary?.clBalance;
    const ccl =
      ys != null &&
      ys.compensatoryOffBalance != null &&
      Number.isFinite(Number(ys.compensatoryOffBalance))
        ? Number(ys.compensatoryOffBalance)
        : row.summary?.cclBalance;
    const el =
      ys != null &&
      ys.earnedLeaveBalance != null &&
      Number.isFinite(Number(ys.earnedLeaveBalance))
        ? Number(ys.earnedLeaveBalance)
        : row.summary?.elBalance;
    return {
      cl,
      el,
      ccl,
      total: row.summary?.totalPaidBalance,
    };
  }

  const inputClass =
    'w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400';

  return (
    <div
      className={
        isSuperadmin
          ? 'min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-12'
          : 'min-h-screen bg-slate-50 dark:bg-slate-950 pb-10'
      }
    >
      <div
        className={
          isSuperadmin
            ? 'border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm'
            : 'border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        }
      >
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={
                  isSuperadmin
                    ? 'h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0'
                    : 'h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0'
                }
              >
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                {isSuperadmin && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/80 dark:border-blue-800/60 bg-blue-50/90 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800 dark:text-blue-200">
                    <Shield className="h-3 w-3 shrink-0" />
                    Super admin
                  </span>
                )}
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                  Leave register
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-normal">
                  {isSuperadmin ? (
                    <>
                      FY balances, payroll-month credits (CL / CCL / EL), and monthly apply limits. Expand a row for
                      month detail; click a month for transactions.
                    </>
                  ) : (
                    <>Per-employee ledger (CL, EL, CCL) for the selected financial year and payroll context.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        <div
          className={
            isSuperadmin
              ? 'rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-none'
              : 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm'
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
            <Filter className="h-3.5 w-3.5" />
            Filters
            {isSuperadmin && (
              <span className="ml-auto font-normal normal-case text-[11px] text-slate-400 dark:text-slate-500 max-w-md text-right leading-snug">
                Payroll month + FY first, then org or search.
              </span>
            )}
          </div>
          {isSuperadmin ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Find people</label>
                <div className="relative mt-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Name or employee number…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/25 p-3 space-y-2.5">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                    Payroll context
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Financial year</label>
                      <select
                        value={financialYear}
                        onChange={(e) => setFinancialYear(e.target.value)}
                        className={`mt-1 ${inputClass}`}
                      >
                        {financialYearOptions.map((fy) => (
                          <option key={fy} value={fy}>
                            {fy}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" />
                    Organization
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        Division
                      </label>
                      <select
                        value={divisionId}
                        onChange={(e) => {
                          setDivisionId(e.target.value);
                          setDepartmentId('');
                        }}
                        className={`mt-1 ${inputClass}`}
                      >
                        <option value="">All divisions</option>
                        {divisions.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        Department
                      </label>
                      <select
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className={`mt-1 ${inputClass}`}
                      >
                        <option value="">All departments</option>
                        {departments.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Search</label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Name or employee number…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CalendarRange className="h-3.5 w-3.5" />
                  Financial year
                </label>
                <select
                  value={financialYear}
                  onChange={(e) => setFinancialYear(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm"
                >
                  {financialYearOptions.map((fy) => (
                    <option key={fy} value={fy}>
                      {fy}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  Division
                </label>
                <select
                  value={divisionId}
                  onChange={(e) => {
                    setDivisionId(e.target.value);
                    setDepartmentId('');
                  }}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm"
                >
                  <option value="">All divisions</option>
                  {divisions.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm"
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div
          className={
            isSuperadmin
              ? 'rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none overflow-hidden'
              : 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden'
          }
        >
          {isSuperadmin && (
            <div className="flex flex-wrap items-start sm:items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Employee register</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl leading-snug">
                  Balances use the year snapshot when FY is set. Expand a row for monthly credits and apply ceiling.
                </p>
              </div>
              {!loading && (
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-900 dark:text-blue-100">
                    {pagination.total} employee{pagination.total === 1 ? '' : 's'}
                  </span>
                  {pagination.pages > 1 && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {page}/{pagination.pages}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className={`w-full ${isSuperadmin ? 'text-xs' : 'text-sm'}`}>
              <thead>
                <tr
                  className={
                    isSuperadmin
                      ? 'bg-slate-100/95 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700'
                  }
                >
                  <th className={`w-9 ${isSuperadmin ? 'py-2 px-1.5' : 'py-3 px-2'}`} aria-label="Expand" />
                  <th
                    className={`text-left font-medium text-slate-600 dark:text-slate-300 ${isSuperadmin ? 'py-2 px-3' : 'py-3 px-4'}`}
                  >
                    Employee
                  </th>
                  <th
                    className={`text-left font-medium text-slate-600 dark:text-slate-300 hidden md:table-cell ${isSuperadmin ? 'py-2 px-3' : 'py-3 px-4'}`}
                  >
                    Org
                  </th>
                  <th
                    className={`text-right font-medium text-slate-600 dark:text-slate-300 ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                    title="Casual leave balance (FY snapshot when set)"
                  >
                    CL
                  </th>
                  <th
                    className={`text-right font-medium text-slate-600 dark:text-slate-300 ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                    title="Earned leave balance"
                  >
                    EL
                  </th>
                  <th
                    className={`text-right font-medium text-slate-600 dark:text-slate-300 ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                    title="Compensatory / CCL balance"
                  >
                    CCL
                  </th>
                  <th
                    className={`text-right font-medium text-slate-600 dark:text-slate-300 hidden sm:table-cell ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                  >
                    Total
                  </th>
                  <th
                    className={`text-right font-medium text-slate-600 dark:text-slate-300 hidden lg:table-cell ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                  >
                    Txns
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <Loader2 className="h-7 w-7 animate-spin mx-auto text-indigo-500" />
                      <p className="mt-2 text-xs">Loading register…</p>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
                      No employees match your filters.
                    </td>
                  </tr>
                ) : (
                  rows.flatMap((row) => {
                    const id = row.employee?.id || row.employee?._id;
                    const idStr = id ? String(id) : '';
                    const expanded = idStr ? expandedIds.includes(idStr) : false;
                    const bal = rowDisplayBalances(row);
                    const months = row.registerMonths?.length
                      ? row.registerMonths
                      : [];
                    const mainRow = (
                      <tr
                        key={idStr || row.employee?.empNo}
                        role="button"
                        tabIndex={0}
                        onClick={() => idStr && toggleRowExpand(idStr)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && idStr) {
                            e.preventDefault();
                            toggleRowExpand(idStr);
                          }
                        }}
                        className={
                          isSuperadmin
                            ? 'border-b border-slate-100 dark:border-slate-800/90 hover:bg-blue-50/40 dark:hover:bg-slate-800/50 cursor-pointer transition-colors'
                            : 'border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer'
                        }
                      >
                        <td
                          className={`text-slate-400 align-middle ${isSuperadmin ? 'py-2 px-1.5' : 'py-3 px-2'}`}
                        >
                          {idStr ? (
                            <ChevronRight
                              className={`${isSuperadmin ? 'h-3.5 w-3.5' : 'h-4 w-4'} transition-transform ${expanded ? 'rotate-90' : ''}`}
                            />
                          ) : null}
                        </td>
                        <td className={isSuperadmin ? 'py-2 px-3' : 'py-3 px-4'}>
                          <div className="flex items-center gap-2">
                            <div
                              className={
                                isSuperadmin
                                  ? 'h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center text-blue-700 dark:text-blue-300'
                                  : 'h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300'
                              }
                            >
                              <User className={isSuperadmin ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 dark:text-white text-sm leading-tight">
                                {row.employee?.name || '—'}
                              </p>
                              <p className="text-[11px] text-slate-500 leading-snug">
                                {row.employee?.empNo || '—'}
                                {row.employee?.designation ? ` · ${row.employee.designation}` : ''}
                              </p>
                              {row.yearSnapshot?.financialYear ? (
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                                  FY {row.yearSnapshot.financialYear} · year register
                                </p>
                              ) : !financialYear.trim() ? (
                                <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90 mt-0.5 leading-snug">
                                  Set FY for year snapshot
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td
                          className={`hidden md:table-cell text-slate-600 dark:text-slate-400 ${isSuperadmin ? 'py-2 px-3 text-[11px]' : 'py-3 px-4 text-xs'}`}
                        >
                          <div>{row.employee?.department || '—'}</div>
                          <div className="text-slate-400">{row.employee?.division || ''}</div>
                        </td>
                        <td
                          className={`text-right font-mono tabular-nums ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                        >
                          {formatNum(bal.cl)}
                        </td>
                        <td
                          className={`text-right font-mono tabular-nums ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                        >
                          {formatNum(bal.el)}
                        </td>
                        <td
                          className={`text-right font-mono tabular-nums ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                        >
                          {formatNum(bal.ccl)}
                        </td>
                        <td
                          className={`text-right font-mono tabular-nums hidden sm:table-cell font-medium text-slate-800 dark:text-slate-200 ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                        >
                          {formatNum(bal.total)}
                        </td>
                        <td
                          className={`text-right text-slate-500 hidden lg:table-cell ${isSuperadmin ? 'py-2 px-2' : 'py-3 px-3'}`}
                        >
                          {row.transactionCount ?? 0}
                        </td>
                      </tr>
                    );
                    const expandRow =
                      expanded && idStr ? (
                        <tr
                          key={`${idStr}-expand`}
                          className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/50"
                        >
                          <td colSpan={8} className={isSuperadmin ? 'px-3 py-3' : 'px-4 py-4'}>
                            {rowDetailLoading[idStr] && !detailCacheRef.current.has(idStr) ? (
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                                Loading months…
                              </div>
                            ) : months.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                No payroll months in this view. Adjust filters or financial year.
                              </p>
                            ) : (
                              <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                  Payroll months · click a month for transactions
                                </p>
                                {isSuperadmin ? (
                                  <div className="flex gap-2 rounded-lg border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/90 dark:bg-blue-950/25 px-2.5 py-2 text-[10px] leading-snug text-blue-950 dark:text-blue-100">
                                    <Info className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                                    <p>
                                      <span className="font-medium">Apply ceiling</span> = min(scheduled CL+CCL[+EL per
                                      policy], policy cap). Locked and approved days both count toward it.
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-400">
                                    The period <strong>ceiling</strong> is min(scheduled CL+CCL[+EL per policy], policy cap).{' '}
                                    Both <strong>locked</strong> (pending / in-approval) and <strong>approved</strong> days{' '}
                                    deduct from that ceiling — apply is blocked once locked + approved reaches the ceiling.
                                  </p>
                                )}
                                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60">
                                  <table
                                    className={`w-full min-w-[720px] border-collapse ${isSuperadmin ? 'text-[10px]' : 'text-[11px]'}`}
                                  >
                                    <thead>
                                      <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                                        <th
                                          rowSpan={2}
                                          className="text-left font-semibold px-2 py-2 align-bottom whitespace-nowrap"
                                        >
                                          Month
                                        </th>
                                        <th colSpan={4} className="text-center font-semibold px-1 py-1 border-l border-slate-200 dark:border-slate-600">
                                          CL
                                        </th>
                                        <th colSpan={3} className="text-center font-semibold px-1 py-1 border-l border-slate-200 dark:border-slate-600">
                                          CCL
                                        </th>
                                        <th colSpan={3} className="text-center font-semibold px-1 py-1 border-l border-slate-200 dark:border-slate-600">
                                          EL
                                        </th>
                                        <th
                                          rowSpan={2}
                                          className="text-right font-semibold px-2 py-2 align-bottom border-l border-slate-200 dark:border-slate-600 whitespace-nowrap max-w-[8rem]"
                                          title="Ceiling min(pool, policy cap). ‘Left’ = ceiling minus counted days (in-flight + approved)."
                                        >
                                          Apply limit / left
                                        </th>
                                      </tr>
                                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">
                                        <th className="text-right font-medium px-1 py-1 border-l border-slate-200 dark:border-slate-600">
                                          Cr
                                        </th>
                                        <th className="text-right font-medium px-1 py-1">Used</th>
                                        <th
                                          className="text-right font-medium px-1 py-1"
                                          title="Locked: pending / in-flight (not yet final approved)"
                                        >
                                          Lk
                                        </th>
                                        <th
                                          className="text-right font-medium px-1 py-1 border-l border-slate-200 dark:border-slate-600"
                                          title="Transferred unused pool to next month"
                                        >
                                          Transfer
                                        </th>
                                        <th className="text-right font-medium px-1 py-1 border-l border-slate-200 dark:border-slate-600">
                                          Cr
                                        </th>
                                        <th className="text-right font-medium px-1 py-1">Used</th>
                                        <th
                                          className="text-right font-medium px-1 py-1"
                                          title="Locked: pending / in-flight (not yet final approved)"
                                        >
                                          Lk
                                        </th>
                                        <th className="text-right font-medium px-1 py-1 border-l border-slate-200 dark:border-slate-600">
                                          Cr
                                        </th>
                                        <th className="text-right font-medium px-1 py-1">Used</th>
                                        <th
                                          className="text-right font-medium px-1 py-1"
                                          title="Locked: pending / in-flight (not yet final approved)"
                                        >
                                          Lk
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {months.map((m, idx) => (
                                        <tr
                                          key={`${m.year}-${m.month}-${idx}`}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() =>
                                            void openMonthTransactions(
                                              idStr,
                                              row.employee?.name || row.employee?.empNo || 'Employee',
                                              m
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault();
                                              void openMonthTransactions(
                                                idStr,
                                                row.employee?.name || row.employee?.empNo || 'Employee',
                                                m
                                              );
                                            }
                                          }}
                                          className="border-b border-slate-100 dark:border-slate-700/80 hover:bg-indigo-50/60 dark:hover:bg-slate-700/40 cursor-pointer font-mono tabular-nums"
                                        >
                                          <td className="text-left px-2 py-1.5 align-top">
                                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                              {m.label || `${m.month}/${m.year}`}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-normal mt-0.5 space-y-0.5">
                                              <div>
                                                Bal CL {formatNum(m.clBalance)} · CCL {formatNum(m.cclBalance)} · EL{' '}
                                                {formatNum(m.elBalance)}
                                              </div>
                                              <div>
                                                sch CL {formatNullableNum(m.scheduledCl)}
                                                {m.scheduledClYtd != null && (
                                                  <span className="text-slate-400">
                                                    {' '}
                                                    · YTD sch {formatNum(m.scheduledClYtd)}
                                                  </span>
                                                )}{' '}
                                                · Txns {m.transactionCount ?? 0}
                                              </div>
                                            </div>
                                            {canEditMonths ? (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const fyResolved =
                                                    financialYear.trim() ||
                                                    String(row.yearSnapshot?.financialYear || '').trim();
                                                  if (!fyResolved) {
                                                    toast.info(
                                                      'Enter Financial year in filters (e.g. 2025-2026), or open row when FY snapshot loads.'
                                                    );
                                                    return;
                                                  }
                                                  setSlotEditModal({
                                                    open: true,
                                                    employeeId: idStr,
                                                    employeeName:
                                                      row.employee?.name || row.employee?.empNo || 'Employee',
                                                    financialYearForApi: fyResolved,
                                                    payrollCycleMonth: m.month,
                                                    payrollCycleYear: m.year,
                                                    label: m.label || `${m.month}/${m.year}`,
                                                    clCredits:
                                                      m.scheduledCl != null ? String(m.scheduledCl) : '',
                                                    compensatoryOffs:
                                                      m.scheduledCco != null ? String(m.scheduledCco) : '',
                                                    elCredits:
                                                      m.scheduledEl != null ? String(m.scheduledEl) : '',
                                                    lockedCredits:
                                                      m.lockedCredits != null ? String(m.lockedCredits) : '',
                                                    validateWithRecords: true,
                                                    carryUnusedToNextMonth: false,
                                                    clUsed: '',
                                                    compensatoryOffsUsed: '',
                                                    elUsed: '',
                                                    reason: '',
                                                    saving: false,
                                                  });
                                                }}
                                                className="mt-1 text-left text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                              >
                                                Edit scheduled pool (admin)…
                                              </button>
                                            ) : null}
                                          </td>
                                          <td className="text-right px-1 py-1.5 border-l border-slate-200 dark:border-slate-600">
                                            {formatNullableNum(m.cl?.credited)}
                                          </td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.cl?.used)}</td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.cl?.locked)}</td>
                                          <td className="text-right px-1 py-1.5 border-l border-slate-200 dark:border-slate-600">
                                            {formatNullableNum(m.cl?.transfer)}
                                          </td>
                                          <td className="text-right px-1 py-1.5 border-l border-slate-200 dark:border-slate-600">
                                            {formatNullableNum(m.ccl?.credited)}
                                          </td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.ccl?.used)}</td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.ccl?.locked)}</td>
                                          <td className="text-right px-1 py-1.5 border-l border-slate-200 dark:border-slate-600">
                                            {formatNullableNum(m.el?.credited)}
                                          </td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.el?.used)}</td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.el?.locked)}</td>
                                          <td className="text-right px-2 py-1.5 border-l border-slate-200 dark:border-slate-600 font-medium text-slate-800 dark:text-slate-100 align-top">
                                            <div>{formatNullableNum(m.monthlyApplyLimit)}</div>
                                            {m.monthlyApplyRemaining != null &&
                                              m.monthlyApplyLimit != null && (
                                                <div
                                                  className={`font-normal text-slate-500 dark:text-slate-400 mt-0.5 space-y-0.5 ${isSuperadmin ? 'text-[9px]' : 'text-[10px]'}`}
                                                >
                                                  <div>Left {formatNum(m.monthlyApplyRemaining)}</div>
                                                  {m.capConsumedDays != null && (
                                                    <div className="text-slate-400">
                                                      − locked {formatNullableNum(m.capLockedDays)} · approved{' '}
                                                      {formatNullableNum(m.capApprovedDays)} · total{' '}
                                                      {formatNum(m.capConsumedDays)}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null;
                    return expandRow ? [mainRow, expandRow] : [mainRow];
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && pagination.pages > 1 && (
            <div
              className={
                isSuperadmin
                  ? 'flex items-center justify-between px-3 sm:px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40'
                  : 'flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
              }
            >
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Page {page} of {pagination.pages} · {pagination.total} employees
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={
                    isSuperadmin
                      ? 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800'
                      : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium disabled:opacity-40'
                  }
                >
                  <ChevronLeft className={isSuperadmin ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className={
                    isSuperadmin
                      ? 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-600 dark:border-blue-500 bg-blue-600 text-white text-[11px] font-medium disabled:opacity-40 hover:bg-blue-700 dark:hover:bg-blue-600'
                      : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium disabled:opacity-40'
                  }
                >
                  Next
                  <ChevronRight className={isSuperadmin ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {monthModal?.open && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="month-modal-title"
          onClick={() => setMonthModal(null)}
        >
          <div
            className={`bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-xl shadow-2xl max-h-[88vh] overflow-hidden flex flex-col border ${
              isSuperadmin
                ? 'border-slate-200/80 dark:border-slate-600'
                : 'border-slate-200 dark:border-slate-700'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={
                isSuperadmin
                  ? 'flex items-center justify-between px-3 sm:px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50'
                  : 'flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800'
              }
            >
              <div className="min-w-0 pr-2">
                {isSuperadmin && (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-0.5">
                    Month transactions
                  </p>
                )}
                <h2
                  id="month-modal-title"
                  className={`font-semibold text-slate-900 dark:text-white ${isSuperadmin ? 'text-base' : 'text-lg font-bold'}`}
                >
                  {monthModal.label}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {monthModal.employeeName} · {monthModal.month}/{monthModal.year}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMonthModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={`overflow-y-auto flex-1 ${isSuperadmin ? 'p-3 sm:p-4' : 'p-4 sm:p-5'}`}>
              {monthModal.loading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className={`animate-spin ${isSuperadmin ? 'h-8 w-8 text-blue-600' : 'h-10 w-10 text-indigo-500'}`} />
                </div>
              ) : monthModal.transactions.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No transactions for this month.</p>
              ) : (
                <div
                  className={
                    isSuperadmin ? 'rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden' : ''
                  }
                >
                  <table className={`w-full ${isSuperadmin ? 'text-xs' : 'text-sm'}`}>
                    <thead>
                      <tr
                        className={
                          isSuperadmin
                            ? 'text-left bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 text-left border-b border-slate-200 dark:border-slate-700'
                        }
                      >
                        <th className={`font-medium ${isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3 font-semibold'}`}>
                          Type
                        </th>
                        <th className={`font-medium ${isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3 font-semibold'}`}>
                          Leave
                        </th>
                        <th
                          className={`font-medium text-right ${isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3 font-semibold'}`}
                        >
                          Days
                        </th>
                        <th
                          className={`hidden sm:table-cell font-medium ${isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3 font-semibold'}`}
                        >
                          Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthModal.transactions.map((tx: any, idx: number) => (
                        <tr
                          key={tx._id || `${tx.createdAt}-${tx.days}-${tx.transactionType}`}
                          className={
                            isSuperadmin
                              ? idx % 2 === 0
                                ? 'border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900'
                                : 'border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20'
                              : 'border-b border-slate-100 dark:border-slate-800/80'
                          }
                        >
                          <td className={isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3'}>{tx.transactionType}</td>
                          <td className={isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3'}>{tx.leaveType}</td>
                          <td
                            className={`text-right font-mono tabular-nums ${isSuperadmin ? 'py-1.5 px-2 font-medium' : 'py-2.5 px-3 font-medium'}`}
                          >
                            {formatNum(tx.days)}
                          </td>
                          <td
                            className={`text-slate-500 dark:text-slate-400 hidden sm:table-cell max-w-[220px] truncate ${isSuperadmin ? 'py-1.5 px-2' : 'py-2.5 px-3'}`}
                          >
                            {tx.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {slotEditModal?.open && (
        <div
          className="fixed inset-0 z-[201] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-edit-title"
          onClick={() => !slotEditModal.saving && setSlotEditModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full sm:max-w-md sm:rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 id="slot-edit-title" className="text-sm font-semibold text-slate-900 dark:text-white">
                  Edit scheduled pool
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {slotEditModal.employeeName} · {slotEditModal.label} · FY{' '}
                  {slotEditModal.financialYearForApi.trim() || '—'}
                </p>
              </div>
              <button
                type="button"
                disabled={slotEditModal.saving}
                onClick={() => setSlotEditModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Updates <strong>scheduled</strong> credits on the FY month slot (initial sync / corrections).
                Apply-cap consumption (locked/approved) is refreshed from leave rows after save; use{' '}
                <strong>Sync apply only</strong> if you only fixed applications.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Scheduled CL
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.clCredits}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, clCredits: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Scheduled CCL (pool)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.compensatoryOffs}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, compensatoryOffs: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Scheduled EL
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.elCredits}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, elCredits: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Policy lock (optional)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.lockedCredits}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, lockedCredits: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Used CL (override)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.clUsed}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, clUsed: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Used CCL (override)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.compensatoryOffsUsed}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, compensatoryOffsUsed: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Used EL (override)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slotEditModal.elUsed}
                    onChange={(e) =>
                      setSlotEditModal((m) => (m ? { ...m, elUsed: e.target.value } : null))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Reason (audit) *
                <textarea
                  value={slotEditModal.reason}
                  onChange={(e) =>
                    setSlotEditModal((m) => (m ? { ...m, reason: e.target.value } : null))
                  }
                  rows={2}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  placeholder="Why are you changing this month?"
                />
              </label>
              <div className="space-y-1">
                <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                    checked={slotEditModal.validateWithRecords}
                    onChange={(e) =>
                      setSlotEditModal((m) =>
                        m ? { ...m, validateWithRecords: e.target.checked } : null
                      )
                    }
                  />
                  <span>
                    Validate with records
                    <span className="block text-[10px] text-slate-500">
                      Prevent save if scheduled values are less than already used days.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                    checked={slotEditModal.carryUnusedToNextMonth}
                    onChange={(e) =>
                      setSlotEditModal((m) =>
                        m ? { ...m, carryUnusedToNextMonth: e.target.checked } : null
                      )
                    }
                  />
                  <span>
                    Carry unused to next month
                    <span className="block text-[10px] text-slate-500">
                      Moves this month&apos;s unused edited pool to the immediate next slot.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={slotEditModal.saving}
                  onClick={() => void saveSlotEdit()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {slotEditModal.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save slot
                </button>
                <button
                  type="button"
                  disabled={slotEditModal.saving}
                  onClick={() => void syncSlotApplyOnly()}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Sync apply only
                </button>
                <button
                  type="button"
                  disabled={slotEditModal.saving}
                  onClick={() => setSlotEditModal(null)}
                  className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs text-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
