'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { api, Division, Department, Employee, Designation } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import {
  GraduationCap,
  Download,
  Loader2,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Users,
  FileCheck,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  mergeOverallQualificationStatusOptions,
  qualificationStatusBadgeClass,
} from '@/lib/qualificationStatus';

interface CertificationQualification {
  rowNum: number | '';
  qualificationFields: Record<string, string>;
  rowStatus: string;
  hasCertificate: string;
  certificateUrl?: string;
}

interface EmployeeCertificationGroup {
  sNo: number;
  emp_no: string;
  employee_name: string;
  division: string;
  department: string;
  designation: string;
  overallCertificationStatus: string;
  overallCertificationStatusValue?: string;
  qualifications: CertificationQualification[];
}

interface ReportStats {
  totalEmployees: number;
  totalQualificationRows: number;
  employeesWithQualifications: number;
  employeesWithoutQualifications: number;
  byOverallStatus: Record<string, number>;
}

function normalizeEmployeeGroups(raw: unknown): EmployeeCertificationGroup[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item: any, index: number) => {
    const qualifications = Array.isArray(item?.qualifications)
      ? item.qualifications.map((qual: any, qualIndex: number) => ({
          rowNum: qual?.rowNum ?? qual?.qualificationRow ?? qualIndex + 1,
          qualificationFields: qual?.qualificationFields || {},
          rowStatus: qual?.rowStatus || '',
          hasCertificate: qual?.hasCertificate || 'No',
          certificateUrl: qual?.certificateUrl,
        }))
      : item?.qualificationRow !== '' && item?.qualificationRow != null
        ? [
            {
              rowNum: item.qualificationRow,
              qualificationFields: item.qualificationFields || {},
              rowStatus: item.rowStatus || '',
              hasCertificate: item.hasCertificate || 'No',
              certificateUrl: item.certificateUrl,
            },
          ]
        : [];

    return {
      sNo: item?.sNo ?? index + 1,
      emp_no: item?.emp_no || '',
      employee_name: item?.employee_name || '',
      division: item?.division || '',
      department: item?.department || '',
      designation: item?.designation || '',
      overallCertificationStatus: item?.overallCertificationStatus || 'Not set',
      overallCertificationStatusValue: item?.overallCertificationStatusValue,
      qualifications,
    };
  });
}

