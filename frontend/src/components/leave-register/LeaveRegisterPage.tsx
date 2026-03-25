'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
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
} from 'lucide-react';

type MonthLeaveBucket = {
  credited?: number;
  used?: number;
  locked?: number | null;
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

export default function LeaveRegisterPage() {
  const now = useMemo(() => new Date(), []);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [financialYear, setFinancialYear] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
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
    setPage(1);
  }, [debouncedSearch, financialYear, month, year, departmentId, divisionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.listLeaveRegister({
          financialYear: financialYear.trim() || undefined,
          month,
          year,
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
  }, [debouncedSearch, financialYear, month, year, departmentId, divisionId, page]);

  useEffect(() => {
    detailCacheRef.current = new Map();
    detailInflightRef.current = new Map();
    setExpandedIds([]);
  }, [debouncedSearch, financialYear, month, year, departmentId, divisionId]);

  const prefetchRowDetail = async (employeeId: string) => {
    if (detailCacheRef.current.has(employeeId)) return;
    const existing = detailInflightRef.current.get(employeeId);
    if (existing) return existing;
    const p = (async () => {
      setRowDetailLoading((r) => ({ ...r, [employeeId]: true }));
      try {
        const res = await api.getEmployeeLeaveRegisterDetail(employeeId, {
          financialYear: financialYear.trim() || undefined,
          month,
          year,
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

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Leave register
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Per-employee ledger (CL, EL, CCL) for the selected financial year and payroll context.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
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
              <input
                type="text"
                placeholder="e.g. 2025 or 2025-2026"
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500">Payroll month</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
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
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                  <th className="w-10 py-3 px-2" aria-label="Expand" />
                  <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-300">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-300 hidden md:table-cell">
                    Org
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-slate-600 dark:text-slate-300">CL</th>
                  <th className="text-right py-3 px-3 font-semibold text-slate-600 dark:text-slate-300">EL</th>
                  <th className="text-right py-3 px-3 font-semibold text-slate-600 dark:text-slate-300">CCL</th>
                  <th className="text-right py-3 px-3 font-semibold text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                    Total
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-slate-600 dark:text-slate-300 hidden lg:table-cell">
                    Txns
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-500">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-500" />
                      <p className="mt-2 text-sm">Loading register…</p>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-500 dark:text-slate-400">
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
                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td className="py-3 px-2 text-slate-400 align-middle">
                          {idStr ? (
                            <ChevronRight
                              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                            />
                          ) : null}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300">
                              <User className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {row.employee?.name || '—'}
                              </p>
                              <p className="text-xs text-slate-500">
                                {row.employee?.empNo || '—'}
                                {row.employee?.designation ? ` · ${row.employee.designation}` : ''}
                              </p>
                              {row.yearSnapshot?.financialYear ? (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  FY {row.yearSnapshot.financialYear}: CL / CCL from year register
                                </p>
                              ) : !financialYear.trim() ? (
                                <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90 mt-0.5">
                                  Set financial year to load year register snapshot
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell text-slate-600 dark:text-slate-400 text-xs">
                          <div>{row.employee?.department || '—'}</div>
                          <div className="text-slate-400">{row.employee?.division || ''}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatNum(bal.cl)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatNum(bal.el)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatNum(bal.ccl)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums hidden sm:table-cell font-semibold text-slate-800 dark:text-slate-200">
                          {formatNum(bal.total)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-500 hidden lg:table-cell">
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
                          <td colSpan={8} className="px-4 py-4">
                            {rowDetailLoading[idStr] && !detailCacheRef.current.has(idStr) ? (
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                Loading months…
                              </div>
                            ) : months.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No payroll months in this view. Adjust filters or financial year.
                              </p>
                            ) : (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                  Payroll months — click a row for transactions
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  The period <strong>ceiling</strong> is min(scheduled CL+CCL[+EL per policy], policy cap).{' '}
                                  Both <strong>locked</strong> (pending / in-approval) and <strong>approved</strong> days{' '}
                                  deduct from that ceiling — apply is blocked once locked + approved reaches the ceiling.
                                </p>
                                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60">
                                  <table className="w-full min-w-[720px] text-[11px] border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                                        <th
                                          rowSpan={2}
                                          className="text-left font-semibold px-2 py-2 align-bottom whitespace-nowrap"
                                        >
                                          Month
                                        </th>
                                        <th colSpan={3} className="text-center font-semibold px-1 py-1 border-l border-slate-200 dark:border-slate-600">
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
                                          </td>
                                          <td className="text-right px-1 py-1.5 border-l border-slate-200 dark:border-slate-600">
                                            {formatNullableNum(m.cl?.credited)}
                                          </td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.cl?.used)}</td>
                                          <td className="text-right px-1 py-1.5">{formatNullableNum(m.cl?.locked)}</td>
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
                                                <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 space-y-0.5">
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-xs text-slate-500">
                Page {page} of {pagination.pages} · {pagination.total} employees
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
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
            className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 id="month-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  {monthModal.label}
                </h2>
                <p className="text-sm text-slate-500">
                  {monthModal.employeeName} · {monthModal.month}/{monthModal.year}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMonthModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {monthModal.loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
                </div>
              ) : monthModal.transactions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No transactions for this month.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-left border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Leave</th>
                      <th className="py-2 text-right">Days</th>
                      <th className="py-2 pl-2 hidden sm:table-cell">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthModal.transactions.map((tx: any) => (
                      <tr
                        key={tx._id || `${tx.createdAt}-${tx.days}-${tx.transactionType}`}
                        className="border-b border-slate-100 dark:border-slate-800/80"
                      >
                        <td className="py-2 pr-2">{tx.transactionType}</td>
                        <td className="py-2 pr-2">{tx.leaveType}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{formatNum(tx.days)}</td>
                        <td className="py-2 pl-2 text-slate-500 hidden sm:table-cell max-w-[220px] truncate">
                          {tx.reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
