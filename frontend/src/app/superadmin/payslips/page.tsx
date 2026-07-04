'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Division, Department, Designation, PayrollOutputColumn } from '@/lib/api';
import { toast, ToastContainer } from 'react-toastify';
import jsPDF from 'jspdf';
import { fetchCompanyProfile, type CompanyProfile } from '@/lib/companyProfile';
import { resolveEmployeeListDisplayParts } from '@/lib/employeeListDisplay';
import { resolvePayslipSections } from '@/components/payslip/DynamicPayslipSections';
import { drawDynamicPayslipPdf } from '@/lib/payslipPdfDynamic';
import { buildPayslipSections } from '@/lib/payslipSections';
import { resolvePayslipLoans } from '@/lib/payslipLoans';
import Spinner from '@/components/Spinner';
import { Search, Eye, Download, Loader2, RefreshCw, FileText, Rocket } from 'lucide-react';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansToolbar,
  LoansContentPanel,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanFormLabel,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansFormInputClass,
  loansFormInputStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { MultiSelect } from '@/components/MultiSelect';
import { ledgerMoneyClass, ledgerStatusBadgeClass, ledgerActionButtonClass, ledgerTableActionsCellClass, ledgerTableActionsGroupClass, ledgerTableActionsHeaderClass, type LedgerUiStatus } from '@/lib/ledgerUi';
import {
  PAYSLIP_LIST_STATUS_OPTIONS,
  payslipMatchesListOrgAndStatus,
  payslipMatchesSearch,
  summarizePayslipRelease,
  formatPayslipReleaseMessage,
  canReleasePayslipRecord,
  isPayslipReleased,
  getPayslipEmployeeViewLabel,
} from '@/lib/payslipListUi';
import { auth } from '@/lib/auth';
import {
  canViewScopedPayslips,
  canReleasePayslips,
  hasAnyRole,
  type User as PermUser,
} from '@/lib/permissions';

const SELF_PAYSLIP_PAGE_SIZE = 6;

const payslipLedgerStatus = (status: string): LedgerUiStatus => {
  if (status === 'processed' || status === 'approved') return 'approved';
  if (status === 'calculated') return 'pending';
  return 'neutral';
};

