'use client';

import { useState, useEffect, useCallback, type MouseEvent, type ReactNode, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { parseFile } from '@/lib/bulkUpload';
import { resolveEmployeeListDisplayParts } from '@/lib/employeeListDisplay';

function PayRegisterEmployeeBlock({
  source,
  lookups,
}: {
  source: {
    employee_name?: string;
    emp_no?: string;
    designation?: string;
    department?: string;
    division?: string;
    employeeId?: Employee | null;
  };
  lookups?: { divisions?: Division[]; departments?: { _id?: string; name?: string }[] };
}) {
  const d = resolveEmployeeListDisplayParts(
    {
      employeeId: source.employeeId as any,
      employee_name: source.employee_name,
      emp_no: source.emp_no,
      designation: source.designation,
      department: source.department,
      division_id: source.division,
    },
    lookups,
  );
  const initial = (d.name.charAt(0) || 'E').toUpperCase();
  return (
    <div className="flex min-w-0 items-start gap-2" title={d.tooltip}>
      {d.profilePhoto ? (
        <img src={d.profilePhoto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-[10px] font-semibold text-white">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold text-slate-900 dark:text-white">{d.name}</div>
        {d.empDesigLine ? <div className="mt-0.5 truncate text-[9px] text-slate-600 dark:text-slate-400">{d.empDesigLine}</div> : null}
        {d.deptDivLine ? <div className="mt-0.5 truncate text-[9px] text-slate-500 dark:text-slate-400">{d.deptDivLine}</div> : null}
      </div>
    </div>
  );
}
import { api, apiRequest, Employee, Division, EmployeeGroup } from '@/lib/api';
import { sortByEmpNo } from '@/lib/employeeSort';
import { usePayRegisterDeepLink } from '@/hooks/usePayRegisterDeepLink';
import ArrearsPayrollSection from '@/components/Arrears/ArrearsPayrollSection';
import DeductionsPayrollSection from '@/components/ManualDeductions/DeductionsPayrollSection';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { ledgerActionButtonClass } from '@/lib/ledgerUi';
import { formatHighlightContribution, highlightBadgeSubtitle } from '@/lib/attendanceHighlight';
import {
  type PayRegisterContribKey,
  type PayRegisterLeaveTypeBreakdownRow,
  resolvePayRegisterContribMap,
  payRegisterContribSelectionActive,
  payRegisterBadgeCategory,
  payRegisterContribAccent,
  getLeaveTypeBreakdownRowsFromPayRegister,
  formatLeaveTypeBreakdownPreview,
} from '@/lib/payRegisterContributingHighlight';
import {
  leaveNatureDisplayLabel,
  mergeEditDataLeaveNatureFromTypes,
  resolveLeaveNatureFromLeaveTypeCode,
} from '@/lib/payRegisterLeaveNature';
import { paidLopSublabel } from '@/lib/payRegisterAllSummaryRow';
import { departmentsForDivisionFilter } from '@/lib/manualDeductionListUi';
import { MultiSelect } from '@/components/MultiSelect';
import {
  initialShiftSelectionsFromRecord,
  payRegisterDayShowsShiftPicker,
  type PayRegisterShiftSelection,
} from '@/lib/payRegisterShifts';
import PayRegisterShiftField from '@/components/pay-register/PayRegisterShiftField';
import PayRegisterSyncProgressOverlay, {
  type PayRegisterSyncProgressEvent,
} from '@/components/pay-register/PayRegisterSyncProgressOverlay';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansTabBar,
  LoansContentPanel,
  LoansSectionTitle,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDialogFooter,
  LoanFormLabel,
  LoanFormInfo,
  LoanDetailSection,
  LoanDetailSectionTitle,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansFormTextareaClass,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';

export type PayRegisterContentProps = {
  paymentsBasePath: string;
  payrollTransactionsBasePath: string;
  showDivisionFilter?: boolean;
  autoSelectSingleDivision?: boolean;
};

interface DailyRecord {
  date: string;
  firstHalf: {
    status: 'present' | 'absent' | 'leave' | 'od' | 'holiday' | 'week_off' | 'blank';
    leaveType: string | null;
    leaveNature: 'paid' | 'lop' | 'without_pay' | null;
    isOD: boolean;
    otHours: number;
    shiftId: string | null;
    remarks: string | null;
  };
  secondHalf: {
    status: 'present' | 'absent' | 'leave' | 'od' | 'holiday' | 'week_off' | 'blank';
    leaveType: string | null;
    leaveNature: 'paid' | 'lop' | 'without_pay' | null;
    isOD: boolean;
    otHours: number;
    shiftId: string | null;
    remarks: string | null;
  };
  status: 'present' | 'absent' | 'leave' | 'od' | 'holiday' | 'week_off' | 'blank' | 'partial' | null;
  leaveType: string | null;
  leaveNature: 'paid' | 'lop' | 'without_pay' | null;
  isOD: boolean;
  isSplit: boolean;
  shiftId: string | null;
  shiftIds?: string[];
  shiftSelections?: PayRegisterShiftSelection[];
  shiftName: string | null;
  payableShifts?: number;
  otHours: number;
  remarks: string | null;
  isManuallyEdited?: boolean;
  isLate?: boolean;
  isEarlyOut?: boolean;
}

interface PayRegisterSummary {
  _id: string;
  employeeId: Employee | string;
  emp_no: string;
  month: string;
  monthName: string;
  year: number;
  monthNumber: number;
  totalDaysInMonth: number;
  dailyRecords: DailyRecord[];
  contributingDates?: Partial<Record<PayRegisterContribKey, Array<string | { date: string; value?: number; label?: string }>>>;
  contributingDatesUpdatedAt?: string | null;
  contributingDatesDerivedFrom?: 'monthly_summary' | 'daily_grid' | null;
  totals: {
    presentDays: number;
    presentHalfDays: number;
    totalPresentDays: number;
    absentDays: number;
    absentHalfDays: number;
    totalAbsentDays: number;
    paidLeaveDays: number;
    paidLeaveHalfDays: number;
    totalPaidLeaveDays: number;
    unpaidLeaveDays: number;
    unpaidLeaveHalfDays: number;
    totalUnpaidLeaveDays: number;
    lopDays: number;
    lopHalfDays: number;
    totalLopDays: number;
    totalLeaveDays: number;
    odDays: number;
    odHalfDays: number;
    totalODDays: number;
    totalOTHours: number;
    totalPayableShifts: number;
    totalWeeklyOffs?: number;
    totalHolidays?: number;
    lateCount?: number;
    earlyOutCount?: number;
    leaveTypeBreakdown?: Array<{ leaveType?: string; kind?: string; days?: number }>;
  };
  status: 'draft' | 'in_review' | 'finalized';
  lastAutoSyncedAt: string | null;
  lastEditedAt: string | null;
  payrollId?: string;
  startDate?: string;
  endDate?: string;
  isStub?: boolean;
  summaryLocked?: boolean;
  summaryLockedAt?: string | null;
  totalAttendanceDeductionDays?: number;
  totalPermissionCount?: number;
  totalPermissionDeductionDays?: number;
  attendanceDeductionBreakdown?: {
    daysDeducted?: number;
    lateEarlyDaysDeducted?: number;
    absentExtraDays?: number;
    absentDays?: number;
    lateInsCount?: number;
    earlyOutsCount?: number;
  } | null;
  attendanceDeductionCalculatedAt?: string | null;
}

interface Shift {
  _id: string;
  name: string;
  payableShifts: number;
}

type TableType = 'all' | 'present' | 'absent' | 'leaves' | 'od' | 'ot' | 'extraHours' | 'shifts';

function sortPayRegistersByEmpNo(list: PayRegisterSummary[]) {
  return sortByEmpNo(list, (pr) => {
    const emp = pr.employeeId;
    if (typeof emp === 'object' && emp && 'emp_no' in emp) {
      return (emp as Employee).emp_no;
    }
    return pr.emp_no;
  });
}

export function PayRegisterContent({
  paymentsBasePath,
  payrollTransactionsBasePath,
  showDivisionFilter = true,
  autoSelectSingleDivision = false,
}: PayRegisterContentProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [payRegisters, setPayRegisters] = useState<PayRegisterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<PayRegisterSyncProgressEvent | null>(null);
  const [showSyncAllModal, setShowSyncAllModal] = useState(false);
  const [syncOverrideLockedIds, setSyncOverrideLockedIds] = useState<Set<string>>(new Set());
  const [syncModalLockedRows, setSyncModalLockedRows] = useState<
    Array<{
      employeeId: string;
      employee_name: string;
      emp_no: string;
      division?: string;
      department?: string;
      designation?: string;
    }>
  >([]);
  const [loadingSyncLockedList, setLoadingSyncLockedList] = useState(false);
  const [savingSummaryLock, setSavingSummaryLock] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeTable, setActiveTable] = useState<TableType>('all');
  const [contribHighlight, setContribHighlight] = useState<{
    prId: string;
    keys: PayRegisterContribKey[];
    title: string;
  } | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [filterDivisions, setFilterDivisions] = useState<string[]>([]);
  const [filterDepartments, setFilterDepartments] = useState<string[]>([]);
  const selectedDivision = filterDivisions.length === 1 ? filterDivisions[0] : '';
  const selectedDepartment = filterDepartments.length === 1 ? filterDepartments[0] : '';
  const [selectedEmployeeGroup, setSelectedEmployeeGroup] = useState<string>('');
  const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
  const [customGroupingEnabled, setCustomGroupingEnabled] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [bulkCalculating, setBulkCalculating] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingModificationsExcel, setExportingModificationsExcel] = useState(false);
  const [exportingModificationsPdf, setExportingModificationsPdf] = useState(false);
  const [calculatingJobId, setCalculatingJobId] = useState<string | null>(null);
  const [calculationProgress, setCalculationProgress] = useState<any>(null);
  const payrollStrategy = 'dynamic' as const;

  const [attendanceDeductionInfo, setAttendanceDeductionInfo] = useState<{
    employeeName: string;
    total: number;
    lateEarlyDays: number;
    absentExtraDays: number;
  } | null>(null);

  const [leaveTypeBreakdownModal, setLeaveTypeBreakdownModal] = useState<{
    employeeName: string;
    totalFromTotals: number;
    rows: PayRegisterLeaveTypeBreakdownRow[];
  } | null>(null);

  // Permission Request State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [permissionReason, setPermissionReason] = useState('');

  // Bulk Summary Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingSummary, setUploadingSummary] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ success: number; failed: number; total: number; errors: string[] } | null>(null);

  // Department Batch Status State (Map of DeptID -> Batch Info)
  const [departmentBatchStatus, setDepartmentBatchStatus] = useState<Map<string, { status: string, permissionGranted: boolean, batchId: string }>>(new Map());
  const [consumedPermissionKeys, setConsumedPermissionKeys] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedArrears, setSelectedArrears] = useState<Array<{ id: string, amount: number, employeeId?: string }>>([]);
  const [selectedDeductions, setSelectedDeductions] = useState<Array<{ id: string, amount: number, employeeId?: string }>>([]);
  const [payrollStartDate, setPayrollStartDate] = useState<string | null>(null);
  const [payrollEndDate, setPayrollEndDate] = useState<string | null>(null);
  const [cycleStartDay, setCycleStartDay] = useState<number | null>(null);
  const [alignedToCycle, setAlignedToCycle] = useState(false);
  /** Text in the search box while typing (not sent to API until Enter). */
  const [searchQuery, setSearchQuery] = useState('');
  /** Last search applied to the API (Enter); used for sync, export, load more. */
  const [committedSearch, setCommittedSearch] = useState('');
  /** Collapse the wide monthly totals table so the day grids below stay in focus. */
  const [monthlySummaryExpanded, setMonthlySummaryExpanded] = useState(false);
  const [attendanceProcessingMode, setAttendanceProcessingMode] = useState<'single_shift' | 'multi_shift' | null>(null);
  const isMultiShiftMode = attendanceProcessingMode === 'multi_shift';
  const payRegisterTableScrollRef = useRef<HTMLDivElement | null>(null);

  usePayRegisterDeepLink({
    setCurrentDate,
    setFilterDepartments,
    setFilterDivisions,
  });

  const scrollPayRegisterTableHorizontally = (direction: 'left' | 'right') => {
    if (!payRegisterTableScrollRef.current) return;
    const amount = Math.max(280, Math.floor(payRegisterTableScrollRef.current.clientWidth * 0.6));
    payRegisterTableScrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    const loadAttendanceMode = async () => {
      try {
        const attendanceRes = await api.getAttendanceSettings();
        const mode = attendanceRes?.data?.processingMode?.mode;
        if (mode === 'single_shift' || mode === 'multi_shift') {
          setAttendanceProcessingMode(mode);
        }
      } catch {
        // Keep default null; permission columns remain hidden.
      }
    };
    loadAttendanceMode();
  }, []);

  useEffect(() => {
    let pollInterval: any;

    if (calculatingJobId) {
      pollInterval = setInterval(async () => {
        try {
          const status = await api.getJobStatus(calculatingJobId);
          if (status.success) {
            // Correctly map the progress object
            if (status.data.progress) {
              setCalculationProgress(status.data.progress);
            }

            // BullMQ state is returned as 'state', not 'status'
            if (status.data.state === 'completed') {
              clearInterval(pollInterval);
              setCalculatingJobId(null);
              setBulkCalculating(false);
              setCalculationProgress(null);
              Swal.fire({
                icon: 'success',
                title: 'Calculation Complete',
                text: 'Payroll calculation finished successfully.',
                timer: 3000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
              });
              loadPayRegisters();
            } else if (status.data.state === 'failed') {
              clearInterval(pollInterval);
              setCalculatingJobId(null);
              setBulkCalculating(false);
              setCalculationProgress(null);
              Swal.fire({
                icon: 'error',
                title: 'Calculation Failed',
                text: status.data.failedReason || 'The background job failed.',
              });
            }
          }
        } catch (err) {
          console.error('Error polling job status:', err);
        }
      }, 1500);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [calculatingJobId]);

  // Load payroll cycle start day, then align initial selectedMonth/Year
  useEffect(() => {
    api.getSetting('payroll_cycle_start_day')
      .then((res) => {
        if (res.success && res.data) {
          setCycleStartDay(Number(res.data.value) || 1);
        } else {
          setCycleStartDay(1);
        }
      })
      .catch(() => setCycleStartDay(1));
  }, []);

  useEffect(() => {
    if (alignedToCycle || cycleStartDay == null) return;
    const today = new Date();
    let effYear = today.getFullYear();
    let effMonth = today.getMonth() + 1;
    if (cycleStartDay > 1 && today.getDate() >= cycleStartDay) {
      // After cycle start: treat current payroll month as the one whose END is next calendar month
      if (effMonth === 12) {
        effMonth = 1;
        effYear += 1;
      } else {
        effMonth += 1;
      }
    }
    setSelectedYear(effYear);
    setSelectedMonth(effMonth);
    setAlignedToCycle(true);
  }, [cycleStartDay, alignedToCycle]);

  const normalizeHalfDay = (
    half?: Partial<DailyRecord['firstHalf']>,
    statusFallback: DailyRecord['status'] = 'absent'
  ): DailyRecord['firstHalf'] => {
    const allowedStatuses: DailyRecord['firstHalf']['status'][] = [
      'present',
      'absent',
      'leave',
      'od',
      'holiday',
      'week_off',
      'blank',
    ];
    const fallbackStatus = allowedStatuses.includes(statusFallback as any)
      ? (statusFallback as DailyRecord['firstHalf']['status'])
      : 'absent';
    const resolvedStatus = allowedStatuses.includes(half?.status as any)
      ? (half?.status as DailyRecord['firstHalf']['status'])
      : fallbackStatus;

    return {
      status: resolvedStatus || fallbackStatus,
      leaveType: half?.leaveType ?? null,
      leaveNature: half?.leaveNature ?? null,
      isOD: half?.isOD ?? false,
      otHours: half?.otHours ?? 0,
      shiftId: half?.shiftId ?? null,
      remarks: half?.remarks ?? null,
    };
  };

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{ employeeId: string; month: string; date: string; record: DailyRecord; employee: Employee } | null>(null);
  const [editData, setEditData] = useState<Partial<DailyRecord>>({});
  const [isHalfDayMode, setIsHalfDayMode] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [paginationTotalPages, setPaginationTotalPages] = useState(1);
  const PAGE_SIZE = 50;
  const [loadingMore, setLoadingMore] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const getPermissionKey = (deptId: string) => `${monthStr}:${deptId}`;
  const hasEffectivePermission = (
    deptId: string,
    batchInfo?: { status: string; permissionGranted: boolean; batchId: string } | null
  ) => !!batchInfo?.permissionGranted && !consumedPermissionKeys.has(getPermissionKey(deptId));

  // Use the configured range from the backend if available, otherwise compute calendar month
  const displayDays = payrollStartDate && payrollEndDate
    ? (() => {
      const start = new Date(payrollStartDate);
      const end = new Date(payrollEndDate);
      const dates = [];
      let curr = new Date(start);
      // Safety break to prevent infinite loop
      let count = 0;
      while (curr <= end && count < 40) {
        dates.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
        count++;
      }
      return dates;
    })()
    : Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      // Using UTC to avoid local timezone shifts during string conversion
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    });

  const daysArray = displayDays; // For compatibility with existing loop names

  const isPastMonth = new Date(year, month - 1, 1).getTime() < new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  useEffect(() => {
    loadShifts();
    loadDivisions();
    loadDepartments();
    loadLeaveTypes();
    loadEmployeeGroupsAndSetting();
  }, []);

  useEffect(() => {
    if (autoSelectSingleDivision && divisions.length === 1 && filterDivisions.length === 0) {
      setFilterDivisions([String(divisions[0]._id)]);
    }
  }, [autoSelectSingleDivision, divisions, filterDivisions.length]);

  useEffect(() => {
    if (!showEditModal || leaveTypes.length === 0) return;
    setEditData((prev) =>
      mergeEditDataLeaveNatureFromTypes(
        prev as Record<string, unknown>,
        leaveTypes,
        isHalfDayMode
      ) as Partial<DailyRecord>
    );
  }, [showEditModal, leaveTypes, isHalfDayMode]);

  const loadEmployeeGroupsAndSetting = async () => {
    try {
      const [groupRes, settingRes] = await Promise.all([
        api.getEmployeeGroups(true),
        api.getSetting('custom_employee_grouping_enabled'),
      ]);
      if (groupRes.success) setEmployeeGroups(groupRes.data || []);
      const enabled = !!(settingRes.success && settingRes.data && settingRes.data.value);
      setCustomGroupingEnabled(enabled);
      if (!enabled) setSelectedEmployeeGroup('');
    } catch (err) {
      console.error('Error loading employee groups/setting:', err);
      setCustomGroupingEnabled(false);
      setSelectedEmployeeGroup('');
    }
  };


  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions(); // Assuming getDivisions exists and returns all
      if (response.success) {
        setDivisions(response.data || []);
      }
    } catch (err) {
      console.error('Error loading divisions:', err);
    }
  };

  const loadLeaveTypes = async () => {
    try {
      const response = await api.getLeaveSettings('leave');
      if (response.success && response.data && response.data.types) {
        setLeaveTypes(response.data.types);
      }
    } catch (err) {
      console.error('Error loading leave types:', err);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setSearchQuery('');
    setCommittedSearch('');
    loadPayRegisters(1, false, '');
    checkBatchLocks();
  }, [year, month, filterDepartments, filterDivisions, selectedEmployeeGroup]);

  const buildPayRegisterApiFilters = useCallback(() => {
    const searchApplied = (committedSearch || '').trim();
    return {
      divisionIds: filterDivisions.length ? [...filterDivisions] : undefined,
      departmentIds: filterDepartments.length ? [...filterDepartments] : undefined,
      search: searchApplied || undefined,
      employeeGroupId:
        customGroupingEnabled && selectedEmployeeGroup.trim()
          ? selectedEmployeeGroup
          : undefined,
    };
  }, [
    filterDivisions,
    filterDepartments,
    committedSearch,
    customGroupingEnabled,
    selectedEmployeeGroup,
  ]);

  const checkBatchLocks = async () => {
    try {
      const response = await api.getPayrollBatches({
        month: monthStr,
        divisionId: filterDivisions.length === 1 ? filterDivisions[0] : undefined,
      });
      if (response && response.data) {
        const statusMap = new Map<string, { status: string, permissionGranted: boolean, batchId: string }>();
        // response.data is array of batches
        const batches = Array.isArray(response.data) ? response.data : [];
        batches.forEach((batch: any) => {
          const deptId = typeof batch.department === 'object' ? batch.department._id : batch.department;
          statusMap.set(deptId, {
            status: batch.status,
            permissionGranted: !!batch.recalculationPermission?.granted,
            batchId: batch._id
          });
        });
        setDepartmentBatchStatus(statusMap);
      }
    } catch (err) {
      console.error('Error checking batch locks:', err);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await api.getDepartments(true);
      if (response.success) {
        setDepartments(response.data || []);
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadShifts = async () => {
    try {
      const response = await api.getShifts();
      if (response.success && response.data) {
        setShifts(response.data.map((s: any) => ({ ...s, payableShifts: s.payableShifts || 0 })));
      }
    } catch (err) {
      console.error('Error loading shifts:', err);
    }
  };

  const loadPayRegisters = async (pageToLoad = 1, append = false, searchOverride?: string) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const listFilters = buildPayRegisterApiFilters();
      const q =
        searchOverride !== undefined
          ? String(searchOverride).trim()
          : listFilters.search;
      console.log('[Pay Register] Loading pay registers:', {
        monthStr,
        page: pageToLoad,
        divisionIds: listFilters.divisionIds,
        departmentIds: listFilters.departmentIds,
        search: q,
      });

      const rawResponse = await api.getEmployeesWithPayRegister(monthStr, {
        ...listFilters,
        search: q || undefined,
        page: pageToLoad,
        limit: PAGE_SIZE,
      });
      const response = rawResponse as any;

      if (response.success) {
        const payRegisterList = response.data || [];
        console.log('[Pay Register] Loaded page', pageToLoad, 'count:', payRegisterList.length);

        if (response.startDate) setPayrollStartDate(response.startDate);
        if (response.endDate) setPayrollEndDate(response.endDate);

        if (append) {
          setPayRegisters((prev) => sortPayRegistersByEmpNo([...prev, ...payRegisterList]));
        } else {
          setPayRegisters(sortPayRegistersByEmpNo(payRegisterList));
        }

        if (response.pagination) {
          setPaginationTotal(response.pagination.total ?? 0);
          setPaginationTotalPages(response.pagination.totalPages ?? 1);
          setHasMore(pageToLoad < response.pagination.totalPages);
        } else {
          setHasMore(payRegisterList.length === PAGE_SIZE);
        }

        if (payRegisterList.length === 0 && !append) {
          Swal.fire({
            icon: 'info',
            title: 'No Employees',
            text: 'No employees found for this selection',
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
        }
      } else {
        console.error('[Pay Register] API call failed:', response);
        if (!append) {
          setPayRegisters([]);
          setPaginationTotal(0);
          setPaginationTotalPages(1);
        }
        if (response.message) {
          Swal.fire({
            icon: 'error',
            title: 'API Error',
            text: response.message,
          });
        }
      }
    } catch (err: any) {
      console.error('[Pay Register] Error loading pay registers:', err);
      if (!append) {
        setPayRegisters([]);
        setPaginationTotal(0);
        setPaginationTotalPages(1);
      }
      Swal.fire({
        icon: 'error',
        title: 'Load Failed',
        text: err.message || 'Failed to load pay registers',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPayRegisters(nextPage, true);
  };

  const isPayRegisterStub = (pr: PayRegisterSummary) =>
    !!(pr as PayRegisterSummary & { isStub?: boolean }).isStub || String(pr._id || '').startsWith('stub_');

  const employeeIdString = (pr: PayRegisterSummary) => {
    const e = pr.employeeId;
    return typeof e === 'object' && e && '_id' in e ? String((e as { _id: string })._id) : String(e);
  };

  const employeeDisplayName = (pr: PayRegisterSummary) => {
    const e = pr.employeeId;
    if (typeof e === 'object' && e && 'employee_name' in e) {
      return String((e as Employee).employee_name || pr.emp_no || 'Employee');
    }
    return pr.emp_no || 'Employee';
  };

  const beginSyncAll = async () => {
    try {
      setLoadingSyncLockedList(true);
      const res = await api.getPayRegisterLockedEmployees(monthStr, buildPayRegisterApiFilters());
      const lockedRows =
        res.success && Array.isArray(res.data) ? res.data : [];
      setSyncModalLockedRows(lockedRows);
      if (lockedRows.length === 0) {
        setShowSyncAllModal(false);
        await runSyncAllWithOverrides(new Set(), []);
        return;
      }
      setSyncOverrideLockedIds(new Set());
      setShowSyncAllModal(true);
    } catch (err: any) {
      console.error('[Pay Register] Failed to load locked summaries:', err);
      Swal.fire({
        icon: 'error',
        title: 'Could not load locked list',
        text: err.message || 'Failed to fetch locked summaries for sync.',
      });
    } finally {
      setLoadingSyncLockedList(false);
    }
  };

  const runSyncAllWithOverrides = async (
    overrideLockedIds: Set<string>,
    lockedRowsList: Array<{
      employeeId: string;
      employee_name: string;
      emp_no: string;
      division?: string;
      department?: string;
      designation?: string;
    }> = []
  ) => {
    try {
      setSyncing(true);
      setShowSyncAllModal(false);
      setSyncProgress({ phase: 'prepare', completed: 0, total: 0 });

      const syncFilters = buildPayRegisterApiFilters();
      const bulkRes = await api.bulkSyncPayRegisterWithProgress(
        monthStr,
        {
          ...syncFilters,
          forceEmployeeIds: [...overrideLockedIds],
          concurrency: 20,
        },
        (event) => {
          flushSync(() => {
            setSyncProgress(event);
          });
        }
      );

      if (!bulkRes?.success || !bulkRes.data) {
        throw new Error(bulkRes?.message || 'Bulk sync failed');
      }

      type BulkSyncStats = {
        synced?: number;
        skippedLocked?: number;
        skippedPayrollCompleted?: number;
        failed?: Array<{ employeeId: string; error: string }>;
        durationMs?: number;
        total?: number;
      };
      const bulkData = bulkRes.data as BulkSyncStats;
      const synced = bulkData.synced ?? 0;
      const skippedLocked = bulkData.skippedLocked ?? 0;
      const skippedPayrollCompleted = bulkData.skippedPayrollCompleted ?? 0;
      const failed = bulkData.failed ?? [];
      const durationMs = bulkData.durationMs ?? 0;
      const total = bulkData.total ?? 0;

      const failedSyncs = failed.map((f: { employeeId: string; error: string }) => ({
        employee_name: f.employeeId,
        emp_no: f.employeeId,
        reason: f.error,
      }));
      const skippedPayrollCompletedList: Array<{ employee_name: string; emp_no: string }> = [];
      if (skippedPayrollCompleted > 0) {
        skippedPayrollCompletedList.push({
          employee_name: `${skippedPayrollCompleted} employee(s)`,
          emp_no: 'payroll completed',
        });
      }

      const escapeHtml = (value: string) =>
        String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      setPage(1);
      await loadPayRegisters(1, false);

      const skippedLockedCount = skippedLocked;

      const parts = [
        `${synced} of ${total} employee(s) synced in ${(durationMs / 1000).toFixed(1)}s.`,
      ];
      if (skippedPayrollCompleted > 0) {
        parts.push(
          `${skippedPayrollCompleted} skipped because payroll batch is already completed.`
        );
      }
      if (skippedLockedCount > 0) parts.push(`${skippedLockedCount} locked summary(ies) left unchanged.`);
      if (failedSyncs.length > 0) parts.push(`${failedSyncs.length} employee(s) failed to sync.`);
      const skippedListHtml =
        skippedPayrollCompleted > 0
          ? `<div class="mt-3 text-left"><div class="font-semibold mb-1">Not synced because payroll batch is completed</div><div class="text-sm">${skippedPayrollCompletedList
              .slice(0, 8)
              .map((item: { employee_name: string; emp_no: string }) => `${escapeHtml(item.employee_name)} (${escapeHtml(item.emp_no)})`)
              .join('<br>')}${skippedPayrollCompleted > 8 ? `<br>and ${skippedPayrollCompleted - 8} more...` : ''}</div></div>`
          : '';
      const failedListHtml =
        failedSyncs.length > 0
          ? `<div class="mt-3 text-left"><div class="font-semibold mb-1">Failed to sync</div><div class="text-sm">${failedSyncs
              .slice(0, 5)
              .map(
                (item) =>
                  `${escapeHtml(item.employee_name)} (${escapeHtml(item.emp_no)}): ${escapeHtml(item.reason)}`
              )
              .join('<br>')}${failedSyncs.length > 5 ? `<br>and ${failedSyncs.length - 5} more...` : ''}</div></div>`
          : '';
      Swal.fire({
        icon: failedSyncs.length > 0 ? 'warning' : 'success',
        title: failedSyncs.length > 0 || skippedPayrollCompleted > 0 ? 'Sync completed with notes' : 'Synced',
        html: `<div>${escapeHtml(parts.join(' '))}</div>${skippedListHtml}${failedListHtml}`,
        confirmButtonText: 'OK',
      });
    } catch (err: any) {
      console.error('Error syncing pay registers:', err);
      Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        text: err.message || 'Failed to sync pay registers',
      });
    } finally {
      setSyncProgress(null);
      setSyncing(false);
    }
  };

  const handleSaveSummaryLock = async (locked: boolean) => {
    const ids = getFilteredPayRegisters()
      .filter((pr) => !isPayRegisterStub(pr))
      .map((pr) => employeeIdString(pr));
    if (ids.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Nothing to update',
        text: 'No pay register rows on this page yet. Sync or create registers first, then save lock.',
      });
      return;
    }
    try {
      setSavingSummaryLock(true);
      const res = await api.setPayRegisterSummaryLock(monthStr, { employeeIds: ids, locked });
      if (!res.success) {
        throw new Error(res.message || 'Request failed');
      }
      await loadPayRegisters();
      Swal.fire({
        icon: 'success',
        title: locked ? 'Summaries locked' : 'Summaries unlocked',
        text: `Updated ${res.data?.modifiedCount ?? 0} record(s).`,
        timer: 2200,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Save failed',
        text: err.message || 'Could not update summary lock',
      });
    } finally {
      setSavingSummaryLock(false);
    }
  };

  const handleDownloadSummary = async () => {
    try {
      setLoading(true);
      const params = {
        month: monthStr,
        ...buildPayRegisterApiFilters(),
      };
      const blob = await api.exportPayRegisterSummary(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pay_Register_Summary_${monthStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      Swal.fire({
        icon: 'success',
        title: 'Success',
        text: 'Summary exported successfully',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch (err: any) {
      console.error('Error exporting summary:', err);
      Swal.fire({
        icon: 'error',
        title: 'Export Failed',
        text: err.message || 'Failed to export summary',
      });
    } finally {
      setLoading(false);
    }
  };

  const getPayRegisterExportFilters = () => ({
    month: monthStr,
    ...buildPayRegisterApiFilters(),
  });

  const handleDownloadModificationsExcel = async () => {
    try {
      setExportingModificationsExcel(true);
      const params = getPayRegisterExportFilters();
      const blob = await api.exportPayRegisterModifications(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PayRegister_Modifications_${monthStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      Swal.fire({
        icon: 'success',
        title: 'Success',
        text: 'Modifications report exported to Excel',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to export modifications report';
      Swal.fire({ icon: 'error', title: 'Export Failed', text: message });
    } finally {
      setExportingModificationsExcel(false);
    }
  };

  const handleDownloadModificationsPdf = async () => {
    try {
      setExportingModificationsPdf(true);
      const params = getPayRegisterExportFilters();
      const blob = await api.exportPayRegisterModificationsPDF(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PayRegister_Modifications_${monthStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      Swal.fire({
        icon: 'success',
        title: 'Success',
        text: 'Modifications report exported to PDF',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to export modifications PDF';
      Swal.fire({ icon: 'error', title: 'Export Failed', text: message });
    } finally {
      setExportingModificationsPdf(false);
    }
  };

  const handleDownloadSummaryPdf = async () => {
    try {
      setExportingPdf(true);
      const params = getPayRegisterExportFilters();
      const blob = await api.exportPayRegisterSummaryPDF(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pay_Register_Summary_${monthStr}${params.departmentIds?.length ? `_${params.departmentIds.join(',')}` : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      Swal.fire({
        icon: 'success',
        title: 'Success',
        text: 'PDF exported successfully',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
      });
    } catch (err: unknown) {
      console.error('Error exporting summary PDF:', err);
      const message = err instanceof Error ? err.message : 'Failed to export summary PDF';
      Swal.fire({
        icon: 'error',
        title: 'Export Failed',
        text: message,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleUploadSummaryFile = async (file: File) => {
    try {
      setUploadingSummary(true);

      const result = await parseFile(file);
      if (!result.success) {
        Swal.fire({
          icon: 'error',
          title: 'Parse Error',
          text: result.errors.join(', ') || 'Failed to parse Excel file',
        });
        return;
      }

      const rawResponse = await api.uploadPayRegisterSummary(monthStr, result.data);
      const response = rawResponse as any;
      if (response.success) {
        setUploadResults(response.data);
        await loadPayRegisters();
        Swal.fire({
          icon: 'success',
          title: 'Upload Complete',
          text: `Successfully processed summary data.`,
        });
        setShowUploadModal(false);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Upload Failed',
          text: response.message || 'Failed to upload summary',
        });
      }
    } catch (err: any) {
      console.error('Error uploading summary:', err);
      Swal.fire({
        icon: 'error',
        title: 'Upload Error',
        text: err.message || 'An error occurred during upload',
      });
    } finally {
      setUploadingSummary(false);
    }
  };

  const handleSaveDate = async () => {
    if (!editingRecord) return;

    try {
      setSaving({ ...saving, [editingRecord.employeeId]: true });

      // First, ensure pay register exists - create if it doesn't
      try {
        await api.getPayRegister(editingRecord.employeeId, monthStr);
      } catch (err: any) {
        // If pay register doesn't exist, create it
        console.log('[Pay Register] Creating pay register for employee:', editingRecord.employeeId);
        await api.createPayRegister(editingRecord.employeeId, monthStr);
      }

      // Prepare update data with isSplit flag; leave nature always follows leave type from settings
      const updatePayload = mergeEditDataLeaveNatureFromTypes(
        {
          ...editData,
          isSplit: isHalfDayMode,
        } as Record<string, unknown>,
        leaveTypes,
        isHalfDayMode
      ) as typeof editData & { isSplit: boolean };

      // Now update the daily record
      const response = await api.updateDailyRecord(
        editingRecord.employeeId,
        monthStr,
        editingRecord.date,
        updatePayload
      );
      if (response.success && response.data) {
        await loadPayRegisters();
        setShowEditModal(false);
        setEditingRecord(null);
        setIsHalfDayMode(false);
        Swal.fire({
          icon: 'success',
          title: 'Updated',
          text: 'Date updated successfully',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Update Failed',
          text: response.message || 'Failed to update date',
        });
      }
    } catch (err: any) {
      console.error('Error updating date:', err);
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: err.message || 'Failed to update date',
      });
    } finally {
      setSaving({ ...saving, [editingRecord.employeeId]: false });
    }
  };

  const handleDateClick = (employee: Employee, date: string, record: DailyRecord) => {
    const isSplit = record.isSplit || record.firstHalf.status !== record.secondHalf.status;
    setEditingRecord({ employeeId: typeof employee === 'object' ? employee._id : employee, month: monthStr, date, record, employee });
    setIsHalfDayMode(isSplit);
    const shiftSelections = initialShiftSelectionsFromRecord(record);
    const shiftIds = shiftSelections.map((s) => s.shiftId);
    setEditData(
      mergeEditDataLeaveNatureFromTypes(
        {
          firstHalf: {
            ...record.firstHalf,
            leaveType: record.firstHalf.leaveType || null,
            leaveNature: record.firstHalf.leaveNature || null,
          },
          secondHalf: {
            ...record.secondHalf,
            leaveType: record.secondHalf.leaveType || null,
            leaveNature: record.secondHalf.leaveNature || null,
          },
          status: record.status,
          leaveType: record.leaveType || null,
          leaveNature: record.leaveNature || null,
          isOD: record.isOD,
          isSplit: isSplit,
          shiftId: record.shiftId || shiftIds[0] || null,
          shiftIds,
          shiftSelections,
          shiftName: record.shiftName || null,
          payableShifts: record.payableShifts ?? undefined,
          otHours: record.otHours,
          remarks: record.remarks || null,
          isLate: record.isLate || false,
          isEarlyOut: record.isEarlyOut || false,
        } as Record<string, unknown>,
        leaveTypes,
        isSplit
      ) as Partial<DailyRecord>
    );
    setShowEditModal(true);
  };

  const getLeaveTotal = (totals: any) =>
    totals?.totalLeaveDays ??
    ((totals?.totalPaidLeaveDays || 0) +
      (totals?.totalUnpaidLeaveDays || 0) +
      (totals?.totalLopDays || 0));

  const getLateAndEarlyCount = (totals: any) =>
    (Number(totals?.lateCount) || 0) + (Number(totals?.earlyOutCount) || 0);

  const formatAttDeductionDays = (pr: PayRegisterSummary) => {
    const br = pr.attendanceDeductionBreakdown;
    const n = Number(pr.totalAttendanceDeductionDays ?? br?.daysDeducted ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toFixed(2).replace(/\.?0+$/, '') || '0';
  };

  const getAttendanceDeductionDaysNumber = (pr: PayRegisterSummary) => {
    const n = Number(pr.totalAttendanceDeductionDays ?? pr.attendanceDeductionBreakdown?.daysDeducted ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const getPayRegisterEmployeeDisplayName = (pr: PayRegisterSummary) =>
    typeof pr.employeeId === 'object' && pr.employeeId && 'employee_name' in pr.employeeId
      ? String((pr.employeeId as Employee).employee_name)
      : pr.emp_no || 'Employee';

  const openPayRegisterLeaveBreakdown = (pr: PayRegisterSummary) => {
    if (pr.isStub) return;
    const rows = getLeaveTypeBreakdownRowsFromPayRegister(pr);
    setLeaveTypeBreakdownModal({
      employeeName: getPayRegisterEmployeeDisplayName(pr),
      totalFromTotals: getLeaveTotal(pr.totals),
      rows,
    });
  };

  const openPayRegisterAttDeductionSplit = (e: MouseEvent<HTMLTableCellElement>, pr: PayRegisterSummary) => {
    e.stopPropagation();
    const breakdown = pr.attendanceDeductionBreakdown || {};
    const total = Number(pr.totalAttendanceDeductionDays ?? breakdown.daysDeducted ?? 0);
    const absentExtraDays = Number(breakdown.absentExtraDays ?? 0);
    const lateEarlyDays = Number(breakdown.lateEarlyDaysDeducted ?? 0);
    const employeeName =
      typeof pr.employeeId === 'object' && pr.employeeId && 'employee_name' in pr.employeeId
        ? String((pr.employeeId as Employee).employee_name)
        : pr.emp_no || 'Employee';
    setAttendanceDeductionInfo({ employeeName, total, lateEarlyDays, absentExtraDays });
  };

  const getSummaryRows = () =>
    getFilteredPayRegisters().map((pr) => {
      const totals = pr.totals || {};
      const present = totals.totalPresentDays || 0;
      const absent = totals.totalAbsentDays || 0;
      const leave = getLeaveTotal(totals);
      const od = totals.totalODDays || 0;
      const ot = totals.totalOTHours || 0;
      const extra = (totals.totalPayableShifts || 0) - (totals.totalPresentDays || 0);
      const weeklyOffs = totals.totalWeeklyOffs || 0;
      const holidays = totals.totalHolidays || 0;
      const lop = totals.totalLopDays || 0;
      const paidLeave = totals.totalPaidLeaveDays || 0;
      const lateCount = getLateAndEarlyCount(totals);
      const holidayAndWeekoffs = (totals.totalWeeklyOffs || 0) + (totals.totalHolidays || 0);

      const monthDays = pr.totalDaysInMonth || daysArray.length || daysInMonth;

      // User Definition:
      // Counted Days = Present + Absent + Holidays + Weekoffs + Total Leaves + OD Days
      const countedDays = present + absent + holidays + weeklyOffs + leave + od;
      const matchesMonth = Math.abs(countedDays - monthDays) < 0.001;
      const payableShifts = totals.totalPayableShifts ?? 0;
      const attDedDays = Number(
        pr.totalAttendanceDeductionDays ?? pr.attendanceDeductionBreakdown?.daysDeducted ?? 0
      );
      const leaveBreakdownRows = getLeaveTypeBreakdownRowsFromPayRegister(pr);
      return {
        pr,
        present,
        absent,
        leave,
        od,
        ot,
        extra,
        weeklyOffs,
        holidays,
        payableShifts,
        lop,
        paidLeave,
        lateCount,
        attDedDays,
        holidayAndWeekoffs,
        monthDays,
        countedDays,
        matchesMonth,
        leaveBreakdownRows,
      };
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'absent':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'leave':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'od':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'holiday':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
      case 'week_off':
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
      case 'blank':
        return 'bg-transparent border-transparent';
      default:
        return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const halfStatusLetter = (st: string) => (st === 'blank' ? '' : st.charAt(0).toUpperCase());

  const formatHalfSplitCell = (record: DailyRecord) => {
    const a = halfStatusLetter(record.firstHalf.status);
    const b = halfStatusLetter(record.secondHalf.status);
    if (!a && !b) return '';
    if (a && b) return `${a}/${b}`;
    return a || b;
  };

  /** Primary status for a daily record (full day or first half when split) for coloring in "All" view */
  const getPrimaryStatus = (record: DailyRecord): string => {
    if (
      record.status === 'blank' ||
      (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank')
    )
      return 'blank';
    if (record.status && ['present', 'absent', 'leave', 'od', 'holiday', 'week_off', 'blank'].includes(record.status))
      return record.status;
    const s1 = record.firstHalf?.status;
    const s2 = record.secondHalf?.status;
    if (s1 && ['present', 'absent', 'leave', 'od', 'holiday', 'week_off', 'blank'].includes(s1)) return s1;
    if (s2 && ['present', 'absent', 'leave', 'od', 'holiday', 'week_off', 'blank'].includes(s2)) return s2;
    return 'absent';
  };

  const getStatusDisplay = (record: DailyRecord | null): string => {
    if (!record) return '-';
    if (
      record.status === 'blank' ||
      (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank')
    )
      return '';
    if (record.isSplit) {
      const first = halfStatusLetter(record.firstHalf.status);
      const second = halfStatusLetter(record.secondHalf.status);
      if (!first && !second) return '';
      return `${first}/${second}`;
    }
    if (record.status === 'leave') return 'L';
    if (record.status === 'od') return 'OD';
    if (record.status === 'present') return 'P';
    if (record.status === 'absent') return 'A';
    if (record.status === 'holiday') return 'H';
    if (record.status === 'week_off') return 'WO';
    return '-';
  };

  const getCellBackgroundColor = (record: DailyRecord | null, tableType: TableType): string => {
    if (!record) return '';

    let base = '';
    if (record.isManuallyEdited) {
      base = 'bg-amber-100 dark:bg-amber-900/30 ring-inset ring-1 ring-amber-300 dark:ring-amber-700';
    } else if (tableType === 'all') {
      base = getStatusColor(getPrimaryStatus(record));
    } else if (tableType === 'present') {
      if (record.status === 'present' || record.firstHalf.status === 'present' || record.secondHalf.status === 'present') {
        base = 'bg-green-100 dark:bg-green-900/30';
      }
    } else if (tableType === 'absent') {
      if (
        record.firstHalf?.status !== 'blank' &&
        record.secondHalf?.status !== 'blank' &&
        (record.status === 'absent' || record.firstHalf.status === 'absent' || record.secondHalf.status === 'absent')
      ) {
        base = 'bg-red-100 dark:bg-red-900/30';
      }
    } else if (tableType === 'leaves') {
      if (record.status === 'leave' || record.firstHalf.status === 'leave' || record.secondHalf.status === 'leave') {
        base = 'bg-yellow-100 dark:bg-yellow-900/30';
      }
    } else if (tableType === 'od') {
      if (record.status === 'od' || record.isOD || record.firstHalf.status === 'od' || record.secondHalf.status === 'od' || record.firstHalf.isOD || record.secondHalf.isOD) {
        base = 'bg-blue-100 dark:bg-blue-900/30';
      }
    } else if (tableType === 'ot' || tableType === 'extraHours') {
      if (record.otHours > 0 || record.firstHalf.otHours > 0 || record.secondHalf.otHours > 0) {
        base = 'bg-orange-100 dark:bg-orange-900/30';
      }
    } else if (tableType === 'shifts') {
      if (record.shiftId !== null || record.shiftName !== null || record.firstHalf.shiftId !== null || record.secondHalf.shiftId !== null) {
        base = 'bg-indigo-100 dark:bg-indigo-900/30';
      }
    }
    return base.trim();
  };

  const payRegisterContribMap = useMemo(() => {
    if (!contribHighlight) return new Map<string, { value: number; label: string }>();
    const pr = payRegisters.find((p) => p._id === contribHighlight.prId);
    return resolvePayRegisterContribMap(pr, contribHighlight.keys).map;
  }, [contribHighlight, payRegisters]);

  const payRegisterContribAccentClasses = useMemo(
    () => (contribHighlight ? payRegisterContribAccent(contribHighlight.keys) : null),
    [contribHighlight]
  );

  const togglePayRegisterContrib = (pr: PayRegisterSummary, keys: PayRegisterContribKey[], title: string) => {
    if (!keys.length || pr.isStub) return;
    setContribHighlight((prev) => {
      const same =
        prev &&
        prev.prId === pr._id &&
        prev.title === title &&
        keys.length === prev.keys.length &&
        keys.every((k, i) => k === prev.keys[i]);
      if (same) return null;
      return { prId: pr._id, keys, title };
    });
  };

  const onPayRegisterTotalLeavesClick = (pr: PayRegisterSummary) => {
    if (pr.isStub) return;
    openPayRegisterLeaveBreakdown(pr);
    togglePayRegisterContrib(pr, ['paidLeaves', 'lopLeaves'], 'Total leaves');
  };

  const shouldShowInTable = (record: DailyRecord | null, tableType: TableType): boolean => {
    if (!record) return false;

    switch (tableType) {
      case 'all':
        return true;
      case 'present':
        return record.status === 'present' || record.firstHalf.status === 'present' || record.secondHalf.status === 'present';
      case 'absent':
        return (
          record.firstHalf?.status !== 'blank' &&
          record.secondHalf?.status !== 'blank' &&
          (record.status === 'absent' || record.firstHalf.status === 'absent' || record.secondHalf.status === 'absent')
        );
      case 'leaves':
        return record.status === 'leave' || record.firstHalf.status === 'leave' || record.secondHalf.status === 'leave';
      case 'od':
        return record.status === 'od' || record.isOD || record.firstHalf.status === 'od' || record.secondHalf.status === 'od' || record.firstHalf.isOD || record.secondHalf.isOD;
      case 'ot':
      case 'extraHours':
        return record.otHours > 0 || record.firstHalf.otHours > 0 || record.secondHalf.otHours > 0;
      case 'shifts':
        return record.shiftId !== null || record.shiftName !== null || record.firstHalf.shiftId !== null || record.secondHalf.shiftId !== null;
      default:
        return false;
    }
  };

  // List rows: API scope when one division/dept selected; extra client filter when multi-select.
  const listDepartmentOptions = useMemo(
    () => departmentsForDivisionFilter(divisions, departments, filterDivisions),
    [divisions, departments, filterDivisions],
  );

  const getFilteredPayRegisters = (): PayRegisterSummary[] => payRegisters;

  const handleViewPayslip = (employee: Employee) => {
    // Navigate to payslip or open payslip modal
    router.push(`${payrollTransactionsBasePath}?employeeId=${employee._id}&month=${monthStr}`);
  };

  const consumeDepartmentPermission = (deptId?: string) => {
    if (!deptId) return;
    setConsumedPermissionKeys((prev) => {
      const next = new Set(prev);
      next.add(getPermissionKey(deptId));
      return next;
    });
  };

  const handleCalculatePayroll = async (employee: Employee) => {
    try {
      const deptId = employee && employee.department_id
        ? (typeof employee.department_id === 'object' ? employee.department_id._id : employee.department_id)
        : '';
      const batchInfo = deptId ? departmentBatchStatus.get(deptId) : null;
      const batchStatus = batchInfo?.status || 'pending';
      const hasPermission = deptId ? hasEffectivePermission(deptId, batchInfo || null) : false;
      const isLocked = batchStatus === 'freeze' || batchStatus === 'complete' || (batchStatus === 'approved' && !hasPermission);

      if (isLocked) {
        if (batchStatus === 'approved' && batchInfo?.batchId) {
          setPendingBatchId(batchInfo.batchId);
          setShowPermissionModal(true);
          return;
        }
        Swal.fire({
          icon: 'info',
          title: 'Payroll Locked',
          text: `Payroll is ${batchStatus}. Recalculation is not allowed.`,
        });
        return;
      }

      const employeeId = typeof employee === 'object' ? employee._id : employee;
      const params = '?strategy=dynamic';
      setCalculatingId(employeeId);
      Swal.fire({
        icon: 'info',
        title: 'Calculating',
        text: 'Calculating payroll...',
        timer: 1200,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });

      // Filter arrears and deductions for this specific employee (compare as string to avoid ObjectId mismatch)
      const empIdStr = String(employeeId);
      const employeeArrears = selectedArrears.filter((a) => a.employeeId != null && String(a.employeeId) === empIdStr);
      const employeeDeductions = selectedDeductions.filter((d) => d.employeeId != null && String(d.employeeId) === empIdStr);

      const response = await api.calculatePayroll(empIdStr, monthStr, params, employeeArrears, employeeDeductions);

      if (response && response.data && response.data.batchId) {
        consumeDepartmentPermission(deptId);
        Swal.fire({
          icon: 'success',
          title: 'Calculated',
          text: 'Payroll calculated! Redirecting to batch...',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
        // Small delay to let the toast be seen
        setTimeout(() => {
          router.push(`${paymentsBasePath}/${response.data.batchId}`);
        }, 1000);
      } else {
        consumeDepartmentPermission(deptId);
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'Payroll calculated',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }
    } catch (err: any) {
      console.error('Error calculating payroll:', err);

      // Check for BATCH_LOCKED error
      // API might return error message in err.message. Check if it contains specific text or if err object has code
      // Note: frontend api wrapper might throw Error(message), so we might check message content
      if (err.message && (err.message.includes('BATCH_LOCKED') || err.message.includes('Recalculation requires permission'))) {
        // Try to extract batchId if possible. Since standard Error doesn't have custom props, 
        // we might need to rely on the backend response.
        // Ideally, we'd need to fetch the batch ID for this department/month or Parse it from somewhere.
        // For now, let's try to parse it from the response if available or fetch it.
        // Use the error info if attached to the error object (requires custom error handling in api.ts)

        // A more robust way: If api sets properties on the error object
        if (err.batchId) {
          setPendingBatchId(err.batchId);
          setShowPermissionModal(true);
          return;
        } else {
          // Fallback: If we can't find batchId, we show a generic error or try to find it.
          // But since we just failed to calc, the backend knows the ID.
          // Let's assume for now api.ts might be updated or we rely on message/manual lookup.
          // IF we can't get ID, we can't request permission easily.
          // Let's check api.ts later. For now, show the message.
        }
      }

      Swal.fire({
        icon: 'error',
        title: 'Calculation Error',
        text: err.message || 'Failed to calculate payroll',
      });
    } finally {
      setCalculatingId(null);
    }
  };

  const handleRequestRecalculation = async () => {
    if (!pendingBatchId) return;
    try {
      const response = await api.requestRecalculation(pendingBatchId, permissionReason);
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Permission Requested',
          text: 'Permission requested successfully',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
        setShowPermissionModal(false);
        setPendingBatchId(null);
        setPermissionReason('');
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Request Failed',
          text: response.message || 'Failed to request permission',
        });
      }
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Error asking for permission',
      });
    }
  };

  const downloadPayrollExcel = async (employeeIds?: string[]) => {
    try {
      setExportingExcel(true);
      const orgFilters = buildPayRegisterApiFilters();

      const blob = await api.exportPayrollExcel({
        month: monthStr,
        departmentId: orgFilters.departmentIds?.length
          ? orgFilters.departmentIds.join(',')
          : undefined,
        divisionId: orgFilters.divisionIds?.length
          ? orgFilters.divisionIds.join(',')
          : undefined,
        search: orgFilters.search,
        employee_group_id: orgFilters.employeeGroupId,
        strategy: payrollStrategy,
        employeeIds,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslips_${monthStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      Swal.fire({
        icon: 'success',
        title: 'Ready',
        text: 'Payroll Excel ready',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch (err: any) {
      // Debug: Log the error details
      console.log('[Export Error]', err?.message || err);
      // Show user-friendly error message via toast
      const errorMessage = err?.message || 'Failed to export payroll Excel';
      console.log('[Showing Toast]', errorMessage);
      Swal.fire({
        icon: 'error',
        title: 'Export Failed',
        text: errorMessage,
      });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleCalculatePayrollForAll = async () => {
    const getScopedDepartmentIds = (): string[] => {
      if (filterDepartments.length) return filterDepartments;
      if (filterDivisions.length) {
        return departmentsForDivisionFilter(divisions, departments, filterDivisions)
          .map((d: { _id?: string }) => String(d._id))
          .filter(Boolean);
      }
      return departments.map((d: any) => d?._id).filter(Boolean);
    };

    const hasLockedBatchInScope = (): boolean => {
      const scopedDeptIds = getScopedDepartmentIds();
      return scopedDeptIds.some((deptId) => {
        const batchInfo = departmentBatchStatus.get(deptId);
        const status = batchInfo?.status || 'pending';
        const permissionGranted = hasEffectivePermission(deptId, batchInfo || null);
        return status === 'freeze' || status === 'complete' || (status === 'approved' && !permissionGranted);
      });
    };

    if (filterDepartments.length !== 1 && hasLockedBatchInScope()) {
      Swal.fire({
        icon: 'info',
        title: 'Department Selection Required',
        text: 'Some departments are locked/approved. Select a department to request permission or recalculate.',
      });
      return;
    }

    if (paginationTotal <= 0 && (!payRegisters || payRegisters.length === 0)) {
      Swal.fire({
        icon: 'info',
        title: 'No Employees',
        text: 'No employees match the selected month and filters.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      return;
    }
    let successCount = 0;
    let failCount = 0;
    const batchIds = new Set<string>(); // Store unique batch IDs

    const searchApplied = (committedSearch || '').trim();
    setBulkCalculating(true);
    Swal.fire({
      icon: 'info',
      title: 'Calculating',
      text:
        paginationTotal > 0
          ? searchApplied
            ? `Queuing payroll for ${paginationTotal} employee(s) matching search "${searchApplied}" (not only this page).`
            : `Queuing payroll for all ${paginationTotal} employee(s) matching these filters (not only this page).`
          : 'Queuing payroll for all employees matching these filters...',
      timer: 2500,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    });
    try {
      const requestData = {
        month: monthStr,
        divisionId: filterDivisions.length ? filterDivisions.join(',') : undefined,
        departmentId: filterDepartments.length ? filterDepartments.join(',') : undefined,
        search: searchApplied || undefined,
        employeeGroupId:
          customGroupingEnabled && selectedEmployeeGroup && selectedEmployeeGroup !== ''
            ? selectedEmployeeGroup
            : undefined,
        strategy: payrollStrategy,
        arrears: selectedArrears
          .filter((a) => a.employeeId != null)
          .map((a) => ({
            arrearId: a.id,
            amount: a.amount,
            employeeId: String(a.employeeId),
          })),
        deductions: selectedDeductions
          .filter((d) => d.employeeId != null)
          .map((d) => ({
            deductionId: d.id,
            amount: d.amount,
            employeeId: String(d.employeeId),
          })),
      };

      console.log('[Bulk Calculate] Request:', requestData);

      const response = await api.calculatePayrollBulk(requestData);

      console.log('[Bulk Calculate] Response:', response);

      if (response.success) {
        if (response.status === 'queued' || response.jobId) {
          if (selectedDepartment) {
            consumeDepartmentPermission(selectedDepartment);
          }
          setCalculatingJobId(response.jobId || null);
          Swal.fire({
            icon: 'info',
            title: 'Calculation Queued',
            text: 'Bulk payroll calculation has been queued. You can track progress below.',
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
          return;
        }

        successCount = response.data.successCount;
        failCount = response.data.failCount;
        if (response.data.batchIds) {
          response.data.batchIds.forEach((id: string) => batchIds.add(id));
        }

        if (failCount === 0) {
          if (selectedDepartment) {
            consumeDepartmentPermission(selectedDepartment);
          }
          Swal.fire({
            icon: 'success',
            title: 'Success',
            text: 'Payroll calculated successfully for all employees',
          });
        } else {
          Swal.fire({
            icon: 'warning',
            title: 'Partial Success',
            text: `Calculation completed with ${failCount} failures`,
          });
        }
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Bulk Calculation Failed',
          text: response.message || 'Bulk calculation failed',
        });
      }

      // Redirect logic based on batches created
      if (batchIds.size === 1) {
        // Single batch -> Redirect to that batch
        const batchId = Array.from(batchIds)[0];
        Swal.fire({
          icon: 'info',
          title: 'Redirecting',
          text: 'Redirecting to Batch Details...',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
        setTimeout(() => {
          router.push(`${paymentsBasePath}/${batchId}`);
        }, 1500);
      } else if (batchIds.size > 1) {
        // Multiple batches -> Redirect to list
        Swal.fire({
          icon: 'info',
          title: 'Redirecting',
          text: 'Redirecting to Payments List...',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
        setTimeout(() => {
          router.push(paymentsBasePath);
        }, 1500);
      }
      else if (successCount > 0) {
        // No batches but legacy/success -> Download Excel
        const listedEmployeeIds = payRegisters.map((pr) =>
          typeof pr.employeeId === 'object' ? pr.employeeId._id : pr.employeeId
        );
        await downloadPayrollExcel(listedEmployeeIds);
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'No Export',
          text: 'Calculation failed for all employees. Nothing to export.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }

    } catch (error: any) {
      console.log('[Bulk Calculate] Error:', error);
      Swal.fire({
        icon: 'error',
        title: 'Calculation Failed',
        text: error?.message || 'Failed to calculate payroll',
      });
    } finally {
      setBulkCalculating(false);
    }
  };

  const handleArrearsSelected = useCallback((arrears: Array<{ id: string, amount: number, employeeId?: string }>) => {
    setSelectedArrears(arrears);
  }, []);

  const handleDeductionsSelected = useCallback((deductions: Array<{ id: string, amount: number, employeeId?: string }>) => {
    setSelectedDeductions(deductions);
  }, []);

  const processPayroll = async () => {
    try {
      if (!selectedEmployee) {
        Swal.fire({
          icon: 'error',
          title: 'No Employee Selected',
          text: 'Please select an employee',
        });
        return;
      }

      // Prepare payroll data
      const payrollData = {
        employeeId: selectedEmployee._id,
        month: selectedMonth,
        year: selectedYear,
        arrears: selectedArrears,
        // Add other payroll data as needed
      };

      // Submit payroll data
      // Use apiRequest for generic post
      const response = await apiRequest<any>('/payroll/process', {
        method: 'POST',
        body: JSON.stringify(payrollData)
      });

      // Process arrears settlement after successful payroll
      if (response.success) {
        if (selectedArrears.length > 0) {
          await settleArrears(response.data.payrollId);
        }
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'Payroll processed successfully',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Processing Failed',
          text: response.message || 'Failed to process payroll',
        });
      }
    } catch (error: any) {
      console.error('Error processing payroll:', error);
      Swal.fire({
        icon: 'error',
        title: 'Processing Failed',
        text: 'Failed to process payroll',
      });
    }
  };

  const settleArrears = async (payrollId: string) => {
    try {
      // Process each selected arrear
      for (const arrear of selectedArrears) {
        await api.updateArrearsSettlement(arrear.id, {
          amount: arrear.amount,
          payrollId,
          month: selectedMonth,
          year: selectedYear,
        });
      }
      Swal.fire({
        icon: 'success',
        title: 'Arrears Settled',
        text: 'Arrears settled successfully',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch (error) {
      console.error('Error settling arrears:', error);
      Swal.fire({
        icon: 'error',
        title: 'Settlement Failed',
        text: 'Failed to settle arrears',
      });
    }
  };

  const countEmployeesForTable = (tabId: TableType) => {
    const rows = getFilteredPayRegisters();
    if (tabId === 'all') return rows.length;
    return rows.filter((pr) => {
      const totals = pr.totals || {};
      switch (tabId) {
        case 'present':
          return (totals.totalPresentDays || 0) > 0;
        case 'absent':
          return (totals.totalAbsentDays || 0) > 0;
        case 'leaves':
          return (totals.totalLeaveDays || 0) > 0;
        case 'od':
          return (totals.totalODDays || 0) > 0;
        case 'ot':
          return (totals.totalOTHours || 0) > 0;
        case 'extraHours':
          return (totals.totalPayableShifts || 0) > (totals.totalPresentDays || 0);
        case 'shifts':
          return (totals.totalPayableShifts || 0) > 0;
        default:
          return true;
      }
    }).length;
  };

  const periodSubtitle =
    !loading && payrollStartDate && payrollEndDate
      ? `${new Date(payrollStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(payrollEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : loading
        ? 'Loading pay period…'
        : undefined;

  const headerSubtitle = [
    periodSubtitle ? `Period ${periodSubtitle}` : null,
    loading
      ? 'Loading…'
      : paginationTotal > 0
        ? paginationTotal <= PAGE_SIZE
          ? `${paginationTotal} employee${paginationTotal !== 1 ? 's' : ''}`
          : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, paginationTotal)} of ${paginationTotal}`
        : getFilteredPayRegisters().length
          ? `${getFilteredPayRegisters().length} on page`
          : null,
    paginationTotalPages > 1 ? `Page ${page}/${paginationTotalPages}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const hdrOutlineBtn =
    'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide transition hover:opacity-80 disabled:opacity-40';
  const hdrPrimaryBtn =
    'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:opacity-40';
  const hdrFieldClass =
    'h-7 border bg-white px-2 text-[11px] text-stone-900 transition focus:outline-none focus:ring-1 focus:ring-[color:var(--ps-accent)] dark:bg-stone-950 dark:text-stone-100';

  const ledgerBorderStyle = { borderColor: 'var(--ps-accent-border)' };
  const summaryThClass = `${loansTableHeadClass()} border-r`;
  const summaryThStickyClass = `sticky left-0 top-0 z-[25] w-[180px] border-r px-3 py-2 text-left ${loansTableHeadClass()}`;
  const summarySubThClass = `${loansTableHeadClass()} border-r px-1 py-1.5 text-center text-[9px]`;
  const summaryDeductionGroupThClass = `${loansTableHeadClass()} border-b border-r px-2 py-1.5 text-center bg-rose-50/90 dark:bg-rose-950/35`;
  const summaryRowClass = 'border-b transition hover:bg-[var(--ps-accent-soft)]/50 dark:hover:bg-stone-900/40';
  const summaryCellClass = 'border-r px-2 py-2 text-center tabular-nums';
  const summaryStickyCellClass =
    'sticky left-0 z-10 border-r bg-white px-3 py-2 text-[11px] font-medium text-stone-900 dark:bg-stone-950 dark:text-stone-100';

  const monthlySummaryToggle = (
    expanded: boolean,
    panelId: string,
    meta: ReactNode,
  ) => (
    <div className="border-b px-4 py-3" style={ledgerBorderStyle}>
      <button
        type="button"
        onClick={() => setMonthlySummaryExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ps-accent)]"
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
            style={{ color: 'var(--ps-accent)' }}
            aria-hidden
          />
          <LoansSectionTitle>Monthly summary</LoansSectionTitle>
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {meta}
        </span>
      </button>
    </div>
  );

  const payRegisterFilterRow = (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            const newDate = new Date(currentDate);
            newDate.setMonth(currentDate.getMonth() - 1);
            setCurrentDate(newDate);
          }}
          className={`h-7 w-7 shrink-0 ${hdrOutlineBtn} !px-0`}
          style={loansDialogOutlineButtonStyle()}
          title="Previous month"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <input
          type="month"
          value={monthStr}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-');
            setCurrentDate(new Date(parseInt(y), parseInt(m) - 1));
          }}
          className={`${hdrFieldClass} w-[7.25rem]`}
          style={loansFormInputStyle()}
          title="Pay period"
        />
        <button
          type="button"
          onClick={() => {
            const newDate = new Date(currentDate);
            newDate.setMonth(currentDate.getMonth() + 1);
            setCurrentDate(newDate);
          }}
          className={`h-7 w-7 shrink-0 ${hdrOutlineBtn} !px-0`}
          style={loansDialogOutlineButtonStyle()}
          title="Next month"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {showDivisionFilter && (
        <MultiSelect
          variant="ledger"
          compact
          options={divisions.map((d) => ({ id: String(d._id), name: d.name ?? 'Division' }))}
          selectedIds={filterDivisions}
          onChange={(vals) => {
            setFilterDivisions(vals);
            setFilterDepartments([]);
          }}
          placeholder="Division"
          className="w-28 sm:w-32"
        />
      )}

      <MultiSelect
        variant="ledger"
        compact
        options={listDepartmentOptions.map((d) => ({
          id: String(d._id),
          name: d.name ?? 'Department',
        }))}
        selectedIds={filterDepartments}
        onChange={setFilterDepartments}
        placeholder="Department"
        className="w-28 sm:w-32"
      />

      {customGroupingEnabled && (
        <select
          value={selectedEmployeeGroup}
          onChange={(e) => setSelectedEmployeeGroup(e.target.value)}
          className={`${hdrFieldClass} w-28 sm:w-32`}
          style={loansFormInputStyle()}
          title="Employee group"
        >
          <option value="">All groups</option>
          {employeeGroups.map((group) => (
            <option key={group._id} value={group._id}>{group.name}</option>
          ))}
        </select>
      )}

      <div className="relative w-28 sm:w-36">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const t = (searchQuery || '').trim();
              setCommittedSearch(t);
              setPage(1);
              void loadPayRegisters(1, false, t);
            }
          }}
          placeholder="Search…"
          className={`${hdrFieldClass} w-full pl-7`}
          style={loansFormInputStyle()}
        />
      </div>
    </>
  );

  const payRegisterExportRow =
    !loading && getFilteredPayRegisters().length > 0 ? (
      <div className="mb-4 flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => handleSaveSummaryLock(true)}
          disabled={savingSummaryLock}
          className={ledgerActionButtonClass('emerald', 'solid')}
        >
          {savingSummaryLock ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {savingSummaryLock ? 'Saving…' : 'Save & lock'}
        </button>
        <button
          type="button"
          onClick={() => void downloadPayrollExcel()}
          disabled={exportingExcel || payRegisters.length === 0}
          title="Export payroll to Excel"
          className={ledgerActionButtonClass('sky')}
        >
          {exportingExcel ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          {exportingExcel ? 'Exporting…' : 'Export'}
        </button>
        <button
          type="button"
          onClick={() => void handleDownloadSummaryPdf()}
          disabled={exportingPdf || payRegisters.length === 0}
          title="Export pay register summary and day breakdown to PDF"
          className={ledgerActionButtonClass('rose')}
        >
          {exportingPdf ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          )}
          {exportingPdf ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={() => void handleDownloadModificationsExcel()}
          disabled={exportingModificationsExcel || loading}
          title="Download report of manual pay register edits"
          className={ledgerActionButtonClass('amber')}
        >
          {exportingModificationsExcel ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
          {exportingModificationsExcel ? 'Exporting…' : 'Modifications Excel'}
        </button>
        <button
          type="button"
          onClick={() => void handleDownloadModificationsPdf()}
          disabled={exportingModificationsPdf || loading}
          title="Download PDF report of manual pay register edits"
          className={ledgerActionButtonClass('violet')}
        >
          {exportingModificationsPdf ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          {exportingModificationsPdf ? 'Exporting…' : 'Modifications PDF'}
        </button>
      </div>
    ) : null;

  const payRegisterHeaderButtons = (
    <>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className={hdrOutlineBtn}
              style={loansDialogOutlineButtonStyle()}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload
            </button>
            <button
              type="button"
              onClick={() => void beginSyncAll()}
              disabled={syncing || loadingSyncLockedList || paginationTotal <= 0}
              className={`${hdrOutlineBtn} disabled:opacity-50`}
              style={loansDialogOutlineButtonStyle()}
            >
              <svg className={`h-3 w-3 ${syncing || loadingSyncLockedList ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loadingSyncLockedList ? '…' : syncing ? 'Syncing' : 'Sync All'}
            </button>

            {(() => {
              if (selectedDepartment) {
                const batchInfo = departmentBatchStatus.get(selectedDepartment);
                const status = batchInfo?.status || 'pending';
                const permissionGranted = hasEffectivePermission(selectedDepartment, batchInfo || null);
                const hasExistingBatchForMonth = Boolean(batchInfo?.batchId);

                if (status === 'freeze' || status === 'complete') {
                  return null;
                }

                if (status === 'approved' && !permissionGranted) {
                  return (
                    <button
                      onClick={() => {
                        if (batchInfo?.batchId) {
                          setPendingBatchId(batchInfo.batchId);
                          setShowPermissionModal(true);
                        } else {
                          Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: "Batch ID not found",
                          });
                        }
                      }}
                      className={hdrOutlineBtn}
                      style={loansDialogOutlineButtonStyle()}
                    >
                      Permission
                    </button>
                  );
                }

                return (
                  <button
                    onClick={handleCalculatePayrollForAll}
                    disabled={bulkCalculating || exportingExcel}
                    className={`${hdrPrimaryBtn} disabled:opacity-50`}
                    style={loansPrimaryButtonStyle()}
                  >
                    {bulkCalculating
                      ? '…'
                      : hasExistingBatchForMonth
                        ? 'Recalculate'
                        : 'Calculate'}
                  </button>
                );
              }

              if (selectedDivision && selectedDivision !== 'all') {
                const currentDivision = divisions.find((d) => d._id === selectedDivision);
                const scopedDeptIds = Array.from(
                  new Set(
                    (currentDivision?.departments || [])
                      .map((d: any) => (typeof d === 'string' ? d : d?._id))
                      .filter(Boolean)
                  )
                );
                const hasLockedInDivision = scopedDeptIds.some((deptId) => {
                  const batchInfo = departmentBatchStatus.get(deptId);
                  const status = batchInfo?.status || 'pending';
                  const permissionGranted = hasEffectivePermission(deptId, batchInfo || null);
                  return status === 'freeze' || status === 'complete' || (status === 'approved' && !permissionGranted);
                });

                if (hasLockedInDivision) {
                  return (
                    <button
                      disabled
                      className="inline-flex h-7 shrink-0 cursor-not-allowed items-center rounded-md bg-amber-500/80 px-2 text-[10px] font-semibold uppercase tracking-wide text-white"
                      title="Select department to request permission"
                    >
                      Select dept
                    </button>
                  );
                }
              }

              return (
                <button
                  onClick={handleCalculatePayrollForAll}
                  disabled={bulkCalculating || exportingExcel}
                  className={`${hdrPrimaryBtn} disabled:opacity-50`}
                  style={loansPrimaryButtonStyle()}
                >
                  {bulkCalculating ? '…' : 'Calculate'}
                </button>
              );
            })()}
    </>
  );

  return (
    <LoansPageShell>
      <LoansPageHeader
        dense
        layout="toolbar"
        badge="Finance · Attendance"
        title="Pay register"
        subtitle={headerSubtitle || 'Monthly attendance and payroll inputs'}
        action={
          <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div aria-hidden className="min-w-0" />
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
              {payRegisterFilterRow}
            </div>
            <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
              {payRegisterHeaderButtons}
            </div>
          </div>
        }
      />

        {syncing && syncProgress && syncProgress.phase !== 'done' && syncProgress.phase !== 'error' && (() => {
          const phase = syncProgress.phase;
          const total = syncProgress.total ?? 0;
          const completed = syncProgress.completed ?? 0;
          const pct =
            phase === 'prepare'
              ? 4
              : total > 0
                ? Math.min(100, Math.round((completed / total) * 100))
                : 0;
          const phaseTitle =
            phase === 'prepare' ? 'Preparing sync' : 'Syncing pay register';
          const countLine =
            phase === 'sync' && total > 0
              ? `${completed} / ${total} employees`
              : 'Finding employees in scope…';
          return (
            <div className="mb-6 animate-fade-in relative z-20">
              <LoanFormInfo title={`Sync All · ${monthStr}`}>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {phaseTitle}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--ps-accent-ink)' }}>
                    {countLine} ({pct}%)
                  </span>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800">
                  <div
                    className="h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: 'var(--ps-accent)' }}
                  />
                </div>
              </LoanFormInfo>
            </div>
          );
        })()}

        {/* Progress Bar for Bulk Calculation */}
        {calculationProgress && (() => {
          const phase = calculationProgress.phase as string | undefined;
          const phaseLabel =
            phase === 'second_salary'
              ? '2nd salary'
              : phase === 'regular'
                ? 'Regular payroll'
                : 'Payroll';
          const showOverall =
            typeof calculationProgress.overallProcessed === 'number' &&
            typeof calculationProgress.overallTotal === 'number' &&
            calculationProgress.overallTotal > 0;
          const pct =
            typeof calculationProgress.percentage === 'number'
              ? calculationProgress.percentage
              : showOverall
                ? Math.round(
                    (calculationProgress.overallProcessed / calculationProgress.overallTotal) * 100
                  )
                : 0;
          const countLine = showOverall
            ? `${calculationProgress.overallProcessed} / ${calculationProgress.overallTotal} overall · phase ${calculationProgress.processed} / ${calculationProgress.total}`
            : `${calculationProgress.processed} / ${calculationProgress.total}`;
          return (
          <div className="mb-6 animate-fade-in relative z-20">
            <LoanFormInfo title={phaseLabel}>
              <div className="flex justify-between items-center text-sm font-medium">
                <span className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {calculationProgress.currentEmployee
                    ? `Calculating for: ${calculationProgress.currentEmployee}`
                    : 'Processing bulk payroll...'}
                </span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--ps-accent-ink)' }}>
                  {calculatingJobId && <span className="mr-3 opacity-50 font-mono text-[10px] font-normal">ID: {calculatingJobId}</span>}
                  {countLine} ({pct}%)
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800">
                <div
                  className="h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: 'var(--ps-accent)' }}
                />
              </div>
            </LoanFormInfo>
          </div>
          );
        })()}

        <LoanDetailDialog
          open={showPermissionModal}
          onClose={() => {
            setShowPermissionModal(false);
            setPendingBatchId(null);
            setPermissionReason('');
          }}
          maxWidth="max-w-md"
        >
          <LoanDetailDialogHeader
            badge="Batch locked"
            title="Request recalculation permission"
            onClose={() => {
              setShowPermissionModal(false);
              setPendingBatchId(null);
              setPermissionReason('');
            }}
          />
          <LoanDetailDialogBody>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              The payroll batch for this month is approved. Recalculation is restricted until permission is granted.
            </p>
            <div>
              <LoanFormLabel>Reason for recalculation</LoanFormLabel>
              <textarea
                className={`mt-1.5 min-h-[80px] ${loansFormTextareaClass()}`}
                style={loansFormInputStyle()}
                placeholder="Reason for recalculation…"
                value={permissionReason}
                onChange={(e) => setPermissionReason(e.target.value)}
              />
            </div>
            <LoanDialogFooter
              onCancel={() => {
                setShowPermissionModal(false);
                setPendingBatchId(null);
                setPermissionReason('');
              }}
              submitLabel="Request permission"
              onSubmit={handleRequestRecalculation}
            />
          </LoanDetailDialogBody>
        </LoanDetailDialog>

        <LoanDetailDialog
          open={showSyncAllModal}
          onClose={() => setShowSyncAllModal(false)}
          maxWidth="max-w-5xl"
        >
          <LoanDetailDialogHeader
            badge="Sync"
            title="Sync all pay registers"
            onClose={() => setShowSyncAllModal(false)}
          />
          <LoanDetailDialogBody>
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
            <LoanFormInfo title="Locked summaries">
              Employees listed here have a locked summary for this month. Locked rows are skipped unless you check{' '}
              <strong>Override</strong>.
            </LoanFormInfo>
            <button
              type="button"
              className="text-xs font-semibold hover:underline"
              style={{ color: 'var(--ps-accent)' }}
              onClick={() => {
                const all = new Set(syncModalLockedRows.map((r) => String(r.employeeId)));
                if (syncOverrideLockedIds.size === all.size && all.size > 0) {
                  setSyncOverrideLockedIds(new Set());
                } else {
                  setSyncOverrideLockedIds(all);
                }
              }}
            >
              {syncModalLockedRows.length > 0 &&
              syncOverrideLockedIds.size === syncModalLockedRows.length
                ? 'Clear all overrides'
                : 'Select all overrides'}
            </button>
            <div className="overflow-x-auto border" style={{ borderColor: 'var(--ps-accent-border)' }}>
              <table className="w-full border-collapse text-xs min-w-[640px]">
                <thead>
                  <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                        <th className="w-10 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Override
                        </th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Employee
                        </th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Division
                        </th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Department
                        </th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Designation
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                      {syncModalLockedRows.map((row) => {
                        const idStr = String(row.employeeId);
                        return (
                          <tr key={idStr} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-2 text-center align-middle">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={syncOverrideLockedIds.has(idStr)}
                                onChange={(e) => {
                                  setSyncOverrideLockedIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(idStr);
                                    else next.delete(idStr);
                                    return next;
                                  });
                                }}
                                aria-label={`Override sync for ${row.employee_name}`}
                              />
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <PayRegisterEmployeeBlock
                                source={{
                                  employee_name: row.employee_name,
                                  emp_no: row.emp_no,
                                  designation: row.designation,
                                  department: row.department,
                                  division: row.division,
                                }}
                                lookups={{ divisions, departments }}
                              />
                            </td>
                            <td className="px-2 py-2 align-middle text-slate-700 dark:text-slate-300 max-w-[140px] truncate" title={row.division || undefined}>
                              {row.division || '—'}
                            </td>
                            <td className="px-2 py-2 align-middle text-slate-700 dark:text-slate-300 max-w-[140px] truncate" title={row.department || undefined}>
                              {row.department || '—'}
                            </td>
                            <td className="px-2 py-2 align-middle text-slate-700 dark:text-slate-300 max-w-[160px] truncate" title={row.designation || undefined}>
                              {row.designation || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            </div>
            <LoanDialogFooter
              onCancel={() => setShowSyncAllModal(false)}
              submitLabel="Run sync"
              onSubmit={() => runSyncAllWithOverrides(syncOverrideLockedIds, syncModalLockedRows)}
            />
          </LoanDetailDialogBody>
        </LoanDetailDialog>

      {/* Summary Table - skeleton when loading */}
      {loading && (
        <div className="mb-6 mt-2">
          <LoansContentPanel>
            {monthlySummaryToggle(
              monthlySummaryExpanded,
              'pay-register-monthly-summary-panel-loading',
              monthlySummaryExpanded ? 'Hide table' : 'Show table',
            )}
            {monthlySummaryExpanded && (
              <div id="pay-register-monthly-summary-panel-loading" className="max-h-[min(70vh,800px)] overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                      <th rowSpan={2} className={summaryThStickyClass} style={ledgerBorderStyle}>
                        Employee
                      </th>
                      {[
                        'Total Present',
                        'Total Absent',
                        'Total Leaves',
                        'Paid Leaves',
                        'LOP Count',
                        'Total OD',
                        'Total OT Hours',
                        'Total Extra Days',
                        'Lates (L+E)',
                      ].map((label) => (
                        <th key={label} rowSpan={2} className={summaryThClass} style={ledgerBorderStyle}>
                          {label}
                        </th>
                      ))}
                      <th rowSpan={2} className={summaryThClass} style={ledgerBorderStyle}>
                        Perm Count
                      </th>
                      <th rowSpan={2} className={summaryThClass} style={ledgerBorderStyle}>
                        Perm ded.
                      </th>
                      <th colSpan={3} className={summaryDeductionGroupThClass} style={ledgerBorderStyle}>
                        Deduction days
                      </th>
                      {['Holidays & Weekoffs', 'Present Days', 'Payable Shifts', 'Month Days', 'Counted Days'].map((label) => (
                        <th key={label} rowSpan={2} className={`${summaryThClass} last:border-r-0`} style={ledgerBorderStyle}>
                          {label}
                        </th>
                      ))}
                    </tr>
                    <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                      <th className={`${summarySubThClass} bg-red-50/90 dark:bg-red-950/30`} style={ledgerBorderStyle}>
                        Absent
                      </th>
                      <th className={`${summarySubThClass} bg-red-50/90 dark:bg-red-950/30`} style={ledgerBorderStyle}>
                        LOP
                      </th>
                      <th className={`${summarySubThClass} bg-rose-50/90 dark:bg-rose-950/35`} style={ledgerBorderStyle}>
                        Att. ded.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className={`${summaryRowClass} animate-pulse`} style={ledgerBorderStyle}>
                        <td className={summaryStickyCellClass} style={ledgerBorderStyle}>
                          <div className="h-4 w-32 rounded bg-stone-200 dark:bg-stone-700" />
                          <div className="mt-1 h-3 w-24 rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                        {Array.from({ length: 19 }).map((_, j) => (
                          <td key={j} className={summaryCellClass} style={ledgerBorderStyle}>
                            <div className="mx-auto h-4 w-8 rounded bg-stone-200 dark:bg-stone-700" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LoansContentPanel>
        </div>
      )}

      {/* Summary Table - real data */}
      {!loading && getFilteredPayRegisters().length > 0 && (
        <div className="mb-6 mt-2">
          <LoansContentPanel>
            {monthlySummaryToggle(
              monthlySummaryExpanded,
              'pay-register-monthly-summary-panel',
              monthlySummaryExpanded
                ? 'Hide table'
                : paginationTotalPages > 1
                  ? `Show · page ${page}/${paginationTotalPages}`
                  : `Show · ${getFilteredPayRegisters().length} row${getFilteredPayRegisters().length === 1 ? '' : 's'}`,
            )}
            {monthlySummaryExpanded && (
              <>
              <div id="pay-register-monthly-summary-panel" className="max-h-[min(70vh,800px)] overflow-auto">
                <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                  <th rowSpan={2} className={summaryThStickyClass} style={ledgerBorderStyle}>
                    Employee
                  </th>
                  {[
                    'Total Present',
                    'Total Absent',
                    'Total Leaves',
                    'Paid Leaves',
                    'LOP Count',
                    'Total OD',
                    'Total OT Hours',
                    'Total Extra Days',
                    'Lates (L+E)',
                  ].map((label) => (
                    <th key={label} rowSpan={2} className={summaryThClass} style={ledgerBorderStyle}>
                      {label}
                    </th>
                  ))}
                  <th rowSpan={2} className={summaryThClass} style={ledgerBorderStyle}>
                    Perm Count
                  </th>
                  <th rowSpan={2} className={summaryThClass} style={ledgerBorderStyle}>
                    Perm ded.
                  </th>
                  <th colSpan={3} className={summaryDeductionGroupThClass} style={ledgerBorderStyle}>
                    Deduction days
                  </th>
                  {['Holidays & Weekoffs', 'Present Days', 'Payable Shifts', 'Month Days', 'Counted Days'].map((label) => (
                    <th key={label} rowSpan={2} className={`${summaryThClass} last:border-r-0`} style={ledgerBorderStyle}>
                      {label}
                    </th>
                  ))}
                </tr>
                <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                  <th className={`${summarySubThClass} bg-red-50/90 dark:bg-red-950/30`} style={ledgerBorderStyle}>
                    Absent
                  </th>
                  <th className={`${summarySubThClass} bg-red-50/90 dark:bg-red-950/30`} style={ledgerBorderStyle}>
                    LOP
                  </th>
                  <th className={`${summarySubThClass} bg-rose-50/90 dark:bg-rose-950/35`} style={ledgerBorderStyle}>
                    Att. ded.
                  </th>
                </tr>
              </thead>
              <tbody>
                {getSummaryRows().map((row) => {
                  const employee = typeof row.pr.employeeId === 'object' ? row.pr.employeeId : null;
                  const empNo =
                    typeof row.pr.employeeId === 'object' ? row.pr.employeeId.emp_no : row.pr.emp_no;
                  const empName = typeof row.pr.employeeId === 'object' ? row.pr.employeeId.employee_name : '';
                  const designation =
                    employee && typeof employee.designation_id === 'object' && employee.designation_id?.name
                      ? String(employee.designation_id.name)
                      : '';
                  const department =
                    typeof row.pr.employeeId === 'object' && row.pr.employeeId.department_id
                      ? typeof row.pr.employeeId.department_id === 'object'
                        ? row.pr.employeeId.department_id.name
                        : ''
                      : '';
                  const leftDate = employee && 'leftDate' in employee ? (employee as any).leftDate : null;
                  const leftDateStr = leftDate ? (typeof leftDate === 'string' ? new Date(leftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '') : '';
                  return (
                    <tr key={row.pr._id} className={summaryRowClass} style={ledgerBorderStyle}>
                      <td className={summaryStickyCellClass} style={ledgerBorderStyle}>
                        <div>
                          <div className="font-semibold truncate">{empName}</div>
                          {designation ? (
                            <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
                              {designation}
                            </div>
                          ) : null}
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 truncate">
                            <span className="truncate">{empNo}</span>
                            {row.pr.summaryLocked && (
                              <span
                                className="shrink-0 rounded border border-amber-300/90 bg-amber-50/80 px-1 py-0 text-[8px] font-semibold uppercase tracking-widest text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                title="Summary locked — skipped on Sync All unless overridden"
                              >
                                Locked
                              </span>
                            )}
                            {department && <span className="truncate">• {department}</span>}
                          </div>
                          {leftDateStr && (
                            <div className="text-[9px] text-amber-600 dark:text-amber-400 font-medium mt-0.5" title="Left in this payroll period">
                              Left {leftDateStr}
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['present'], 'Present days') ? payRegisterContribAccent(['present']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight days in grid (from contributingDates)'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['present'], 'Present days')}
                      >
                        {row.present.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['absent'], 'Absent') ? payRegisterContribAccent(['absent']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight contributing absent days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['absent'], 'Absent')}
                      >
                        {row.absent.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['paidLeaves', 'lopLeaves'], 'Total leaves') ? payRegisterContribAccent(['paidLeaves', 'lopLeaves']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click for by-type leave details; highlights paid + LOP days in the grid'}
                        onClick={() => onPayRegisterTotalLeavesClick(row.pr)}
                      >
                        <div className="flex flex-col items-center gap-0.5 leading-tight">
                          <span className="font-semibold">{row.leave.toFixed(1)}</span>
                          {!row.pr.isStub ? (
                            <span
                              className="max-w-[min(140px,100%)] truncate text-[8px] font-normal normal-case text-slate-600 dark:text-slate-400"
                              title={
                                row.leaveBreakdownRows.length > 0
                                  ? `${paidLopSublabel(row.paidLeave, row.lop)} · ${formatLeaveTypeBreakdownPreview(row.leaveBreakdownRows, 12)}`
                                  : `Leave by nature: ${paidLopSublabel(row.paidLeave, row.lop)}`
                              }
                            >
                              {paidLopSublabel(row.paidLeave, row.lop)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`${summaryCellClass} font-medium text-green-600 dark:text-green-400 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['paidLeaves'], 'Paid leaves') ? payRegisterContribAccent(['paidLeaves']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight paid-leave contribution days only'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['paidLeaves'], 'Paid leaves')}
                      >
                        {row.paidLeave.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} font-medium text-red-600 dark:text-red-400 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['lopLeaves'], 'LOP') ? payRegisterContribAccent(['lopLeaves']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight LOP contribution days only'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['lopLeaves'], 'LOP')}
                      >
                        {row.lop.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['ods'], 'OD') ? payRegisterContribAccent(['ods']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight OD days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['ods'], 'OD')}
                      >
                        {row.od.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['otHours'], 'OT hours') ? payRegisterContribAccent(['otHours']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight OT days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['otHours'], 'OT hours')}
                      >
                        {row.ot.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['partial', 'payableShifts'], 'Extra / payable') ? payRegisterContribAccent(['partial', 'payableShifts']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight payable / partial related days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['partial', 'payableShifts'], 'Extra / payable')}
                      >
                        {row.extra.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} font-bold text-amber-600 dark:text-amber-400 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['lateIn', 'earlyOut'], 'Late / early') ? payRegisterContribAccent(['lateIn', 'earlyOut']).summaryRing : ''}`}
                        title={
                          row.pr.isStub
                            ? undefined
                            : `Late in: ${row.pr.totals?.lateCount ?? 0}, Early out: ${row.pr.totals?.earlyOutCount ?? 0}. Click to highlight.`
                        }
                        onClick={() =>
                          !row.pr.isStub && togglePayRegisterContrib(row.pr, ['lateIn', 'earlyOut'], 'Late / early')
                        }
                      >
                        {row.lateCount}
                      </td>
                        <>
                          <td className={`${summaryCellClass} font-semibold text-stone-800 dark:text-stone-200`} style={ledgerBorderStyle}>
                            {Number(row.pr.totalPermissionCount ?? 0).toFixed(0)}
                          </td>
                          <td className={`${summaryCellClass} font-semibold text-rose-700 dark:text-rose-300`} style={ledgerBorderStyle}>
                            {(Number(row.pr.totalPermissionDeductionDays ?? 0)).toFixed(2).replace(/\.?0+$/, '') || '0'}
                          </td>
                        </>
                      <td
                        className={`${summaryCellClass} font-medium text-red-600 dark:text-red-400 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['absent'], 'Absent') ? payRegisterContribAccent(['absent']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Same as Total Absent — shown under deduction days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['absent'], 'Absent')}
                      >
                        {row.absent.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} font-medium text-red-600 dark:text-red-400 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['lopLeaves'], 'LOP') ? payRegisterContribAccent(['lopLeaves']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'LOP leave days — click to highlight LOP days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['lopLeaves'], 'LOP')}
                      >
                        {row.lop.toFixed(1)}
                      </td>
                      <td
                        role="button"
                        tabIndex={0}
                        onClick={(e) => openPayRegisterAttDeductionSplit(e, row.pr)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openPayRegisterAttDeductionSplit(e as unknown as MouseEvent<HTMLTableCellElement>, row.pr);
                          }
                        }}
                        className={`${summaryCellClass} cursor-pointer font-bold text-rose-600 hover:bg-[var(--ps-accent-soft)]/70 hover:underline decoration-rose-400/80 dark:text-rose-400`}
                        style={ledgerBorderStyle}
                        title={
                          row.pr.attendanceDeductionBreakdown
                            ? `Late/early days: ${Number(row.pr.attendanceDeductionBreakdown.lateEarlyDaysDeducted ?? 0).toFixed(2)}, Absent extra: ${Number(row.pr.attendanceDeductionBreakdown.absentExtraDays ?? 0).toFixed(2)} — click for split`
                            : 'Policy attendance deduction days (pay register) — click for split'
                        }
                      >
                        {Number.isFinite(row.attDedDays) ? row.attDedDays.toFixed(2).replace(/\.?0+$/, '') || '0' : '0'}
                      </td>
                      <td
                        className={`${summaryCellClass} ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['weeklyOffs', 'holidays'], 'Week offs & holidays') ? payRegisterContribAccent(['weeklyOffs', 'holidays']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight week offs & holidays'}
                        onClick={() =>
                          !row.pr.isStub && togglePayRegisterContrib(row.pr, ['weeklyOffs', 'holidays'], 'Week offs & holidays')
                        }
                      >
                        {row.holidayAndWeekoffs.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} font-medium text-green-600 dark:text-green-400 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['present'], 'Present days') ? payRegisterContribAccent(['present']).summaryRing : ''}`}
                        title={
                          row.pr.isStub ? undefined : 'Click to highlight present contributions'
                        }
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['present'], 'Present days')}
                      >
                        {row.present.toFixed(1)}
                      </td>
                      <td
                        className={`${summaryCellClass} font-bold text-stone-700 dark:text-stone-300 ${row.pr.isStub ? '' : 'cursor-pointer hover:bg-[var(--ps-accent-soft)]/70'} ${payRegisterContribSelectionActive(contribHighlight, row.pr._id, ['payableShifts'], 'Payable shifts') ? payRegisterContribAccent(['payableShifts']).summaryRing : ''}`}
                        title={row.pr.isStub ? undefined : 'Click to highlight payable shift days'}
                        onClick={() => !row.pr.isStub && togglePayRegisterContrib(row.pr, ['payableShifts'], 'Payable shifts')}
                      >
                        {row.payableShifts.toFixed(1)}
                      </td>
                      <td className={summaryCellClass} style={ledgerBorderStyle}>{row.monthDays}</td>
                      <td
                        className={`${summaryCellClass} font-semibold ${row.matchesMonth
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                          }`}
                        style={ledgerBorderStyle}
                      >
                        {row.countedDays.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
                </table>
              </div>
              {/* Pagination below Summary table */}
              {paginationTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t p-4" style={ledgerBorderStyle}>
                  <button
                    type="button"
                    onClick={() => { setPage(p => Math.max(1, p - 1)); loadPayRegisters(Math.max(1, page - 1), false); }}
                    disabled={page <= 1 || loading}
                    className={`${hdrOutlineBtn} disabled:opacity-50`}
                    style={loansDialogOutlineButtonStyle()}
                  >
                    Previous
                  </button>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Page {page} of {paginationTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setPage(p => Math.min(paginationTotalPages, p + 1)); loadPayRegisters(Math.min(paginationTotalPages, page + 1), false); }}
                    disabled={page >= paginationTotalPages || loading}
                    className={`${hdrOutlineBtn} disabled:opacity-50`}
                    style={loansDialogOutlineButtonStyle()}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          </LoansContentPanel>
        </div>
      )
      }

      {payRegisterExportRow}

      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => scrollPayRegisterTableHorizontally('left')}
          className={`h-9 w-9 ${loansDialogOutlineButtonClass()}`}
          style={loansDialogOutlineButtonStyle()}
          aria-label="Scroll register grid left"
          title="Scroll table left"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => scrollPayRegisterTableHorizontally('right')}
          className={`h-9 w-9 ${loansDialogOutlineButtonClass()}`}
          style={loansDialogOutlineButtonStyle()}
          aria-label="Scroll register grid right"
          title="Scroll table right"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <LoansTabBar
        activeTab={activeTable}
        onChange={(id) => setActiveTable(id as TableType)}
        tabs={[
          { id: 'all', label: 'All', count: countEmployeesForTable('all') },
          { id: 'present', label: 'Present', count: countEmployeesForTable('present') },
          { id: 'absent', label: 'Absent', count: countEmployeesForTable('absent') },
          { id: 'leaves', label: 'Leaves', count: countEmployeesForTable('leaves') },
          { id: 'od', label: 'OD', count: countEmployeesForTable('od') },
          { id: 'ot', label: 'OT', count: countEmployeesForTable('ot') },
          { id: 'extraHours', label: 'Extra hours', count: countEmployeesForTable('extraHours') },
          { id: 'shifts', label: 'Shifts', count: countEmployeesForTable('shifts') },
        ]}
      />

      <LoansContentPanel>
        <div className="border bg-white dark:bg-stone-950" style={{ borderColor: 'var(--ps-accent-border)' }}>
          <div ref={payRegisterTableScrollRef} className="max-h-[min(85vh,900px)] overflow-auto">
            {loading ? (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <th className="sticky left-0 top-0 z-[25] w-[180px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Employee</th>
                    {daysArray.map((day) => (
                      <th key={day} className="border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{parseInt(day.split('-')[2])}</th>
                    ))}
                    <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="mt-1 h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                      </td>
                      {daysArray.map((day) => (
                        <td key={day} className="border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700">
                          <div className="h-6 w-full max-w-[28px] mx-auto rounded bg-slate-200 dark:bg-slate-700" />
                        </td>
                      ))}
                      <td className="border-r-0 border-slate-200 px-2 py-2 text-center dark:border-slate-700">
                        <div className="h-4 w-10 mx-auto rounded bg-slate-200 dark:bg-slate-700" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
                  {activeTable === 'all' ? (
                    <>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                        <th
                          rowSpan={2}
                          className="sticky left-0 top-0 z-[25] w-[180px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Employee
                        </th>
                        {daysArray.map((day) => (
                          <th
                            key={day}
                            rowSpan={2}
                            className={
                              'w-[calc((100%-180px-960px)/' +
                              daysArray.length +
                              ')] border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }
                          >
                            {parseInt(day.split('-')[2])}
                          </th>
                        ))}
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20"
                          title="From monthly attendance summary present days. OD is in the OD column."
                        >
                          Present Days
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700/50"
                        >
                          Week Offs
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-purple-50 dark:bg-purple-900/20"
                        >
                          Holidays
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-yellow-50 dark:bg-yellow-900/20"
                        >
                          Total Leaves
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/20"
                        >
                          OD Days
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50 dark:bg-red-900/20"
                        >
                          Absents
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60"
                          title="Present + week offs + holidays + total leaves + OD days + absents"
                        >
                          Total Days
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-900/20"
                          title="Late in + early out (combined)"
                        >
                          Lates (L+E)
                        </th>
                          <>
                            <th
                              rowSpan={2}
                              className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-cyan-50 dark:bg-cyan-900/20"
                              title="Total permission count from monthly summary"
                            >
                              Perm count
                            </th>
                            <th
                              rowSpan={2}
                              className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-rose-50 dark:bg-rose-900/20"
                              title="Permission deduction days from monthly summary"
                            >
                              Perm ded.
                            </th>
                          </>
                        <th
                          colSpan={3}
                          className="border-b border-r border-slate-200 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-800 dark:border-slate-700 dark:bg-rose-950/30 dark:text-rose-100 bg-rose-100/80 dark:bg-rose-950/40"
                          title="Absent days, LOP leave days, and policy attendance deduction days (late/early + absent extra)"
                        >
                          Deduction days
                        </th>
                        <th
                          rowSpan={2}
                          className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/20"
                          title="Present + OD + week offs + holidays + paid leaves − attendance deduction days"
                        >
                          Paid Days
                        </th>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                        <th
                          className="w-[80px] border-r border-slate-200 px-1 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50/90 dark:bg-red-950/30"
                          title="Calendar absent total (same as Absents column)"
                        >
                          Absent
                        </th>
                        <th
                          className="w-[80px] border-r border-slate-200 px-1 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50/90 dark:bg-red-950/30"
                          title="LOP (loss of pay) leave days"
                        >
                          LOP
                        </th>
                        <th
                          className="w-[80px] border-r border-slate-200 px-1 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-rose-50 dark:bg-rose-900/25"
                          title="Policy attendance deduction days — click row cell for split"
                        >
                          Att. ded.
                        </th>
                      </tr>
                    </>
                  ) : (
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <th className="sticky left-0 top-0 z-[25] w-[180px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Employee
                      </th>
                      {daysArray.map((day) => (
                        <th
                          key={day}
                          className={
                            'w-[calc((100%-180px-' +
                            (activeTable === 'leaves' ? '320px' : '80px') +
                            '/' +
                            daysArray.length +
                            ')] border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }
                        >
                          {parseInt(day.split('-')[2])}
                        </th>
                      ))}
                      {activeTable === 'present' && (
                        <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20">
                          Total Present Days
                        </th>
                      )}
                      {activeTable === 'absent' && (
                        <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50 dark:bg-red-900/20">
                          Total Absent Days
                        </th>
                      )}
                      {activeTable === 'leaves' && (
                        <>
                          <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-yellow-50 dark:bg-yellow-900/20">
                            Total Leaves
                          </th>
                          <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20">
                            Paid Leaves
                          </th>
                          <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50 dark:bg-red-900/20">
                            LOP
                          </th>
                          <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-orange-50 dark:bg-orange-900/20">
                            Without Pay
                          </th>
                        </>
                      )}
                      {activeTable === 'od' && (
                        <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/20">
                          Total OD Days
                        </th>
                      )}
                      {activeTable === 'ot' && (
                        <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-orange-50 dark:bg-orange-900/20">
                          Total OT Hours
                        </th>
                      )}
                      {activeTable === 'extraHours' && (
                        <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-purple-50 dark:bg-purple-900/20">
                          Total Extra Hours
                        </th>
                      )}
                      {activeTable === 'shifts' && (
                        <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-900/20">
                          Total Shifts
                        </th>
                      )}
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {getFilteredPayRegisters().length === 0 ? (
                    <tr>
                      <td colSpan={1 + daysArray.length + (activeTable === 'leaves' ? 4 : activeTable === 'all' ? 14 : 1)} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No records found{activeTable !== 'all' ? ` for ${activeTable === 'shifts' ? 'shifts' : activeTable} table` : ''}
                      </td>
                    </tr>
                  ) : (
                    getFilteredPayRegisters().map((pr) => {
                      const leaveBreakdownForRow = getLeaveTypeBreakdownRowsFromPayRegister(pr);
                      const employee = typeof pr.employeeId === 'object' ? pr.employeeId : null;
                      const employeeId = typeof pr.employeeId === 'object' ? pr.employeeId._id : pr.employeeId;
                      const emp_no = typeof pr.employeeId === 'object' ? pr.employeeId.emp_no : pr.emp_no;
                      const employee_name = typeof pr.employeeId === 'object' ? pr.employeeId.employee_name : '';
                      const designationDaily =
                        employee && typeof employee.designation_id === 'object' && employee.designation_id?.name
                          ? String(employee.designation_id.name)
                          : '';
                      const department = typeof pr.employeeId === 'object' && pr.employeeId.department_id
                        ? (typeof pr.employeeId.department_id === 'object' ? pr.employeeId.department_id.name : '')
                        : '';
                      const leftDateDaily = employee && 'leftDate' in employee ? (employee as any).leftDate : null;
                      const leftDateStrDaily = leftDateDaily ? (typeof leftDateDaily === 'string' ? new Date(leftDateDaily).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '') : '';

                      // Create a map of daily records for quick lookup
                      const dailyRecordsMap = new Map(pr.dailyRecords.map(r => [r.date, r]));

                      const deptId = employee && employee.department_id
                        ? (typeof employee.department_id === 'object' ? employee.department_id._id : employee.department_id)
                        : '';

                      const batchInfo = deptId ? departmentBatchStatus.get(deptId) : null;
                      const batchStatus = batchInfo?.status || 'pending';
                      const hasPermission = deptId ? hasEffectivePermission(deptId, batchInfo || null) : false;

                      const isLocked = batchStatus === 'freeze' || batchStatus === 'complete' || (batchStatus === 'approved' && !hasPermission);
                      const isFrozenOrComplete = ['freeze', 'complete'].includes(batchStatus);

                      return (
                        <tr key={pr._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-semibold truncate flex-1 flex items-center gap-1">
                                  {employee_name}
                                  {leftDateStrDaily && (
                                    <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium" title="Left in this payroll period">(Left {leftDateStrDaily})</span>
                                  )}
                                  {isLocked && (
                                    <span title={`Payroll ${batchStatus}`} className="text-slate-400">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                      </svg>
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {!pr.payrollId ? (
                                    isLocked ? (
                                      batchStatus === 'approved' ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (batchInfo?.batchId) {
                                              setPendingBatchId(batchInfo.batchId);
                                              setShowPermissionModal(true);
                                            } else {
                                              Swal.fire({
                                                icon: 'error',
                                                title: 'Error',
                                                text: 'Batch ID not found',
                                              });
                                            }
                                          }}
                                          className="rounded-md px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:shadow-md bg-amber-500 hover:bg-amber-600"
                                          title="Request permission to recalculate"
                                        >
                                          Permission
                                        </button>
                                      ) : (
                                        <button
                                          disabled
                                          className="rounded-md px-2 py-1 text-[9px] font-semibold text-slate-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 cursor-not-allowed"
                                          title={`Payroll ${batchStatus}`}
                                        >
                                          Locked
                                        </button>
                                      )
                                    ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (employee) handleCalculatePayroll(employee);
                                      }}
                                      className="rounded-md px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:shadow-md bg-amber-500 hover:bg-amber-600"
                                      title="Calculate Payroll"
                                    >
                                      Calculate
                                    </button>
                                    )
                                  ) : (
                                    <Link
                                      href={`${payrollTransactionsBasePath}?employeeId=${employeeId}&month=${monthStr}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded-md px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:shadow-md bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 inline-block"
                                      title="View Payslip"
                                    >
                                      Payslip
                                    </Link>
                                  )}

                                  {!isFrozenOrComplete && (
                                    <div />
                                  )}
                                </div>
                              </div>
                              {designationDaily ? (
                                <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
                                  {designationDaily}
                                </div>
                              ) : null}
                              <div className="text-[9px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 truncate mt-1">
                                <span className="truncate">{emp_no}</span>
                                {pr.summaryLocked && (
                                  <span
                                    className="shrink-0 font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1 py-0"
                                    title="Summary locked — skipped on Sync All unless overridden"
                                  >
                                    Locked
                                  </span>
                                )}
                                {department && <span className="truncate">• {department}</span>}
                              </div>
                            </div>
                          </td>
                          {daysArray.map((day) => {
                            const dateStr = day;
                            const record = dailyRecordsMap.get(dateStr) || null;
                            const shouldShow = shouldShowInTable(record, activeTable);
                            const displayStatus = getStatusDisplay(record);
                            const highlightInfo =
                              contribHighlight?.prId === pr._id ? payRegisterContribMap.get(dateStr) : undefined;
                            const isContribHighlighted = !!highlightInfo;
                            const bgColor = getCellBackgroundColor(record, activeTable);
                            const badgeCategory = contribHighlight ? payRegisterBadgeCategory(contribHighlight.keys) : 'present';
                            const highlightSub =
                              isContribHighlighted && highlightInfo && contribHighlight
                                ? highlightBadgeSubtitle(badgeCategory, highlightInfo.label)
                                : null;

                            return (
                              <td
                                key={day}
                                onClick={() => {
                                  if (employee && !isLocked) {
                                    if (record) {
                                      handleDateClick(employee, dateStr, record);
                                    } else {
                                      // Create empty record for editing if no record exists
                                      const emptyRecord: DailyRecord = {
                                        date: dateStr,
                                        firstHalf: {
                                          status: 'absent',
                                          leaveType: null,
                                          leaveNature: null,
                                          isOD: false,
                                          otHours: 0,
                                          shiftId: null,
                                          remarks: null,
                                        },
                                        secondHalf: {
                                          status: 'absent',
                                          leaveType: null,
                                          leaveNature: null,
                                          isOD: false,
                                          otHours: 0,
                                          shiftId: null,
                                          remarks: null,
                                        },
                                        status: 'absent',
                                        leaveType: null,
                                        leaveNature: null,
                                        isOD: false,
                                        isSplit: false,
                                        shiftId: null,
                                        shiftName: null,
                                        otHours: 0,
                                        remarks: null,
                                      };
                                      handleDateClick(employee, dateStr, emptyRecord);
                                    }
                                  }
                                }}
                                className={`border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700 relative
                                ${employee && !isLocked ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : 'cursor-not-allowed opacity-75 bg-slate-50 dark:bg-slate-800/50'} 
                                ${bgColor}
                                ${isContribHighlighted && payRegisterContribAccentClasses ? payRegisterContribAccentClasses.cellHighlight : ''}`}
                              >
                                {isContribHighlighted && highlightInfo && payRegisterContribAccentClasses && (
                                  <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none px-0.5">
                                    <div
                                      className={`text-white px-1 py-0.5 rounded-md shadow-md flex flex-col items-center justify-center gap-0 leading-none min-w-[1.35rem] max-w-[46px] ${payRegisterContribAccentClasses.badgeBg}`}
                                    >
                                      <span className="text-[9px] font-black tabular-nums tracking-tight">
                                        {formatHighlightContribution(highlightInfo.value)}
                                      </span>
                                      {highlightSub ? (
                                        <span
                                          className={`text-[6px] opacity-95 truncate max-w-[44px] text-center leading-tight ${['leaves', 'paidLeaves', 'lopLeaves'].includes(badgeCategory) ? 'font-semibold normal-case' : 'font-bold uppercase'}`}
                                          title={highlightSub}
                                        >
                                          {highlightSub}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                )}
                                {shouldShow && record ? (
                                  <div className="space-y-0.5">
                                    {activeTable === 'shifts' ? (
                                      <>
                                        {record.shiftName ? (
                                          <div className="font-semibold text-[9px] text-indigo-700 dark:text-indigo-300" title={record.shiftName}>
                                            {record.shiftName.length > 8 ? record.shiftName.substring(0, 8) + '...' : record.shiftName}
                                          </div>
                                        ) : (
                                          <div className="font-semibold text-[9px] text-slate-500">-</div>
                                        )}
                                        {record.isSplit && (
                                          <div className="text-[7px] opacity-75 text-slate-500">
                                            {record.firstHalf.shiftId ? '1st' : ''}
                                            {record.firstHalf.shiftId && record.secondHalf.shiftId ? '/' : ''}
                                            {record.secondHalf.shiftId ? '2nd' : ''}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div className="font-semibold text-[9px]">{displayStatus}</div>
                                        {record.isSplit && (
                                          <div className="text-[8px] opacity-75">
                                            {formatHalfSplitCell(record)}
                                          </div>
                                        )}
                                        {activeTable === 'all' && (record.isLate || record.isEarlyOut) && (
                                          <div className="text-[7px] font-medium text-amber-600 dark:text-amber-400 mt-0.5" title={[record.isLate && 'Late', record.isEarlyOut && 'Early out'].filter(Boolean).join(', ')}>
                                            {record.isLate && 'L'}
                                            {record.isLate && record.isEarlyOut && ' '}
                                            {record.isEarlyOut && 'E'}
                                          </div>
                                        )}
                                        {record.otHours > 0 && (activeTable === 'ot' || activeTable === 'extraHours' || activeTable === 'all') && (
                                          <div className="text-[8px] font-semibold text-blue-600 dark:text-blue-300">{record.otHours}h</div>
                                        )}
                                        {record.shiftName && activeTable === 'all' && (
                                          <div className="text-[8px] opacity-75 truncate" title={record.shiftName}>{record.shiftName.substring(0, 3)}</div>
                                        )}
                                      </>
                                    )}
                                    {record.isManuallyEdited && (
                                      <div className="text-[7px] text-indigo-600 dark:text-indigo-400" title="Manually Edited">✎</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[9px]">-</span>
                                )}
                              </td>
                            );
                          })}
                          {/* Dynamic columns based on active tab */}
                          {activeTable === 'all' && (() => {
                            const present = pr.totals?.totalPresentDays ?? 0;
                            const weekOffs = pr.totals?.totalWeeklyOffs ?? 0;
                            const holidays = pr.totals?.totalHolidays ?? 0;
                            const totalLeaves = getLeaveTotal(pr.totals);
                            const od = pr.totals?.totalODDays ?? 0;
                            const absent = pr.totals?.totalAbsentDays ?? 0;
                            const paidLeaves = pr.totals?.totalPaidLeaveDays ?? 0;
                            const lopDays = pr.totals?.totalLopDays ?? 0;
                            const attDed = getAttendanceDeductionDaysNumber(pr);
                            const totalDaysSummed = present + weekOffs + holidays + totalLeaves + od + absent;
                            const paidDays = Math.max(0, present + od + weekOffs + holidays + paidLeaves - attDed);
                            return (
                              <>
                                <td
                                  className={`border-r border-slate-200 bg-green-50 dark:bg-green-900/20 px-2 py-2 text-center text-[11px] font-bold text-green-700 dark:text-green-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['present'], 'Present days') ? payRegisterContribAccent(['present']).summaryRing : ''}`}
                                  title="Matches monthly summary present days. Click to highlight."
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['present'], 'Present days')}
                                >
                                  {present.toFixed(1)}
                                </td>
                                {/*
                                <td
                                  className={`border-r border-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center text-[11px] font-bold text-slate-700 dark:text-slate-300 dark:bg-slate-700/50 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['payableShifts'], 'Payable shifts') ? payRegisterContribAccent(['payableShifts']).summaryRing : ''}`}
                                  title="Click to highlight payable shifts"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['payableShifts'], 'Payable shifts')}
                                >
                                  {(pr.totals?.totalPayableShifts ?? 0).toFixed(1)}
                                </td>
                                */}
                                <td
                                  className={`border-r border-slate-200 bg-gray-50 dark:bg-slate-700/50 px-2 py-2 text-center text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['weeklyOffs'], 'Week offs') ? payRegisterContribAccent(['weeklyOffs']).summaryRing : ''}`}
                                  title="Click to highlight week offs"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['weeklyOffs'], 'Week offs')}
                                >
                                  {weekOffs.toFixed(1)}
                                </td>
                                <td
                                  className={`border-r border-slate-200 bg-purple-50 dark:bg-purple-900/20 px-2 py-2 text-center text-[11px] font-bold text-purple-700 dark:text-purple-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['holidays'], 'Holidays') ? payRegisterContribAccent(['holidays']).summaryRing : ''}`}
                                  title="Click to highlight holidays"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['holidays'], 'Holidays')}
                                >
                                  {holidays.toFixed(1)}
                                </td>
                                <td
                                  className={`border-r border-slate-200 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-2 text-center text-[11px] font-bold text-yellow-800 dark:text-yellow-200 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['paidLeaves', 'lopLeaves'], 'Total leaves') ? payRegisterContribAccent(['paidLeaves', 'lopLeaves']).summaryRing : ''}`}
                                  title="Click for by-type leave details; highlights paid + LOP days in the grid"
                                  onClick={() => onPayRegisterTotalLeavesClick(pr)}
                                >
                                  <div className="flex flex-col items-center gap-0.5 leading-tight">
                                    <span>{totalLeaves.toFixed(1)}</span>
                                    {!pr.isStub ? (
                                      <span
                                        className="max-w-[72px] truncate text-[8px] font-semibold normal-case text-yellow-900/90 dark:text-yellow-200/90"
                                        title={
                                          leaveBreakdownForRow.length > 0
                                            ? `${paidLopSublabel(paidLeaves, lopDays)} · ${formatLeaveTypeBreakdownPreview(leaveBreakdownForRow, 12)}`
                                            : `Leave by nature: ${paidLopSublabel(paidLeaves, lopDays)}`
                                        }
                                      >
                                        {paidLopSublabel(paidLeaves, lopDays)}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td
                                  className={`border-r border-slate-200 bg-blue-50 dark:bg-blue-900/20 px-2 py-2 text-center text-[11px] font-bold text-blue-700 dark:text-blue-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['ods'], 'OD') ? payRegisterContribAccent(['ods']).summaryRing : ''}`}
                                  title="Click to highlight OD days"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['ods'], 'OD')}
                                >
                                  {od.toFixed(1)}
                                </td>
                                <td
                                  className={`border-r border-slate-200 bg-red-50 dark:bg-red-900/20 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:text-red-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['absent'], 'Absent') ? payRegisterContribAccent(['absent']).summaryRing : ''}`}
                                  title="Click to highlight absent days"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['absent'], 'Absent')}
                                >
                                  {absent.toFixed(1)}
                                </td>
                                <td
                                  className="border-r border-slate-200 bg-slate-100 px-2 py-2 text-center text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                                  title="Present + week offs + holidays + total leaves + OD days + absents (informational)"
                                >
                                  {totalDaysSummed.toFixed(1)}
                                </td>
                                <td
                                  className={`border-r border-slate-200 bg-amber-50 dark:bg-amber-900/20 px-2 py-2 text-center text-[11px] font-bold text-amber-700 dark:text-amber-300 cursor-pointer hover:opacity-90 ${
                                    payRegisterContribSelectionActive(contribHighlight, pr._id, ['lateIn', 'earlyOut'], 'Late / early')
                                      ? payRegisterContribAccent(['lateIn', 'earlyOut']).summaryRing
                                      : ''
                                  }`}
                                  title={`Late: ${pr.totals?.lateCount ?? 0}, Early out: ${pr.totals?.earlyOutCount ?? 0} — click to highlight`}
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['lateIn', 'earlyOut'], 'Late / early')}
                                >
                                  {getLateAndEarlyCount(pr.totals)}
                                </td>
                                  <>
                                    <td
                                      className="border-r border-slate-200 bg-cyan-50 dark:bg-cyan-900/20 px-2 py-2 text-center text-[11px] font-bold text-cyan-700 dark:text-cyan-300"
                                      title="Total permission count from monthly summary"
                                    >
                                      {Number(pr.totalPermissionCount ?? 0).toFixed(0)}
                                    </td>
                                    <td
                                      className="border-r border-slate-200 bg-rose-50 dark:bg-rose-900/20 px-2 py-2 text-center text-[11px] font-bold text-rose-700 dark:text-rose-300"
                                      title="Permission deduction days from monthly summary"
                                    >
                                      {(Number(pr.totalPermissionDeductionDays ?? 0)).toFixed(2).replace(/\.?0+$/, '') || '0'}
                                    </td>
                                  </>
                                <td
                                  className={`border-r border-slate-200 bg-red-50/80 dark:bg-red-950/25 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:text-red-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['absent'], 'Absent') ? payRegisterContribAccent(['absent']).summaryRing : ''}`}
                                  title="Same total as Absents column — click to highlight absent days"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['absent'], 'Absent')}
                                >
                                  {absent.toFixed(1)}
                                </td>
                                <td
                                  className={`border-r border-slate-200 bg-red-50/80 dark:bg-red-950/25 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:text-red-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['lopLeaves'], 'LOP') ? payRegisterContribAccent(['lopLeaves']).summaryRing : ''}`}
                                  title="LOP leave days — click to highlight LOP days in the grid"
                                  onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['lopLeaves'], 'LOP')}
                                >
                                  {lopDays.toFixed(1)}
                                </td>
                                <td
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => openPayRegisterAttDeductionSplit(e, pr)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      openPayRegisterAttDeductionSplit(e as unknown as MouseEvent<HTMLTableCellElement>, pr);
                                    }
                                  }}
                                  className="border-r border-slate-200 bg-rose-50 dark:bg-rose-900/20 px-2 py-2 text-center text-[11px] font-bold text-rose-700 dark:text-rose-300 cursor-pointer hover:underline decoration-rose-600/70"
                                  title={
                                    pr.attendanceDeductionBreakdown
                                      ? `Late/early deduction days: ${Number(pr.attendanceDeductionBreakdown.lateEarlyDaysDeducted ?? 0).toFixed(2)}, Absent extra: ${Number(pr.attendanceDeductionBreakdown.absentExtraDays ?? 0).toFixed(2)} — click for split`
                                      : 'Policy attendance deduction days — click for split'
                                  }
                                >
                                  {formatAttDeductionDays(pr)}
                                </td>
                                <td
                                  className={`border-r-0 border-slate-200 bg-blue-50 dark:bg-blue-900/20 px-2 py-2 text-center text-[11px] font-bold text-blue-700 dark:text-blue-300 cursor-pointer hover:opacity-90 ${payRegisterContribSelectionActive(
                                    contribHighlight,
                                    pr._id,
                                    ['present', 'ods', 'weeklyOffs', 'holidays', 'paidLeaves'],
                                    'Paid days components'
                                  )
                                    ? payRegisterContribAccent(['present', 'ods', 'weeklyOffs', 'holidays', 'paidLeaves']).summaryRing
                                    : ''}`}
                                  title="Present + OD + week offs + holidays + paid leaves − attendance deduction — click to highlight contributing days"
                                  onClick={() =>
                                    !pr.isStub &&
                                    togglePayRegisterContrib(pr, ['present', 'ods', 'weeklyOffs', 'holidays', 'paidLeaves'], 'Paid days components')
                                  }
                                >
                                  {paidDays.toFixed(1)}
                                </td>
                              </>
                            );
                          })()}
                          {activeTable === 'present' && (
                            <td className="border-r-0 border-slate-200 bg-green-50 px-2 py-2 text-center text-[11px] font-bold text-green-700 dark:border-slate-700 dark:bg-green-900/20 dark:text-green-300">
                              {pr.totals.totalPresentDays.toFixed(1)}
                            </td>
                          )}
                          {activeTable === 'absent' && (
                            <td className="border-r-0 border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:border-slate-700 dark:bg-red-900/20 dark:text-red-300">
                              {pr.totals.totalAbsentDays.toFixed(1)}
                            </td>
                          )}
                          {activeTable === 'leaves' && (
                            <>
                              <td
                                className={`border-r border-slate-200 bg-yellow-50 px-2 py-2 text-center text-[11px] font-bold text-yellow-700 dark:border-slate-700 dark:bg-yellow-900/20 dark:text-yellow-300 ${!pr.isStub ? 'cursor-pointer hover:opacity-90' : ''} ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['paidLeaves', 'lopLeaves'], 'Total leaves') ? payRegisterContribAccent(['paidLeaves', 'lopLeaves']).summaryRing : ''}`}
                                title={pr.isStub ? undefined : 'Click for by-type leave details; highlights paid + LOP days in the grid'}
                                onClick={() => onPayRegisterTotalLeavesClick(pr)}
                              >
                                <div className="flex flex-col items-center gap-0.5 leading-tight">
                                  <span>{pr.totals.totalLeaveDays.toFixed(1)}</span>
                                  {!pr.isStub ? (
                                    <span
                                      className="max-w-[72px] truncate text-[8px] font-semibold normal-case text-yellow-900 dark:text-yellow-200"
                                      title={
                                        leaveBreakdownForRow.length > 0
                                          ? `${paidLopSublabel(pr.totals.totalPaidLeaveDays ?? 0, pr.totals.totalLopDays ?? 0)} · ${formatLeaveTypeBreakdownPreview(leaveBreakdownForRow, 12)}`
                                          : `Leave by nature: ${paidLopSublabel(pr.totals.totalPaidLeaveDays ?? 0, pr.totals.totalLopDays ?? 0)}`
                                      }
                                    >
                                      {paidLopSublabel(pr.totals.totalPaidLeaveDays ?? 0, pr.totals.totalLopDays ?? 0)}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td
                                className={`border-r border-slate-200 bg-green-50 px-2 py-2 text-center text-[11px] font-bold text-green-700 dark:border-slate-700 dark:bg-green-900/20 dark:text-green-300 ${!pr.isStub ? 'cursor-pointer hover:opacity-90' : ''} ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['paidLeaves'], 'Paid leaves') ? payRegisterContribAccent(['paidLeaves']).summaryRing : ''}`}
                                title={pr.isStub ? undefined : 'Click to highlight paid-leave days only'}
                                onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['paidLeaves'], 'Paid leaves')}
                              >
                                {pr.totals.totalPaidLeaveDays.toFixed(1)}
                              </td>
                              <td
                                className={`border-r border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:border-slate-700 dark:bg-red-900/20 dark:text-red-300 ${!pr.isStub ? 'cursor-pointer hover:opacity-90' : ''} ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['lopLeaves'], 'LOP') ? payRegisterContribAccent(['lopLeaves']).summaryRing : ''}`}
                                title={pr.isStub ? undefined : 'Click to highlight LOP days only'}
                                onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['lopLeaves'], 'LOP')}
                              >
                                {pr.totals.totalLopDays.toFixed(1)}
                              </td>
                              <td
                                className={`border-r-0 border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300 ${!pr.isStub ? 'cursor-pointer hover:opacity-90' : ''} ${payRegisterContribSelectionActive(contribHighlight, pr._id, ['lopLeaves'], 'Without pay') ? payRegisterContribAccent(['lopLeaves']).summaryRing : ''}`}
                                title={pr.isStub ? undefined : 'Click to highlight unpaid / LOP-style leave days (same map as LOP when synced from summary)'}
                                onClick={() => !pr.isStub && togglePayRegisterContrib(pr, ['lopLeaves'], 'Without pay')}
                              >
                                {pr.totals.totalUnpaidLeaveDays.toFixed(1)}
                              </td>
                            </>
                          )}
                          {activeTable === 'od' && (
                            <td className="border-r-0 border-slate-200 bg-blue-50 px-2 py-2 text-center text-[11px] font-bold text-blue-700 dark:border-slate-700 dark:bg-blue-900/20 dark:text-blue-300">
                              {pr.totals.totalODDays.toFixed(1)}
                            </td>
                          )}
                          {activeTable === 'ot' && (
                            <td className="border-r-0 border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300">
                              {pr.totals.totalOTHours.toFixed(1)}
                            </td>
                          )}
                          {activeTable === 'extraHours' && (
                            <td className="border-r-0 border-slate-200 bg-purple-50 px-2 py-2 text-center text-[11px] font-bold text-purple-700 dark:border-slate-700 dark:bg-purple-900/20 dark:text-purple-300">
                              {pr.totals.totalOTHours.toFixed(1)}
                            </td>
                          )}
                          {activeTable === 'shifts' && (
                            <td className="border-r-0 border-slate-200 bg-indigo-50 px-2 py-2 text-center text-[11px] font-bold text-indigo-700 dark:border-slate-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                              {pr.dailyRecords.filter(r => r.shiftId !== null || r.shiftName !== null || r.firstHalf.shiftId !== null || r.secondHalf.shiftId !== null).length}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
            {/* Pagination below grid table */}
            {!loading && paginationTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => { setPage(p => Math.max(1, p - 1)); loadPayRegisters(Math.max(1, page - 1), false); }}
                  disabled={page <= 1 || loading}
                  className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Page {page} of {paginationTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => { setPage(p => Math.min(paginationTotalPages, p + 1)); loadPayRegisters(Math.min(paginationTotalPages, page + 1), false); }}
                  disabled={page >= paginationTotalPages || loading}
                  className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
        </div>
      </LoansContentPanel>

      <LoanDetailDialog
        open={showEditModal && !!editingRecord}
        onClose={() => {
          setShowEditModal(false);
          setIsHalfDayMode(false);
        }}
        maxWidth="max-w-4xl"
      >
        {editingRecord && (
          <>
            <LoanDetailDialogHeader
              badge="Daily record"
              title={`Edit ${editingRecord.date}`}
              subtitle={editingRecord.employee.employee_name}
              onClose={() => {
                setShowEditModal(false);
                setIsHalfDayMode(false);
              }}
            />
            <LoanDetailDialogBody>
              <div className="max-h-[70vh] overflow-y-auto space-y-6">

                <div className="space-y-6">
                  {/* Half-Day Mode Toggle */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isHalfDayMode}
                        onChange={(e) => {
                          setIsHalfDayMode(e.target.checked);
                          if (!e.target.checked) {
                            // When disabling half-day mode, sync both halves to the same status
                            const currentStatus = editData.status || editData.firstHalf?.status || 'absent';
                            setEditData({
                              ...editData,
                              status: currentStatus,
                              firstHalf: normalizeHalfDay(editData.firstHalf, currentStatus as any),
                              secondHalf: normalizeHalfDay(editData.secondHalf, currentStatus as any),
                              isSplit: false,
                            });
                          } else {
                            setEditData({
                              ...editData,
                              isSplit: true,
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Enable Half-Day Mode
                      </span>
                    </label>
                    {isHalfDayMode && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        (Edit first and second half separately)
                      </span>
                    )}
                  </div>

                  {/* First Half - Only show if half-day mode is enabled */}
                  {isHalfDayMode && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-white">First Half</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Status
                          </label>
                          <select
                            value={editData.firstHalf?.status || 'absent'}
                            onChange={(e) => setEditData({
                              ...editData,
                              firstHalf: {
                                ...editData.firstHalf!,
                                status: e.target.value as any,
                                leaveType: e.target.value === 'leave' ? (editData.firstHalf?.leaveType || null) : null,
                                leaveNature: e.target.value === 'leave' ? (editData.firstHalf?.leaveNature || null) : null,
                                isOD: e.target.value === 'od',
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          >
                            <option value="present">Present</option>
                            <option value="absent">Absent</option>
                            <option value="leave">Leave</option>
                            <option value="od">OD</option>
                            <option value="holiday">Holiday</option>
                            <option value="week_off">Week Off</option>
                          </select>
                        </div>
                        {editData.firstHalf?.status === 'leave' && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Leave Type
                              </label>
                              <select
                                value={editData.firstHalf?.leaveType || ''}
                                onChange={(e) => {
                                  const code = e.target.value ? e.target.value : null;
                                  const nat = resolveLeaveNatureFromLeaveTypeCode(code, leaveTypes);
                                  setEditData({
                                    ...editData,
                                    firstHalf: {
                                      ...editData.firstHalf!,
                                      leaveType: code,
                                      leaveNature: nat,
                                    },
                                  });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                              >
                                <option value="">Select Leave Type</option>
                                {leaveTypes.map((lt) => (
                                  <option key={lt.code} value={lt.code}>
                                    {lt.name} ({lt.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Leave Nature <span className="font-normal text-slate-500">(from leave type)</span>
                              </label>
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={leaveNatureDisplayLabel(
                                  resolveLeaveNatureFromLeaveTypeCode(
                                    editData.firstHalf?.leaveType,
                                    leaveTypes
                                  )
                                )}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-600/40 text-slate-800 dark:text-slate-100 cursor-not-allowed"
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            OT Hours
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={editData.firstHalf?.otHours || 0}
                            onChange={(e) => setEditData({
                              ...editData,
                              firstHalf: {
                                ...editData.firstHalf!,
                                otHours: parseFloat(e.target.value) || 0,
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Second Half - Only show if half-day mode is enabled */}
                  {isHalfDayMode && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-white">Second Half</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Status
                          </label>
                          <select
                            value={editData.secondHalf?.status || 'absent'}
                            onChange={(e) => setEditData({
                              ...editData,
                              secondHalf: {
                                ...editData.secondHalf!,
                                status: e.target.value as any,
                                leaveType: e.target.value === 'leave' ? (editData.secondHalf?.leaveType || null) : null,
                                leaveNature: e.target.value === 'leave' ? (editData.secondHalf?.leaveNature || null) : null,
                                isOD: e.target.value === 'od',
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          >
                            <option value="present">Present</option>
                            <option value="absent">Absent</option>
                            <option value="leave">Leave</option>
                            <option value="od">OD</option>
                            <option value="holiday">Holiday</option>
                            <option value="week_off">Week Off</option>
                          </select>
                        </div>
                        {editData.secondHalf?.status === 'leave' && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Leave Type
                              </label>
                              <select
                                value={editData.secondHalf?.leaveType || ''}
                                onChange={(e) => {
                                  const code = e.target.value ? e.target.value : null;
                                  const nat = resolveLeaveNatureFromLeaveTypeCode(code, leaveTypes);
                                  setEditData({
                                    ...editData,
                                    secondHalf: {
                                      ...editData.secondHalf!,
                                      leaveType: code,
                                      leaveNature: nat,
                                    },
                                  });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                              >
                                <option value="">Select Leave Type</option>
                                {leaveTypes.map((lt) => (
                                  <option key={lt.code} value={lt.code}>
                                    {lt.name} ({lt.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Leave Nature <span className="font-normal text-slate-500">(from leave type)</span>
                              </label>
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={leaveNatureDisplayLabel(
                                  resolveLeaveNatureFromLeaveTypeCode(
                                    editData.secondHalf?.leaveType,
                                    leaveTypes
                                  )
                                )}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-600/40 text-slate-800 dark:text-slate-100 cursor-not-allowed"
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            OT Hours
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={editData.secondHalf?.otHours || 0}
                            onChange={(e) => setEditData({
                              ...editData,
                              secondHalf: {
                                ...editData.secondHalf!,
                                otHours: parseFloat(e.target.value) || 0,
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Full Day Fields - Show when NOT in half-day mode OR for specific tabs */}
                  {!isHalfDayMode && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-white">
                        {activeTable === 'all' ? 'Day Status' :
                          activeTable === 'present' ? 'Present Status' :
                            activeTable === 'absent' ? 'Absent Status' :
                              activeTable === 'leaves' ? 'Leave Details' :
                                activeTable === 'od' ? 'OD Details' :
                                  activeTable === 'ot' || activeTable === 'extraHours' ? 'OT Hours' :
                                    'Full Day'}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(activeTable === 'all' || activeTable === 'present' || activeTable === 'absent' || activeTable === 'leaves' || activeTable === 'od') && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Status
                            </label>
                            <select
                              value={editData.status || 'absent'}
                              onChange={(e) => {
                                const newStatus = e.target.value as any;
                                setEditData({
                                  ...editData,
                                  status: newStatus,
                                  firstHalf: {
                                    ...editData.firstHalf!,
                                    status: newStatus,
                                    leaveType: newStatus === 'leave' ? (editData.firstHalf?.leaveType || null) : null,
                                    leaveNature: newStatus === 'leave' ? (editData.firstHalf?.leaveNature || null) : null,
                                    isOD: newStatus === 'od',
                                  },
                                  secondHalf: {
                                    ...editData.secondHalf!,
                                    status: newStatus,
                                    leaveType: newStatus === 'leave' ? (editData.secondHalf?.leaveType || null) : null,
                                    leaveNature: newStatus === 'leave' ? (editData.secondHalf?.leaveNature || null) : null,
                                    isOD: newStatus === 'od',
                                  },
                                  leaveType: newStatus === 'leave' ? (editData.leaveType || null) : null,
                                  leaveNature: newStatus === 'leave' ? (editData.leaveNature || null) : null,
                                  isOD: newStatus === 'od',
                                  isSplit: false,
                                });
                              }}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                            >
                              <option value="present">Present</option>
                              <option value="absent">Absent</option>
                              <option value="leave">Leave</option>
                              <option value="od">OD</option>
                              <option value="holiday">Holiday</option>
                              <option value="week_off">Week Off</option>
                            </select>
                          </div>
                        )}
                        {editData.status === 'leave' && (activeTable === 'leaves' || !isHalfDayMode) && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Leave Type
                              </label>
                              <select
                                value={editData.leaveType || ''}
                                onChange={(e) => {
                                  const code = e.target.value ? e.target.value : null;
                                  const nat = resolveLeaveNatureFromLeaveTypeCode(code, leaveTypes);
                                  setEditData({
                                    ...editData,
                                    leaveType: code,
                                    leaveNature: nat,
                                    firstHalf: {
                                      ...editData.firstHalf!,
                                      leaveType: code,
                                      leaveNature: nat,
                                    },
                                    secondHalf: {
                                      ...editData.secondHalf!,
                                      leaveType: code,
                                      leaveNature: nat,
                                    },
                                  });
                                }}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                              >
                                <option value="">Select Leave Type</option>
                                {leaveTypes.map((lt) => (
                                  <option key={lt.code} value={lt.code}>
                                    {lt.name} ({lt.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Leave Nature <span className="font-normal text-slate-500">(from leave type)</span>
                              </label>
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={leaveNatureDisplayLabel(
                                  resolveLeaveNatureFromLeaveTypeCode(editData.leaveType, leaveTypes)
                                )}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-600/40 text-slate-800 dark:text-slate-100 cursor-not-allowed"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {payRegisterDayShowsShiftPicker(editData, isHalfDayMode) && (
                    <PayRegisterShiftField
                      shifts={shifts}
                      isMultiShiftMode={isMultiShiftMode}
                      showShiftPicker
                      value={{
                        shiftId: editData.shiftId || null,
                        shiftIds: editData.shiftIds || [],
                        shiftSelections:
                          editData.shiftSelections ||
                          (editData.shiftIds || []).map((id) => ({ shiftId: id, isHalf: false })),
                        shiftName: editData.shiftName || null,
                        payableShifts: editData.payableShifts ?? 1,
                      }}
                      onChange={(next) =>
                        setEditData({
                          ...editData,
                          ...next,
                          firstHalf: {
                            ...editData.firstHalf!,
                            shiftId: next.shiftId,
                          },
                          secondHalf: {
                            ...editData.secondHalf!,
                            shiftId: next.shiftId,
                          },
                        })
                      }
                    />
                  )}

                  {/* Full Day OT Hours - Show for OT/Extra Hours tabs or when not in half-day mode */}
                  {(activeTable === 'ot' || activeTable === 'extraHours' || !isHalfDayMode) && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {isHalfDayMode ? 'Total OT Hours (First + Second Half)' : 'Total OT Hours (Full Day)'}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editData.otHours || 0}
                        onChange={(e) => {
                          const otValue = parseFloat(e.target.value) || 0;
                          if (isHalfDayMode) {
                            // Distribute OT hours equally between halves
                            setEditData({
                              ...editData,
                              otHours: otValue,
                              firstHalf: {
                                ...editData.firstHalf!,
                                otHours: otValue / 2,
                              },
                              secondHalf: {
                                ...editData.secondHalf!,
                                otHours: otValue / 2,
                              },
                            });
                          } else {
                            setEditData({
                              ...editData,
                              otHours: otValue,
                              firstHalf: {
                                ...editData.firstHalf!,
                                otHours: otValue,
                              },
                              secondHalf: {
                                ...editData.secondHalf!,
                                otHours: otValue,
                              },
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                      />
                    </div>
                  )}

                  {/* Exceptions Overrides */}
                  <div className="flex flex-wrap gap-6 p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/20">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isLate"
                        checked={editData.isLate || false}
                        onChange={(e) => setEditData({ ...editData, isLate: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="isLate" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        Late In
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isEarlyOut"
                        checked={editData.isEarlyOut || false}
                        onChange={(e) => setEditData({ ...editData, isEarlyOut: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="isEarlyOut" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        Early Out
                      </label>
                    </div>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Remarks
                    </label>
                    <textarea
                      value={editData.remarks || ''}
                      onChange={(e) => setEditData({
                        ...editData,
                        remarks: e.target.value,
                      })}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                </div>

              </div>
              <LoanDialogFooter
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingRecord(null);
                  setIsHalfDayMode(false);
                }}
                submitLabel={saving[editingRecord.employeeId] ? 'Saving…' : 'Save'}
                onSubmit={handleSaveDate}
                loading={!!saving[editingRecord.employeeId]}
                submitDisabled={!!saving[editingRecord.employeeId]}
              />
            </LoanDetailDialogBody>
          </>
        )}
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!leaveTypeBreakdownModal}
        onClose={() => setLeaveTypeBreakdownModal(null)}
        maxWidth="max-w-md"
      >
        {leaveTypeBreakdownModal && (
          <>
            <LoanDetailDialogHeader
              badge="Leave breakdown"
              title="Total leaves by type"
              subtitle={leaveTypeBreakdownModal.employeeName}
              onClose={() => setLeaveTypeBreakdownModal(null)}
            />
            <LoanDetailDialogBody>
            {(() => {
              const sumByType = leaveTypeBreakdownModal.rows.reduce((s, r) => s + r.days, 0);
              const drift = Math.abs(sumByType - leaveTypeBreakdownModal.totalFromTotals);
              return (
                <>
                  {leaveTypeBreakdownModal.rows.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No leave rows found on the daily grid for this month.</p>
                  ) : (
                    <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
                          <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-800">
                            <th className="px-2 py-2 font-semibold text-slate-700 dark:text-slate-300">Leave type</th>
                            <th className="px-2 py-2 font-semibold text-slate-700 dark:text-slate-300">Bucket</th>
                            <th className="px-2 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">Days</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {leaveTypeBreakdownModal.rows.map((r, i) => (
                            <tr key={`${r.kind}-${r.leaveTypeLabel}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-2 py-1.5 font-medium text-slate-900 dark:text-slate-100">{r.leaveTypeLabel}</td>
                              <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">
                                {r.kind === 'lop' ? 'LOP / unpaid' : 'Paid'}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                                {r.days.toFixed(1).replace(/\.?0+$/, '')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/80">
                            <td colSpan={2} className="px-2 py-2 font-semibold text-slate-700 dark:text-slate-300">
                              Sum (daily grid)
                            </td>
                            <td className="px-2 py-2 text-right font-bold text-slate-900 dark:text-slate-100">
                              {sumByType.toFixed(1).replace(/\.?0+$/, '')}
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={2} className="px-2 py-1.5 text-slate-600 dark:text-slate-400">
                              Stored monthly total
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                              {leaveTypeBreakdownModal.totalFromTotals.toFixed(1).replace(/\.?0+$/, '')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                  {drift > 0.051 ? (
                    <p className="mt-2 text-[10px] leading-snug text-amber-800 dark:text-amber-300">
                      The sum from the daily grid can differ slightly from the stored monthly total when policy caps, split days, or sync rounding apply.
                    </p>
                  ) : null}
                </>
              );
            })()}
            </LoanDetailDialogBody>
          </>
        )}
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!attendanceDeductionInfo}
        onClose={() => setAttendanceDeductionInfo(null)}
        maxWidth="max-w-sm"
      >
        {attendanceDeductionInfo && (
          <>
            <LoanDetailDialogHeader
              badge="Attendance"
              title="Deduction split"
              subtitle={attendanceDeductionInfo.employeeName}
              onClose={() => setAttendanceDeductionInfo(null)}
            />
            <LoanDetailDialogBody>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-stone-600 dark:text-stone-300">Late/early deduction days</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                    {attendanceDeductionInfo.lateEarlyDays.toFixed(2).replace(/\.?0+$/, '') || '0'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-600 dark:text-stone-300">Absent extra deduction days</span>
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    {attendanceDeductionInfo.absentExtraDays.toFixed(2).replace(/\.?0+$/, '') || '0'}
                  </span>
                </div>
                <div
                  className="mt-2 flex items-center justify-between border-t pt-2"
                  style={{ borderColor: 'var(--ps-accent-border)' }}
                >
                  <span className="font-semibold text-stone-800 dark:text-stone-200">Total deduction days</span>
                  <span className="font-bold" style={{ color: 'var(--ps-accent-ink)' }}>
                    {attendanceDeductionInfo.total.toFixed(2).replace(/\.?0+$/, '') || '0'}
                  </span>
                </div>
              </div>
            </LoanDetailDialogBody>
          </>
        )}
      </LoanDetailDialog>

      <LoanDetailSection className="mt-8">
        <LoanDetailSectionTitle>Arrears for payroll</LoanDetailSectionTitle>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
          Approved arrears not fully settled. Adjust amounts to include in this month&apos;s payroll.
        </p>
        <ArrearsPayrollSection
          month={month}
          year={year}
          divisionId={selectedDivision || undefined}
          departmentId={selectedDepartment || undefined}
          onArrearsSelected={handleArrearsSelected}
        />
      </LoanDetailSection>

      <LoanDetailSection className="mt-6">
        <LoanDetailSectionTitle>Manual deductions for payroll</LoanDetailSectionTitle>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
          Approved manual deductions to deduct from net pay this month.
        </p>
        <DeductionsPayrollSection
          month={monthStr}
          year={year}
          divisionId={selectedDivision || undefined}
          departmentId={selectedDepartment || undefined}
          onDeductionsSelected={handleDeductionsSelected}
        />
      </LoanDetailSection>

      <LoanDetailDialog
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        maxWidth="max-w-lg"
      >
        <LoanDetailDialogHeader
          badge="Bulk upload"
          title="Summary Excel"
          onClose={() => setShowUploadModal(false)}
        />
        <LoanDetailDialogBody>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Download the summary for your current filters, edit offline, then upload it back.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <button
              type="button"
              onClick={handleDownloadSummary}
              className={`flex flex-col items-center justify-center border border-dashed p-6 transition hover:opacity-95 ${loansDialogOutlineButtonClass()}`}
              style={loansDialogOutlineButtonStyle()}
            >
              <span className="font-semibold">Download summary Excel</span>
              <span className="mt-1 text-xs text-stone-500">Based on current filters</span>
            </button>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center border border-dashed p-6 transition hover:opacity-95 ${loansDialogOutlineButtonClass()}`}
              style={loansDialogOutlineButtonStyle()}
            >
              <input
                type="file"
                className="hidden"
                accept=".xlsx, .xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadSummaryFile(file);
                }}
                disabled={uploadingSummary}
              />
              <span className="font-semibold">
                {uploadingSummary ? 'Uploading…' : 'Upload summary Excel'}
              </span>
              <span className="mt-1 text-xs text-stone-500">.xlsx or .xls only</span>
            </label>
          </div>
        </LoanDetailDialogBody>
      </LoanDetailDialog>
      <PayRegisterSyncProgressOverlay
        visible={
          syncing &&
          syncProgress != null &&
          syncProgress.phase !== 'done' &&
          syncProgress.phase !== 'error'
        }
        phase={syncProgress?.phase ?? null}
        completed={syncProgress?.completed ?? 0}
        total={syncProgress?.total ?? 0}
        monthLabel={monthStr}
      />
    </LoansPageShell>
  );
}
