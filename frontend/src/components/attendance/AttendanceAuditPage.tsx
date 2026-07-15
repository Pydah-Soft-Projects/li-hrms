'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, Department, Division } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import Spinner from '@/components/Spinner';
import { ShieldCheck, AlertTriangle, CheckCircle2, Info, Loader2, FileText, Building2, Building, User, Calendar, Search, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { AttendanceAuditCompareGrid, type CompareData } from '@/components/attendance/AttendanceAuditCompareGrid';
import { exportAttendanceAuditPdf } from '@/lib/attendanceAuditPdf';

type OverviewEmployee = CompareData;

type OverviewResult = {
  month: string;
  period: { start: string; end: string };
  total: number;
  totalFiltered?: number;
  flagged: number;
  shown: number;
  page?: number;
  totalPages?: number;
  truncated?: boolean;
  onlyIssues?: boolean;
  employees: OverviewEmployee[];
};

function currentPayrollMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AttendanceAuditPage({
  hideTitle,
  embedded,
  active = true,
}: {
  hideTitle?: boolean;
  /** When rendered inside Audits page — no breakout margins */
  embedded?: boolean;
  active?: boolean;
} = {}) {
  const [month, setMonth] = useState(currentPayrollMonth());
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [empNos, setEmpNos] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [overview, setOverview] = useState<OverviewResult | null>(null);

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
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingFilters(false);
      }
    })();
  }, []);

  const loadOverview = useCallback(async (targetPage = 1) => {
    if (!month) return;
    try {
      setLoading(true);
      const res = await api.getAttendanceAuditOverview({
        month,
        divisionIds: divisionIds.length ? divisionIds : undefined,
        departmentIds: departmentIds.length ? departmentIds : undefined,
        empNos: empNos.trim() || undefined,
        onlyIssues,
        limit: 50,
        page: targetPage,
      });
      if (res.success) {
        setOverview(res.data as OverviewResult);
      } else {
        toast.error(res.message || 'Failed to load comparisons');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load comparisons');
    } finally {
      setLoading(false);
    }
  }, [month, divisionIds, departmentIds, empNos, onlyIssues]);

  useEffect(() => {
    if (!loadingFilters) {
      setPage(1);
      loadOverview(1);
    }
  }, [month, divisionIds, departmentIds, empNos, onlyIssues, loadingFilters, loadOverview]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadOverview(newPage);
  };

  const handleExportPdf = async () => {
    if (!overview) {
      toast.error('Load audit data before exporting');
      return;
    }
    setExportingPdf(true);
    const toastId = toast.loading('Generating PDF…');
    try {
      const res = await api.getAttendanceAuditOverview({
        month,
        divisionIds: divisionIds.length ? divisionIds : undefined,
        departmentIds: departmentIds.length ? departmentIds : undefined,
        empNos: empNos.trim() || undefined,
        onlyIssues,
        limit: 5000,
        page: 1,
      });

      if (!res.success) {
        throw new Error(res.message || 'Failed to fetch audit data');
      }

      const fullOverview = res.data as OverviewResult;

      exportAttendanceAuditPdf(
        {
          month: fullOverview.month,
          period: fullOverview.period,
          total: fullOverview.total,
          flagged: fullOverview.flagged,
          shown: fullOverview.shown,
          onlyIssues: fullOverview.onlyIssues,
          truncated: fullOverview.truncated,
        },
        fullOverview.employees
      );
      toast.success('PDF downloaded', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to generate PDF', { id: toastId });
    } finally {
      setExportingPdf(false);
    }
  };

  if (loadingFilters) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const filtersBar = (
    <div className="flex flex-nowrap w-max min-w-full items-center gap-2 pb-1.5">
      {/* Month */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
        />
      </div>

      {/* Division */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <MultiSelect
          options={divisions.map((d) => ({ id: d._id, name: d.name }))}
          selectedIds={divisionIds}
          onChange={setDivisionIds}
          placeholder="All Divisions"
          className="min-w-[100px] max-w-[130px]"
          pill
        />
      </div>

      {/* Department */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:border-emerald-300">
        <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <MultiSelect
          options={filteredDepartments.map((d) => ({ id: d._id, name: d.name }))}
          selectedIds={departmentIds}
          onChange={setDepartmentIds}
          placeholder="All Departments"
          className="min-w-[100px] max-w-[130px]"
          pill
        />
      </div>

      {/* Employee # */}
      <div className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all duration-300 hover:border-emerald-300 ${searchFocused ? 'w-[200px] sm:w-[260px]' : 'w-[120px]'}`}>
        <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          type="text"
          value={empNos}
          onChange={(e) => setEmpNos(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Emp # (e.g. 101, 102)"
          className="bg-transparent text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none w-full"
        />
      </div>

      {/* Refresh */}
      <button
        type="button"
        onClick={() => loadOverview(1)}
        disabled={loading}
        className="flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50 transition-all"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        Refresh
      </button>

      {/* Export PDF */}
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={loading || exportingPdf || !overview}
        title="Export abstract differences as PDF"
        className="flex shrink-0 items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 shadow-sm text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
      >
        {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
        {exportingPdf ? 'Exporting…' : 'Export PDF'}
      </button>
    </div>
  );

  const portalTarget = active && mounted ? document.getElementById('audit-header-filters') : null;

  return (
    <div
      className={
        embedded
          ? 'w-full max-w-full space-y-5'
          : 'w-full max-w-full -mx-4 space-y-6 px-4 pb-24 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6'
      }
    >
      {!hideTitle && (
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="h-7 w-7 text-emerald-600" />
            Attendance Audits
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Attendance monthly view vs pay register — same day cells and summary columns as the attendance page.
            Summaries follow each employee&apos;s shift mode (single-shift or multi-shift). Half-day present matches
            pay register present on that half.
          </p>
        </div>
      )}

      {portalTarget ? createPortal(filtersBar, portalTarget) : filtersBar}

      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-slate-500">Loading attendance vs pay register comparisons…</p>
        </div>
      ) : overview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {overview.period.start} → {overview.period.end}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium dark:bg-slate-800">
              {overview.total} in scope
            </span>
            {overview.flagged > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overview.flagged} with issues
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All aligned
              </span>
            )}
            <span className="text-xs text-slate-500">Showing {overview.shown}</span>
          </div>

          {!overview.employees.length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              {onlyIssues
                ? 'No mismatches or edits found for this scope.'
                : 'No employees in scope for this month.'}
            </div>
          ) : (
            <div className="space-y-6">
              {overview.employees.map((item) => (
                <AttendanceAuditCompareGrid key={item.employee._id || item.employee.emp_no} data={item} compact />
              ))}
            </div>
          )}

          {/* Pagination */}
          {(() => {
            const totalPages = overview.totalPages;
            if (!totalPages || totalPages <= 1) return null;
            return (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 shadow-sm mt-4">
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages} · {overview.totalFiltered || overview.shown} employees
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1 || loading}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = Math.max(1, page - 2) + i;
                    if (pg > totalPages) return null;
                    return (
                      <button
                        key={pg}
                        type="button"
                        onClick={() => handlePageChange(pg)}
                        disabled={loading}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                          pg === page
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
                  >
                    Next →
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