function PayslipEmployeeBlock({
  employee,
  empNo,
  departments,
  designations,
}: {
  employee: Employee | null;
  empNo: string;
  departments: Department[];
  designations: Designation[];
}) {
  const d = resolveEmployeeListDisplayParts(
    { employeeId: employee as any, emp_no: empNo },
    { departments, designations },
  );
  const initial = (d.name.charAt(0) || 'E').toUpperCase();
  return (
    <div className="flex min-w-0 items-start gap-3" title={d.tooltip}>
      {d.profilePhoto ? (
        <img src={d.profilePhoto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
      ) : (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center text-[10px] font-semibold text-white"
          style={{ backgroundColor: 'var(--ps-accent)' }}
        >
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{d.name}</div>
        {d.empDesigLine ? <div className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-400">{d.empDesigLine}</div> : null}
        {d.deptDivLine ? <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{d.deptDivLine}</div> : null}
      </div>
    </div>
  );
}
interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department_id?: string | { _id: string; name: string };
  designation_id?: string | { _id: string; name: string };
  location?: string;
  bank_account_no?: string;
  pf_number?: string;
  esi_number?: string;
}



interface PayrollRecord {
  _id: string;
  employeeId: Employee | string;
  emp_no: string;
  month: string;
  monthName: string;
  year: number;
  monthNumber: number;
  attendance?: {
    totalDaysInMonth: number;
    presentDays: number;
    paidLeaveDays: number;
    odDays: number;
    weeklyOffs: number;
    holidays: number;
    absentDays: number;
    payableShifts: number;
    extraDays: number;
    totalPaidDays: number;
    otHours: number;
    otDays: number;
    earnedSalary: number;
  };
  earnings: {
    basicPay: number;
    perDayBasicPay: number;
    payableAmount: number;
    incentive: number;
    otPay: number;
    otHours: number;
    totalAllowances: number;
    allowances: Array<{ name: string; amount: number }>;
    grossSalary: number;
  };
  deductions: {
    attendanceDeduction: number;
    attendanceDeductionBreakdown?: { daysDeducted?: number };
    permissionDeduction: number;
    leaveDeduction: number;
    totalOtherDeductions: number;
    otherDeductions: Array<{ name: string; amount: number }>;
    totalDeductions: number;
  };
  loanAdvance: {
    totalEMI: number;
    advanceDeduction: number;
  };
  netSalary: number;
  status: string;
  isReleased?: boolean;
  payrollBatchId?: {
    _id?: string;
    status?: string;
    batchNumber?: string;
    month?: string;
  } | string;
  arrearsAmount?: number;
  totalDaysInMonth?: number;
  totalPayableShifts?: number;
  roundOff?: number;
  startDate?: string;
  endDate?: string;
}

export function PayslipsContent({
  basePath = '/superadmin/payslips',
  showDivisionFilter = true,
}: {
  basePath?: string;
  showDivisionFilter?: boolean;
}) {
  const router = useRouter();
  const currentUser = auth.getUser() as PermUser | null;
  const viewMode = useMemo(() => {
    if (!currentUser) return 'self' as const;
    if (basePath.includes('superadmin') && hasAnyRole(currentUser, ['super_admin', 'sub_admin', 'hr'])) {
      return 'admin' as const;
    }
    if (canViewScopedPayslips(currentUser)) return 'scoped' as const;
    return 'self' as const;
  }, [currentUser, basePath]);
  const isSelfView = viewMode === 'self';
  const canRelease = Boolean(currentUser && canReleasePayslips(currentUser) && viewMode !== 'self');

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<PayrollRecord[]>([]);
  const [selfPage, setSelfPage] = useState(1);
  const [selfHasMore, setSelfHasMore] = useState(false);
  const [selfTotal, setSelfTotal] = useState(0);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('');
  const [listFilterDivisions, setListFilterDivisions] = useState<string[]>([]);
  const [listFilterDepartments, setListFilterDepartments] = useState<string[]>([]);
  const [listFilterDesignations, setListFilterDesignations] = useState<string[]>([]);
  const [listFilterStatuses, setListFilterStatuses] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // PDF Generation
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingBulkPDF, setGeneratingBulkPDF] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [payrollOutputColumns, setPayrollOutputColumns] = useState<PayrollOutputColumn[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 20;

  useEffect(() => {
    if (!isSelfView) {
      const today = new Date();
      const day = today.getDate();
      let defaultMonth = '';
      if (day > 15) {
        defaultMonth = today.toISOString().substring(0, 7);
      } else {
        const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        defaultMonth = prevMonth.toISOString().substring(0, 7);
      }
      setSelectedMonth(defaultMonth);
    }

    loadFilterData();
    fetchCompanyProfile().then(setCompanyProfile);
    api.getPayrollConfig().then((res) => {
      const cols = (res as { data?: { outputColumns?: PayrollOutputColumn[] } })?.data?.outputColumns;
      if (Array.isArray(cols)) setPayrollOutputColumns(cols);
    }).catch(() => {});
  }, [isSelfView]);

  useEffect(() => {
    if (isSelfView) {
      setSelfPage(1);
      fetchPayrollRecords({ page: 1, append: false });
    } else if (selectedMonth) {
      fetchPayrollRecords();
    }
  }, [selectedMonth, isSelfView]);

  useEffect(() => {
    applyFilters();
  }, [
    payrollRecords,
    searchQuery,
    listFilterDivisions,
    listFilterDepartments,
    listFilterDesignations,
    listFilterStatuses,
    divisions,
    departments,
  ]);

  const loadFilterData = async () => {
    try {
      const requests: Promise<unknown>[] = [
        api.getDepartments(),
        api.getAllDesignations(),
      ];
      if (showDivisionFilter) requests.unshift(api.getDivisions());

      const results = await Promise.all(requests);
      let idx = 0;
      if (showDivisionFilter) {
        const divRes = results[idx++] as Awaited<ReturnType<typeof api.getDivisions>>;
        if (divRes.success) setDivisions(divRes.data || []);
      }
      const deptRes = results[idx++] as Awaited<ReturnType<typeof api.getDepartments>>;
      const desigRes = results[idx] as Awaited<ReturnType<typeof api.getAllDesignations>>;
      if (deptRes.success) setDepartments(deptRes.data || []);
      if (desigRes.success) setDesignations(desigRes.data || []);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  const fetchPayrollRecords = async (opts?: { page?: number; append?: boolean }) => {
    if (!isSelfView && !selectedMonth) return;

    const page = opts?.page ?? (isSelfView ? selfPage : 1);
    const append = opts?.append ?? false;

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await api.getPayrollRecords({
        month: selectedMonth || undefined,
        page: isSelfView ? page : undefined,
        limit: isSelfView ? SELF_PAYSLIP_PAGE_SIZE : undefined,
      });
      if (response.success) {
        const rows = (response.data || []) as PayrollRecord[];
        if (isSelfView && append) {
          setPayrollRecords((prev) => [...prev, ...rows]);
        } else {
          setPayrollRecords(rows);
        }
        if (isSelfView) {
          setSelfHasMore(Boolean(response.hasMore));
          setSelfTotal(response.total ?? rows.length);
          setSelfPage(page);
        }
      }
    } catch (error: any) {
      console.error('Error fetching payroll records:', error);
      toast.error(error.message || 'Failed to fetch payroll records');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMoreSelf = () => {
    if (!selfHasMore || loadingMore) return;
    fetchPayrollRecords({ page: selfPage + 1, append: true });
  };

  const handleReleaseFiltered = async () => {
    if (!selectedMonth) {
      toast.error('Select a pay period before releasing payslips');
      return;
    }

    const releaseSummary = summarizePayslipRelease(filteredRecords);
    const toRelease = filteredRecords.filter((r) => canReleasePayslipRecord(r));

    if (toRelease.length === 0) {
      toast.warning(formatPayslipReleaseMessage(releaseSummary), { autoClose: 6000 });
      return;
    }

    const divisionId = showDivisionFilter && listFilterDivisions.length === 1
      ? listFilterDivisions[0]
      : undefined;
    const departmentId = listFilterDepartments.length === 1 ? listFilterDepartments[0] : undefined;

    try {
      setReleasing(true);
      const response = await api.releasePayslips({
        month: selectedMonth,
        divisionId,
        departmentId,
        recordIds: filteredRecords.map((r) => r._id),
      });
      if (response.success) {
        const newlyReleased = response.stats?.newlyReleased ?? response.modifiedCount ?? response.count ?? 0;
        const msg = response.message
          || formatPayslipReleaseMessage(response.stats ?? releaseSummary, newlyReleased);
        if (newlyReleased > 0) {
          toast.success(msg, { autoClose: 6000 });
        } else {
          toast.warning(msg, { autoClose: 6000 });
        }
        await fetchPayrollRecords();
      } else {
        toast.error(response.message || 'Failed to release payslips');
      }
    } catch (error: any) {
      console.error('Error releasing payslips:', error);
      toast.error(error.message || 'Failed to release payslips');
    } finally {
      setReleasing(false);
    }
  };

  const applyFilters = () => {
    const filtered = payrollRecords.filter((record) => (
      payslipMatchesSearch(record, searchQuery)
      && payslipMatchesListOrgAndStatus(
        record,
        divisions,
        departments,
        showDivisionFilter ? listFilterDivisions : [],
        listFilterDepartments,
        listFilterDesignations,
        listFilterStatuses,
      )
    ));

    setFilteredRecords(filtered);
    setCurrentPage(1);
  };

  const getDeptName = (id: any) => {
    if (!id) return 'N/A';
    if (typeof id === 'object' && id.name) return id.name;
    return departments.find(d => d._id === id)?.name || (typeof id === 'string' ? id : 'N/A');
  };

  const getDesigName = (id: any) => {
    if (!id) return 'N/A';
    if (typeof id === 'object' && id.name) return id.name;
    return designations.find(d => d._id === id)?.name || (typeof id === 'string' ? id : 'N/A');
  };

  const drawPayslipOnDoc = async (doc: jsPDF, record: PayrollRecord) => {
    const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
    if (!employee) return false;

    const sections = resolvePayslipSections(record, payrollOutputColumns);
    if (!sections.hasConfiguredSections) return false;

    const loans = resolvePayslipLoans(record);
    const profile = companyProfile ?? (await fetchCompanyProfile());
    await drawDynamicPayslipPdf(doc, {
      payroll: record,
      employee: {
        employee_name: employee.employee_name,
        emp_no: record.emp_no || employee.emp_no,
        designation_id: getDesigName(employee.designation_id),
        department_id: getDeptName(employee.department_id),
        bank_account_no: employee.bank_account_no,
        location: employee.location,
      },
      sections,
      loans,
      profile,
    });
    return true;
  };

  const generatePayslipPDF = async (record: PayrollRecord) => {
    setGeneratingPDF(true);
    toast.info('Generating payslip PDF...', { autoClose: 1000 });
    try {
      const doc = new jsPDF();
      const success = await drawPayslipOnDoc(doc, record);
      if (success) {
        doc.save(`Payslip_${record.emp_no}_${record.month}.pdf`);
        toast.success('Payslip PDF generated successfully!');
      } else {
        toast.error('Configure payslip sections in Payroll Configuration or employee data missing');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate payslip PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const generateBulkPayslipsPDF = async () => {
    if (selectedRecords.size === 0) {
      toast.warning('Please select at least one payslip to export');
      return;
    }

    setGeneratingBulkPDF(true);
    toast.info(`Generating ${selectedRecords.size} payslip(s)...`, { autoClose: 2000 });
    try {
      const recordsToExport = filteredRecords.filter(r => selectedRecords.has(r._id));
      const doc = new jsPDF();
      let addedPages = 0;

      for (let i = 0; i < recordsToExport.length; i++) {
        const record = recordsToExport[i];
        if (addedPages > 0) doc.addPage();

        const success = await drawPayslipOnDoc(doc, record);
        if (success) {
          addedPages++;
        }
      }

      if (addedPages > 0) {
        doc.save(`Bulk_Payslips_${selectedMonth}.pdf`);
        toast.success(`${addedPages} payslips exported successfully!`);
        setSelectedRecords(new Set());
      } else {
        toast.error('No valid payslips found to export');
      }
    } catch (error) {
      console.error('Error generating bulk PDF:', error);
      toast.error('Failed to generate bulk payslips');
    } finally {
      setGeneratingBulkPDF(false);
    }
  };

  const toggleSelectRecord = (recordId: string) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map(r => r._id)));
    }
  };

  // Pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = isSelfView
    ? filteredRecords
    : filteredRecords.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);

  const listDepartmentOptions = useMemo(() => {
    if (!showDivisionFilter || listFilterDivisions.length === 0) return departments;
    const allowed = new Set<string>();
    for (const divId of listFilterDivisions) {
      const div = divisions.find((d) => String(d._id) === String(divId));
      const deptIds = ((div?.departments ?? []) as unknown[]).map((d) => (typeof d === 'string' ? d : (d as { _id?: string })?._id));
      if (deptIds.length) {
        deptIds.forEach((id) => { if (id) allowed.add(String(id)); });
      } else {
        departments
          .filter((d: Department & { division_id?: string; division?: string }) => String(d.division_id || d.division) === String(divId))
          .forEach((d) => allowed.add(String(d._id)));
      }
    }
    if (allowed.size === 0) return departments;
    return departments.filter((d) => allowed.has(String(d._id)));
  }, [showDivisionFilter, listFilterDivisions, divisions, departments]);

  const tableColSpan = isSelfView ? 6 : canRelease ? 10 : 9;

  const releaseSummary = useMemo(
    () => summarizePayslipRelease(filteredRecords),
    [filteredRecords],
  );

  const payslipStats = useMemo(() => ({
    total: filteredRecords.length,
    selected: selectedRecords.size,
    processed: filteredRecords.filter((r) => r.status === 'processed').length,
    calculated: filteredRecords.filter((r) => r.status === 'calculated').length,
    pendingRelease: releaseSummary.pendingRelease,
    alreadyReleased: releaseSummary.alreadyReleased,
    batchNotReady: releaseSummary.batchNotReady,
    noBatch: releaseSummary.noBatch,
    notEligible: releaseSummary.notEligible,
  }), [filteredRecords, selectedRecords, releaseSummary]);

  const anyListFilterActive =
    searchQuery.trim() !== ''
    || listFilterDivisions.length > 0
    || listFilterDepartments.length > 0
    || listFilterDesignations.length > 0
    || listFilterStatuses.length > 0;

  const clearListFilters = () => {
    setSearchQuery('');
    setListFilterDivisions([]);
    setListFilterDepartments([]);
    setListFilterDesignations([]);
    setListFilterStatuses([]);
  };

  return (
    <LoansPageShell>
      <ToastContainer position="top-right" autoClose={3000} />

      <LoansPageHeader
        badge="Payroll payslips"
        title={isSelfView ? 'My payslips' : 'Employee payslips'}
        subtitle={
          isSelfView
            ? 'View your released payslips — newest first. Load more to see older months.'
            : 'View, search, and release payslips after the payment batch is frozen or completed'
        }
      />

      <LoansStatGrid
        stats={[
          { label: isSelfView ? 'Payslips loaded' : 'Payslips found', value: isSelfView ? payrollRecords.length : payslipStats.total, accent: true },
          ...(isSelfView
            ? [
                { label: 'Total available', value: selfTotal },
                { label: 'Showing', value: `${payrollRecords.length} of ${selfTotal || payrollRecords.length}` },
              ]
            : [
                { label: 'Selected', value: payslipStats.selected },
                { label: 'Ready to release', value: payslipStats.pendingRelease, accent: payslipStats.pendingRelease > 0 },
                { label: 'Awaiting batch', value: payslipStats.batchNotReady },
                { label: 'Already released', value: payslipStats.alreadyReleased },
              ]),
        ]}
      />

      <LoansToolbar>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <LoanFormLabel>{isSelfView ? 'Filter by month (optional)' : 'Pay period *'}</LoanFormLabel>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
              required={!isSelfView}
            />
          </div>

          {!isSelfView && (
            <button
              type="button"
              onClick={() => fetchPayrollRecords()}
              disabled={!selectedMonth || loading}
              className={`flex h-10 items-center gap-2 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Load payslips
            </button>
          )}

          {isSelfView && (
            <button
              type="button"
              onClick={() => {
                setSelfPage(1);
                fetchPayrollRecords({ page: 1, append: false });
              }}
              disabled={loading}
              className={`flex h-10 items-center gap-2 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          )}

          {!isSelfView && showDivisionFilter && (
            <MultiSelect
              variant="ledger"
              label="Division"
              options={divisions.map((d) => ({ id: String(d._id), name: d.name ?? 'Division' }))}
              selectedIds={listFilterDivisions}
              onChange={(vals) => {
                setListFilterDivisions(vals);
                setListFilterDepartments([]);
              }}
              placeholder="All divisions"
              className="w-full sm:w-40 md:w-44"
            />
          )}

          {!isSelfView && (
            <>
              <MultiSelect
                variant="ledger"
                label="Department"
                options={listDepartmentOptions.map((d) => ({
                  id: String(d._id),
                  name: d.name ?? 'Department',
                }))}
                selectedIds={listFilterDepartments}
                onChange={setListFilterDepartments}
                placeholder="All departments"
                className="w-full sm:w-40 md:w-44"
              />

              <MultiSelect
                variant="ledger"
                label="Designation"
                options={designations.map((d) => ({
                  id: String(d._id),
                  name: d.name ?? (d as Designation & { title?: string }).title ?? 'Designation',
                }))}
                selectedIds={listFilterDesignations}
                onChange={setListFilterDesignations}
                placeholder="All designations"
                className="w-full sm:w-40 md:w-44"
              />

              <MultiSelect
                variant="ledger"
                label="Status"
                options={PAYSLIP_LIST_STATUS_OPTIONS}
                selectedIds={listFilterStatuses}
                onChange={setListFilterStatuses}
                placeholder="All statuses"
                className="w-full sm:w-48 md:w-56"
              />

              <div className="flex w-full flex-col gap-1.5 sm:w-44 md:w-52">
                <LoanFormLabel>Search</LoanFormLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Emp ID or name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`h-10 pl-9 pr-3 ${loansFormInputClass()}`}
                    style={loansFormInputStyle()}
                  />
                </div>
              </div>

              {anyListFilterActive && (
                <button
                  type="button"
                  onClick={clearListFilters}
                  className="h-10 rounded-md border px-3 text-xs font-semibold uppercase tracking-wider transition hover:opacity-80"
                  style={{ borderColor: 'var(--ps-accent-border)', color: 'var(--ps-accent)' }}
                >
                  Clear filters
                </button>
              )}
            </>
          )}

          {canRelease && (
            <button
              type="button"
              onClick={handleReleaseFiltered}
              disabled={!selectedMonth || releasing || loading}
              className={`flex h-10 items-center gap-2 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
              title={
                releaseSummary.pendingRelease > 0
                  ? `Release ${releaseSummary.pendingRelease} payslip(s) whose payment batch is frozen or completed.`
                  : formatPayslipReleaseMessage(releaseSummary)
              }
            >
              {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Release ({releaseSummary.pendingRelease} ready)
            </button>
          )}

          {!isSelfView && (
            <button
              type="button"
              onClick={generateBulkPayslipsPDF}
              disabled={selectedRecords.size === 0 || generatingBulkPDF}
              className={`ml-auto flex h-10 items-center gap-2 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
            >
              {generatingBulkPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export PDF ({selectedRecords.size})
            </button>
          )}
        </div>
      </LoansToolbar>

      {(filteredRecords.length > 0 || isSelfView) && !isSelfView && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border bg-white px-5 py-3 text-sm dark:bg-stone-950" style={{ borderColor: 'var(--ps-accent-border)' }}>
          <span className="text-stone-600 dark:text-stone-400">
            <FileText className="mr-2 inline h-4 w-4" style={{ color: 'var(--ps-accent)' }} />
            {filteredRecords.length} payslip(s) · {selectedRecords.size} selected
            {canRelease && (
              <span className="ml-3 text-xs text-stone-500">
                · {releaseSummary.pendingRelease} ready to release
                · {releaseSummary.batchNotReady} awaiting batch freeze/complete
                · {releaseSummary.alreadyReleased} already released
                {releaseSummary.noBatch > 0 ? ` · ${releaseSummary.noBatch} no batch` : ''}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Page {currentPage} of {totalPages || 1}
          </span>
        </div>
      )}

      <LoansContentPanel>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                {!isSelfView && (
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRecords.size === currentRecords.length && currentRecords.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer"
                      style={{ accentColor: 'var(--ps-accent)' }}
                    />
                  </th>
                )}
                {!isSelfView && <th className="px-4 py-3 font-semibold">Employee</th>}
                {!isSelfView && <th className="px-4 py-3 font-semibold">Dept / designation</th>}
                <th className="px-4 py-3 font-semibold">Month</th>
                <th className="px-4 py-3 text-right font-semibold">Earnings</th>
                <th className="px-4 py-3 text-right font-semibold">Deductions</th>
                <th className="px-4 py-3 text-right font-semibold">Net salary</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                {canRelease && <th className="px-4 py-3 text-center font-semibold">Employee view</th>}
                <th className={`px-4 py-3 ${ledgerTableActionsHeaderClass('right')}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-16 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : currentRecords.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-16 text-center text-stone-500">
                    <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    {isSelfView
                      ? 'No released payslips available yet. Payslips appear here after the payment batch is frozen/completed and HR releases them.'
                      : selectedMonth
                        ? 'No payslips match your filters.'
                        : 'Select a pay period to begin.'}
                  </td>
                </tr>
              ) : (
                currentRecords.map((record) => {
                  const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
                  const sections = buildPayslipSections(payrollOutputColumns, record);
                  return (
                    <tr
                      key={record._id}
                      onClick={() => router.push(`${basePath}/${record._id}`)}
                      className="cursor-pointer border-b transition-colors hover:bg-stone-50 dark:hover:bg-stone-900/40"
                      style={{ borderColor: 'var(--ps-accent-border)' }}
                    >
                      {!isSelfView && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(record._id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectRecord(record._id);
                            }}
                            className="h-4 w-4 cursor-pointer"
                            style={{ accentColor: 'var(--ps-accent)' }}
                          />
                        </td>
                      )}
                      {!isSelfView && (
                        <td className="px-4 py-3">
                          <PayslipEmployeeBlock
                            employee={employee}
                            empNo={record.emp_no}
                            departments={departments}
                            designations={designations}
                          />
                        </td>
                      )}
                      {!isSelfView && (
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-stone-800 dark:text-stone-200">
                              {getDeptName(employee?.department_id)}
                            </span>
                            <span className="text-xs text-stone-500">{getDesigName(employee?.designation_id)}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-stone-700 dark:text-stone-300">
                        {record.monthName} {record.year}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {sections.hasConfiguredSections ? (
                          <span className={`text-sm font-semibold ${ledgerMoneyClass()}`}>
                            ₹{(sections.totalEarnings ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {sections.hasConfiguredSections ? (
                          <span className={`text-sm font-semibold ${ledgerMoneyClass(true)}`}>
                            ₹{(sections.totalDeductions ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {sections.hasConfiguredSections ? (
                          <span className={`text-sm font-bold ${ledgerMoneyClass()}`}>
                            ₹{(sections.netPayable ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={ledgerStatusBadgeClass(payslipLedgerStatus(record.status))}>
                          {record.status}
                        </span>
                      </td>
                      {canRelease && (
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const view = getPayslipEmployeeViewLabel(record);
                            const toneClass =
                              view.tone === 'released'
                                ? ledgerStatusBadgeClass('approved')
                                : view.tone === 'pending'
                                  ? ledgerStatusBadgeClass('pending')
                                  : view.tone === 'waiting'
                                    ? ledgerStatusBadgeClass('neutral')
                                    : 'text-xs text-stone-400';
                            return (
                              <span
                                className={view.tone === 'neutral' ? toneClass : toneClass}
                                title={
                                  view.tone === 'waiting'
                                    ? 'Payment batch must be frozen or completed before employees can see this payslip'
                                    : undefined
                                }
                              >
                                {view.label}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      <td className={`px-4 py-3 ${ledgerTableActionsCellClass('right')}`}>
                        <div className={ledgerTableActionsGroupClass('right')}>
                          <Link
                            href={`${basePath}/${record._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className={ledgerActionButtonClass('sky', 'outline')}
                            title="View details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              generatePayslipPDF(record);
                            }}
                            disabled={generatingPDF}
                            className={ledgerActionButtonClass('emerald', 'outline')}
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {isSelfView && selfHasMore && (
          <div className="flex justify-center border-t px-4 py-4" style={{ borderColor: 'var(--ps-accent-border)' }}>
            <button
              type="button"
              onClick={handleLoadMoreSelf}
              disabled={loadingMore}
              className={`flex h-10 items-center gap-2 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more payslips
            </button>
          </div>
        )}

        {!isSelfView && totalPages > 1 && (
          <div
            className="flex items-center justify-between border-t px-4 py-3"
            style={{ borderColor: 'var(--ps-accent-border)' }}
          >
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={loansDialogOutlineButtonClass()}
              style={loansDialogOutlineButtonStyle()}
            >
              Previous
            </button>
            <div className="flex gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i + 1}
                  type="button"
                  onClick={() => setCurrentPage(i + 1)}
                  className={`min-w-[36px] px-2 py-1.5 text-sm font-medium ${
                    currentPage === i + 1 ? loansPrimaryButtonClass() : loansDialogOutlineButtonClass()
                  }`}
                  style={currentPage === i + 1 ? loansPrimaryButtonStyle() : loansDialogOutlineButtonStyle()}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={loansDialogOutlineButtonClass()}
              style={loansDialogOutlineButtonStyle()}
            >
              Next
            </button>
          </div>
        )}
      </LoansContentPanel>
    </LoansPageShell>
  );
}

export default function PayslipsPage() {
  return <PayslipsContent />;
}



