'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Department, Division } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import Spinner from '@/components/Spinner';
import { ShieldCheck, AlertTriangle, CheckCircle2, Info, Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { AttendanceAuditCompareGrid, type CompareData } from '@/components/attendance/AttendanceAuditCompareGrid';
import { exportAttendanceAuditPdf } from '@/lib/attendanceAuditPdf';

type OverviewEmployee = CompareData;

type OverviewResult = {
  month: string;
  period: { start: string; end: string };
  total: number;
  flagged: number;
  shown: number;
  truncated?: boolean;
  onlyIssues?: boolean;
  employees: OverviewEmployee[];
};

function currentPayrollMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AttendanceAuditPage() {
  const [month, setMonth] = useState(currentPayrollMonth());
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [empNos, setEmpNos] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(true);
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

  const loadOverview = useCallback(async () => {
    if (!month) return;
    try {
      setLoading(true);
      const res = await api.getAttendanceAuditOverview({
        month,
        divisionIds: divisionIds.length ? divisionIds : undefined,
        departmentIds: departmentIds.length ? departmentIds : undefined,
        empNos: empNos.trim() || undefined,
        onlyIssues,
        limit: 150,
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
    if (!loadingFilters) loadOverview();
  }, [loadOverview, loadingFilters]);

  const handleExportPdf = () => {
    if (!overview) {
      toast.error('Load audit data before exporting');
      return;
    }
    setExportingPdf(true);
    const toastId = toast.loading('Generating PDF…');
    try {
      exportAttendanceAuditPdf(
        {
          month: overview.month,
          period: overview.period,
          total: overview.total,
          flagged: overview.flagged,
          shown: overview.shown,
          onlyIssues: overview.onlyIssues,
          truncated: overview.truncated,
        },
        overview.employees
      );
      toast.success('PDF downloaded', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF', { id: toastId });
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

  return (
    <div className="w-full max-w-full -mx-4 space-y-6 px-4 pb-24 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <ShieldCheck className="h-7 w-7 text-indigo-600" />
          Attendance Audits
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Attendance monthly view vs pay register — same day cells and summary columns as the attendance page.
          Summaries follow each employee&apos;s shift mode (single-shift or multi-shift). Half-day present matches
          pay register present on that half.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm lg:col-span-1">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Payroll month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <div className="lg:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Division</span>
            <MultiSelect
              options={divisions.map((d) => ({ id: d._id, name: d.name }))}
              selectedIds={divisionIds}
              onChange={setDivisionIds}
              placeholder="All divisions"
            />
          </div>
          <div className="lg:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Department</span>
            <MultiSelect
              options={filteredDepartments.map((d) => ({ id: d._id, name: d.name }))}
              selectedIds={departmentIds}
              onChange={setDepartmentIds}
              placeholder="All departments"
            />
          </div>
          <label className="block text-sm lg:col-span-1">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Employee #</span>
            <input
              type="text"
              value={empNos}
              onChange={(e) => setEmpNos(e.target.value)}
              placeholder="e.g. 101, 102"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <div className="flex flex-col justify-end gap-2 lg:col-span-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
                className="rounded border-slate-300"
              />
              Issues only
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadOverview}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refresh
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={loading || exportingPdf || !overview}
                title="Export abstract differences as PDF"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {exportingPdf ? 'Exporting…' : 'Export PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>

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

          {overview.truncated && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Narrow division, department, or employee filters to see more rows (max 150 per load).</p>
            </div>
          )}

          {!overview.employees.length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              {onlyIssues
                ? 'No mismatches or edits found for this scope. Uncheck “Issues only” to see all employees.'
                : 'No employees in scope for this month.'}
            </div>
          ) : (
            <div className="space-y-6">
              {overview.employees.map((item) => (
                <AttendanceAuditCompareGrid key={item.employee._id || item.employee.emp_no} data={item} compact />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