export default function CertificationReportsTab() {
  const [loading, setLoading] = useState(false);
  const [loadingXlsx, setLoadingXlsx] = useState(false);
  const [fetchingFilters, setFetchingFilters] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [statusOptions, setStatusOptions] = useState<{ value: string; label: string }[]>([]);

  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [designationIds, setDesignationIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [qualificationStatusIds, setQualificationStatusIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [includeLeft, setIncludeLeft] = useState(false);

  const [employeeGroups, setEmployeeGroups] = useState<EmployeeCertificationGroup[]>([]);
  const [expandedEmpNos, setExpandedEmpNos] = useState<Set<string>>(new Set());
  const [qualFieldLabels, setQualFieldLabels] = useState<string[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 25;

  useEffect(() => {
    loadInitialFilters();
  }, []);

  const loadInitialFilters = async () => {
    setFetchingFilters(true);
    try {
      const [divRes, desRes, statusRes] = await Promise.all([
        api.getDivisions(true),
        api.getAllDesignations(),
        api.getSetting('qualification_statuses'),
      ]);
      if (divRes.success) setDivisions(divRes.data || []);
      if (desRes.success) setDesignations(desRes.data || []);
      const merged = mergeOverallQualificationStatusOptions({
        settingList: statusRes?.success ? statusRes.data?.value : undefined,
      });
      setStatusOptions(merged);
    } catch (error) {
      console.error('Error loading filters:', error);
    } finally {
      setFetchingFilters(false);
    }
  };

  const handleDivisionChange = async (ids: string[]) => {
    setDivisionIds(ids);
    setDepartmentIds([]);
    setEmployeeIds([]);
    setDepartments([]);
    setEmployees([]);

    if (ids.length > 0) {
      try {
        const deptPromises = ids.map((id) => api.getDepartments(true, id));
        const results = await Promise.all(deptPromises);
        let allDepts: Department[] = [];
        results.forEach((res) => {
          if (res.success) allDepts = [...allDepts, ...(res.data || [])];
        });
        const uniqueDepts = Array.from(new Map(allDepts.map((item) => [item._id, item])).values());
        setDepartments(uniqueDepts);
      } catch (error) {
        console.error('Error loading departments:', error);
      }
    }
  };

  const handleDepartmentChange = async (ids: string[]) => {
    setDepartmentIds(ids);
    setEmployeeIds([]);
    setEmployees([]);

    if (ids.length > 0) {
      try {
        const res = await api.getEmployeesSummary({
          department_ids: ids.join(','),
          is_active: true,
          limit: 5000,
          page: 1,
        });
        if (res.success) setEmployees(res.data || []);
      } catch (error) {
        console.error('Error loading employees:', error);
      }
    }
  };

  const buildFilters = useCallback(
    () => ({
      page,
      limit,
      search: searchQuery || undefined,
      divisionId: divisionIds.length ? divisionIds.join(',') : undefined,
      department_ids: departmentIds.length ? departmentIds.join(',') : undefined,
      designation_id: designationIds.length ? designationIds.join(',') : undefined,
      employeeId: employeeIds.length ? employeeIds.join(',') : undefined,
      qualificationStatus: qualificationStatusIds.length ? qualificationStatusIds.join(',') : undefined,
      includeLeft: includeLeft ? 'true' : 'false',
    }),
    [
      page,
      limit,
      searchQuery,
      divisionIds,
      departmentIds,
      designationIds,
      employeeIds,
      qualificationStatusIds,
      includeLeft,
    ]
  );

  const fetchReport = async () => {
    setLoadingData(true);
    try {
      const res = await api.getCertificationReport(buildFilters());
      if (res.success) {
        const rawGroups =
          res.employees ||
          res.data?.employees ||
          res.rows ||
          res.data?.rows ||
          [];
        setEmployeeGroups(normalizeEmployeeGroups(rawGroups));
        setQualFieldLabels(res.qualFieldLabels || res.data?.qualFieldLabels || []);
        setStats(res.stats || null);
        setTotalRecords(res.pagination?.total || 0);
        setTotalPages(res.pagination?.totalPages || 1);
        setExpandedEmpNos(new Set());
      } else {
        setEmployeeGroups([]);
        setQualFieldLabels([]);
        setStats(null);
        setTotalRecords(0);
        setTotalPages(1);
        toast.error(res.message || 'Failed to load certification report');
      }
    } catch (error) {
      console.error('Error fetching certification report:', error);
      setEmployeeGroups([]);
      setStats(null);
      toast.error('Failed to load certification report');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReport();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, divisionIds, departmentIds, designationIds, employeeIds, qualificationStatusIds, includeLeft]);

  useEffect(() => {
    setPage(1);
  }, [divisionIds, departmentIds, designationIds, employeeIds, qualificationStatusIds, searchQuery, includeLeft]);

  const handleExportPDF = async () => {
    const toastId = toast.loading('Generating PDF report...');
    setLoading(true);
    try {
      const { page: _p, limit: _l, ...exportFilters } = buildFilters();
      const blob = await api.exportCertificationReportPDF(exportFilters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certification_Report_${dayjs().format('YYYY-MM-DD')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('PDF downloaded successfully!', { id: toastId });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to export PDF';
      toast.error(msg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleExportXLSX = async () => {
    const toastId = toast.loading('Generating Excel report...');
    setLoadingXlsx(true);
    try {
      const { page: _p, limit: _l, ...exportFilters } = buildFilters();
      const blob = await api.exportCertificationReport(exportFilters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certification_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Excel downloaded successfully!', { id: toastId });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to export Excel';
      toast.error(msg, { id: toastId });
    } finally {
      setLoadingXlsx(false);
    }
  };

  const toggleExpanded = (empNo: string) => {
    setExpandedEmpNos((prev) => {
      const next = new Set(prev);
      if (next.has(empNo)) next.delete(empNo);
      else next.add(empNo);
      return next;
    });
  };

  const formatFieldValue = (value: string | boolean | undefined) => {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (value == null || String(value).trim() === '') return '—';
    return String(value);
  };

  const employeeFilterOptions = useMemo(
    () =>
      employees.map((e) => ({
        id: e._id,
        name: `${e.emp_no} — ${e.employee_name || 'Unnamed'}`,
      })),
    [employees]
  );

  return (
    <div className="space-y-6 w-full pb-10">
      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 dark:bg-violet-950/20 dark:border-violet-900/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-4">
            <div className="bg-violet-600 p-2.5 rounded-xl shrink-0 shadow-lg shadow-violet-600/20">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-violet-900 dark:text-violet-100 uppercase tracking-wider">
                Employee Certification Report
              </h3>
              <p className="text-xs text-violet-700/80 dark:text-violet-300/80 mt-1 font-medium">
                One row per employee with overall certification status. Expand to view qualification details. Export includes all rows.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              disabled={loading || loadingXlsx}
              className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/20 active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {loading ? 'Generating...' : 'Export PDF'}
            </button>
            <button
              onClick={handleExportXLSX}
              disabled={loading || loadingXlsx}
              className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-violet-600 border border-violet-200 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50 dark:bg-slate-900 dark:border-violet-800 dark:text-violet-300"
            >
              {loadingXlsx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {loadingXlsx ? 'Generating...' : 'Export XLSX'}
            </button>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
              <Users className="h-3.5 w-3.5" /> Employees
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.totalEmployees}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
              <FileCheck className="h-3.5 w-3.5" /> Qualification Rows
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.totalQualificationRows}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">With Qualifications</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.employeesWithQualifications}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Without Qualifications</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.employeesWithoutQualifications}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between rounded-t-2xl">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </h4>
            {fetchingFilters && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
          </div>
          <div className="p-5 grid gap-4 grid-cols-2">
            <MultiSelect
              label="Division"
              options={divisions.map((d) => ({ id: d._id, name: d.name }))}
              selectedIds={divisionIds}
              onChange={handleDivisionChange}
              loading={fetchingFilters}
            />
            <MultiSelect
              label="Department"
              options={departments.map((d) => ({ id: d._id, name: d.name }))}
              selectedIds={departmentIds}
              onChange={handleDepartmentChange}
              disabled={divisionIds.length === 0}
            />
            <MultiSelect
              label="Designation"
              options={designations.map((d) => ({ id: d._id, name: d.name }))}
              selectedIds={designationIds}
              onChange={setDesignationIds}
            />
            <MultiSelect
              label="Employee"
              options={employeeFilterOptions}
              selectedIds={employeeIds}
              onChange={setEmployeeIds}
              disabled={departmentIds.length === 0}
            />
            <div className="col-span-2">
              <MultiSelect
                label="Overall Certification Status"
                options={statusOptions.map((o) => ({ id: o.value, name: o.label }))}
                selectedIds={qualificationStatusIds}
                onChange={setQualificationStatusIds}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Search</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Employee code, name, phone, email..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-sm"
                />
              </div>
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLeft}
                onChange={(e) => setIncludeLeft(e.target.checked)}
                className="rounded border-slate-300"
              />
              Include employees who have left
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 p-5">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Status Breakdown</h4>
          {stats?.byOverallStatus && Object.keys(stats.byOverallStatus).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.byOverallStatus).map(([label, count]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${qualificationStatusBadgeClass(label)}`}
                  >
                    {label}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> No data yet
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Report Preview</h4>
          {loadingData && <Loader2 className="h-4 w-4 animate-spin text-violet-500" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3 font-bold w-8" />
                <th className="px-3 py-3 font-bold">#</th>
                <th className="px-3 py-3 font-bold">Emp Code</th>
                <th className="px-3 py-3 font-bold">Name</th>
                <th className="px-3 py-3 font-bold">Division</th>
                <th className="px-3 py-3 font-bold">Department</th>
                <th className="px-3 py-3 font-bold">Designation</th>
                <th className="px-3 py-3 font-bold">Overall Certification Status</th>
                <th className="px-3 py-3 font-bold text-center">Qualifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employeeGroups.length === 0 && !loadingData ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-500">
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                employeeGroups.map((employee) => {
                  const isExpanded = expandedEmpNos.has(employee.emp_no);
                  const qualCount = employee.qualifications?.length || 0;
                  const canExpand = qualCount > 0;

                  return (
                    <Fragment key={employee.emp_no}>
                      <tr
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${canExpand ? 'cursor-pointer' : ''}`}
                        onClick={() => canExpand && toggleExpanded(employee.emp_no)}
                      >
                        <td className="px-3 py-2.5 text-slate-400">
                          {canExpand ? (
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                            />
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{employee.sNo}</td>
                        <td className="px-3 py-2.5 font-mono font-semibold">{employee.emp_no}</td>
                        <td className="px-3 py-2.5 font-medium">{employee.employee_name}</td>
                        <td className="px-3 py-2.5">{employee.division || '—'}</td>
                        <td className="px-3 py-2.5">{employee.department || '—'}</td>
                        <td className="px-3 py-2.5">{employee.designation || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${qualificationStatusBadgeClass(
                              employee.overallCertificationStatusValue || employee.overallCertificationStatus
                            )}`}
                          >
                            {employee.overallCertificationStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {qualCount > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-bold text-[10px]">
                              {qualCount}
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && qualCount > 0 && (
                        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-violet-50/50 dark:bg-violet-950/20">
                                <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
                                  Qualification details — {employee.employee_name} ({employee.emp_no})
                                </p>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2 font-bold">Row</th>
                                      {qualFieldLabels.map((label) => (
                                        <th key={label} className="px-3 py-2 font-bold whitespace-nowrap">
                                          {label}
                                        </th>
                                      ))}
                                      <th className="px-3 py-2 font-bold">Row Status</th>
                                      <th className="px-3 py-2 font-bold">Certificate</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {(employee.qualifications ?? []).map((qual, idx) => (
                                      <tr key={`${employee.emp_no}-qual-${qual.rowNum || idx}`}>
                                        <td className="px-3 py-2 text-center font-semibold">{qual.rowNum || idx + 1}</td>
                                        {qualFieldLabels.map((label) => (
                                          <td
                                            key={label}
                                            className="px-3 py-2 max-w-[180px] truncate"
                                            title={formatFieldValue(qual.qualificationFields?.[label] as string)}
                                          >
                                            {formatFieldValue(qual.qualificationFields?.[label] as string)}
                                          </td>
                                        ))}
                                        <td className="px-3 py-2">{qual.rowStatus || '—'}</td>
                                        <td className="px-3 py-2">
                                          {qual.hasCertificate === 'Yes' ? (
                                            <span className="text-emerald-600 font-semibold">Yes</span>
                                          ) : (
                                            <span className="text-slate-400">No</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              Showing page {page} of {totalPages} ({totalRecords} employees)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 dark:border-slate-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 dark:border-slate-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
