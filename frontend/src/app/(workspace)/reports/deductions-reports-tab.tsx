'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, Department, Division, Designation } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Search,
  TrendingDown,
  Users,
  Calendar,
  Loader2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { sortByEmpNo } from '@/lib/employeeSort';
import { useSecondSalaryFeatureEnabled } from '@/hooks/useSecondSalaryFeatureEnabled';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import {
  exportDeductionsReportBundle,
  prepareDeductionsReportPreview,
  type DeductionsExportFormat,
  type DeductionsReportPreview,
} from '@/lib/paysheetDeductionsPdf';

const SEARCH_DEBOUNCE_MS = 350;

function orderPaysheetRowsByEmpNo(rows: Record<string, unknown>[]) {
  return sortByEmpNo(rows, (r) => {
    const code = r['Employee Code'] ?? r['Emp No'] ?? r['Employee No'] ?? r['emp_no'];
    return code != null ? String(code) : '';
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function DeductionsReportsTab() {
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const { profile } = useCompanyProfile();
  const { secondSalaryEnabled } = useSecondSalaryFeatureEnabled();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<DeductionsReportPreview | null>(null);

  const [selectedMonth, setSelectedMonth] = useState('');
  const [paysheetKind, setPaysheetKind] = useState<'regular' | 'second_salary'>('regular');
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [customEmployeeGroupingEnabled, setCustomEmployeeGroupingEnabled] = useState(false);
  const [employeeGroups, setEmployeeGroups] = useState<{ _id: string; name: string }[]>([]);
  const [selectedEmployeeGroup, setSelectedEmployeeGroup] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'inactive' | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [exportingDeductions, setExportingDeductions] = useState(false);
  const [deductionsExportModalOpen, setDeductionsExportModalOpen] = useState(false);
  const [deductionsExportFormat, setDeductionsExportFormat] =
    useState<DeductionsExportFormat>('by_department');

  useEffect(() => {
    if (!secondSalaryEnabled && paysheetKind === 'second_salary') {
      setPaysheetKind('regular');
    }
  }, [secondSalaryEnabled, paysheetKind]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getPaysheetDefaultMonth();
        const m = res?.data?.month;
        if (!cancelled && m && /^\d{4}-\d{2}$/.test(m)) {
          setSelectedMonth(m);
          return;
        }
      } catch {
        /* fallback */
      }
      if (cancelled) return;
      const today = new Date();
      const fallback =
        today.getDate() > 15
          ? today.toISOString().slice(0, 7)
          : new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7);
      setSelectedMonth(fallback);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEmployeeGroupingConfig = useCallback(async () => {
    try {
      const res = await api.getSetting('custom_employee_grouping_enabled');
      const on = !!(res?.success && res?.data != null && res.data.value);
      setCustomEmployeeGroupingEnabled(on);
      if (!on) {
        setEmployeeGroups([]);
        setSelectedEmployeeGroup('');
        return;
      }
      const g = await api.getEmployeeGroups(true);
      if (g.success && Array.isArray(g.data)) setEmployeeGroups(g.data);
      else setEmployeeGroups([]);
    } catch {
      setCustomEmployeeGroupingEnabled(false);
      setEmployeeGroups([]);
      setSelectedEmployeeGroup('');
    }
  }, []);

  const loadDivisions = useCallback(async () => {
    try {
      const res = await api.getDivisions().catch(() => ({ data: [] }));
      setDivisions(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setDivisions([]);
    }
  }, []);

  const loadDepartments = useCallback(async (divisionId?: string) => {
    try {
      const res = await api.getDepartments(undefined, divisionId || undefined).catch(() => ({ data: [] }));
      setDepartments(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setDepartments([]);
    }
  }, []);

  const loadDesignations = useCallback(async (departmentId?: string) => {
    if (!departmentId) {
      setDesignations([]);
      return;
    }
    try {
      const res = await api.getDesignations(departmentId).catch(() => ({ data: [] }));
      setDesignations(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setDesignations([]);
    }
  }, []);

  useEffect(() => {
    loadEmployeeGroupingConfig();
    loadDivisions();
    loadDepartments();
  }, [loadEmployeeGroupingConfig, loadDivisions, loadDepartments]);

  useEffect(() => {
    if (selectedDivision) loadDepartments(selectedDivision);
    else loadDepartments();
    setSelectedDepartment('');
    setSelectedDesignation('');
  }, [selectedDivision, loadDepartments]);

  useEffect(() => {
    if (selectedDepartment) loadDesignations(selectedDepartment);
    else {
      setDesignations([]);
      setSelectedDesignation('');
    }
  }, [selectedDepartment, loadDesignations]);

  const loadDeductionsData = useCallback(async () => {
    if (!selectedMonth) return;

    setLoading(true);
    try {
      const res = await api.getPaysheetData({
        month: selectedMonth,
        departmentId: selectedDepartment || undefined,
        divisionId: selectedDivision || undefined,
        designationId: selectedDesignation || undefined,
        employee_group_id: selectedEmployeeGroup || undefined,
        status: employmentStatus || undefined,
        search: debouncedSearch || undefined,
        source: 'existing',
        secondSalary: secondSalaryEnabled && paysheetKind === 'second_salary',
      });

      if (res?.success && res?.data) {
        const nextHeaders = res.data.headers || [];
        const nextRows = orderPaysheetRowsByEmpNo(res.data.rows || []);
        setRows(nextRows);
        const nextPreview = await prepareDeductionsReportPreview(nextRows, nextHeaders);
        setPreview(nextPreview);
        if (nextRows.length === 0 && res.message) {
          toast(res.message, { icon: 'ℹ️' });
        }
      } else {
        setRows([]);
        setPreview(null);
        toast.error(res?.message || 'Failed to load deductions report data');
      }
    } catch (error) {
      console.error('Error loading deductions report:', error);
      toast.error('Error loading deductions report');
      setRows([]);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [
    selectedMonth,
    selectedDepartment,
    selectedDivision,
    selectedDesignation,
    selectedEmployeeGroup,
    employmentStatus,
    debouncedSearch,
    paysheetKind,
    secondSalaryEnabled,
  ]);

  useEffect(() => {
    loadDeductionsData();
  }, [loadDeductionsData]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (selectedDivision) n++;
    if (selectedDepartment) n++;
    if (selectedDesignation) n++;
    if (employmentStatus) n++;
    if (debouncedSearch.trim()) n++;
    if (selectedEmployeeGroup) n++;
    return n;
  }, [selectedDivision, selectedDepartment, selectedDesignation, employmentStatus, debouncedSearch, selectedEmployeeGroup]);

  const clearFilters = () => {
    setSelectedDivision('');
    setSelectedDepartment('');
    setSelectedDesignation('');
    setEmploymentStatus('');
    setSelectedEmployeeGroup('');
    setSearchInput('');
    setDebouncedSearch('');
  };

  const scrollTableHorizontally = (direction: 'left' | 'right') => {
    if (!tableScrollRef.current) return;
    const amount = Math.max(280, Math.floor(tableScrollRef.current.clientWidth * 0.6));
    tableScrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const openDeductionsExportModal = () => {
    if (!selectedMonth) {
      toast.error('Please select a month');
      return;
    }
    if (!rows.length) {
      toast.error('No paysheet data found for the selected filters');
      return;
    }
    setDeductionsExportFormat('by_department');
    setDeductionsExportModalOpen(true);
  };

  const confirmExportDeductionsPdf = async () => {
    if (!selectedMonth || !profile) {
      toast.error('Please select a month and ensure company profile is loaded');
      return;
    }

    setExportingDeductions(true);
    try {
      const departmentName = selectedDepartment
        ? departments.find((d) => d._id === selectedDepartment)?.name
        : undefined;
      const divisionName = selectedDivision
        ? divisions.find((d) => d._id === selectedDivision)?.name
        : undefined;
      const designationName = selectedDesignation
        ? designations.find((d) => d._id === selectedDesignation)?.name
        : undefined;
      const groupName = selectedEmployeeGroup
        ? employeeGroups.find((g) => g._id === selectedEmployeeGroup)?.name
        : undefined;

      const paysheetQuery = {
        month: selectedMonth,
        departmentId: selectedDepartment || undefined,
        divisionId: selectedDivision || undefined,
        designationId: selectedDesignation || undefined,
        employee_group_id: selectedEmployeeGroup || undefined,
        status: employmentStatus || undefined,
        search: debouncedSearch || undefined,
        source: 'existing' as const,
      };

      const { exported } = await exportDeductionsReportBundle(selectedMonth, profile, {
        format: deductionsExportFormat,
        secondSalaryEnabled,
        filters: {
          department: departmentName,
          division: divisionName,
          designation: designationName,
          group: groupName,
        },
        fetchPaysheet: async (secondSalary) => {
          const res = await api.getPaysheetData({
            ...paysheetQuery,
            secondSalary,
          });
          if (!res?.success || !res?.data) {
            return { headers: [], rows: [] };
          }
          return {
            headers: res.data.headers || [],
            rows: orderPaysheetRowsByEmpNo(res.data.rows || []),
          };
        },
      });

      setDeductionsExportModalOpen(false);

      if (exported.length === 0) {
        toast.error('No paysheet data found for the selected filters');
        return;
      }

      toast.success(
        exported.length === 2
          ? 'Downloaded Regular and 2nd Salary deductions reports'
          : `Downloaded ${exported[0]} deductions report`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to export deductions report';
      toast.error(msg);
    } finally {
      setExportingDeductions(false);
    }
  };

  const monthLabel = selectedMonth
    ? new Date(`${selectedMonth}-01`).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
    : '';

  const hasData = (preview?.employees.length ?? 0) > 0;
  const deductionCols = preview?.deductionColumnHeaders ?? [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="deductionsMonth" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Pay Month
            </label>
            <input
              type="month"
              id="deductionsMonth"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          {secondSalaryEnabled && (
            <div>
              <label htmlFor="salaryKind" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Salary Type
              </label>
              <select
                id="salaryKind"
                value={paysheetKind}
                onChange={(e) => setPaysheetKind(e.target.value as 'regular' | 'second_salary')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="regular">Regular Salary</option>
                <option value="second_salary">2nd Salary</option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="division" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Division
            </label>
            <select
              id="division"
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
            <label htmlFor="department" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Department
            </label>
            <select
              id="department"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="designation" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Designation
            </label>
            <select
              id="designation"
              value={selectedDesignation}
              onChange={(e) => setSelectedDesignation(e.target.value)}
              disabled={!selectedDepartment}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">All designations</option>
              {designations.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {customEmployeeGroupingEnabled && (
            <div>
              <label htmlFor="empGroup" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Employee Group
              </label>
              <select
                id="empGroup"
                value={selectedEmployeeGroup}
                onChange={(e) => setSelectedEmployeeGroup(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All groups</option>
                {employeeGroups.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="empStatus" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Employment Status
            </label>
            <select
              id="empStatus"
              value={employmentStatus}
              onChange={(e) => setEmploymentStatus(e.target.value as 'active' | 'inactive' | '')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label htmlFor="search" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="search"
                placeholder="Employee name or code…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {monthLabel}
              {paysheetKind === 'second_salary' ? ' · 2nd Salary' : ' · Regular Salary'}
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Loading…
              </span>
            )}
            <button
              type="button"
              onClick={() => scrollTableHorizontally('left')}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600"
              aria-label="Scroll table left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollTableHorizontally('right')}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600"
              aria-label="Scroll table right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => loadDeductionsData()}
              disabled={loading || !selectedMonth}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 hover:text-red-600 disabled:opacity-40"
              title="Reload"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={openDeductionsExportModal}
              disabled={!selectedMonth || !hasData || exportingDeductions}
              className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-50"
              title="Export Deductions Report PDF"
            >
              {exportingDeductions ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              {exportingDeductions ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {preview && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Deductions</p>
                <p className="mt-1 text-2xl font-bold text-red-900 dark:text-red-100">
                  ₹{formatCurrency(preview.grandTotal)}
                </p>
              </div>
              <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/40">
                <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Employees</p>
                <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {preview.employees.length}
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/40">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-sm dark:border-purple-800 dark:bg-purple-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Deduction Columns</p>
                <p className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {deductionCols.length}
                </p>
              </div>
              <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900/40">
                <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Avg per Employee</p>
                <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
                  ₹
                  {formatCurrency(
                    preview.employees.length > 0 ? preview.grandTotal / preview.employees.length : 0
                  )}
                </p>
              </div>
              <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/40">
                <TrendingDown className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deductions Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {loading && !hasData ? (
          <div className="flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Loading deductions report…</p>
            </div>
          </div>
        ) : !hasData ? (
          <div className="p-12 text-center">
            <p className="text-slate-600 dark:text-slate-400">
              {deductionCols.length === 0 && rows.length > 0
                ? 'No deduction columns found in paysheet data for this month.'
                : 'No paysheet deductions data found for the selected month and filters.'}
            </p>
          </div>
        ) : (
          <div ref={tableScrollRef} className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-sm table-auto">
              <colgroup>
                <col className="w-12" />
                <col className="w-24" />
                <col className="min-w-[10rem]" />
                <col className="min-w-[8rem]" />
                <col className="min-w-[7rem]" />
                <col className="min-w-[8rem]" />
                <col className="min-w-[6rem]" />
                {deductionCols.map((col) => (
                  <col key={col} className="min-w-[5.5rem]" />
                ))}
                <col className="min-w-[6rem]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    S.No
                  </th>
                  <th className="sticky left-10 z-10 bg-slate-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    EC No.
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Employee Name
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Designation
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Division
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Department
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Group
                  </th>
                  {deductionCols.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-red-800 dark:text-red-300">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {preview!.employees.map((emp, index) => (
                  <tr key={`${emp.ecNo}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-center text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {index + 1}
                    </td>
                    <td className="sticky left-10 z-10 bg-white px-3 py-2.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {emp.ecNo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                      {emp.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {emp.designation}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {emp.division}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {emp.department}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {emp.group}
                    </td>
                    {deductionCols.map((col) => (
                      <td
                        key={col}
                        className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300"
                      >
                        {formatCurrency(emp.deductions[col] || 0)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {formatCurrency(emp.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                <tr>
                  <td className="sticky left-0 z-10 bg-red-50 px-3 py-3 dark:bg-red-900/20" />
                  <td className="sticky left-10 z-10 bg-red-50 px-3 py-3 dark:bg-red-900/20" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-red-800 dark:text-red-200">
                    Grand Total
                  </td>
                  {deductionCols.map((col) => (
                    <td
                      key={col}
                      className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-red-800 dark:text-red-200"
                    >
                      {formatCurrency(preview!.columnTotals[col] || 0)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold tabular-nums text-red-900 dark:text-red-100">
                    {formatCurrency(preview!.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {deductionsExportModalOpen && (
        <div
          className="fixed inset-0 z-[201] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deductions-export-title"
          onClick={() => !exportingDeductions && setDeductionsExportModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-rose-700 to-rose-900 text-white">
              <h2 id="deductions-export-title" className="text-base font-semibold">
                Export deductions report
              </h2>
              <p className="text-xs text-white/90 mt-1 leading-snug">
                PDF with employee details and all configured deduction columns for {monthLabel}.
                {secondSalaryEnabled
                  ? ' Downloads Regular and 2nd Salary reports when data exists.'
                  : ' Downloads Regular salary deductions only.'}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-600 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:ring-2 has-[:checked]:ring-rose-500/40">
                <input
                  type="radio"
                  name="deductionsExportFormat"
                  className="mt-0.5"
                  checked={deductionsExportFormat === 'combined'}
                  disabled={exportingDeductions}
                  onChange={() => setDeductionsExportFormat('combined')}
                />
                <span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Combined table</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    One table for all employees with a single grand total at the end.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-600 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:ring-2 has-[:checked]:ring-rose-500/40">
                <input
                  type="radio"
                  name="deductionsExportFormat"
                  className="mt-0.5"
                  checked={deductionsExportFormat === 'by_department'}
                  disabled={exportingDeductions}
                  onChange={() => setDeductionsExportFormat('by_department')}
                />
                <span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    By division &amp; department (recommended)
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Each department on its own section with department totals.
                  </span>
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
              <button
                type="button"
                disabled={exportingDeductions}
                onClick={() => setDeductionsExportModalOpen(false)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exportingDeductions}
                onClick={() => void confirmExportDeductionsPdf()}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 text-white px-4 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {exportingDeductions ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
