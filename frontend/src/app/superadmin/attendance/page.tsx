'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';
import {
  formatHighlightContribution,
  highlightBadgeSubtitle,
  hasAttendancePunches,
  isFullDayOdEligibleForConflictRevoke,
} from '@/lib/attendanceHighlight';
import {
  normalizeCompleteSummaryColumns,
  superadminVisibleCompleteKeys,
  type SuperadminCompleteAggregateKey,
} from '@/lib/attendanceCompleteAggregateColumns';
import {
  getPartialColumnTotal,
  getPartialRecordPayableContribution,
} from '@/lib/attendancePartialContribution';
import {
  computePayRegisterAllRowFromMonthlySummary,
  formatPolicyAttendanceDeductionDisplay,
  paidLopSublabel,
} from '@/lib/payRegisterAllSummaryRow';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { alertSuccess, alertError, alertConfirm, alertLoading } from '@/lib/customSwal';
import {
  getAbsentCountForRow,
  normalizeMonthlyAttendanceRows,
  writeMonthlyAttendanceExcelFile,
} from '@/lib/attendanceMonthlyExcelExport';
import { ArrowLeftIcon, ArrowRightIcon, Briefcase, MapPin, Camera, ExternalLink, Star, Info } from 'lucide-react';
import dynamic from 'next/dynamic';
const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

interface AttendanceRecord {
  date: string;
  inTime: string | null;
  outTime: string | null;
  totalHours: number | null;
  status: 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'LEAVE' | 'OD' | 'HALF_DAY' | 'HOLIDAY' | 'WEEK_OFF' | '-';
  shiftId?: { _id: string; name: string; startTime: string; endTime: string; duration: number; payableShifts?: number } | string | null;
  shifts?: {
    _id: string;
    shiftId: { _id: string; name: string; startTime: string; endTime: string; duration: number } | string;
    inTime: string | null;
    outTime: string | null;
    status: string;
    workingHours: number;
    otHours: number;
    earlyOutMinutes?: number;
    lateInMinutes?: number;
    shiftStartTime?: string;
    shiftEndTime?: string;
    payableShift?: number;
  }[];
  payableShifts?: number;
  isLateIn?: boolean;
  isEarlyOut?: boolean;
  lateInMinutes?: number | null;
  earlyOutMinutes?: number | null;
  expectedHours?: number | null;
  hasLeave?: boolean;
  leaveInfo?: {
    leaveId: string;
    leaveType: string;
    isHalfDay: boolean;
    halfDayType?: string;
    purpose?: string;
    fromDate?: string;
    toDate?: string;
    numberOfDays?: number;
    dayInLeave?: number;
    appliedAt?: string;
    approvedBy?: { name: string; email?: string } | null;
    approvedAt?: string;
  } | null;
  hasOD?: boolean;
  odInfo?: {
    odId: string;
    odType: string;
    odType_extended?: 'full_day' | 'half_day' | 'hours' | null; // NEW: OD type
    isHalfDay: boolean;
    halfDayType?: string;
    purpose?: string;
    reason?: string;
    placeVisited?: string;
    fromDate?: string;
    toDate?: string;
    numberOfDays?: number;
    durationHours?: number; // NEW: Duration in hours for hour-based OD
    odStartTime?: string; // NEW: Start time for hour-based OD
    odEndTime?: string; // NEW: End time for hour-based OD
    photo: string;
    photoEvidence?: {
      url: string;
      exifLocation?: {
        latitude: number;
        longitude: number;
      };
    };
    geoLocation?: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    dayInOD?: number;
    appliedAt?: string;
    approvedBy?: { name: string; email?: string } | null;
    approvedAt?: string;
  } | null;
  isConflict?: boolean;
  otHours?: number;
  extraHours?: number;
  permissionHours?: number;
  permissionCount?: number;
  permissionRequests?: Array<{
    _id: string;
    permissionType?: 'mid_shift' | 'late_in' | 'early_out';
    permittedEdgeTime?: string;
    permissionStartTime?: string;
    permissionEndTime?: string;
    permissionHours?: number;
    status?: string;
    gateOutTime?: string;
    gateInTime?: string;
    purpose?: string;
  }>;
  isEdited?: boolean;
  locked?: boolean;
  editHistory?: {
    action: string;
    modifiedBy: string;
    modifiedByName?: string;
    modifiedAt: string;
    details: string;
  }[];
  source?: string[];
  policyMeta?: {
    partialDayRule?: {
      applied?: boolean;
      firstHalfStatus?: string | null;
      secondHalfStatus?: string | null;
      lopPortion?: number;
      note?: string | null;
    } | null;
    sandwichRule?: {
      applied?: boolean;
      previousNeighborKind?: string | null;
      nextNeighborKind?: string | null;
      effect?: string | null;
      note?: string | null;
    } | null;
  } | null;
}

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id: string; name: string };
  department_id?: { _id: string; name: string };
  designation?: { _id: string; name: string };
  designation_id?: { _id: string; name: string };
  division?: { _id: string; name: string };
  division_id?: { _id: string; name: string };
  leftDate?: string;
}

interface MonthlyAttendanceData {
  employee: Employee;
  dailyAttendance: Record<string, AttendanceRecord | null>;
  presentDays?: number;
  payableShifts?: number;
  summary?: {
    _id: string;
    employeeId: string;
    emp_no: string;
    month: string;
    year: number;
    totalLeaves: number;
    /** Paid leave day-units (monthly summary engine). */
    totalPaidLeaves?: number;
    /** LOP day-units including policy partial / sandwich. */
    totalLopLeaves?: number;
    totalODs: number;
    /** Sum of payable contributions on PARTIAL-status days. */
    totalPartialDays?: number;
    totalWeeklyOffs?: number;
    totalHolidays?: number;
    totalPresentDays: number;
    totalAbsentDays?: number;
    totalDaysInMonth: number;
    totalPayableShifts: number;
    // Late/Early metrics (combined)
    lateOrEarlyCount?: number;
    totalLateOrEarlyMinutes?: number;
    /** Policy-based (payroll-aligned) attendance deduction days */
    totalAttendanceDeductionDays?: number;
    attendanceDeductionBreakdown?: {
      lateInsCount?: number;
      earlyOutsCount?: number;
      combinedCount?: number;
      freeAllowedPerMonth?: number;
      effectiveCount?: number;
      daysDeducted?: number;
      lateEarlyDaysDeducted?: number;
      absentExtraDays?: number;
      absentDays?: number;
      lopDaysPerAbsent?: number | null;
      deductionType?: string | null;
      calculationMode?: string | null;
    };
    contributingDates?: {
      present?: string[];
      leaves?: string[];
      ods?: string[];
      partial?: Array<string | { date: string; value?: number; label?: string }>;
      weeklyOffs?: string[];
      holidays?: string[];
      payableShifts?: string[];
      otHours?: string[];
      extraHours?: string[];
      lateIn?: string[];
      earlyOut?: string[];
      permissions?: string[];
      absent?: Array<string | { date: string; value?: number; label?: string }>;
      paidLeaves?: Array<string | { date: string; value?: number; label?: string }>;
      lopLeaves?: Array<string | { date: string; value?: number; label?: string }>;
    };
    lastCalculatedAt: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface Department {
  _id: string;
  name: string;
  code?: string;
  division?: string | { _id: string; name: string };
  divisions?: (string | { _id: string; name: string })[];
}

function getPresentExcludingOD(summary?: MonthlyAttendanceData['summary'] | null): number | null {
  if (!summary) return null;
  // Backend now provides totalPresentDays with OD already excluded/separated.
  // We just return it directly with 2-decimal precision.
  return Math.max(0, Math.round((Number(summary.totalPresentDays) || 0) * 100) / 100);
}

interface Designation {
  _id: string;
  name: string;
  department: string;
}

export default function AttendancePage() {
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAttendanceTable = (direction: 'left' | 'right') => {
    const el = tableScrollRef.current;
    if (!el) return;
    const amount = Math.max(320, Math.floor(el.clientWidth * 0.7));
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const [tableType, setTableType] = useState<'complete' | 'present_absent' | 'in_out' | 'leaves' | 'od' | 'ot'>('complete');
  const [attendanceProcessingMode, setAttendanceProcessingMode] = useState<'single_shift' | 'multi_shift' | null>(null);
  const [orgCompleteSummaryColumns, setOrgCompleteSummaryColumns] = useState<
    Record<SuperadminCompleteAggregateKey, boolean>
  >(() => normalizeCompleteSummaryColumns(undefined));

  // Robust time formatter
  const formatTime = (timeStr: string | null, showDateIfDifferent?: boolean, recordDate?: string) => {
    if (!timeStr) return '-';

    // Handle HH:mm or HH:mm:ss format
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return timeStr;

      // Primary time display in 12h IST (Uses browser local time)
      const timeFormatted = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      // Optional date prefix for out-of-day punches (e.g., night shifts)
      if (showDateIfDifferent && recordDate) {
        const timeDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (timeDateStr !== recordDate) {
          const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return `${dateLabel}, ${timeFormatted}`;
        }
      }

      return timeFormatted;
    } catch {
      return timeStr;
    }
  };

  const appendHalfStatus = (base: string, marker: string) => {
    if (!marker) return base || '-';
    if (!base || base === '-') return marker;
    if (base === marker) return base;
    if (base === 'A') return marker;
    return `${base}/${marker}`;
  };

  const getBaseDisplayStatus = (record: AttendanceRecord | null) => {
    if (!record) return 'A';
    if (record.status === 'PRESENT') return 'P';
    if (record.status === 'HALF_DAY') return 'HD';
    if (record.status === 'PARTIAL') return 'PT';
    if (record.status === 'HOLIDAY') return 'H';
    if (record.status === 'WEEK_OFF') return 'WO';
    if (record.status === 'LEAVE' || record.hasLeave) return (record.leaveInfo?.numberOfDays && record.leaveInfo.numberOfDays >= 3) ? 'LL' : 'L';
    if (record.status === 'OD' || record.hasOD) return 'OD';
    return 'A';
  };

  const timeToMins = (t: any): number => {
    if (!t) return 0;
    if (t instanceof Date) return t.getHours() * 60 + t.getMinutes();
    const str = String(t);
    if (str.includes('AM') || str.includes('PM')) {
      const [time, modifier] = str.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const buildSplitCellStatus = (record: AttendanceRecord | null) => {
    if (!record) return null;
    const leaveInfo = record.leaveInfo;
    const odInfo = record.odInfo;
    const leaveMarker = leaveInfo ? ((leaveInfo.numberOfDays && leaveInfo.numberOfDays >= 3) ? 'LL' : 'L') : '';
    const odMarker = odInfo ? 'OD' : '';
    const hasHalfLeave = !!leaveInfo?.isHalfDay;
    const isHoursOD = !!(odInfo && odInfo.odType_extended === 'hours');
    const hasHalfOD = !!(odInfo && odInfo.odType_extended === 'half_day' && odInfo.isHalfDay);
    const hasFullLeave = !!(leaveInfo && !leaveInfo.isHalfDay);
    const hasFullOD = !!(odInfo && odInfo.odType_extended === 'full_day');
    const partialRule = record.policyMeta?.partialDayRule;
    const hasPartialPolicySplit = record.status === 'PARTIAL' && partialRule?.applied === true;
    const shouldSplit = !isHoursOD && (record.status === 'HALF_DAY' || hasHalfLeave || hasHalfOD || hasPartialPolicySplit);
    if (!shouldSplit) return null;

    let top = 'A';
    let bottom = 'A';
    if (record.status === 'PRESENT') { top = 'P'; bottom = 'P'; }
    else if (record.status === 'PARTIAL') {
      if (hasPartialPolicySplit) {
        const toCell = (status?: string | null) => {
          const s = String(status || '').toLowerCase();
          if (s === 'present') return 'PT';
          if (s === 'leave') return 'L';
          if (s === 'od') return 'OD';
          if (s === 'absent') return 'A';
          return 'PT';
        };
        top = toCell(partialRule?.firstHalfStatus);
        bottom = toCell(partialRule?.secondHalfStatus);
      } else {
        top = 'PT';
        bottom = 'PT';
      }
    }
    else if (record.status === 'HALF_DAY') {
      const eo = Number(record.earlyOutMinutes) || 0;
      const li = Number(record.lateInMinutes) || 0;
      let workedHalf: 'first' | 'second' = (eo > li) ? 'first' : (li > eo) ? 'second' : 'first';

      // NEW: Punch-Gap Fallback (Failsafe for waived penalties)
      if (eo === li && record.shifts && record.shifts.length > 0) {
        const s = record.shifts[0];
        const sStart = s.shiftStartTime || (typeof s.shiftId === 'object' ? s.shiftId?.startTime : null);
        const sEnd = s.shiftEndTime || (typeof s.shiftId === 'object' ? s.shiftId?.endTime : null);
        if (s.inTime && sStart && s.outTime && sEnd) {
          const inDiff = Math.max(0, timeToMins(s.inTime) - timeToMins(sStart));
          const outDiff = Math.max(0, timeToMins(sEnd) - timeToMins(s.outTime));
          if (inDiff > outDiff) workedHalf = 'second';
          else if (outDiff > inDiff) workedHalf = 'first';
        }
      }

      // OD Fallback (if still tied)
      if (eo === li && record.odInfo?.halfDayType) {
        workedHalf = record.odInfo.halfDayType === 'first_half' ? 'second' : 'first';
      }

      if (workedHalf === 'first') { top = 'HD'; bottom = 'A'; } else { top = 'A'; bottom = 'HD'; }
    }

    // Half-day OD while daily status is OD (not HALF_DAY): the non-OD half is office time — show HD, not A (matches punch / closeness intent).
    if (hasHalfOD && record.status === 'OD') {
      const hasIn = !!(record as any).inTime || (record.shifts?.length && record.shifts.some((s: any) => s.inTime));
      const hasOut = !!(record as any).outTime || (record.shifts?.length && record.shifts.some((s: any) => s.outTime));
      if (odInfo?.halfDayType === 'second_half' && hasIn) top = 'HD';
      else if (odInfo?.halfDayType === 'first_half' && hasOut) bottom = 'HD';
    }

    if (hasFullLeave && leaveMarker) {
      top = appendHalfStatus(top, leaveMarker);
      bottom = appendHalfStatus(bottom, leaveMarker);
    } else if (hasHalfLeave && leaveMarker) {
      if (leaveInfo?.halfDayType === 'second_half') bottom = appendHalfStatus(bottom, leaveMarker);
      else top = appendHalfStatus(top, leaveMarker);
    }
    if (hasFullOD && odMarker) {
      top = appendHalfStatus(top, odMarker);
      bottom = appendHalfStatus(bottom, odMarker);
    } else if (hasHalfOD && odMarker) {
      if (odInfo?.halfDayType === 'second_half') bottom = appendHalfStatus(bottom, odMarker);
      else top = appendHalfStatus(top, odMarker);
    }
    return { top, bottom };
  };

  const getSplitHalfClass = (value: string) => {
    const v = (value || '').toUpperCase();
    if (v.includes('OD')) return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200';
    if (v.includes('LL')) return 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200';
    if (v.includes('/L') || v === 'L') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/45 dark:text-orange-200';
    if (v.includes('PT')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/45 dark:text-purple-200';
    if (v.includes('HD')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200';
    if (v === 'P') return 'bg-green-100 text-green-800 dark:bg-green-900/45 dark:text-green-200';
    if (v === 'A') return 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300';
    return 'bg-slate-100 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200';
  };

  const formatHalfTag = (halfDayType?: string | null) => {
    if (halfDayType === 'first_half') return '1H';
    if (halfDayType === 'second_half') return '2H';
    return 'HD';
  };

  const getLeaveCellLabel = (record: AttendanceRecord | null) => {
    if (!(record?.hasLeave || record?.status === 'LEAVE')) return '-';
    const base = (record?.leaveInfo?.numberOfDays && record.leaveInfo.numberOfDays >= 3) ? 'LL' : 'L';
    if (record?.leaveInfo?.isHalfDay) return `${base}-${formatHalfTag(record.leaveInfo.halfDayType)}`;
    return base;
  };

  const getODCellLabel = (record: AttendanceRecord | null) => {
    if (!(record?.hasOD || record?.status === 'OD')) return '-';
    if (record?.odInfo?.odType_extended === 'hours') {
      return `ODh${record.odInfo.durationHours != null ? `(${record.odInfo.durationHours}h)` : ''}`;
    }
    if (record?.odInfo?.isHalfDay || record?.odInfo?.odType_extended === 'half_day') {
      return `OD-${formatHalfTag(record.odInfo?.halfDayType)}`;
    }
    return 'OD';
  };


  const [currentDate, setCurrentDate] = useState(new Date());
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [selectedEmployeeForPayslip, setSelectedEmployeeForPayslip] = useState<Employee | null>(null);
  const [payslipData, setPayslipData] = useState<any>(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [calculatingPayroll, setCalculatingPayroll] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyAttendanceData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [attendanceDetail, setAttendanceDetail] = useState<any>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, AttendanceRecord | null>>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [syncingShifts, setSyncingShifts] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedEmployeeForSummary, setSelectedEmployeeForSummary] = useState<Employee | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [payrollCycleStartDay, setPayrollCycleStartDay] = useState(1);
  const [payrollCycleEndDay, setPayrollCycleEndDay] = useState(31);
  const [cycleDates, setCycleDates] = useState({ startDate: '', endDate: '', label: '' });

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Filter states
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('');
  // Pagination states for scaling
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filteredMonthlyData, setFilteredMonthlyData] = useState<MonthlyAttendanceData[]>([]);
  const observerTarget = useRef<HTMLDivElement>(null);

  // OutTime dialog state
  const [showOutTimeDialog, setShowOutTimeDialog] = useState(false);
  const [selectedRecordForOutTime, setSelectedRecordForOutTime] = useState<{ employee: Employee; date: string; shiftRecordId?: string } | null>(null);
  const [outTimeValue, setOutTimeValue] = useState('');
  const [updatingOutTime, setUpdatingOutTime] = useState(false);

  // OT conversion state
  const [convertingToOT, setConvertingToOT] = useState(false);
  const [hasExistingOT, setHasExistingOT] = useState(false);
  const [otRequestStatus, setOtRequestStatus] = useState<string | null>(null);

  // Shift selection and out-time state
  const [availableShifts, setAvailableShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [editingShift, setEditingShift] = useState(false);
  const [outTimeInput, setOutTimeInput] = useState('');
  const [editingOutTime, setEditingOutTime] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [savingOutTime, setSavingOutTime] = useState(false);
  const [selectedShiftRecordId, setSelectedShiftRecordId] = useState<string | null>(null);
  const [inTimeInput, setInTimeInput] = useState('');
  const [editingInTime, setEditingInTime] = useState(false);
  const [savingInTime, setSavingInTime] = useState(false);

  // Leave conflict state
  const [leaveConflicts, setLeaveConflicts] = useState<any[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [revokingLeave, setRevokingLeave] = useState(false);
  const [revokingOD, setRevokingOD] = useState(false);
  const [updatingLeave, setUpdatingLeave] = useState(false);

  // Attendance feature flags (from settings) – control visibility of Edit In/Out and Upload
  const [attendanceFeatureFlags, setAttendanceFeatureFlags] = useState<{
    allowInTimeEditing: boolean;
    allowOutTimeEditing: boolean;
    allowAttendanceUpload: boolean;
    allowShiftChange: boolean;
  }>({ allowInTimeEditing: true, allowOutTimeEditing: true, allowAttendanceUpload: true, allowShiftChange: true });
  const [otAutoCreateEnabled, setOtAutoCreateEnabled] = useState(false);
  const [otPolicyEligibleForConvert, setOtPolicyEligibleForConvert] = useState(false);
  const [otPolicyPreview, setOtPolicyPreview] = useState<any | null>(null);
  const [selectedOtEmployees, setSelectedOtEmployees] = useState<Record<string, boolean>>({});
  const [showBulkOtPreviewModal, setShowBulkOtPreviewModal] = useState(false);
  const [bulkOtEligibleQueue, setBulkOtEligibleQueue] = useState<
    Array<{
      key: string;
      employeeId: string;
      employeeNumber: string;
      employeeName: string;
      date: string;
      rawHours: number;
      slabHours: number;
      steps: string[];
    }>
  >([]);
  const [selectedBulkOtKeys, setSelectedBulkOtKeys] = useState<Record<string, boolean>>({});
  const [bulkOtPreviewLoading, setBulkOtPreviewLoading] = useState(false);
  const [bulkOtSkippedItems, setBulkOtSkippedItems] = useState<
    Array<{ key: string; label: string; date: string; reason: string }>
  >([]);
  const [bulkOtSkippedExpanded, setBulkOtSkippedExpanded] = useState(false);
  const [showSingleOtConfirmModal, setShowSingleOtConfirmModal] = useState(false);
  const [singleOtConfirmLoading, setSingleOtConfirmLoading] = useState(false);
  const [singleOtConfirmError, setSingleOtConfirmError] = useState('');
  const [singleOtConfirmData, setSingleOtConfirmData] = useState<{
    employeeId: string;
    rawHours: number;
    finalHours: number;
    date: string;
    steps: string[];
    employeeName: string;
    employeeNumber: string;
  } | null>(null);

  const [exportingExcel, setExportingExcel] = useState(false);

  // In Time dialog state
  const [showInTimeDialog, setShowInTimeDialog] = useState(false);
  const isAttendanceDetailLocked = !!(
    attendanceDetail &&
    (attendanceDetail.locked || attendanceDetail.isEdited || attendanceDetail.source?.includes('manual'))
  );
  const isAttendanceLockedResponse = (response: any) =>
    response &&
    !response.success &&
    (
      response.code === 'ATTENDANCE_DAILY_LOCKED' ||
      response.reason === 'attendance_daily_locked' ||
      response.code === 'PAYROLL_BATCH_COMPLETED' ||
      response.reason === 'payroll_batch_completed'
    );
  const handleAttendanceLockedPopup = async (message?: string) => {
    setEditingShift(false);
    setEditingOutTime(false);
    setShowOutTimeDialog(false);
    setShowInTimeDialog(false);
    setSelectedShiftId('');
    setSelectedShiftRecordId(null);
    setSelectedRecordForOutTime(null);
    setSelectedRecordForInTime(null);
    setOutTimeInput('');
    setOutTimeValue('');
    setInTimeDialogValue('');
    setError('');
    await Swal.fire({
      icon: 'warning',
      title: 'Attendance Locked',
      text: message || 'Attendance is locked for a completed payroll period.',
      confirmButtonText: 'OK',
    });
  };
  const [selectedRecordForInTime, setSelectedRecordForInTime] = useState<{ employee: Employee; date: string; shiftRecordId?: string } | null>(null);
  const [inTimeDialogValue, setInTimeDialogValue] = useState('');
  const [updatingInTime, setUpdatingInTime] = useState(false);

  // Highlighting state
  const [activeHighlight, setActiveHighlight] = useState<{ employeeId: string; category: string } | null>(null);
  const [attendanceDeductionInfo, setAttendanceDeductionInfo] = useState<{
    employeeName: string;
    total: number;
    lateEarlyDays: number;
    absentDays: number;
  } | null>(null);
  const activeHighlightDates = useMemo(() => {
    if (!activeHighlight) return new Map<string, { value: number; label: string }>();
    const empData = monthlyData.find(d => d.employee._id === activeHighlight.employeeId);
    if (!empData) return new Map<string, { value: number; label: string }>();

    const map = new Map<string, { value: number; label: string }>();
    const cd = empData.summary?.contributingDates as Record<string, unknown> | undefined;
    const items = cd?.[activeHighlight.category];

    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        if (typeof item === 'string') {
          map.set(item, { value: 1, label: '' });
        } else if (item && item.date) {
          map.set(item.date, { value: item.value ?? 1, label: item.label || '' });
        }
      });
      return map;
    }

    // Legacy: summaries without contributingDates.absent (partial absents need recalculated summary)
    if (activeHighlight.category === 'absent' && empData.dailyAttendance) {
      for (const [dateStr, rec] of Object.entries(empData.dailyAttendance)) {
        if (rec?.status === 'ABSENT') map.set(dateStr, { value: 1, label: '' });
      }
    }
    if (activeHighlight.category === 'partial' && empData.dailyAttendance) {
      for (const [dateStr, rec] of Object.entries(empData.dailyAttendance)) {
        if (rec?.status === 'PARTIAL') {
          const v = getPartialRecordPayableContribution(rec);
          map.set(dateStr, { value: v, label: v > 0 ? `PT (${v})` : 'PARTIAL' });
        }
      }
    }
    return map;
  }, [activeHighlight, monthlyData]);

  useEffect(() => {
    if (tableType !== 'ot' || otAutoCreateEnabled) setSelectedOtEmployees({});
  }, [tableType, otAutoCreateEnabled]);

  const groupedBulkOtEligibility = useMemo(() => {
    const map: Record<string, typeof bulkOtEligibleQueue> = {};
    bulkOtEligibleQueue.forEach((item) => {
      const groupKey = `${item.employeeName} (${item.employeeNumber})`;
      if (!map[groupKey]) map[groupKey] = [];
      map[groupKey].push(item);
    });
    return map;
  }, [bulkOtEligibleQueue]);

  const handleSummaryClick = (employeeId: string, category: string) => {
    setActiveHighlight(prev => {
      if (prev?.employeeId === employeeId && prev?.category === category) return null;
      return { employeeId, category };
    });
  };

  const openAttendanceDeductionInfo = (
    e: MouseEvent<HTMLTableCellElement>,
    item: MonthlyAttendanceData
  ) => {
    e.stopPropagation();
    const breakdown = item.summary?.attendanceDeductionBreakdown || {};
    const total = Number(item.summary?.totalAttendanceDeductionDays ?? breakdown.daysDeducted ?? 0);
    const absentDays = Number(breakdown.absentExtraDays ?? 0);
    const lateEarlyDays = Number(breakdown.lateEarlyDaysDeducted ?? 0);
    setAttendanceDeductionInfo({
      employeeName: item.employee.employee_name,
      total,
      lateEarlyDays,
      absentDays,
    });
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    setActiveHighlight(null);
  }, [year, month, cycleDates.startDate, cycleDates.endDate]);

  useEffect(() => {
    loadDivisions();
    loadDepartments();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [startRes, endRes] = await Promise.all([
        api.getSetting('payroll_cycle_start_day'),
        api.getSetting('payroll_cycle_end_day')
      ]);

      if (startRes.success && startRes.data) {
        setPayrollCycleStartDay(parseInt(startRes.data.value, 10) || 1);
      }
      if (endRes.success && endRes.data) {
        setPayrollCycleEndDay(parseInt(endRes.data.value, 10) || 31);
      }
    } catch (err) {
      console.error('Error loading payroll settings:', err);
    }
  };

  useEffect(() => {
    const loadFlags = async () => {
      try {
        const [attendanceRes, otRes] = await Promise.all([
          api.getAttendanceSettings(),
          api.getOvertimeSettings(),
        ]);
        if (attendanceRes?.data?.featureFlags) {
          const ff = attendanceRes.data.featureFlags;
          setAttendanceFeatureFlags({
            allowInTimeEditing: ff.allowInTimeEditing !== false,
            allowOutTimeEditing: ff.allowOutTimeEditing !== false,
            allowAttendanceUpload: ff.allowAttendanceUpload !== false,
            allowShiftChange: ff.allowShiftChange !== false,
          });
        }
        if (attendanceRes?.data?.completeSummaryColumns) {
          setOrgCompleteSummaryColumns(normalizeCompleteSummaryColumns(attendanceRes.data.completeSummaryColumns));
        }
        const mode = attendanceRes?.data?.processingMode?.mode;
        if (mode === 'single_shift' || mode === 'multi_shift') {
          setAttendanceProcessingMode(mode);
        }
        setOtAutoCreateEnabled(Boolean(otRes?.data?.autoCreateOtRequest));
      } catch {
        // keep defaults
      }
    };
    loadFlags();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkEligibility = async () => {
      setOtPolicyEligibleForConvert(false);
      setOtPolicyPreview(null);
      const hasAnyShift = Boolean(attendanceDetail?.shiftId || (attendanceDetail?.shifts && attendanceDetail.shifts.length > 0));
      if (
        !selectedEmployee ||
        !selectedDate ||
        !hasAnyShift ||
        !attendanceDetail?.extraHours ||
        attendanceDetail.extraHours <= 0 ||
        hasExistingOT
      ) {
        return;
      }
      try {
        const preview = await api.previewOTExtraHours({
          employeeId: selectedEmployee._id,
          employeeNumber: selectedEmployee.emp_no,
          date: selectedDate,
        });
        const pdata = (preview as { data?: any })?.data;
        if (!cancelled) {
          setOtPolicyPreview(pdata || null);
        }
        const eligible = Boolean(
          preview?.success &&
          pdata?.policy?.eligible &&
          !pdata?.hasExistingOt
        );
        if (!cancelled) setOtPolicyEligibleForConvert(eligible);
      } catch {
        if (!cancelled) {
          setOtPolicyEligibleForConvert(false);
          setOtPolicyPreview(null);
        }
      }
    };
    checkEligibility();
    return () => {
      cancelled = true;
    };
  }, [
    selectedEmployee?._id,
    selectedEmployee?.emp_no,
    selectedDate,
    attendanceDetail?.shiftId,
    attendanceDetail?.shifts?.length,
    attendanceDetail?.extraHours,
    hasExistingOT,
    showDetailDialog,
  ]);

  useEffect(() => {
    if (selectedDepartment) {
      loadDesignations(selectedDepartment);
    } else {
      setDesignations([]);
      setSelectedDesignation('');
    }
  }, [selectedDepartment]);

  useEffect(() => {
    if (payrollCycleStartDay != null && payrollCycleStartDay >= 1) {
      if (payrollCycleStartDay > 1) {
        let startYear = year;
        let startMonth = month - 1;
        if (startMonth === 0) {
          startMonth = 12;
          startYear = year - 1;
        }

        // Use payrollCycleEndDay if set, otherwise fallback to startDay - 1
        const endDay = payrollCycleEndDay || (payrollCycleStartDay - 1);
        const endDateObj = new Date(year, month - 1, endDay);
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;
        const actualEndDay = endDateObj.getDate();

        const start = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(payrollCycleStartDay).padStart(2, '0')}`;
        const end = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(actualEndDay).padStart(2, '0')}`;

        setCycleDates({ startDate: start, endDate: end, label: '' });
      } else {
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        // For calendar month, respects payrollCycleEndDay if it's less than lastDay
        const actualEndDay = Math.min(payrollCycleEndDay || 31, lastDay);
        const end = `${year}-${String(month).padStart(2, '0')}-${String(actualEndDay).padStart(2, '0')}`;
        setCycleDates({ startDate: start, endDate: end, label: '' });
      }
    }
  }, [year, month, payrollCycleStartDay, payrollCycleEndDay]);

  useEffect(() => {
    // wait for cycle dates
    if (!cycleDates.startDate) return;

    // Reset page when filters change
    setPage(1);
    loadMonthlyAttendance(true);
  }, [selectedDivision, selectedDepartment, selectedDesignation, cycleDates.startDate, debouncedSearch]); // Removed tableType dependency

  // Handle Load More when page changes
  useEffect(() => {
    if (page > 1) {
      loadMonthlyAttendance(false);
    }
  }, [page]);

  useEffect(() => {
    // In server-side pagination mode, we don't apply local filters
    // unless we have all data loaded (which we won't at 5k scale).
    // So we just pass through monthlyData.
    setFilteredMonthlyData(monthlyData);
  }, [monthlyData]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, loadingMore, page]);

  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions(true);
      if (response.success && response.data) {
        setDivisions(response.data);
      }
    } catch (err) {
      console.error('Error loading divisions:', err);
    }
  };

  const loadDepartments = async (divisionId?: string) => {
    try {
      // If we want to filter departments by division, we might need a different API or filter client-side
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        let depts = response.data;
        if (divisionId) {
          depts = depts.filter((d: Department) => {
            // Check direct division assignment (object or string)
            const deptDivisionId = d.division && typeof d.division === 'object' ? d.division._id : d.division;
            if (deptDivisionId === divisionId) return true;

            // Check array of divisions
            if (Array.isArray(d.divisions) && d.divisions.length > 0) {
              return d.divisions.some((div: any) => {
                const divId = div && typeof div === 'object' ? div._id : div;
                return divId === divisionId;
              });
            }

            return false;
          });
        }
        setDepartments(depts);
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadDesignations = async (departmentId: string) => {
    try {
      const response = await api.getDesignations(departmentId);
      if (response.success && response.data) {
        setDesignations(response.data);
      }
    } catch (err) {
      console.error('Error loading designations:', err);
    }
  };

  // Helper to normalize data structure (handles both flat and nested responses)
  const normalizeAttendanceData = (data: any[]): MonthlyAttendanceData[] =>
    normalizeMonthlyAttendanceRows(data) as MonthlyAttendanceData[];

  const loadMonthlyAttendance = async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      setError('');
      const targetPage = reset ? 1 : page;

      const response = await api.getMonthlyAttendance(year, month, {
        page: targetPage,
        limit,
        search: debouncedSearch,
        divisionId: selectedDivision,
        departmentId: selectedDepartment,
        designationId: selectedDesignation,
        startDate: cycleDates.startDate,
        endDate: cycleDates.endDate
      });

      if (response.success) {
        const rawData = response.data || [];
        const newData = normalizeAttendanceData(rawData);
        if (reset) {
          setMonthlyData(newData);
        } else {
          // Append new data, but filter out duplicates just in case
          setMonthlyData(prev => {
            const existingIds = new Set(prev.map(i => i.employee._id));
            const uniqueNewData = newData.filter((i: any) => !existingIds.has(i.employee._id));
            return [...prev, ...uniqueNewData];
          });
        }

        const pagInfo = (response as any).pagination;
        if (pagInfo) {
          setTotalPages(pagInfo.totalPages || 1);
          setTotalCount(pagInfo.total || 0);
          setHasMore(targetPage < pagInfo.totalPages);
        } else {
          setHasMore(false);
        }
      } else {
        setError(response.message || 'Failed to load monthly attendance');
      }
    } catch (err: any) {
      console.error('Error loading monthly attendance:', err);
      setError(err.message || 'Failed to load monthly attendance');
    } finally {
      if (reset) setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadAllEmployeesAttendance = async () => {
    try {
      setLoadingAttendance(true);
      setError('');
      const response = await api.getMonthlyAttendance(year, month, {
        startDate: cycleDates.startDate,
        endDate: cycleDates.endDate
      });
      if (response.success) {
        const normalizedData = normalizeAttendanceData(response.data || []);

        // Convert monthly data to calendar format for all employees
        const calendarData: Record<string, Record<string, AttendanceRecord | null>> = {};
        normalizedData.forEach((item: MonthlyAttendanceData) => {
          // Apply filters
          if (selectedDepartment && item.employee.department?._id !== selectedDepartment) return;
          if (selectedDesignation && item.employee.designation?._id !== selectedDesignation) return;

          // Store dailyAttendance for this employee
          calendarData[item.employee._id] = item.dailyAttendance;
        });
        setAttendanceData(calendarData);
        setMonthlyData(normalizedData);
      } else {
        setError(response.message || 'Failed to load attendance');
      }
    } catch (err: any) {
      console.error('Error loading attendance:', err);
      setError(err.message || 'Failed to load attendance');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const loadAttendance = async () => {
    if (!selectedEmployee) return;

    try {
      setLoadingAttendance(true);
      const response = await api.getAttendanceCalendar(selectedEmployee.emp_no, year, month);
      if (response.success) {
        setAttendanceData(response.data || {});
      }
    } catch (err) {
      console.error('Error loading attendance:', err);
      setError('Failed to load attendance data');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const loadAvailableShifts = async (employeeNumber: string, date: string) => {
    try {
      setLoadingShifts(true);
      const response = await api.getAvailableShifts(employeeNumber, date);
      if (response.success && response.data) {
        setAvailableShifts(response.data);
      }
    } catch (err) {
      console.error('Error loading available shifts:', err);
    } finally {
      setLoadingShifts(false);
    }
  };

  const handleAssignShift = async () => {
    if (!selectedEmployee || !selectedDate || !selectedShiftId) {
      setError('Please select a shift');
      return;
    }

    try {
      setSavingShift(true);
      setError('');
      setSuccess('');

      const response = await api.assignShiftToAttendance(
        selectedEmployee.emp_no,
        selectedDate,
        selectedShiftId,
        selectedShiftRecordId || undefined
      );

      if (response.success) {
        setSuccess('Shift assigned successfully!');
        setEditingShift(false);
        setSelectedShiftId('');
        setSelectedShiftRecordId(null);

        // Optimistic update: mark as manually edited
        setMonthlyData(prevData => prevData.map(empData => {
          if (empData.employee.emp_no === selectedEmployee.emp_no) {
            const updatedDaily = { ...empData.dailyAttendance };
            if (updatedDaily[selectedDate]) {
              const record = updatedDaily[selectedDate];
              if (record) {
                const newSource = record.source ? [...record.source] : [];
                if (!newSource.includes('manual')) newSource.push('manual');
                updatedDaily[selectedDate] = { ...record, source: newSource };
              }
            }
            return { ...empData, dailyAttendance: updatedDaily };
          }
          return empData;
        }));

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedDetail = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
        if (updatedDetail) {
          setAttendanceDetail(updatedDetail);
        }

        setTimeout(() => {
          setSuccess('');
        }, 2000);
      } else {
        if (isAttendanceLockedResponse(response)) {
          await handleAttendanceLockedPopup(response.message);
          return;
        }
        setError(response.message || 'Failed to assign shift');
      }
    } catch (err: any) {
      console.error('Error assigning shift:', err);
      setError(err.message || 'An error occurred while assigning shift');
    } finally {
      setSavingShift(false);
    }
  };

  const handleSaveOutTime = async () => {
    if (!selectedEmployee || !selectedDate || !outTimeInput) {
      setError('Please enter out-time');
      return;
    }

    try {
      setSavingOutTime(true);
      setError('');
      setSuccess('');

      // Combine date with time to create proper datetime string
      const [hours, mins] = outTimeInput.split(':').map(Number);
      const date = new Date(selectedDate);
      date.setHours(hours, mins, 0, 0);
      const outTimeDateTime = date.toISOString();

      const response = await api.updateAttendanceOutTime(
        selectedEmployee.emp_no,
        selectedDate,
        outTimeDateTime,
        selectedShiftRecordId || undefined
      );

      if (response.success) {
        setSuccess('Out-time updated successfully!');
        setEditingOutTime(false);
        setOutTimeInput('');
        setSelectedShiftRecordId(null);

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedDetail = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
        if (updatedDetail) {
          setAttendanceDetail(updatedDetail);
        }

        setTimeout(() => {
          setSuccess('');
        }, 2000);
      } else {
        if (isAttendanceLockedResponse(response)) {
          await handleAttendanceLockedPopup(response.message);
          return;
        }
        setError(response.message || 'Failed to update out-time');
      }
    } catch (err: any) {
      console.error('Error updating out-time:', err);
      setError(err.message || 'An error occurred while updating out-time');
    } finally {
      setSavingOutTime(false);
    }
  };

  const handleSaveInTime = async () => {
    if (!selectedEmployee || !selectedDate || !inTimeInput) {
      setError('Please enter in-time');
      return;
    }

    try {
      setSavingInTime(true);
      setError('');
      setSuccess('');

      // Combine date with time to create proper datetime string
      // Note: If In-time crosses midnight (previous day?), we might need more logic,
      // but usually In-Time is on the selected date.
      const date = new Date(selectedDate);
      const [hours, mins] = inTimeInput.split(':').map(Number);
      date.setHours(hours, mins, 0, 0);
      const inTimeDateTime = date.toISOString();

      const response = await api.updateAttendanceInTime(
        selectedEmployee.emp_no,
        selectedDate,
        inTimeDateTime
      );

      if (response.success) {
        setSuccess('In-time updated successfully!');
        setEditingInTime(false);
        setInTimeInput('');

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedDetail = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
        if (updatedDetail) {
          setAttendanceDetail(updatedDetail);
        }

        setTimeout(() => {
          setSuccess('');
        }, 2000);
      } else {
        setError(response.message || 'Failed to update in-time');
      }
    } catch (err: any) {
      console.error('Error updating in-time:', err);
      setError(err.message || 'An error occurred while updating in-time');
    } finally {
      setSavingInTime(false);
    }
  };

  const loadLeaveConflicts = async (employeeNumber: string, date: string) => {
    try {
      setLoadingConflicts(true);
      const response = await api.getLeaveConflicts(employeeNumber, date);
      if (response.success && response.data) {
        setLeaveConflicts(response.data);
      } else {
        setLeaveConflicts([]);
      }
    } catch (err) {
      console.error('Error loading leave conflicts:', err);
      setLeaveConflicts([]);
    } finally {
      setLoadingConflicts(false);
    }
  };

  const handleRevokeLeave = async (leaveId: string) => {
    if (!selectedEmployee || !selectedDate) return;

    try {
      setRevokingLeave(true);
      setError('');
      setSuccess('');

      const response = await api.revokeLeaveForAttendance(leaveId);

      if (response.success) {
        setSuccess('Leave revoked successfully!');
        setLeaveConflicts([]);

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedDetail = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
        if (updatedDetail) {
          setAttendanceDetail(updatedDetail);
        }

        // Reload conflicts
        await loadLeaveConflicts(selectedEmployee.emp_no, selectedDate);

        setTimeout(() => {
          setSuccess('');
        }, 3000);
      } else {
        setError(response.message || 'Failed to revoke leave');
      }
    } catch (err: any) {
      console.error('Error revoking leave:', err);
      setError(err.message || 'An error occurred while revoking leave');
    } finally {
      setRevokingLeave(false);
    }
  };

  const handleRevokeOD = async (odId: string) => {
    if (!selectedEmployee || !selectedDate) return;

    if (
      !confirm(
        'Revoke this OD approval? Monthly summary and daily attendance will be recalculated without this OD.'
      )
    ) {
      return;
    }

    try {
      setRevokingOD(true);
      setError('');
      setSuccess('');

      const response = await api.revokeODApproval(odId, 'Revoked: check-in/out present with full-day OD');

      if (response.success) {
        setSuccess('OD approval revoked successfully! Monthly summary and daily attendance have been updated.');

        await loadMonthlyAttendance();

        const monthRes = await api.getMonthlyAttendance(year, month, {
          page,
          limit,
          search: debouncedSearch,
          divisionId: selectedDivision,
          departmentId: selectedDepartment,
          designationId: selectedDesignation,
          startDate: cycleDates.startDate,
          endDate: cycleDates.endDate,
        });
        const detailBase = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
        if (detailBase) {
          const list = monthRes.success ? normalizeAttendanceData(monthRes.data || []) : [];
          const item = list.find((i) => i.employee._id === selectedEmployee._id);
          const dayRecord = item?.dailyAttendance?.[selectedDate];
          const base = detailBase;
          if (dayRecord) {
            setAttendanceDetail({
              ...base,
              hasLeave: dayRecord.hasLeave,
              leaveInfo: dayRecord.leaveInfo,
              hasOD: dayRecord.hasOD,
              odInfo: dayRecord.odInfo,
              isConflict: dayRecord.isConflict,
              isEdited: dayRecord.isEdited,
              editHistory: dayRecord.editHistory,
              source: dayRecord.source,
            });
          } else {
            setAttendanceDetail(base);
          }
        }

        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError((response as any).message || (response as any).error || 'Failed to revoke OD');
      }
    } catch (err: any) {
      console.error('Error revoking OD:', err);
      setError(err.message || 'An error occurred while revoking OD');
    } finally {
      setRevokingOD(false);
    }
  };

  const handleUpdateLeave = async (leaveId: string) => {
    if (!selectedEmployee || !selectedDate) return;

    try {
      setUpdatingLeave(true);
      setError('');
      setSuccess('');

      const response = await api.updateLeaveForAttendance(leaveId, selectedEmployee.emp_no, selectedDate);

      if (response.success) {
        setSuccess(response.message || 'Leave updated successfully!');
        setLeaveConflicts([]);

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedDetail = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
        if (updatedDetail) {
          setAttendanceDetail(updatedDetail);
        }

        // Reload conflicts
        await loadLeaveConflicts(selectedEmployee.emp_no, selectedDate);

        setTimeout(() => {
          setSuccess('');
        }, 3000);
      } else {
        setError(response.message || 'Failed to update leave');
      }
    } catch (err: any) {
      console.error('Error updating leave:', err);
      setError(err.message || 'An error occurred while updating leave');
    } finally {
      setUpdatingLeave(false);
    }
  };

  const loadAttendanceDetailWithPermissions = async (employeeNumber: string, date: string) => {
    const [detailRes, permissionsRes] = await Promise.all([
      api.getAttendanceDetail(employeeNumber, date),
      api.getPermissions({ employeeNumber, date, startDate: date, endDate: date }),
    ]);

    if (!detailRes.success) return null;

    const base = detailRes.data || {};
    const permissionRows = Array.isArray(permissionsRes?.data)
      ? permissionsRes.data
      : Array.isArray((permissionsRes as any)?.data?.permissions)
        ? (permissionsRes as any).data.permissions
        : Array.isArray((permissionsRes as any)?.data?.items)
          ? (permissionsRes as any).data.items
          : [];
    const normalized = permissionRows
      .filter((p: any) => {
        const permDate = String(p?.date || '').slice(0, 10);
        const permEmpNo = String(p?.employeeNumber || p?.employeeId?.emp_no || '');
        return permDate === date && permEmpNo === employeeNumber;
      })
      .map((p: any) => ({
        _id: p._id,
        permissionType: p.permissionType,
        permittedEdgeTime: p.permittedEdgeTime,
        permissionStartTime: p.permissionStartTime,
        permissionEndTime: p.permissionEndTime,
        permissionHours: Number(p.permissionHours || 0),
        status: p.status,
        gateOutTime: p.gateOutTime,
        gateInTime: p.gateInTime,
        purpose: p.purpose,
      }));

    if (!normalized.length) return base;

    const permissionHours = normalized.reduce((sum: number, p: any) => sum + Number(p.permissionHours || 0), 0);
    return {
      ...base,
      permissionRequests: normalized,
      permissionCount: normalized.length,
      permissionHours: permissionHours > 0 ? permissionHours : Number(base.permissionHours || 0),
    };
  };

  const handleDateClick = async (employee: Employee, date: string) => {
    setSelectedDate(date);
    setSelectedEmployee(employee);
    setHasExistingOT(false);
    setOtRequestStatus(null);
    setOtRequestStatus(null);
    setEditingShift(false);
    setEditingOutTime(false);
    setEditingInTime(false);
    setSelectedShiftId('');
    setOutTimeInput('');
    setInTimeInput('');
    setSelectedShiftId('');
    setOutTimeInput('');
    setLeaveConflicts([]);

    try {
      // Load available shifts for this employee/date
      await loadAvailableShifts(employee.emp_no, date);

      // Load leave conflicts
      await loadLeaveConflicts(employee.emp_no, date);

      // Get the daily attendance record from monthly data if available
      const employeeData = monthlyData.find(item => item.employee._id === employee._id);
      const dayRecord = employeeData?.dailyAttendance[date];

      // Check if OT already exists (pending or approved) - hide Convert button
      try {
        const otResponse = await api.getOTRequests({
          employeeId: employee._id,
          employeeNumber: employee.emp_no,
          date: date,
        });
        const existing = (otResponse.data || []).filter((ot: any) =>
          ['pending', 'approved', 'manager_approved', 'hod_approved'].includes(ot?.status)
        );
        if (existing.length > 0) {
          setHasExistingOT(true);
          setOtRequestStatus(existing[0]?.status || null);
        } else {
          setHasExistingOT(false);
          setOtRequestStatus(null);
        }
      } catch (otErr) {
        console.error('Error checking existing OT:', otErr);
        setHasExistingOT(false);
        setOtRequestStatus(null);
      }

      // If we have the record with leave/OD info, use it directly
      const detail = await loadAttendanceDetailWithPermissions(employee.emp_no, date);
      if (dayRecord && detail) {
        console.log('Day record from monthly data:', dayRecord);
        console.log('Leave info:', dayRecord.leaveInfo);
        setAttendanceDetail({
          ...detail,
          hasLeave: dayRecord.hasLeave,
          leaveInfo: dayRecord.leaveInfo,
          hasOD: dayRecord.hasOD,
          odInfo: dayRecord.odInfo,
          isConflict: dayRecord.isConflict,
          isEdited: dayRecord.isEdited,
          editHistory: dayRecord.editHistory,
          source: dayRecord.source,
        });
        setShowDetailDialog(true);
      } else if (detail) {
        console.log('Day record from API:', detail);
        setAttendanceDetail(detail);
        setShowDetailDialog(true);
      } else if (dayRecord) {
        setAttendanceDetail(dayRecord);
        setShowDetailDialog(true);
      }
    } catch (err) {
      console.error('Error loading attendance detail:', err);
      setError('Failed to load attendance detail');
    }
  };

  const closeSingleOtConfirmModal = () => {
    if (convertingToOT || singleOtConfirmLoading) return;
    setShowSingleOtConfirmModal(false);
    setSingleOtConfirmError('');
    setSingleOtConfirmData(null);
  };

  const handleConvertExtraHoursToOT = async () => {
    if (!selectedEmployee || !selectedDate || !attendanceDetail) {
      setError('Missing employee or date information');
      return;
    }
    if (isAttendanceDetailLocked) {
      setError('Batch locked. No further operation will be performed for this attendance day.');
      return;
    }
    if (!attendanceDetail.extraHours || attendanceDetail.extraHours <= 0) {
      setError('No extra hours to convert');
      return;
    }
    if (hasExistingOT) {
      setError('OT record already exists for this date');
      return;
    }
    const hasShift = Boolean(
      attendanceDetail.shiftId || (attendanceDetail.shifts && attendanceDetail.shifts.length > 0)
    );
    if (!hasShift) {
      setError('Shift not assigned. Please assign shift first.');
      return;
    }

    setError('');
    setSuccess('');
    setShowSingleOtConfirmModal(true);
    setSingleOtConfirmLoading(true);
    setSingleOtConfirmError('');
    setSingleOtConfirmData(null);

    try {
      const preview = await api.previewOTExtraHours({
        employeeId: selectedEmployee._id,
        employeeNumber: selectedEmployee.emp_no,
        date: selectedDate,
      });
      if (!preview.success) {
        setSingleOtConfirmError((preview as { message?: string }).message || 'Could not preview OT rules');
        return;
      }
      const pdata = (preview as { data?: any }).data;
      if (pdata?.hasExistingOt) {
        setSingleOtConfirmError(
          'An OT record already exists for this date (pending or approved). Refresh if this looks wrong.'
        );
        return;
      }
      const pol = pdata?.policy;
      if (!pol?.eligible) {
        setSingleOtConfirmError(
          `Extra hours do not qualify under OT rules (${Number(pdata?.rawExtraHours).toFixed(2)}h raw). ${(pol?.steps || []).join('; ')}`
        );
        return;
      }
      setSingleOtConfirmData({
        employeeId: selectedEmployee._id,
        employeeNumber: selectedEmployee.emp_no,
        employeeName: selectedEmployee.employee_name || selectedEmployee.emp_no,
        date: selectedDate,
        rawHours: Number(pdata?.rawExtraHours ?? 0),
        finalHours: Number(pol.finalHours ?? 0),
        steps: pol?.steps || [],
      });
    } catch (err: any) {
      console.error('OT preview error:', err);
      setSingleOtConfirmError(err?.message || 'Preview failed');
    } finally {
      setSingleOtConfirmLoading(false);
    }
  };

  const handleConfirmSingleOtConvert = async () => {
    if (!singleOtConfirmData) return;
    try {
      setConvertingToOT(true);
      setError('');
      setSuccess('');
      const response = await api.convertExtraHoursToOT({
        employeeId: singleOtConfirmData.employeeId,
        employeeNumber: singleOtConfirmData.employeeNumber,
        date: singleOtConfirmData.date,
      });
      if (response.success) {
        setSuccess(response.message || 'OT conversion requested. Pending management approval.');
        setHasExistingOT(true);
        setOtRequestStatus('pending');
        closeSingleOtConfirmModal();
        await loadMonthlyAttendance();
      } else {
        setSingleOtConfirmError(response.message || 'Failed to convert extra hours to OT');
      }
    } catch (err: any) {
      console.error('Error converting extra hours to OT:', err);
      setSingleOtConfirmError(err?.message || 'An error occurred while converting');
    } finally {
      setConvertingToOT(false);
    }
  };

  const handleToggleOtEmployeeSelection = (employeeId: string, checked: boolean) => {
    setSelectedOtEmployees((prev) => ({ ...prev, [employeeId]: checked }));
  };

  const handleSelectAllOtEmployees = (checked: boolean) => {
    if (!checked) {
      setSelectedOtEmployees({});
      return;
    }
    const next: Record<string, boolean> = {};
    filteredMonthlyData.forEach((item) => {
      if (item?.employee?._id) next[item.employee._id] = true;
    });
    setSelectedOtEmployees(next);
  };

  const handleBulkConvertSelectedToOT = async () => {
    if (tableType !== 'ot' || otAutoCreateEnabled) return;
    const selected = filteredMonthlyData.filter((item) => selectedOtEmployees[item.employee._id]);
    if (!selected.length) {
      setError('Select at least one employee in OT table');
      return;
    }
    setBulkOtPreviewLoading(true);
    setError('');
    setSuccess('');
    const skippedItems: Array<{ key: string; label: string; date: string; reason: string }> = [];
    try {
      const eligibleQueue: Array<{
        key: string;
        employeeId: string;
        employeeNumber: string;
        employeeName: string;
        date: string;
        rawHours: number;
        slabHours: number;
        steps: string[];
      }> = [];

      for (const item of selected) {
        const employeeId = item.employee?._id;
        const employeeNumber = item.employee?.emp_no;
        const employeeName = item.employee?.employee_name || employeeNumber || 'Employee';
        const empLabel = `${employeeName} (${employeeNumber})`;
        if (!employeeId || !employeeNumber) {
          skippedItems.push({
            key: `no-emp-${skippedItems.length}`,
            label: empLabel,
            date: '—',
            reason: 'Missing employee ID or employee number',
          });
          continue;
        }
        const entries = Object.entries(item.dailyAttendance || {});
        for (const [date, record] of entries) {
          const rawExtraGrid = Number((record as any)?.extraHours || 0);
          if (rawExtraGrid <= 0) continue;

          const rowKey = `${employeeNumber}|${date}`;
          let preview: any;
          try {
            preview = await api.previewOTExtraHours({ employeeId, employeeNumber, date });
          } catch (e: any) {
            skippedItems.push({
              key: rowKey,
              label: empLabel,
              date,
              reason: e?.message || 'Preview request failed',
            });
            continue;
          }
          const pdata = preview?.data;
          if (!preview.success) {
            skippedItems.push({
              key: rowKey,
              label: empLabel,
              date,
              reason: (preview as { message?: string }).message || 'Preview failed',
            });
            continue;
          }
          if (pdata?.hasExistingOt) {
            skippedItems.push({
              key: rowKey,
              label: empLabel,
              date,
              reason: 'OT already exists for this date (pending or approved)',
            });
            continue;
          }
          const pol = pdata?.policy;
          if (!pol?.eligible) {
            const detail = (pol?.steps || []).join('; ') || 'Does not meet OT slab/threshold rules';
            skippedItems.push({
              key: rowKey,
              label: empLabel,
              date,
              reason: detail,
            });
            continue;
          }
          eligibleQueue.push({
            key: rowKey,
            employeeId,
            employeeNumber,
            employeeName,
            date,
            rawHours: Number(pdata?.rawExtraHours || 0),
            slabHours: Number(pol?.finalHours || 0),
            steps: pol?.steps || [],
          });
        }
      }

      setBulkOtSkippedItems(skippedItems);

      if (!eligibleQueue.length) {
        setBulkOtSkippedExpanded(skippedItems.length > 0);
        setBulkOtEligibleQueue([]);
        setSelectedBulkOtKeys({});
        if (skippedItems.length) {
          setShowBulkOtPreviewModal(true);
          setSuccess('No eligible days to convert. Review skipped days in the dialog.');
        } else {
          setSuccess('No days with extra hours found for the selected employees.');
        }
        return;
      }

      setBulkOtEligibleQueue(eligibleQueue);
      const allSelected: Record<string, boolean> = {};
      eligibleQueue.forEach((q) => {
        allSelected[q.key] = true;
      });
      setSelectedBulkOtKeys(allSelected);
      setShowBulkOtPreviewModal(true);
      setBulkOtSkippedExpanded(skippedItems.length > 0);
      if (skippedItems.length) {
        setSuccess(
          `${eligibleQueue.length} eligible day(s) ready. ${skippedItems.length} day(s) skipped — expand Skipped days for details.`
        );
      }
    } catch (err: any) {
      console.error('Bulk OT conversion error:', err);
      setError(err?.message || 'Bulk OT conversion failed');
    } finally {
      setBulkOtPreviewLoading(false);
    }
  };

  const handleConfirmBulkConvertSelectedToOT = async () => {
    if (!bulkOtEligibleQueue.length) return;
    const selectedQueue = bulkOtEligibleQueue.filter((q) => selectedBulkOtKeys[q.key]);
    if (!selectedQueue.length) {
      setError('Select at least one eligible day to create OT');
      return;
    }
    try {
      setConvertingToOT(true);
      setError('');
      setSuccess('');
      let converted = 0;
      let failed = 0;
      for (const item of selectedQueue) {
        const resp = await api.convertExtraHoursToOT({
          employeeId: item.employeeId,
          employeeNumber: item.employeeNumber,
          date: item.date,
        });
        if (resp.success) converted += 1;
        else failed += 1;
      }
      setSuccess(`Bulk OT conversion finished: ${converted} converted, ${failed} failed.`);
      setSelectedOtEmployees({});
      setShowBulkOtPreviewModal(false);
      setBulkOtEligibleQueue([]);
      setSelectedBulkOtKeys({});
      setBulkOtSkippedItems([]);
      setBulkOtSkippedExpanded(false);
      await loadMonthlyAttendance();
    } catch (err: any) {
      console.error('Bulk OT conversion error:', err);
      setError(err?.message || 'Bulk OT conversion failed');
    } finally {
      setConvertingToOT(false);
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      // Set to 15th to avoid month-end rollover issues (e.g. Mar 31 -> Feb 28)
      newDate.setDate(15);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleExcelUpload = async () => {
    if (!uploadFile) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setSuccess('');
      const response = await api.uploadAttendanceExcel(uploadFile);
      if (response.success) {
        if (response.isAsync) {
          // Large file, processing in background
          toast.info(response.data.message || 'Processing started in background');
        } else {
          toast.success(response.message || 'File uploaded successfully');
          loadMonthlyAttendance();
        }

        setUploadFile(null);
        setShowUploadDialog(false);
        const fileInput = document.getElementById('excel-upload-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        toast.error(response.message || 'Upload failed');
        setError(response.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await api.downloadAttendanceTemplate();
      setSuccess('Template downloaded successfully');
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const handleViewPayslip = async (employee: Employee) => {
    setSelectedEmployeeForPayslip(employee);
    setShowPayslipModal(true);
    setLoadingPayslip(true);
    setPayslipData(null);
    setError('');

    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const response = await api.getPayslip(employee._id, monthStr);

      if (response.success && response.data) {
        setPayslipData(response.data);
      } else {
        // If payslip doesn't exist, offer to calculate
        setError('Payslip not found. Would you like to calculate payroll?');
      }
    } catch (err: any) {
      console.error('Error loading payslip:', err);
      if (err.message?.includes('not found') || err.message?.includes('404')) {
        setError('Payslip not found. Would you like to calculate payroll?');
      } else {
        setError('Failed to load payslip');
      }
    } finally {
      setLoadingPayslip(false);
    }
  };

  const handleCalculatePayroll = async () => {
    if (!selectedEmployeeForPayslip) return;

    try {
      setCalculatingPayroll(true);
      setError('');
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const response = await api.calculatePayroll(selectedEmployeeForPayslip._id, monthStr);

      if (response.success) {
        toast.success('Payroll calculated successfully!');
        // Reload payslip
        const payslipResponse = await api.getPayslip(selectedEmployeeForPayslip._id, monthStr);
        if (payslipResponse.success && payslipResponse.data) {
          setPayslipData(payslipResponse.data);
          setError('');
        }
      } else {
        const errorMsg = response.message || 'Failed to calculate payroll';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err: any) {
      console.error('Error calculating payroll:', err);
      setError(err.message || 'Failed to calculate payroll');
    } finally {
      setCalculatingPayroll(false);
    }
  };

  const handleEmployeeClick = async (employee: Employee) => {
    setSelectedEmployeeForSummary(employee);
    setShowSummaryModal(true);
    setLoadingSummary(true);
    try {
      // First try to get summary from the monthly data if available
      const employeeData = monthlyData.find(item => item.employee._id === employee._id);
      if (employeeData && employeeData.summary) {
        setMonthlySummary(employeeData.summary);
        setLoadingSummary(false);
        return;
      }

      // If not in monthly data, fetch from API
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const response = await api.getMonthlySummary(employee._id, monthStr);
      if (response.success) {
        setMonthlySummary(response.data);
      } else {
        setError('Failed to load monthly summary');
      }
    } catch (err: any) {
      console.error('Error loading monthly summary:', err);
      setError('Failed to load monthly summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const [exportingPDF, setExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    try {
      setExportingPDF(true);
      setError('');
      setSuccess('');

      const params = {
        year: String(year),
        month: String(month),
        search: debouncedSearch,
        divisionId: selectedDivision,
        departmentId: selectedDepartment,
        designationId: selectedDesignation,
        startDate: cycleDates.startDate,
        endDate: cycleDates.endDate,
        groupBy: 'employee'
      };

      const blob = await api.exportAttendanceReportPDF(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_report_${year}_${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('PDF report downloaded successfully');
    } catch (err: any) {
      console.error('PDF Export error:', err);
      toast.error(err.message || 'Failed to export PDF');
      setError(err.message || 'Failed to export PDF');
    } finally {
      setExportingPDF(false);
    }
  };

  const handleSyncShifts = async () => {
    const result = await alertConfirm(
      'Sync Shifts?',
      'This will sync shifts for all attendance records that don\'t have shifts assigned. This may take a few minutes.',
      'Yes, Sync Now'
    );
    if (!result.isConfirmed) return;

    try {
      setSyncingShifts(true);
      setError('');
      setSuccess('');
      const response = await api.syncShifts();
      if (response.success) {
        alertSuccess('Success', response.message || `Processed ${response.data?.processed || 0} records: ${response.data?.assigned || 0} assigned, ${response.data?.confused || 0} flagged for review`);
        loadMonthlyAttendance();
      } else {
        alertError('Failed', response.message || 'Failed to sync shifts');
      }
    } catch (err: any) {
      alertError('Error', err.message || 'An error occurred during shift sync');
    } finally {
      setSyncingShifts(false);
    }
  };

  const handleExportAttendance = async () => {
    try {
      setExportingExcel(true);
      setError('');
      const response = await api.getMonthlyAttendance(year, month, {
        page: 1,
        limit: 50000,
        search: debouncedSearch,
        divisionId: selectedDivision,
        departmentId: selectedDepartment,
        designationId: selectedDesignation,
        startDate: cycleDates.startDate,
        endDate: cycleDates.endDate,
      });
      if (!response.success || !response.data?.length) {
        toast.warn('No attendance data to export');
        return;
      }
      const data = normalizeAttendanceData(response.data || []);
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const monthLabel = `${monthNames[month - 1]} ${year}`;
      writeMonthlyAttendanceExcelFile(data, {
        cycleDates,
        year,
        month,
        monthLabel,
        whenNoCycle: 'none',
        processingMode: attendanceProcessingMode,
      });
      toast.success(`Exported ${data.length} employees to attendance_${monthStr}.xlsx`);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(err?.message || 'Failed to export attendance');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleUpdateOutTime = async () => {
    if (!selectedRecordForOutTime || !outTimeValue) {
      alert('Please enter out time');
      return;
    }

    try {
      setUpdatingOutTime(true);
      setError('');
      setSuccess('');

      // Support datetime-local (YYYY-MM-DDTHH:mm) for overnight: use full date from input. Else time-only on record date.
      let isoString: string;
      if (outTimeValue.includes('T')) {
        isoString = new Date(outTimeValue).toISOString();
      } else {
        const [hours, mins] = outTimeValue.split(':').map(Number);
        const date = new Date(selectedRecordForOutTime.date);
        date.setHours(hours, mins, 0, 0);
        isoString = date.toISOString();
      }

      const response = await api.updateAttendanceOutTime(
        selectedRecordForOutTime.employee.emp_no,
        selectedRecordForOutTime.date,
        isoString,
        selectedRecordForOutTime.shiftRecordId
      );

      if (response.success) {
        setSuccess('Out time updated successfully. Shift will be automatically assigned.');
        setShowOutTimeDialog(false);
        setSelectedRecordForOutTime(null);
        setOutTimeValue('');

        // Optimistic update: mark as manually edited
        setMonthlyData(prevData => prevData.map(empData => {
          if (empData.employee.emp_no === selectedRecordForOutTime.employee.emp_no) {
            const updatedDaily = { ...empData.dailyAttendance };
            if (updatedDaily[selectedRecordForOutTime.date]) {
              const record = updatedDaily[selectedRecordForOutTime.date];
              if (record) {
                const newSource = record.source ? [...record.source] : [];
                if (!newSource.includes('manual')) newSource.push('manual');
                updatedDaily[selectedRecordForOutTime.date] = { ...record, source: newSource };
              }
            }
            return { ...empData, dailyAttendance: updatedDaily };
          }
          return empData;
        }));

        loadMonthlyAttendance();
      } else {
        if (isAttendanceLockedResponse(response)) {
          await handleAttendanceLockedPopup(response.message);
          return;
        }
        setError(response.message || 'Failed to update out time');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating out time');
    } finally {
      setUpdatingOutTime(false);
    }
  };

  const handleUpdateInTime = async () => {
    if (!selectedRecordForInTime || !inTimeDialogValue) {
      alert('Please enter in time');
      return;
    }
    try {
      setUpdatingInTime(true);
      setError('');
      setSuccess('');
      let isoString: string;
      if (inTimeDialogValue.includes('T')) {
        isoString = new Date(inTimeDialogValue).toISOString();
      } else {
        const [hours, mins] = inTimeDialogValue.split(':').map(Number);
        const d = new Date(selectedRecordForInTime.date);
        d.setHours(hours, mins, 0, 0);
        isoString = d.toISOString();
      }
      const response = await api.updateAttendanceInTime(
        selectedRecordForInTime.employee.emp_no,
        selectedRecordForInTime.date,
        isoString,
        selectedRecordForInTime.shiftRecordId
      );
      if (response.success) {
        setSuccess('In time updated successfully.');
        setShowInTimeDialog(false);
        setSelectedRecordForInTime(null);
        setInTimeDialogValue('');
        await loadMonthlyAttendance();
        if (selectedEmployee && selectedDate && selectedRecordForInTime.employee.emp_no === selectedEmployee.emp_no && selectedRecordForInTime.date === selectedDate) {
          const updatedDetail = await loadAttendanceDetailWithPermissions(selectedEmployee.emp_no, selectedDate);
          if (updatedDetail) setAttendanceDetail(updatedDetail);
        }
      } else {
        if (isAttendanceLockedResponse(response)) {
          await handleAttendanceLockedPopup(response.message);
          return;
        }
        setError(response.message || 'Failed to update in time');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating in time');
    } finally {
      setUpdatingInTime(false);
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = () => {
    const lastDay = new Date(year, month, 0);
    return lastDay.getDate();
  };

  const getCalendarDays = () => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        day,
        date: dateStr,
      });
    }

    return days;
  };

  const getStatusColor = (record: AttendanceRecord | null) => {
    if (!record) return '';
    if (record.status === 'PRESENT') return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/10 dark:border-green-800 dark:text-green-400';
    if (record.status === 'PARTIAL') return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/10 dark:border-yellow-800 dark:text-yellow-400';
    if (record.status === 'HALF_DAY') return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/10 dark:border-orange-800 dark:text-orange-400';
    if (record.status === 'HOLIDAY') return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/10 dark:border-red-800 dark:text-red-400';
    if (record.status === 'WEEK_OFF') return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/10 dark:border-orange-800 dark:text-orange-400';
    if (record.status === 'OD') return 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-900/10 dark:border-indigo-800 dark:text-indigo-400';
    return '';
  };

  const getCellBackgroundColor = (record: AttendanceRecord | null) => {
    if (!record) {
      return 'bg-slate-100 dark:bg-slate-800';
    }

    // Priority: Conflict (purple) > Leave (orange) > OD (blue) > Absent (gray) > Present (default)
    if (record.isConflict) {
      return 'bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700';
    }
    if (record.hasLeave && !record.hasOD) {
      if (record.leaveInfo?.numberOfDays && record.leaveInfo.numberOfDays >= 3) {
        return 'bg-amber-200 border-amber-400 dark:bg-amber-900/50 dark:border-amber-600';
      }
      return 'bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700';
    }
    if (record.hasOD && !record.hasLeave) {
      if (record.status === 'OD') {
        return 'bg-indigo-100 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-700';
      }
      return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700';
    }
    if (record.hasLeave && record.hasOD) {
      // Both leave and OD - show as conflict
      return 'bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700';
    }
    if (record.status === 'ABSENT' || record.status === 'LEAVE' || record.status === 'OD' || record.status === 'HALF_DAY') {
      return 'bg-slate-100 dark:bg-slate-800';
    }
    if (record.status === 'HOLIDAY') {
      return 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-700';
    }
    if (record.status === 'WEEK_OFF') {
      return 'bg-orange-100 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700';
    }
    return '';
  };



  const formatHours = (hours: number | null | undefined) => {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return '-';
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  const formatHoursHHMM = (hours: number | null | undefined) => {
    if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return '-';
    const totalMinutes = Math.round(Number(hours) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const formatOtPolicyStepLineForDisplay = (line: string) =>
    line.replace(/(\d+(?:\.\d+)?)h\b/g, (match, numStr) => {
      const v = parseFloat(numStr);
      if (!Number.isFinite(v)) return match;
      return formatHoursHHMM(v);
    });

  const daysInMonth = getDaysInMonth();
  const daysArray = useMemo(() => {
    if (!cycleDates.startDate || !cycleDates.endDate) return [];

    const dates = [];
    let current = new Date(cycleDates.startDate);
    const end = new Date(cycleDates.endDate);

    let count = 0;
    while (current <= end && count <= 35) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      dates.push(dateStr);
      current.setDate(current.getDate() + 1);
      count++;
    }
    return dates;
  }, [cycleDates.startDate, cycleDates.endDate]);

  const visibleSuperadminCompleteKeys = useMemo(
    () => superadminVisibleCompleteKeys(orgCompleteSummaryColumns),
    [orgCompleteSummaryColumns]
  );

  const usePayRegisterAllComplete = attendanceProcessingMode === 'single_shift' && tableType === 'complete';

  const superadminTrailingSummaryCount = useMemo(() => {
    if (tableType === 'complete' && usePayRegisterAllComplete) return 12;
    if (tableType === 'complete') return Math.max(1, visibleSuperadminCompleteKeys.length);
    if (tableType === 'present_absent') return 2;
    if (tableType === 'in_out') return 1;
    if (tableType === 'leaves') return 4;
    if (tableType === 'od') return 2;
    if (tableType === 'ot') return 2;
    return 0;
  }, [tableType, visibleSuperadminCompleteKeys.length, usePayRegisterAllComplete]);

  const superadminTableEmptyColSpan = 1 + daysArray.length + superadminTrailingSummaryCount;

  // Virtualized row component




  console.log('Attendance rendering. Data length:', filteredMonthlyData.length);
  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1920px]">
        {/* Header */}
        <div className="mb-6 flex flex-nowrap items-center justify-between gap-4 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex flex-nowrap items-center gap-4">
            {/* Title Section */}
            <div className="flex flex-nowrap items-center gap-3 shrink-0">
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">Attendance Management</h1>
              </div>

              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden md:block" />

              {/* Search Toggle */}
              <div className="flex items-center gap-2">
                {showSearch ? (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        autoFocus
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            loadMonthlyAttendance(true);
                          }
                        }}
                        placeholder="Search..."
                        className="w-40 h-9 pl-9 pr-3 text-xs rounded-xl border border-slate-200 bg-white focus:border-green-500 focus:ring-2 focus:ring-green-500/10 transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-white shadow-sm"
                      />
                    </div>
                    <button
                      onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                      className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-green-600 hover:border-green-200 hover:bg-green-50/50 transition-all shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    title="Search Records"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Filters Group */}
            <div className="flex flex-nowrap items-center gap-1.5 p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm">
              <select
                value={selectedDivision}
                onChange={(e) => {
                  setSelectedDivision(e.target.value);
                  setSelectedDepartment('');
                  setSelectedDesignation('');
                  loadDepartments(e.target.value);
                }}
                className="h-8 pl-2 pr-6 text-[11px] font-semibold bg-white dark:bg-slate-800 border-0 rounded-lg focus:ring-2 focus:ring-green-500/20 text-slate-700 dark:text-slate-300 shadow-sm min-w-[100px] max-w-[140px]"
              >
                <option value="">All Divisions</option>
                {divisions.map((div) => (
                  <option key={div._id} value={div._id}>{div.name}</option>
                ))}
              </select>

              <select
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setSelectedDesignation('');
                }}
                className="h-8 pl-2 pr-6 text-[11px] font-semibold bg-white dark:bg-slate-800 border-0 rounded-lg focus:ring-2 focus:ring-green-500/20 text-slate-700 dark:text-slate-300 shadow-sm min-w-[100px] max-w-[140px]"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>

              {selectedDepartment && (
                <select
                  value={selectedDesignation}
                  onChange={(e) => setSelectedDesignation(e.target.value)}
                  className="h-8 pl-2 pr-6 text-[11px] font-semibold bg-white dark:bg-slate-800 border-0 rounded-lg focus:ring-2 focus:ring-green-500/20 text-slate-700 dark:text-slate-300 shadow-sm min-w-[100px] max-w-[140px] animate-in slide-in-from-left-2"
                >
                  <option value="">All Designations</option>
                  {designations.map((desig) => (
                    <option key={desig._id} value={desig._id}>{desig.name}</option>
                  ))}
                </select>
              )}

              {/* Table Type Dropdown */}
              <select
                value={tableType}
                onChange={(e) => setTableType(e.target.value as any)}
                className="h-8 pl-2 pr-6 text-[11px] font-bold bg-green-50 dark:bg-green-900/20 border-0 rounded-lg focus:ring-2 focus:ring-green-500/20 text-green-700 dark:text-green-400 shadow-sm cursor-pointer"
              >
                <option value="complete">Complete</option>
                <option value="present_absent">Pres/Abs</option>
                <option value="in_out">In/Out</option>
                <option value="leaves">Leaves</option>
                <option value="od">OD</option>
                <option value="ot">OT</option>
              </select>
            </div>
          </div>

          <div className="flex flex-nowrap items-center gap-3 shrink-0">
            {/* Month/Year Navigation */}
            <div className="flex items-center gap-0.5 p-0.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <button
                onClick={() => navigateMonth('prev')}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center px-1 space-x-0.5">
                <select
                  value={month}
                  onChange={(e) => {
                    const newDate = new Date(currentDate);
                    newDate.setDate(15); // Prevent rollover
                    newDate.setMonth(parseInt(e.target.value) - 1);
                    setCurrentDate(newDate);
                  }}
                  className="bg-transparent border-0 text-[11px] font-bold text-slate-900 dark:text-white focus:ring-0 p-0 cursor-pointer"
                >
                  {monthNames.map((name, idx) => (
                    <option key={idx} value={idx + 1}>{name.substring(0, 3)}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => {
                    const newDate = new Date(currentDate);
                    newDate.setDate(15); // Prevent rollover
                    newDate.setFullYear(parseInt(e.target.value));
                    setCurrentDate(newDate);
                  }}
                  className="bg-transparent border-0 text-[11px] font-bold text-slate-900 dark:text-white focus:ring-0 p-0 cursor-pointer"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => navigateMonth('next')}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncShifts}
                disabled={syncingShifts}
                title="Sync Shifts"
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-green-600 hover:border-green-200 transition-all shadow-sm active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 md:w-auto md:px-3"
              >
                {syncingShifts ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                ) : (
                  <svg className="h-4 w-4 md:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span className="hidden md:inline text-xs font-semibold">Sync</span>
              </button>

              {attendanceFeatureFlags.allowAttendanceUpload && (
                <button
                  onClick={() => setShowUploadDialog(true)}
                  title="Upload Excel"
                  className="h-9 flex items-center px-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-xs font-bold text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:-translate-y-0.5 transition-all active:scale-95"
                >
                  <svg className="mr-2 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload
                </button>
              )}

              <button
                onClick={handleExportAttendance}
                disabled={exportingExcel}
                title="Export filtered attendance to Excel"
                className="h-9 flex items-center px-4 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400"
              >
                {exportingExcel ? (
                  <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                ) : (
                  <svg className="mr-2 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {exportingExcel ? 'Exporting...' : 'Export'}
              </button>

              <button
                onClick={handleExportPDF}
                disabled={exportingPDF}
                title="Download PDF Attendance Report"
                className="h-9 flex items-center px-4 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-red-400"
              >
                {exportingPDF ? (
                  <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                ) : (
                  <svg className="mr-2 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                {exportingPDF ? 'Generating...' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>


        {/* Status Legend */}
        <div className="mb-6 flex flex-wrap items-center gap-4 px-4 py-3 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 backdrop-blur-sm shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mr-2">Status Key</span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {[
              { label: 'P', name: 'Present', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
              { label: 'H', name: 'Holiday', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
              { label: 'WO', name: 'Week Off', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' },
              { label: 'L', name: 'Leave', color: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/10 dark:text-orange-400 dark:border-orange-900/30' },
              { label: 'LL', name: 'Long Leave', color: 'bg-amber-200 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700' },
              { label: 'OD', name: 'On Duty', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
              { label: 'PT', name: 'Partial', color: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
              { label: 'HD', name: 'Half Day', color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/10 dark:text-orange-400 dark:border-orange-900/30' },
              { label: 'A', name: 'Absent', color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
              { label: '!', name: 'Conflict', color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' },
              { label: '✎', name: 'Edited', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/10 dark:text-indigo-400 dark:border-indigo-800' },
              { label: '●', name: 'Late', color: 'bg-amber-500', dotOnly: true },
              { label: '●', name: 'Early out', color: 'bg-blue-500', dotOnly: true },
            ].map((item, idx) => (
              <div key={`${item.label}-${item.name}-${idx}`} className="flex items-center gap-2 group cursor-help">
                <div className={`flex items-center justify-center rounded text-[10px] font-bold border shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:shadow-md ${(item as any).dotOnly ? 'w-5 h-5 border-transparent' : 'w-6 h-6'} ${(item as any).dotOnly ? '' : item.color}`}>
                  {(item as any).dotOnly ? <span className={`inline-block h-2 w-2 rounded-full ${item.color}`} /> : item.label}
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}


        {/* Attendance Table */}
        <div className="mb-2 flex items-center justify-end gap-2">
          {tableType === 'ot' && !otAutoCreateEnabled && (
            <>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={
                    filteredMonthlyData.length > 0 &&
                    filteredMonthlyData.every((i) => Boolean(selectedOtEmployees[i.employee._id]))
                  }
                  onChange={(e) => handleSelectAllOtEmployees(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                Select all
              </label>
              <button
                type="button"
                onClick={handleBulkConvertSelectedToOT}
                disabled={convertingToOT || bulkOtPreviewLoading || filteredMonthlyData.length === 0}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                title="Convert eligible extra hours for selected employees"
              >
                {bulkOtPreviewLoading
                  ? 'Checking…'
                  : convertingToOT
                    ? 'Converting...'
                    : 'Convert Selected to OT'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => scrollAttendanceTable('left')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            title="Scroll table left"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollAttendanceTable('right')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            title="Scroll table right"
          >
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
        <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm relative">
          <table className="w-full text-xs box-border">
            {/* Table Header */}
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-20">
              {tableType === 'complete' && usePayRegisterAllComplete ? (
                <>
                  <tr className="border-b border-slate-200 dark:border-slate-700 w-full">
                    <th
                      rowSpan={2}
                      className="sticky left-0 top-0 z-30 border-r border-slate-200 bg-slate-100 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 w-[200px] min-w-[200px]"
                    >
                      Employee
                    </th>
                    {daysArray.map((dateStr) => {
                      const dateObj = parseISO(dateStr);
                      const dayNum = dateObj.getDate();
                      const dayName = format(dateObj, 'EEE');
                      return (
                        <th
                          key={dateStr}
                          rowSpan={2}
                          className="sticky top-0 z-20 border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 w-[35px] min-w-[35px]"
                        >
                          <div className="text-[10px] font-bold">{dayNum}</div>
                          <div className="text-[8px] font-medium uppercase tracking-tighter opacity-70">{dayName}</div>
                        </th>
                      );
                    })}
                    <th
                      rowSpan={2}
                      className="w-[72px] min-w-[72px] border-r border-slate-200 bg-green-50 dark:bg-green-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-green-800 dark:text-green-200"
                      title="Present days (pay register)"
                    >
                      Present
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[64px] min-w-[64px] border-r border-slate-200 bg-slate-100/90 dark:bg-slate-800/50 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-slate-800"
                    >
                      W.off
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[64px] min-w-[64px] border-r border-slate-200 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-purple-800"
                    >
                      Hol
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[78px] min-w-[78px] border-r border-slate-200 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-yellow-900"
                    >
                      T.leave
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[64px] min-w-[64px] border-r border-slate-200 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-indigo-800"
                    >
                      OD
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[64px] min-w-[64px] border-r border-slate-200 bg-red-50 dark:bg-red-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-red-800"
                    >
                      Abs
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[64px] min-w-[64px] border-r border-slate-200 bg-slate-100 dark:bg-slate-800/60 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-slate-800"
                      title="Present + week offs + holidays + total leaves + OD + absents (informational)"
                    >
                      Tot
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[58px] min-w-[58px] border-r border-slate-200 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-amber-900"
                      title="Late in + early out (count)"
                    >
                      L/E
                    </th>
                    <th
                      colSpan={3}
                      className="border-b border-r border-slate-200 bg-rose-100/80 dark:bg-rose-950/30 px-1 py-1.5 text-center text-[9px] font-bold uppercase text-rose-900 dark:text-rose-100"
                      title="Absent, LOP, and policy attendance deduction (pay register deduction block)"
                    >
                      Deduction days
                    </th>
                    <th
                      rowSpan={2}
                      className="w-[72px] min-w-[72px] border-slate-200 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-2 text-center text-[9px] font-bold uppercase text-blue-800"
                      title="Present + week offs + holidays + OD + paid leave − att. deduction"
                    >
                      Paid
                    </th>
                  </tr>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800">
                    <th
                      className="w-[60px] min-w-[60px] border-r border-slate-200 bg-red-50/90 dark:bg-red-950/30 px-1 py-1.5 text-center text-[8px] font-bold text-red-800 dark:text-red-200"
                      title="Absent days in deduction / same as main Abs for calendar absent total"
                    >
                      Absents
                    </th>
                    <th
                      className="w-[60px] min-w-[60px] border-r border-slate-200 bg-red-50/90 dark:bg-red-950/30 px-1 py-1.5 text-center text-[8px] font-bold text-red-800 dark:text-red-200"
                      title="Loss of pay leave day-units"
                    >
                      LOP
                    </th>
                    <th
                      className="w-[64px] min-w-[64px] border-r border-slate-200 bg-rose-50/90 dark:bg-rose-900/25 px-0.5 py-1.5 text-center text-[7px] font-bold leading-tight text-rose-900 dark:text-rose-100"
                      title="Policy attendance deduction (late/early, absent extra, etc.)"
                    >
                      <div className="flex flex-col items-center justify-center gap-0">
                        <span>Attendance</span>
                        <span>deduction</span>
                      </div>
                    </th>
                  </tr>
                </>
              ) : (
                <tr className="border-b border-slate-200 dark:border-slate-700 w-full">
                  <th className="sticky left-0 top-0 z-30 border-r border-slate-200 bg-slate-100 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 w-[200px] min-w-[200px]">
                    Employee
                  </th>
                  {daysArray.map((dateStr) => {
                    const dateObj = parseISO(dateStr);
                    const dayNum = dateObj.getDate();
                    const dayName = format(dateObj, 'EEE');
                    return (
                      <th
                        key={dateStr}
                        className="sticky top-0 z-20 border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 w-[35px] min-w-[35px]"
                      >
                        <div className="text-[10px] font-bold">{dayNum}</div>
                        <div className="text-[8px] font-medium uppercase tracking-tighter opacity-70">{dayName}</div>
                      </th>
                    );
                  })}
                {tableType === 'complete' && !usePayRegisterAllComplete &&
                  visibleSuperadminCompleteKeys.map((colKey, idx) => {
                    const isLast = idx === visibleSuperadminCompleteKeys.length - 1;
                    const edge = isLast ? '' : 'border-r border-slate-200';
                    const base =
                      'px-1 py-3 text-center text-[9px] font-bold uppercase dark:border-slate-200';
                    switch (colKey) {
                      case 'present':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-blue-50 text-blue-700 dark:bg-blue-900/20 w-[60px] min-w-[60px]`}
                          >
                            Pres
                          </th>
                        );
                      case 'leaves':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-amber-50 text-amber-700 dark:bg-amber-900/20 w-[60px] min-w-[60px]`}
                          >
                            Leaves
                          </th>
                        );
                      case 'od':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 w-[60px] min-w-[60px]`}
                          >
                            OD
                          </th>
                        );
                      case 'partial':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-amber-50 text-amber-900 dark:bg-amber-900/20 w-[60px] min-w-[60px]`}
                            title="PARTIAL attendance days"
                          >
                            Part
                          </th>
                        );
                      case 'absent':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-red-50 text-red-700 dark:bg-red-900/20 w-[60px] min-w-[60px]`}
                          >
                            Abs
                          </th>
                        );
                      case 'weekOffs':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-orange-100 text-orange-700 dark:bg-orange-900/20 w-[60px] min-w-[60px]`}
                          >
                            WO
                          </th>
                        );
                      case 'holidays':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-red-50 text-red-700 dark:bg-red-900/20 w-[60px] min-w-[60px]`}
                          >
                            Hol
                          </th>
                        );
                      case 'otHours':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-orange-50 text-orange-700 dark:bg-orange-900/20 w-[60px] min-w-[60px]`}
                          >
                            OT
                          </th>
                        );
                      case 'extraHours':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-purple-50 text-purple-700 dark:bg-purple-900/20 w-[60px] min-w-[60px]`}
                          >
                            Extra
                          </th>
                        );
                      case 'permissions':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 w-[80px] min-w-[80px]`}
                          >
                            Perms
                          </th>
                        );
                      case 'lateEarly':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-rose-50 text-rose-700 dark:bg-rose-900/20 w-[70px] min-w-[70px]`}
                          >
                            Lates+
                          </th>
                        );
                      case 'attDed':
                        return (
                          <th
                            key={colKey}
                            className={`${edge} ${base} bg-violet-50 text-violet-800 dark:bg-violet-900/25 w-[64px] min-w-[64px]`}
                            title="Policy attendance deduction days (late/early + absent extra), same as payroll"
                          >
                            Att ded
                          </th>
                        );
                      case 'payableShifts':
                        return (
                          <th
                            key={colKey}
                            className={`bg-green-50 ${base} text-green-700 dark:bg-green-900/20 w-[70px] min-w-[70px]`}
                          >
                            Payable
                          </th>
                        );
                      default:
                        return null;
                    }
                  })}
                {tableType === 'present_absent' && (
                  <>
                    <th className="border-r border-slate-200 bg-green-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-green-700 w-[60px] min-w-[60px]">P</th>
                    <th className="border-r border-slate-200 bg-red-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-red-700 w-[60px] min-w-[60px]">A</th>
                  </>
                )}
                {tableType === 'in_out' && (
                  <th className="border-r border-slate-200 bg-blue-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-blue-700 w-[60px] min-w-[60px]">Days</th>
                )}
                {tableType === 'leaves' && (
                  <>
                    <th className="border-r border-slate-200 bg-orange-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-orange-700 w-[60px] min-w-[60px]">Tot</th>
                    <th className="border-r border-slate-200 bg-red-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-red-700 w-[60px] min-w-[60px]">Abs</th>
                    <th className="border-r border-slate-200 bg-yellow-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-yellow-700 w-[60px] min-w-[60px]">Paid</th>
                    <th className="border-r border-slate-200 bg-rose-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-rose-700 w-[60px] min-w-[60px]">LOP</th>
                  </>
                )}
                {tableType === 'od' && (
                  <>
                    <th className="border-r border-slate-200 bg-indigo-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-indigo-700 w-[60px] min-w-[60px]">OD</th>
                    <th className="border-r border-slate-200 bg-red-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-red-700 w-[60px] min-w-[60px]">Abs</th>
                  </>
                )}
                {tableType === 'ot' && (
                  <>
                    <th className="border-r border-slate-200 bg-orange-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-orange-700 w-[60px] min-w-[60px]">OT</th>
                    <th className="border-r border-slate-200 bg-purple-50 px-1 py-3 text-center text-[9px] font-bold uppercase text-purple-700 w-[60px] min-w-[60px]">Extra</th>
                  </>
                )}
              </tr>
              )}
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {loading ? (
                <>
                  {/* Skeleton Loading - only tbody cells */}
                  {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 w-full">
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 w-[200px] min-w-[200px]">
                        <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                        <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                      </td>
                      {daysArray.map((dateStr) => (
                        <td
                          key={dateStr}
                          className="border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700 w-[35px] min-w-[35px]"
                        >
                          <div className="h-8 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                        </td>
                      ))}
                      {tableType === 'complete' && usePayRegisterAllComplete
                        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                            <td
                              key={i}
                              className="border-r border-slate-200 px-2 py-2 text-center dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 w-[56px] min-w-[56px]"
                            >
                              <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                            </td>
                          ))
                        : null}
                      {tableType === 'complete' && !usePayRegisterAllComplete &&
                        visibleSuperadminCompleteKeys.map((colKey, skIdx) => {
                          const isLast = skIdx === visibleSuperadminCompleteKeys.length - 1;
                          const edge = isLast ? '' : 'border-r border-slate-200';
                          const bg =
                            colKey === 'present'
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : colKey === 'leaves'
                                ? 'bg-amber-50 dark:bg-amber-900/20'
                                : colKey === 'od'
                                  ? 'bg-indigo-50 dark:bg-indigo-900/20'
                                  : colKey === 'partial'
                                    ? 'bg-amber-50 dark:bg-amber-900/20'
                                    : colKey === 'absent'
                                      ? 'bg-red-50 dark:bg-red-900/20'
                                      : colKey === 'weekOffs'
                                        ? 'bg-orange-100 dark:bg-orange-900/20'
                                        : colKey === 'holidays'
                                          ? 'bg-red-50 dark:bg-red-900/20'
                                          : colKey === 'otHours'
                                            ? 'bg-orange-50 dark:bg-orange-900/20'
                                            : colKey === 'extraHours'
                                              ? 'bg-purple-50 dark:bg-purple-900/20'
                                              : colKey === 'permissions'
                                                ? 'bg-cyan-50 dark:bg-cyan-900/20'
                                                : colKey === 'lateEarly'
                                                  ? 'bg-rose-50 dark:bg-rose-900/20'
                                                  : colKey === 'attDed'
                                                    ? 'bg-violet-50 dark:bg-violet-900/25'
                                                    : 'bg-green-50 dark:bg-green-900/20';
                          const w =
                            colKey === 'permissions'
                              ? 'w-[80px] min-w-[80px]'
                              : colKey === 'lateEarly'
                                ? 'w-[70px] min-w-[70px]'
                                : colKey === 'attDed'
                                  ? 'w-[64px] min-w-[64px]'
                                  : colKey === 'payableShifts'
                                    ? 'w-[70px] min-w-[70px]'
                                    : 'w-[60px] min-w-[60px]';
                          return (
                            <td key={colKey} className={`${edge} border-slate-200 px-2 py-2 text-center dark:border-slate-700 ${bg} ${w}`}>
                              <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                            </td>
                          );
                        })}
                      {tableType === 'present_absent' && (
                        <>
                          <td className="border-r border-slate-200 bg-green-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                          <td className="border-r border-slate-200 bg-red-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                        </>
                      )}
                      {tableType === 'in_out' && (
                        <td className="border-r border-slate-200 bg-blue-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                      )}
                      {tableType === 'leaves' && (
                        <>
                          <td className="border-r border-slate-200 bg-orange-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                          <td className="border-r border-slate-200 bg-red-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                          <td className="border-r border-slate-200 bg-yellow-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                          <td className="border-r border-slate-200 bg-rose-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                        </>
                      )}
                      {tableType === 'od' && (
                        <>
                          <td className="border-r border-slate-200 bg-indigo-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                          <td className="border-r border-slate-200 bg-red-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                        </>
                      )}
                      {tableType === 'ot' && (
                        <>
                          <td className="border-r border-slate-200 bg-orange-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                          <td className="border-r border-slate-200 bg-purple-50 px-2 py-2 text-center dark:border-slate-700 w-[60px] min-w-[60px]"><div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div></td>
                        </>
                      )}
                    </tr>
                  ))}
                </>
              ) : filteredMonthlyData.length === 0 ? (
                <tr>
                  <td colSpan={superadminTableEmptyColSpan} className="p-8 text-center text-slate-500 min-h-[400px]">
                    No employees found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredMonthlyData.map((item, index) => {
                  {/* Inline logic from previous Row component */ }
                  // Ensure dailyAttendance is always an object
                  const dailyAttendance = (item.dailyAttendance && typeof item.dailyAttendance === 'object') ? item.dailyAttendance : {};

                  // Safe helper was here, but we can just use safe checks inline or Object.values(dailyAttendance || {})
                  const safeGetValues = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return [];
                    try { return Object.values(obj); } catch (e) { return []; }
                  };

                  const dailyValues: any[] = safeGetValues(dailyAttendance);

                  const presentFromSummary = getPresentExcludingOD(item.summary);
                  const daysPresent = presentFromSummary != null
                    ? presentFromSummary
                    : item.presentDays !== undefined
                      ? item.presentDays
                      : dailyValues.reduce((sum, record: any) => {
                        if (!record) return sum;
                        let contribution = 0;
                        if (record.status === 'PRESENT' || record.status === 'PARTIAL') contribution = 1;
                        else if (record.status === 'HALF_DAY') contribution = 0.5;
                        return Math.round((sum + contribution) * 100) / 100;
                      }, 0);

                  const payableShifts = Number(
                    item.summary?.totalPayableShifts ?? item.payableShifts ?? 0
                  );
                  const monthPresent = dailyValues.reduce((sum, r: any) => {
                    if (r?.status === 'PRESENT' || r?.status === 'PARTIAL') return sum + 1;
                    if (r?.status === 'HALF_DAY') return sum + 0.5;
                    return sum;
                  }, 0);
                  const monthAbsent = getAbsentCountForRow(item, dailyValues);
                  const leaveRecords = dailyValues.filter((r: any) => r?.status === 'LEAVE' || r?.hasLeave);
                  const totalLeaves = item.summary?.totalLeaves ?? leaveRecords.length;
                  const weekOffsCount = item.summary?.totalWeeklyOffs ?? dailyValues.filter((r: any) => r?.status === 'WEEK_OFF').length;
                  const holidaysCount = item.summary?.totalHolidays ?? dailyValues.filter((r: any) => r?.status === 'HOLIDAY').length;
                  const lopCount = leaveRecords.filter((r: any) => {
                    const anyR = r as any;
                    return anyR?.leaveNature === 'lop' ||
                      anyR?.leaveInfo?.leaveType?.toLowerCase().includes('lop') ||
                      anyR?.leaveInfo?.leaveType?.toLowerCase().includes('loss of pay');
                  }).length;
                  const summaryPaidLeaves = Number(item.summary?.totalPaidLeaves);
                  const summaryLopLeaves = Number(item.summary?.totalLopLeaves);
                  const paidLeaveCol = Number.isFinite(summaryPaidLeaves)
                    ? summaryPaidLeaves
                    : Math.max(0, totalLeaves - lopCount);
                  const lopLeaveCol = Number.isFinite(summaryLopLeaves) ? summaryLopLeaves : lopCount;
                  const totalODs = item.summary?.totalODs ?? dailyValues.filter((r: any) => r?.status === 'OD' || r?.hasOD).length;
                  const partialContributionTotal = getPartialColumnTotal(item.summary, dailyAttendance);
                  const prAllRow = usePayRegisterAllComplete
                    ? computePayRegisterAllRowFromMonthlySummary(
                        item.summary ??
                          ({
                            totalPresentDays: daysPresent,
                            totalWeeklyOffs: weekOffsCount,
                            totalHolidays: holidaysCount,
                            totalLeaves,
                            totalPaidLeaves: paidLeaveCol,
                            totalLopLeaves: lopLeaveCol,
                            totalODs,
                            totalAbsentDays: monthAbsent,
                          } as any),
                        { processingMode: 'single_shift' }
                      )
                    : null;

                  // Helper for department/division names
                  const getDeptName = (emp: Employee) => {
                    if (emp.department && typeof emp.department === 'object') return emp.department.name;
                    if (emp.department_id && typeof emp.department_id === 'object') return emp.department_id.name;
                    return '';
                  };

                  const getDesignationName = (emp: Employee) => {
                    if (emp.designation && typeof emp.designation === 'object') return emp.designation.name;
                    if (emp.designation_id && typeof emp.designation_id === 'object') return emp.designation_id.name;
                    return 'Staff';
                  };

                  const isHighAbsenteeism = monthAbsent > 2;

                  return (
                    <tr
                      key={item.employee?._id || index}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition-colors w-full ${isHighAbsenteeism ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}
                    >
                      <td className={`sticky left-0 z-10 border-r border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-900 dark:border-slate-700 dark:text-white w-[200px] min-w-[200px] ${isHighAbsenteeism ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-slate-900'}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            {tableType === 'ot' && !otAutoCreateEnabled && item.employee?._id && (
                              <input
                                type="checkbox"
                                checked={Boolean(selectedOtEmployees[item.employee._id])}
                                onChange={(e) =>
                                  handleToggleOtEmployeeSelection(item.employee._id as string, e.target.checked)
                                }
                                onClick={(e) => e.stopPropagation()}
                                title="Select employee for bulk OT conversion"
                                className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500"
                              />
                            )}
                            <div
                              className="font-semibold truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-1"
                              onClick={() => item.employee && handleEmployeeClick(item.employee)}
                              title="Click to view monthly summary"
                            >
                              {item.employee?.employee_name || 'Unknown Employee'}
                            </div>
                          </div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-1 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span>{item.employee?.emp_no || '-'}</span>
                              <span>•</span>
                              <span className="font-medium">{item.employee ? getDesignationName(item.employee) : 'Staff'}</span>
                            </div>
                            {item.employee && getDeptName(item.employee) && (
                              <span className="text-blue-500/80 dark:text-blue-400/80 font-bold tracking-widest uppercase text-[8px]">
                                {getDeptName(item.employee)}
                              </span>
                            )}
                            {item.employee?.leftDate && (
                              <span className="text-amber-600 dark:text-amber-400 font-bold text-[8px] uppercase tracking-wider mt-0.5">
                                Left {new Date(item.employee.leftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {daysArray.map((dateStr) => {
                        const record = dailyAttendance[dateStr] || null;
                        const shifts = (record as any)?.shifts || [];
                        const isMultiShift = shifts.length > 1;
                        let shiftName = record?.shiftId && typeof record.shiftId === 'object' ? (record.shiftId as any).name : '-';
                        if (isMultiShift) shiftName = `Multi (${shifts.length})`;

                        const displayStatus = getBaseDisplayStatus(record);
                        const splitStatus = buildSplitCellStatus(record);

                        const hasData = record && record.status !== '-';
                        const isLate = hasData && (
                          (record && (record as any).lateInMinutes != null && (record as any).lateInMinutes > 0) ||
                          (shifts && shifts.some((s: any) => s.lateInMinutes != null && s.lateInMinutes > 0))
                        );
                        const isEarlyOut = hasData && (
                          (record && (record as any).earlyOutMinutes != null && (record as any).earlyOutMinutes > 0) ||
                          (shifts && shifts.some((s: any) => s.earlyOutMinutes != null && s.earlyOutMinutes > 0))
                        );

                        const highlightInfo = activeHighlight?.employeeId === item.employee?._id ? activeHighlightDates.get(dateStr) : null;
                        const isHighlighted = !!highlightInfo;
                        const dayCellHighlightClass =
                          isHighlighted && activeHighlight?.category === 'lopLeaves'
                            ? 'ring-2 ring-rose-400/70 ring-inset z-10 !bg-rose-50/90 dark:!bg-rose-900/55 shadow-[0_0_20px_rgba(244,63,94,0.18)] scale-[1.05] rounded-md'
                            : isHighlighted && activeHighlight?.category === 'paidLeaves'
                              ? 'ring-2 ring-yellow-400/70 ring-inset z-10 !bg-yellow-50/90 dark:!bg-yellow-900/40 shadow-[0_0_20px_rgba(234,179,8,0.2)] scale-[1.05] rounded-md'
                              : isHighlighted
                                ? 'ring-2 ring-blue-400/60 ring-inset z-10 !bg-blue-50/90 dark:!bg-blue-900/60 shadow-[0_0_20px_rgba(59,130,246,0.2)] scale-[1.05] rounded-md'
                                : '';
                        const dayBadgeBg =
                          activeHighlight?.category === 'lopLeaves'
                            ? 'bg-rose-600/90'
                            : activeHighlight?.category === 'paidLeaves'
                              ? 'bg-yellow-600/90'
                              : 'bg-blue-600/90';

                        return (
                          <td
                            key={dateStr}
                            onClick={() => hasData && item.employee && handleDateClick(item.employee, dateStr)}
                            className={`border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700 w-[35px] min-w-[35px] align-middle relative transition-all duration-300 ${hasData ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                              } ${getStatusColor(record)} ${getCellBackgroundColor(record)} ${dayCellHighlightClass}`}
                          >
                            {isHighlighted && highlightInfo && (() => {
                              const sub = highlightBadgeSubtitle(
                                activeHighlight!.category,
                                highlightInfo.label
                              );
                              return (
                              <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none px-0.5">
                                <div className={`${dayBadgeBg} text-white px-1 py-0.5 rounded-md shadow-md border border-white/30 animate-in fade-in zoom-in duration-300 backdrop-blur-[2px] flex flex-col items-center justify-center gap-0 leading-none min-w-[1.35rem] max-w-[42px]`}>
                                  <span className="text-[10px] font-black tabular-nums tracking-tight">
                                    {formatHighlightContribution(highlightInfo.value)}
                                  </span>
                                  {sub ? (
                                    <span
                                      className={`text-[6px] opacity-90 truncate max-w-[40px] text-center leading-tight ${
                                        activeHighlight?.category === 'leaves' || activeHighlight?.category === 'paidLeaves' || activeHighlight?.category === 'lopLeaves'
                                          ? 'font-semibold normal-case'
                                          : 'font-bold uppercase'
                                      }`}
                                      title={sub}
                                    >
                                      {sub}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              );
                            })()}
                            {record && record.isEdited && (
                              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse z-20" title="Edited Manually"></span>
                            )}
                            {(isLate || isEarlyOut) && (
                              <div className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-0.5 z-10" title={`${isLate ? 'Late in' : ''}${isLate && isEarlyOut ? ' • ' : ''}${isEarlyOut ? 'Early out' : ''}`}>
                                {isLate && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" title="Late" />}
                                {isEarlyOut && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" title="Early out" />}
                              </div>
                            )}
                            <div className="flex flex-col items-center justify-center w-full h-full">
                              {hasData ? (
                                <div className="space-y-0.5">
                                  {tableType === 'complete' && (
                                    <>
                                      {splitStatus ? (
                                        <div
                                          className="mx-auto w-fit overflow-hidden rounded-md border border-slate-300/80 dark:border-slate-600/80 bg-white/80 dark:bg-slate-900/60 leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
                                          title={`First half: ${splitStatus.top} | Second half: ${splitStatus.bottom}`}
                                        >
                                          <div className={`px-1.5 py-[2px] text-[8px] font-extrabold tracking-tight ${getSplitHalfClass(splitStatus.top)}`}>{splitStatus.top}</div>
                                          <div className={`border-t border-slate-300/80 dark:border-slate-600/80 px-1.5 py-[2px] text-[8px] font-extrabold tracking-tight ${getSplitHalfClass(splitStatus.bottom)}`}>{splitStatus.bottom}</div>
                                        </div>
                                      ) : (
                                        <div className="font-semibold text-[9px]">{displayStatus}</div>
                                      )}
                                      {shiftName !== '-' && (
                                        <div className={`${isMultiShift ? 'text-blue-600 font-bold' : ''} text-[8px] opacity-75 truncate max-w-[40px]`} title={shiftName as string}>
                                          {isMultiShift ? 'Multi' : (shiftName as string).substring(0, 3)}
                                        </div>
                                      )}
                                      {record && record.totalHours !== null && (
                                        <div className="text-[8px] font-semibold">{formatHours(record.totalHours)}</div>
                                      )}
                                      {record?.odInfo?.odType_extended === 'hours' && (
                                        <div
                                          className="inline-flex items-center gap-1 rounded bg-indigo-100 px-1 py-[1px] text-[7px] font-extrabold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"
                                          title={`Hourly OD ${record.odInfo.durationHours != null ? `(${record.odInfo.durationHours}h)` : ''}`}
                                        >
                                          <span>ODh</span>
                                          {record.odInfo.durationHours != null ? <span>{record.odInfo.durationHours}h</span> : null}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {tableType === 'present_absent' && (
                                    <div className="font-bold text-[10px]">{displayStatus}</div>
                                  )}
                                  {tableType === 'in_out' && (
                                    <div className="text-[8px] font-medium leading-tight">
                                      {shifts && shifts.length > 0 ? (
                                        shifts.map((s: any, idx: number) => (
                                          <div key={idx} className={idx > 0 ? "mt-1 pt-1 border-t border-slate-100 dark:border-slate-800" : ""}>
                                            <div className="text-green-600 dark:text-green-400">{formatTime(s.inTime)}</div>
                                            <div className="text-red-600 dark:text-red-400">{formatTime(s.outTime)}</div>
                                          </div>
                                        ))
                                      ) : (
                                        <>
                                          <div className="text-green-600 dark:text-green-400">{record?.inTime ? formatTime(record.inTime) : '-'}</div>
                                          <div className="text-red-600 dark:text-red-400">{record?.outTime ? formatTime(record.outTime) : '-'}</div>
                                        </>
                                      )}
                                      {isMultiShift && <div className="text-[7px] text-blue-600 font-bold mt-0.5">Multi</div>}
                                    </div>
                                  )}
                                  {tableType === 'leaves' && (
                                    <div className="font-bold text-[10px] text-orange-600">{getLeaveCellLabel(record)}</div>
                                  )}
                                  {tableType === 'od' && (
                                    <div className="font-bold text-[10px] text-indigo-600">{getODCellLabel(record)}</div>
                                  )}
                                  {tableType === 'ot' && (
                                    <div className="text-[8px] font-medium leading-tight">
                                      <div className="text-orange-600">{record?.otHours ? formatHours(record.otHours) : '-'}</div>
                                      <div className="text-purple-600">{record?.extraHours ? formatHours(record.extraHours) : '-'}</div>
                                    </div>
                                  )}
                                  {record?.source?.includes('manual') && (
                                    <div className="text-[7px] text-indigo-600 dark:text-indigo-400 absolute top-0.5 right-0.5" title="Manually Edited">✎</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[9px]">-</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      {tableType === 'complete' &&
                        (usePayRegisterAllComplete && prAllRow ? (
                          <>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'present')}
                              className="border-r border-slate-200 bg-green-50 dark:bg-green-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-green-800 dark:text-green-200 w-[72px] min-w-[72px] cursor-pointer hover:opacity-90"
                              title="From monthly summary (same layout as workspace / pay register)"
                            >
                              {prAllRow.present.toFixed(1)}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'weeklyOffs')}
                              className="border-r border-slate-200 bg-slate-100/90 text-gray-800 dark:bg-slate-800/50 dark:text-slate-200 px-1.5 py-2 text-center text-[11px] font-bold w-[64px] min-w-[64px] cursor-pointer"
                            >
                              {prAllRow.weekOffs.toFixed(1)}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'holidays')}
                              className="border-r border-slate-200 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-purple-800 dark:text-purple-200 w-[64px] min-w-[64px] cursor-pointer"
                            >
                              {prAllRow.holidays.toFixed(1)}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'leaves')}
                              className="border-r border-slate-200 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-yellow-900 dark:text-yellow-100 w-[78px] min-w-[78px] cursor-pointer"
                            >
                              <div className="flex flex-col items-center gap-0.5 leading-tight">
                                <span>{prAllRow.totalLeaves.toFixed(1)}</span>
                                <span
                                  className="text-[8px] font-semibold text-yellow-900/90 dark:text-yellow-200/90"
                                  title={`Leave by nature: ${paidLopSublabel(prAllRow.paidLeaves, prAllRow.dedLop)}`}
                                >
                                  {paidLopSublabel(prAllRow.paidLeaves, prAllRow.dedLop)}
                                </span>
                              </div>
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'ods')}
                              className="border-r border-slate-200 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-indigo-800 dark:text-indigo-200 w-[64px] min-w-[64px] cursor-pointer"
                            >
                              {prAllRow.od.toFixed(1)}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'absent')}
                              className="border-r border-slate-200 bg-red-50 dark:bg-red-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-red-800 dark:text-red-200 w-[64px] min-w-[64px] cursor-pointer"
                            >
                              {prAllRow.absent.toFixed(1)}
                            </td>
                            <td
                              className="border-r border-slate-200 bg-slate-100 dark:bg-slate-800/60 px-1.5 py-2 text-center text-[11px] font-bold text-slate-800 dark:text-slate-200 w-[64px] min-w-[64px]"
                              title="Present + week offs + holidays + total leaves + OD + absents (informational)"
                            >
                              {prAllRow.totalDaysSummed.toFixed(1)}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'lateIn')}
                              className="border-r border-slate-200 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-amber-900 dark:text-amber-200 w-[58px] min-w-[58px] cursor-pointer"
                            >
                              {prAllRow.lates}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'absent')}
                              className="border-r border-slate-200 bg-red-50/90 dark:bg-red-950/30 px-1.5 py-2 text-center text-[10px] font-bold text-red-800 dark:text-red-200 w-[60px] min-w-[60px] cursor-pointer"
                            >
                              {prAllRow.dedAbsent.toFixed(1)}
                            </td>
                            <td
                              onClick={() => item.employee && handleSummaryClick(item.employee._id, 'lopLeaves')}
                              className="border-r border-slate-200 bg-red-50/90 dark:bg-red-950/30 px-1.5 py-2 text-center text-[10px] font-bold text-red-800 dark:text-red-200 w-[60px] min-w-[60px] cursor-pointer"
                            >
                              {prAllRow.dedLop.toFixed(1)}
                            </td>
                            <td
                              onClick={(e) => openAttendanceDeductionInfo(e, item)}
                              className="border-r border-slate-200 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-2 text-center text-[10px] font-bold text-rose-900 dark:text-rose-200 w-[64px] min-w-[64px] cursor-pointer"
                            >
                              {formatPolicyAttendanceDeductionDisplay(
                                prAllRow.attDed,
                                item.summary?.attendanceDeductionBreakdown
                              )}
                            </td>
                            <td
                              onClick={() =>
                                item.employee && handleSummaryClick(item.employee._id, 'paidLeaves')
                              }
                              className="bg-blue-50 dark:bg-blue-900/20 px-1.5 py-2 text-center text-[11px] font-bold text-blue-800 dark:text-blue-200 w-[72px] min-w-[72px] cursor-pointer"
                              title="Present + week offs + holidays + OD + paid leave − att. deduction (pay register paid days)"
                            >
                              {prAllRow.paidDays.toFixed(1)}
                            </td>
                          </>
                        ) : (
                        visibleSuperadminCompleteKeys.map((colKey, cIdx) => {
                          const isLast = cIdx === visibleSuperadminCompleteKeys.length - 1;
                          const edge = isLast ? '' : 'border-r border-slate-200';
                          switch (colKey) {
                            case 'present':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'present')}
                                  className={`${edge} border-slate-200 bg-blue-50 px-2 py-2 text-center text-[11px] font-bold text-blue-700 dark:border-slate-700 dark:bg-blue-900/20 dark:text-blue-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-blue-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'present' ? 'ring-2 ring-blue-400 ring-inset bg-white dark:bg-blue-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {daysPresent}
                                </td>
                              );
                            case 'leaves':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'leaves')}
                                  className={`${edge} border-slate-200 bg-amber-50 px-2 py-2 text-center text-[11px] font-bold text-amber-700 dark:border-slate-700 dark:bg-amber-900/20 dark:text-amber-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-amber-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'leaves' ? 'ring-2 ring-amber-400 ring-inset bg-white dark:bg-amber-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {totalLeaves}
                                </td>
                              );
                            case 'od':
                              const odsCount = item.summary?.totalODs ?? dailyValues.filter((r: any) => r?.status === 'OD' || r?.hasOD).length;
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'ods')}
                                  className={`${edge} border-slate-200 bg-indigo-50 px-2 py-2 text-center text-[11px] font-bold text-indigo-700 dark:border-slate-700 dark:bg-indigo-900/20 dark:text-indigo-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-indigo-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'ods' ? 'ring-2 ring-indigo-400 ring-inset bg-white dark:bg-indigo-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {odsCount}
                                </td>
                              );
                            case 'partial':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'partial')}
                                  className={`${edge} border-slate-200 bg-amber-50 px-2 py-2 text-center text-[11px] font-bold text-amber-900 dark:border-slate-700 dark:bg-amber-900/20 dark:text-amber-200 w-[60px] min-w-[60px] cursor-pointer hover:bg-amber-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'partial' ? 'ring-2 ring-amber-400 ring-inset bg-white dark:bg-amber-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {partialContributionTotal.toFixed(2)}
                                </td>
                              );
                            case 'absent':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'absent')}
                                  className={`${edge} border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:border-slate-700 dark:bg-red-900/20 dark:text-red-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-red-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'absent' ? 'ring-2 ring-red-400 ring-inset bg-white dark:bg-red-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {monthAbsent}
                                </td>
                              );
                            case 'weekOffs':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'weeklyOffs')}
                                  className={`${edge} border-slate-200 bg-orange-100 px-2 py-2 text-center text-[11px] font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-orange-200 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'weeklyOffs' ? 'ring-2 ring-orange-400 ring-inset bg-white dark:bg-orange-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {weekOffsCount}
                                </td>
                              );
                            case 'holidays':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'holidays')}
                                  className={`${edge} border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 dark:border-slate-700 dark:bg-red-900/20 dark:text-red-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-red-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'holidays' ? 'ring-2 ring-red-400 ring-inset bg-white dark:bg-red-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {holidaysCount}
                                </td>
                              );
                            case 'otHours':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'otHours')}
                                  className={`${edge} border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-orange-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'otHours' ? 'ring-2 ring-orange-400 ring-inset bg-white dark:bg-orange-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {formatHours(dailyValues.reduce((sum, record: any) => sum + (record?.otHours || 0), 0))}
                                </td>
                              );
                            case 'extraHours':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'extraHours')}
                                  className={`${edge} border-slate-200 bg-purple-50 px-2 py-2 text-center text-[11px] font-bold text-purple-700 dark:border-slate-700 dark:bg-purple-900/20 dark:text-purple-300 w-[60px] min-w-[60px] cursor-pointer hover:bg-purple-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'extraHours' ? 'ring-2 ring-purple-400 ring-inset bg-white dark:bg-purple-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {formatHours(dailyValues.reduce((sum, record: any) => sum + (record?.extraHours || 0), 0))}
                                </td>
                              );
                            case 'permissions':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'permissions')}
                                  className={`${edge} border-slate-200 bg-cyan-50 px-2 py-2 text-center text-[11px] font-bold text-cyan-700 dark:border-slate-700 dark:bg-cyan-900/20 dark:text-cyan-300 w-[80px] min-w-[80px] cursor-pointer hover:bg-cyan-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'permissions' ? 'ring-2 ring-cyan-400 ring-inset bg-white dark:bg-cyan-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {dailyValues.reduce((sum, record: any) => sum + (record?.permissionCount || 0), 0)}
                                </td>
                              );
                            case 'lateEarly':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'lateIn')}
                                  className={`${edge} border-slate-200 bg-rose-50 px-2 py-2 text-center text-[11px] font-bold text-rose-700 dark:border-slate-700 dark:bg-rose-900/20 dark:text-rose-300 w-[70px] min-w-[70px] cursor-pointer hover:bg-rose-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'lateIn' ? 'ring-2 ring-rose-400 ring-inset bg-white dark:bg-rose-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {item.summary?.lateOrEarlyCount ?? 0}
                                </td>
                              );
                            case 'attDed':
                              return (
                                <td
                                  key={colKey}
                                  onClick={(e) => openAttendanceDeductionInfo(e, item)}
                                  className={`${edge} border-slate-200 bg-violet-50 px-1 py-2 text-center text-[10px] font-bold text-violet-900 dark:border-slate-700 dark:bg-violet-900/25 dark:text-violet-200 w-[64px] min-w-[64px] cursor-pointer hover:bg-violet-100/80 dark:hover:bg-violet-900/40`}
                                  title="Click to view deduction breakdown (late/early vs absent)"
                                >
                                  {Number(item.summary?.totalAttendanceDeductionDays ?? 0).toLocaleString('en-IN', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                              );
                            case 'payableShifts':
                              return (
                                <td
                                  key={colKey}
                                  onClick={() => item.employee && handleSummaryClick(item.employee._id, 'payableShifts')}
                                  className={`bg-green-50 px-2 py-2 text-center text-[11px] font-bold text-green-700 dark:border-slate-700 dark:bg-green-900/20 dark:text-green-300 w-[70px] min-w-[70px] cursor-pointer hover:bg-green-100 transition-all duration-300 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'payableShifts' ? 'ring-2 ring-green-400 ring-inset bg-white dark:bg-green-900/40 shadow-inner scale-[0.98]' : ''}`}
                                >
                                  {payableShifts.toFixed(2)}
                                </td>
                              );
                            default:
                              return null;
                          }
                        })
                        ))}
                      {tableType === 'present_absent' && (
                        <>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'present')}
                            className={`border-r border-slate-200 bg-green-50 px-2 py-2 text-center text-[11px] font-bold text-green-700 cursor-pointer hover:bg-green-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'present' ? 'ring-2 ring-green-500 ring-inset bg-green-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {monthPresent}
                          </td>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'absent')}
                            className={`border-r border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 cursor-pointer hover:bg-red-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'absent' ? 'ring-2 ring-red-500 ring-inset bg-red-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {monthAbsent}
                          </td>
                        </>
                      )}
                      {tableType === 'in_out' && (
                        <td
                          onClick={() => item.employee && handleSummaryClick(item.employee._id, 'present')}
                          className={`border-r border-slate-200 bg-blue-50 px-2 py-2 text-center text-[11px] font-bold text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'present' ? 'ring-2 ring-blue-500 ring-inset bg-blue-100' : ''} w-[60px] min-w-[60px]`}
                        >
                          {daysPresent}
                        </td>
                      )}
                      {tableType === 'leaves' && (
                        <>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'leaves')}
                            className={`border-r border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 cursor-pointer hover:bg-orange-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'leaves' ? 'ring-2 ring-orange-500 ring-inset bg-orange-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {totalLeaves}
                          </td>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'absent')}
                            className={`border-r border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 cursor-pointer hover:bg-red-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'absent' ? 'ring-2 ring-red-500 ring-inset bg-red-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {monthAbsent}
                          </td>
                          <td
                            title="Click: highlight paid-leave contribution days only"
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'paidLeaves')}
                            className={`border-r border-slate-200 bg-yellow-50 px-2 py-2 text-center text-[11px] font-bold text-yellow-700 w-[60px] min-w-[60px] cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'paidLeaves' ? 'ring-2 ring-yellow-500 ring-inset shadow-inner' : ''}`}
                          >
                            {Number(paidLeaveCol || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          <td
                            title="Click: highlight LOP contribution days only"
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'lopLeaves')}
                            className={`border-r border-slate-200 bg-rose-50 px-2 py-2 text-center text-[11px] font-bold text-rose-700 w-[60px] min-w-[60px] cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'lopLeaves' ? 'ring-2 ring-rose-500 ring-inset shadow-inner' : ''}`}
                          >
                            {Number(lopLeaveCol || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                        </>
                      )}
                      {tableType === 'od' && (
                        <>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'ods')}
                            className={`border-r border-slate-200 bg-indigo-50 px-2 py-2 text-center text-[11px] font-bold text-indigo-700 cursor-pointer hover:bg-indigo-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'ods' ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {totalODs}
                          </td>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'absent')}
                            className={`border-r border-slate-200 bg-red-50 px-2 py-2 text-center text-[11px] font-bold text-red-700 cursor-pointer hover:bg-red-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'absent' ? 'ring-2 ring-red-500 ring-inset bg-red-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {monthAbsent}
                          </td>
                        </>
                      )}
                      {tableType === 'ot' && (
                        <>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'otHours')}
                            className={`border-r border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 cursor-pointer hover:bg-orange-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'otHours' ? 'ring-2 ring-orange-500 ring-inset bg-orange-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {formatHours(dailyValues.reduce((sum, record: any) => sum + (record?.otHours || 0), 0))}
                          </td>
                          <td
                            onClick={() => item.employee && handleSummaryClick(item.employee._id, 'extraHours')}
                            className={`border-r border-slate-200 bg-purple-50 px-2 py-2 text-center text-[11px] font-bold text-purple-700 cursor-pointer hover:bg-purple-100 transition-colors ${activeHighlight?.employeeId === item.employee?._id && activeHighlight?.category === 'extraHours' ? 'ring-2 ring-purple-500 ring-inset bg-purple-100' : ''} w-[60px] min-w-[60px]`}
                          >
                            {formatHours(dailyValues.reduce((sum, record: any) => sum + (record?.extraHours || 0), 0))}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div ref={observerTarget} className="h-4 w-full" />
        </div>

        {bulkOtPreviewLoading && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-2xl dark:border-slate-600 dark:bg-slate-900">
              <svg className="h-8 w-8 animate-spin text-green-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
                Checking OT rules for selected employees…
              </p>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                This can take a moment when many days are scanned.
              </p>
            </div>
          </div>
        )}

        {showBulkOtPreviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Eligible OT Days (Selected Employees)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    OT rules (slab/threshold) already applied — raw vs credited (slab) hours are shown per day.
                  </p>
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                    Creates pending OT requests only. Management must approve before they count as approved OT for payroll.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (convertingToOT) return;
                    setShowBulkOtPreviewModal(false);
                    setBulkOtSkippedItems([]);
                    setBulkOtSkippedExpanded(false);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {bulkOtEligibleQueue.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs dark:border-green-900/50 dark:bg-green-900/20">
                  <span className="font-semibold text-green-800 dark:text-green-300">
                    Only ticked employees/dates will create OT requests.
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 rounded-md border border-green-300 bg-white/80 px-2 py-1 text-[11px] font-semibold text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
                      <input
                        type="checkbox"
                        checked={
                          bulkOtEligibleQueue.length > 0 &&
                          bulkOtEligibleQueue.every((q) => selectedBulkOtKeys[q.key])
                        }
                        onChange={(e) => {
                          const next: Record<string, boolean> = {};
                          bulkOtEligibleQueue.forEach((q) => {
                            next[q.key] = e.target.checked;
                          });
                          setSelectedBulkOtKeys(next);
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-green-600"
                      />
                      Select all eligible
                    </label>
                    <span className="rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      {bulkOtEligibleQueue.filter((q) => selectedBulkOtKeys[q.key]).length}/{bulkOtEligibleQueue.length}
                    </span>
                  </div>
                </div>
              )}
              <div className="max-h-80 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                {Object.keys(groupedBulkOtEligibility).length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No eligible days in this run. Expand &quot;Skipped days&quot; below for reasons.
                  </p>
                ) : (
                  Object.entries(groupedBulkOtEligibility).map(([employeeLabel, rows]) => (
                    <div key={employeeLabel} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 text-xs dark:border-slate-700">
                        <label className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                          <input
                            type="checkbox"
                            checked={rows.length > 0 && rows.every((r) => selectedBulkOtKeys[r.key])}
                            onChange={(e) => {
                              const next = { ...selectedBulkOtKeys };
                              rows.forEach((r) => {
                                next[r.key] = e.target.checked;
                              });
                              setSelectedBulkOtKeys(next);
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-green-600"
                          />
                          {employeeLabel}
                        </label>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {rows.filter((r) => selectedBulkOtKeys[r.key]).length}/{rows.length} selected
                        </span>
                      </div>
                      <div className="space-y-1">
                        {rows.map((row) => (
                          <label
                            key={row.key}
                            className="flex cursor-pointer flex-col gap-1 rounded-md border border-slate-100 px-2 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedBulkOtKeys[row.key])}
                                  onChange={(e) =>
                                    setSelectedBulkOtKeys((prev) => ({ ...prev, [row.key]: e.target.checked }))
                                  }
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-green-600"
                                />
                                {row.date}
                              </span>
                              <span className="font-medium text-slate-600 dark:text-slate-300">
                                raw {formatHoursHHMM(row.rawHours)}
                              </span>
                              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                                slab {formatHoursHHMM(row.slabHours)}
                              </span>
                            </div>
                            {row.steps && row.steps.length > 0 ? (
                              <p className="pl-6 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                                {row.steps.map((st) => formatOtPolicyStepLineForDisplay(st)).join(' · ')}
                              </p>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {bulkOtSkippedItems.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/20">
                  <button
                    type="button"
                    onClick={() => setBulkOtSkippedExpanded((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-bold text-amber-900 dark:text-amber-200"
                  >
                    <span>
                      Skipped days ({bulkOtSkippedItems.length}) — grid extra hours, existing OT, or policy rules
                    </span>
                    <span className="text-lg leading-none">{bulkOtSkippedExpanded ? '−' : '+'}</span>
                  </button>
                  {bulkOtSkippedExpanded && (
                    <ul className="max-h-52 space-y-2 overflow-y-auto border-t border-amber-200/80 px-3 py-2 dark:border-amber-800/40">
                      {bulkOtSkippedItems.map((s) => (
                        <li
                          key={s.key}
                          className="rounded-lg border border-amber-100 bg-white/90 px-2 py-2 text-[11px] dark:border-amber-900/40 dark:bg-slate-900/60"
                        >
                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                            {s.label} · <span className="tabular-nums text-slate-600 dark:text-slate-300">{s.date}</span>
                          </div>
                          <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                            {formatOtPolicyStepLineForDisplay(s.reason)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkOtPreviewModal(false);
                    setBulkOtSkippedItems([]);
                    setBulkOtSkippedExpanded(false);
                  }}
                  disabled={convertingToOT}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkConvertSelectedToOT}
                  disabled={
                    convertingToOT ||
                    bulkOtEligibleQueue.length === 0 ||
                    bulkOtEligibleQueue.filter((q) => selectedBulkOtKeys[q.key]).length === 0
                  }
                  className="rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
                >
                  {convertingToOT
                    ? 'Creating...'
                    : `Create OT (${bulkOtEligibleQueue.filter((q) => selectedBulkOtKeys[q.key]).length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {showSingleOtConfirmModal && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Confirm convert to OT</h3>
                <button
                  type="button"
                  onClick={closeSingleOtConfirmModal}
                  disabled={convertingToOT || singleOtConfirmLoading}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {singleOtConfirmLoading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Loading OT rule preview…</p>
                </div>
              ) : singleOtConfirmError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                  {formatOtPolicyStepLineForDisplay(singleOtConfirmError)}
                </div>
              ) : singleOtConfirmData ? (
                <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                  <p className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-xs dark:border-indigo-900/40 dark:bg-indigo-950/30">
                    <span className="font-semibold text-slate-900 dark:text-white">{singleOtConfirmData.employeeName}</span>
                    <span className="text-slate-500"> ({singleOtConfirmData.employeeNumber})</span>
                    <br />
                    <span className="tabular-nums">Date {singleOtConfirmData.date}</span>
                  </p>
                  <p>
                    Credited OT (after rules):{' '}
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">
                      {formatHoursHHMM(singleOtConfirmData.finalHours)}
                    </span>{' '}
                    from raw extra{' '}
                    <span className="font-semibold tabular-nums">{formatHoursHHMM(singleOtConfirmData.rawHours)}</span>
                  </p>
                  {singleOtConfirmData.steps.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                      <span className="font-bold text-slate-700 dark:text-slate-200">Policy steps: </span>
                      {singleOtConfirmData.steps.map((st) => formatOtPolicyStepLineForDisplay(st)).join(' · ')}
                    </div>
                  )}
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    This creates a pending OT request. Management approval is required before it is treated as approved OT.
                  </p>
                </div>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeSingleOtConfirmModal}
                  disabled={convertingToOT || singleOtConfirmLoading}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSingleOtConvert}
                  disabled={
                    convertingToOT ||
                    singleOtConfirmLoading ||
                    !singleOtConfirmData ||
                    Boolean(singleOtConfirmError)
                  }
                  className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-50"
                >
                  {convertingToOT ? 'Creating…' : 'Create pending OT'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showUploadDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Upload Attendance Excel</h3>
                <button
                  onClick={() => {
                    setShowUploadDialog(false);
                    setUploadFile(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select Excel File
                  </label>
                  <input
                    id="excel-upload-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Download Template
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleExcelUpload}
                    disabled={!uploadFile || uploading}
                    className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                  <button
                    onClick={() => {
                      setShowUploadDialog(false);
                      setUploadFile(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showOutTimeDialog && selectedRecordForOutTime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Enter Out Time</h3>
                <button
                  onClick={() => {
                    setShowOutTimeDialog(false);
                    setSelectedRecordForOutTime(null);
                    setOutTimeValue('');
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedRecordForOutTime?.employee?.employee_name}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedRecordForOutTime?.employee?.emp_no} • {selectedRecordForOutTime?.date}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Out Time (date + time) *
                  </label>
                  <input
                    type="datetime-local"
                    value={outTimeValue}
                    onChange={(e) => setOutTimeValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Enter the logout date and time. For overnight shifts, select the <strong>next calendar day</strong> as the date.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleUpdateOutTime}
                    disabled={!outTimeValue || updatingOutTime}
                    className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingOutTime ? 'Updating...' : 'Update Out Time'}
                  </button>
                  <button
                    onClick={() => {
                      setShowOutTimeDialog(false);
                      setSelectedRecordForOutTime(null);
                      setOutTimeValue('');
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showInTimeDialog && selectedRecordForInTime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Enter In Time</h3>
                <button
                  onClick={() => {
                    setShowInTimeDialog(false);
                    setSelectedRecordForInTime(null);
                    setInTimeDialogValue('');
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedRecordForInTime?.employee?.employee_name}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedRecordForInTime?.employee?.emp_no} • {selectedRecordForInTime?.date}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">In Time (date + time) *</label>
                  <input
                    type="datetime-local"
                    value={inTimeDialogValue}
                    onChange={(e) => setInTimeDialogValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enter the check-in date and time.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleUpdateInTime}
                    disabled={!inTimeDialogValue || updatingInTime}
                    className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingInTime ? 'Updating...' : 'Update In Time'}
                  </button>
                  <button
                    onClick={() => {
                      setShowInTimeDialog(false);
                      setSelectedRecordForInTime(null);
                      setInTimeDialogValue('');
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDetailDialog && attendanceDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Attendance Details - {selectedDate}
                  {selectedEmployee && (
                    <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                      ({selectedEmployee?.employee_name})
                    </span>
                  )}
                  {(attendanceDetail.locked || attendanceDetail.isEdited || attendanceDetail.source?.includes('manual')) && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700 ring-1 ring-inset ring-violet-600/20 shadow-sm dark:bg-violet-900/30 dark:text-violet-300">
                      Manually Locked
                    </span>
                  )}
                  {attendanceDetail.isEdited && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20" title="This record has been manually modified">
                      Edited
                    </span>
                  )}
                  {selectedEmployee?.leftDate && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20 shadow-sm">
                      Left {new Date(selectedEmployee.leftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => {
                    setShowDetailDialog(false);
                    setError('');
                    setSuccess('');
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Unified Header / Daily Summary */}
              <div className="space-y-4 mb-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Daily Status</label>
                      <div className="mt-1">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${attendanceDetail.status === 'PRESENT' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                          attendanceDetail.status === 'HALF_DAY' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' :
                            attendanceDetail.status === 'ABSENT' ? 'bg-red-50 text-red-700 ring-red-600/10' :
                              'bg-gray-50 text-gray-600 ring-gray-500/10'
                          }`}>
                          {(() => {
                            const statuses = [attendanceDetail.status || 'N/A'];
                            if (attendanceDetail.hasOD) statuses.push('OD');
                            if (attendanceDetail.hasLeave) statuses.push('LEAVE');
                            // Filter and join unique statuses
                            return Array.from(new Set(statuses)).join(' / ');
                          })()}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Hours</label>
                      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                        {formatHours(attendanceDetail.totalWorkingHours ?? attendanceDetail.totalHours ?? 0)} hrs
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">OT Hours</label>
                      <div className="mt-1 text-sm font-bold text-orange-600 dark:text-orange-400">
                        {formatHours(
                          Number(
                            attendanceDetail?.esiConversion?.consideredOtHours
                            ?? attendanceDetail?.otRequest?.otHours
                            ?? attendanceDetail.totalOTHours
                            ?? attendanceDetail.otHours
                            ?? 0
                          )
                        )} hrs
                      </div>
                    </div>
                    {Number(attendanceDetail.approvedOtHours || 0) > 0 && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Approved OT Hours</label>
                        <div className="mt-1 text-sm font-bold text-green-600 dark:text-green-400">
                          {formatHours(Number(attendanceDetail.approvedOtHours || 0))} hrs
                        </div>
                      </div>
                    )}
                    {Number(attendanceDetail?.otRequest?.rawOtHours ?? 0) > 0 && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">OT Policy Split</label>
                        <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                          Actual: {formatHours(Number(attendanceDetail?.otRequest?.rawOtHours || 0))} hrs, Considered: {formatHours(Number(attendanceDetail?.otRequest?.consideredOtHours ?? attendanceDetail?.otRequest?.otHours ?? 0))} hrs
                        </div>
                      </div>
                    )}
                    {(attendanceDetail.extraHours && attendanceDetail.extraHours > 0) ? (
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Extra Hours</label>
                        <div className="mt-1 text-sm font-bold text-purple-600 dark:text-purple-400">
                          {formatHours(attendanceDetail.extraHours)} hrs
                        </div>
                      </div>
                    ) : (
                      attendanceDetail.status === 'PRESENT' && (
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Expected</label>
                          <div className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">
                            {attendanceDetail.expectedHours ?? '-'} hrs
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {attendanceDetail.approvedEsiLeave && attendanceDetail.esiConversion && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-800/50 dark:bg-amber-900/10">
                      <label className="text-[10px] font-black uppercase tracking-wider text-amber-700/80 dark:text-amber-400/80">
                        ESI Day OT Split
                      </label>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Punch Hours:</span>{' '}
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {formatHours(Number(attendanceDetail.esiConversion.punchHours || 0))} hrs
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Considered to OT:</span>{' '}
                          <span className="font-bold text-orange-700 dark:text-orange-300">
                            {formatHours(Number(attendanceDetail.esiConversion.consideredOtHours || 0))} hrs
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Remaining:</span>{' '}
                          <span className="font-bold text-blue-700 dark:text-blue-300">
                            {formatHours(Number(attendanceDetail.esiConversion.remainingHoursForAttendance || 0))} hrs
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OT Conversion Actions */}
                  {attendanceDetail.extraHours > 0 && !hasExistingOT && (!otAutoCreateEnabled || otPolicyEligibleForConvert) && (
                    <div className="mt-3 flex justify-end">
                      <div className="text-right">
                        <button
                          onClick={handleConvertExtraHoursToOT}
                          disabled={isAttendanceDetailLocked || convertingToOT || singleOtConfirmLoading}
                          className="rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-purple-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        >
                          {convertingToOT
                            ? 'Converting...'
                            : singleOtConfirmLoading
                              ? 'Checking…'
                              : 'Convert Extra to OT'}
                        </button>
                        {otPolicyPreview?.policy?.eligible && (
                          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            Slab/base value: {formatHours(Number(otPolicyPreview?.policy?.finalHours || 0))} hrs
                            {' '}from actual {formatHours(Number(otPolicyPreview?.rawExtraHours || attendanceDetail?.extraHours || 0))} hrs
                          </div>
                        )}
                        {isAttendanceDetailLocked && (
                          <div className="mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                            Batch locked. No further operation will be performed.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {attendanceDetail.extraHours > 0 && !hasExistingOT && otAutoCreateEnabled && !otPolicyEligibleForConvert && (
                    <div className="mt-3 text-right">
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        Not eligible to convert to OT
                      </span>
                      <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        {(otPolicyPreview?.policy?.steps || []).join('; ') || `Check OT slab minimum (threshold ${Number(otPolicyPreview?.mergedPolicy?.thresholdHours || 0).toFixed(2)}h, min OT ${Number(otPolicyPreview?.mergedPolicy?.minOTHours || 0).toFixed(2)}h).`}
                      </div>
                    </div>
                  )}
                  {hasExistingOT && (
                    <div className="mt-3 text-right">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${otRequestStatus === 'approved'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                        {otRequestStatus === 'approved' ? 'OT Converted' : 'Pending approval'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Shift Details (Multi-Shift Display) */}
                {attendanceDetail.shifts && attendanceDetail.shifts.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Attendance Segments</h4>
                    {attendanceDetail.shifts.map((shift: any, index: number) => {
                      const shiftName = shift.shiftName || (shift.shiftId && typeof shift.shiftId === 'object' ? shift.shiftId.name : 'Unknown Shift');
                      const shiftIdVal = shift.shiftId && typeof shift.shiftId === 'object' ? shift.shiftId._id : shift.shiftId;
                      const isEditingThisShift = editingShift && selectedShiftRecordId === shift._id;
                      const isEditingThisOutTime = editingOutTime && selectedShiftRecordId === shift._id;

                      return (
                        <div key={shift._id || index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-all hover:shadow-md">
                          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                                {index + 1}
                              </span>
                              <div className="font-bold text-sm text-slate-800 dark:text-white">{shiftName}</div>
                            </div>
                            <div className="text-[11px] font-bold text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-full">
                              {formatHours(shift.workingHours)} hrs
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Shift Selection - read-only or change when allowShiftChange */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Configured Shift</label>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title={shiftName}>{shiftName}</div>
                                {attendanceFeatureFlags.allowShiftChange && selectedEmployee && selectedDate && !isEditingThisShift && !isAttendanceDetailLocked && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setSelectedShiftRecordId(shift._id);
                                      setEditingShift(true);
                                      if (availableShifts.length === 0 && selectedEmployee) {
                                        await loadAvailableShifts(selectedEmployee.emp_no, selectedDate || attendanceDetail.date);
                                      }
                                    }}
                                    className="text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                                  >
                                    Change shift
                                  </button>
                                )}
                                {isEditingThisShift && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <select
                                      value={selectedShiftId}
                                      onChange={(e) => setSelectedShiftId(e.target.value)}
                                      className="h-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm min-w-[140px] focus:ring-2 focus:ring-violet-500/50"
                                    >
                                      <option value="">Select shift</option>
                                      {availableShifts.map((s: any) => (
                                        <option key={s._id} value={s._id}>{s.name}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={handleAssignShift}
                                      disabled={savingShift || !selectedShiftId}
                                      className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                                    >
                                      {savingShift ? 'Saving…' : 'Assign'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setEditingShift(false); setSelectedShiftId(''); setSelectedShiftRecordId(null); }}
                                      className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Punch Times */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70">Check-In</label>
                                <div className="text-sm font-black text-slate-800 dark:text-white">{formatTime(shift.inTime)}</div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-rose-600/70">Check-Out</label>
                                <div className="text-sm font-black text-slate-800 dark:text-white">{formatTime(shift.outTime, true, selectedDate || '')}</div>
                              </div>
                            </div>
                          </div>

                          {/* Secondary Metrics */}
                          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-50 pt-3 dark:border-slate-800">
                            {shift.lateInMinutes > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"></div>
                                <span className="text-[10px] font-bold text-orange-600">Late: {shift.lateInMinutes}m</span>
                              </div>
                            )}
                            {shift.earlyOutMinutes > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"></div>
                                <span className="text-[10px] font-bold text-orange-600">Early: {shift.earlyOutMinutes}m</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Status</span>
                              <span className={`text-[10px] font-black uppercase ${shift.status === 'PRESENT' ? 'text-green-600' : 'text-slate-500'}`}>
                                {(() => {
                                  const statuses = [shift.status || '-'];
                                  if (attendanceDetail.hasOD) statuses.push('OD');
                                  if (attendanceDetail.hasLeave) statuses.push('LEAVE');
                                  return Array.from(new Set(statuses)).join(' / ');
                                })()}
                              </span>
                            </div>
                          </div>
                          {selectedEmployee && selectedDate && (attendanceFeatureFlags.allowInTimeEditing || attendanceFeatureFlags.allowOutTimeEditing) && !isAttendanceDetailLocked && (
                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-3">
                              {attendanceFeatureFlags.allowInTimeEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const inTime = shift.inTime ? new Date(shift.inTime) : null;
                                    const baseDate = selectedDate || attendanceDetail.date;
                                    const defaultDateTime = inTime
                                      ? `${inTime.getFullYear()}-${String(inTime.getMonth() + 1).padStart(2, '0')}-${String(inTime.getDate()).padStart(2, '0')}T${String(inTime.getHours()).padStart(2, '0')}:${String(inTime.getMinutes()).padStart(2, '0')}`
                                      : `${baseDate}T09:00`;
                                    setInTimeDialogValue(defaultDateTime);
                                    setSelectedRecordForInTime({
                                      employee: selectedEmployee,
                                      date: baseDate,
                                      shiftRecordId: shift._id,
                                    });
                                    setShowInTimeDialog(true);
                                    setShowDetailDialog(false);
                                  }}
                                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                                >
                                  Edit In Time
                                </button>
                              )}
                              {attendanceFeatureFlags.allowOutTimeEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const outTime = shift.outTime ? new Date(shift.outTime) : null;
                                    const baseDate = selectedDate || attendanceDetail.date;
                                    const defaultDateTime = outTime
                                      ? `${outTime.getFullYear()}-${String(outTime.getMonth() + 1).padStart(2, '0')}-${String(outTime.getDate()).padStart(2, '0')}T${String(outTime.getHours()).padStart(2, '0')}:${String(outTime.getMinutes()).padStart(2, '0')}`
                                      : `${baseDate}T18:00`;
                                    setOutTimeValue(defaultDateTime);
                                    setSelectedRecordForOutTime({
                                      employee: selectedEmployee,
                                      date: baseDate,
                                      shiftRecordId: shift._id,
                                    });
                                    setShowOutTimeDialog(true);
                                    setShowDetailDialog(false);
                                  }}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  Edit Out Time
                                </button>
                              )}
                            </div>
                          )}
                          {isAttendanceDetailLocked && (
                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-300">
                                This attendance day is locked, so in-time, out-time, and shift edits are disabled.
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Call-to-action for missing attendance on absent day? */
                  attendanceDetail.status === 'ABSENT' ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700 bg-slate-50/50">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h5 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">No attendance records today</h5>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Employee was marked as absent for this date.</p>
                    </div>
                  ) : null
                )}

                {/* Shared Metrics / Deductions (Unified Footer) */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                  {/* Late In Display - Support Multi-Shift */}
                  {(() => {
                    const shiftsWithLate = attendanceDetail.shifts?.filter((s: any) => s.lateInMinutes && s.lateInMinutes > 0) || [];
                    const hasRootLate = attendanceDetail.isLateIn && attendanceDetail.lateInMinutes;

                    if (shiftsWithLate.length > 0 || hasRootLate) {
                      return (
                        <div className="p-3 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/50">
                          <label className="text-[10px] font-black uppercase tracking-widest text-orange-600/70">Late In Aggregate</label>
                          <div className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-400">
                            +{attendanceDetail.lateInMinutes || 0} minutes
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Early Out Display - Support Multi-Shift */}
                  {(() => {
                    const shiftsWithEarly = attendanceDetail.shifts?.filter((s: any) => s.earlyOutMinutes && s.earlyOutMinutes > 0) || [];
                    const hasRootEarly = attendanceDetail.isEarlyOut && attendanceDetail.lateInMinutes;

                    if (shiftsWithEarly.length > 0 || hasRootEarly) {
                      return (
                        <div className="p-3 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/50">
                          <label className="text-[10px] font-black uppercase tracking-widest text-orange-600/70">Early Out Aggregate</label>
                          <div className="mt-1 text-sm font-bold text-orange-700 dark:text-orange-400">
                            -{attendanceDetail.earlyOutMinutes || 0} minutes
                          </div>
                          {attendanceDetail.earlyOutDeduction?.deductionApplied && (
                            <p className="mt-1 text-[10px] font-bold text-rose-600 italic">
                              Deduction: {attendanceDetail.earlyOutDeduction.deductionType?.replace('_', ' ')}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {Number(attendanceDetail.approvedOtHours ?? attendanceDetail.esiConversion?.approvedOtHours ?? attendanceDetail.otHours ?? 0) > 0 && (
                  <div className="p-3 rounded-xl bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/50 mt-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-green-600/70">Overtime Hours</label>
                    <div className="mt-1 text-sm font-bold text-green-800 dark:text-green-400">
                      {formatHours(
                        Number(
                          attendanceDetail.approvedOtHours
                          ?? attendanceDetail.esiConversion?.approvedOtHours
                          ?? attendanceDetail?.esiConversion?.consideredOtHours
                          ?? attendanceDetail?.otRequest?.otHours
                          ?? attendanceDetail.otHours
                          ?? 0
                        )
                      )} hrs approved
                    </div>
                  </div>
                )}

                {!!attendanceDetail.permissionRequests?.length && (
                  <div className="p-3 rounded-xl bg-cyan-50/50 dark:bg-cyan-900/10 border border-cyan-100 dark:border-cyan-800/50 mt-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-cyan-600/70">Permission Details</label>
                    <div className="mt-2 space-y-2">
                      {attendanceDetail.permissionRequests.map((p: any) => {
                        const type = p.permissionType || 'mid_shift';
                        const typeLabel = type === 'late_in' ? 'Late In' : type === 'early_out' ? 'Early Out' : 'Mid Shift';
                        const parseTimeToMinutes = (
                          value: any,
                          mode: 'late_in' | 'early_out' | 'mid_shift' = 'mid_shift',
                          shiftRefMin?: number | null
                        ): number | null => {
                          if (!value) return null;
                          const raw = String(value).trim();
                          const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                          if (ampmMatch) {
                            let hh = Number(ampmMatch[1]);
                            const mm = Number(ampmMatch[2]);
                            const marker = ampmMatch[3].toUpperCase();
                            if (marker === 'PM' && hh < 12) hh += 12;
                            if (marker === 'AM' && hh === 12) hh = 0;
                            return hh * 60 + mm;
                          }
                          const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
                          if (hhmmMatch) {
                            const h = Number(hhmmMatch[1]);
                            const m = Number(hhmmMatch[2]);
                            const candidates: number[] = [h * 60 + m];
                            if (h >= 1 && h <= 11) candidates.push((h + 12) * 60 + m); // ambiguous 12h input without AM/PM
                            if (h === 12) candidates.push(m); // 12:xx can be midnight in some payloads

                            if (shiftRefMin != null) {
                              if (mode === 'early_out') {
                                const viable = candidates.filter((c) => c <= shiftRefMin);
                                if (viable.length) return viable.reduce((best, cur) =>
                                  (shiftRefMin - cur) < (shiftRefMin - best) ? cur : best
                                );
                              }
                              if (mode === 'late_in') {
                                const viable = candidates.filter((c) => c >= shiftRefMin);
                                if (viable.length) return viable.reduce((best, cur) =>
                                  (cur - shiftRefMin) < (best - shiftRefMin) ? cur : best
                                );
                              }
                            }
                            return candidates[0];
                          }
                          const parsed = new Date(raw);
                          if (!isNaN(parsed.getTime())) return parsed.getHours() * 60 + parsed.getMinutes();
                          return null;
                        };
                        const formatDiff = (mins: number | null) => (mins == null ? '-' : `${mins} min`);
                        const shiftStartRaw =
                          (attendanceDetail.shiftId && typeof attendanceDetail.shiftId === 'object' ? (attendanceDetail.shiftId as any).startTime : null)
                          || (attendanceDetail.shifts?.[0]?.shiftStartTime)
                          || (typeof attendanceDetail.shifts?.[0]?.shiftId === 'object' ? (attendanceDetail.shifts?.[0]?.shiftId as any)?.startTime : null);
                        const shiftEndRaw =
                          (attendanceDetail.shiftId && typeof attendanceDetail.shiftId === 'object' ? (attendanceDetail.shiftId as any).endTime : null)
                          || (attendanceDetail.shifts?.[0]?.shiftEndTime)
                          || (typeof attendanceDetail.shifts?.[0]?.shiftId === 'object' ? (attendanceDetail.shifts?.[0]?.shiftId as any)?.endTime : null);
                        const shiftStartMin = parseTimeToMinutes(shiftStartRaw);
                        const shiftEndMin = parseTimeToMinutes(shiftEndRaw);
                        const permittedMin = parseTimeToMinutes(
                          p.permittedEdgeTime,
                          type,
                          type === 'late_in' ? shiftStartMin : type === 'early_out' ? shiftEndMin : null
                        );
                        const lateAllowanceMin = type === 'late_in' && permittedMin != null && shiftStartMin != null ? Math.max(0, permittedMin - shiftStartMin) : null;
                        const earlyAllowanceMin = type === 'early_out' && permittedMin != null && shiftEndMin != null ? Math.max(0, shiftEndMin - permittedMin) : null;
                        const timeLabel =
                          type === 'mid_shift'
                            ? `${formatTime(p.permissionStartTime, true, selectedDate || '')} - ${formatTime(p.permissionEndTime, true, selectedDate || '')}`
                            : `${type === 'late_in' ? 'Latest arrival' : 'Earliest exit'} ${p.permittedEdgeTime || '--:--'}`;
                        const outRequired = type !== 'late_in';
                        const inRequired = type !== 'early_out';
                        const outVerified = Boolean(p.gateOutTime);
                        const inVerified = Boolean(p.gateInTime);
                        return (
                          <div key={p._id} className="rounded-lg border border-cyan-200/70 dark:border-cyan-800/60 bg-white/80 dark:bg-slate-900/60 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-slate-900 dark:text-slate-100">{typeLabel}</p>
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{String(p.status || 'pending').replace(/_/g, ' ')}</span>
                            </div>
                            <div className="mt-2 rounded-xl border border-cyan-200/70 dark:border-cyan-800/60 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 text-center">
                              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-600/80 dark:text-cyan-300/80">Permission Window</p>
                              <p className="mt-0.5 text-base sm:text-lg font-black text-cyan-800 dark:text-cyan-200">{timeLabel}</p>
                            </div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="rounded-md bg-cyan-100/60 dark:bg-cyan-900/30 px-2 py-1.5">
                                <p className="text-[9px] font-black uppercase tracking-wider text-cyan-700/80 dark:text-cyan-300/80">Type</p>
                                <p className="text-[11px] font-bold text-cyan-900 dark:text-cyan-100">{typeLabel}</p>
                              </div>
                              <div className="rounded-md bg-cyan-100/60 dark:bg-cyan-900/30 px-2 py-1.5">
                                <p className="text-[9px] font-black uppercase tracking-wider text-cyan-700/80 dark:text-cyan-300/80">Rule</p>
                                <p className="text-[11px] font-bold text-cyan-900 dark:text-cyan-100">
                                  {type === 'mid_shift' ? 'Start + End window' : type === 'late_in' ? 'Latest arrival limit' : 'Earliest exit limit'}
                                </p>
                              </div>
                            </div>
                            {type !== 'mid_shift' && (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="rounded-md bg-slate-100 dark:bg-slate-800/70 px-2 py-1.5">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Shift {type === 'late_in' ? 'Start' : 'End'}</p>
                                  <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{formatTime(type === 'late_in' ? shiftStartRaw : shiftEndRaw, true, selectedDate || '')}</p>
                                </div>
                                <div className="rounded-md bg-slate-100 dark:bg-slate-800/70 px-2 py-1.5">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{type === 'late_in' ? 'Allowed Late' : 'Allowed Early'}</p>
                                  <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{formatDiff(type === 'late_in' ? lateAllowanceMin : earlyAllowanceMin)}</p>
                                </div>
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {outRequired && (
                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${outVerified ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                  OUT QR {outVerified ? `Verified ${formatTime(p.gateOutTime, true, selectedDate || '')}` : 'Pending'}
                                </span>
                              )}
                              {inRequired && (
                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${inVerified ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                  IN QR {inVerified ? `Verified ${formatTime(p.gateInTime, true, selectedDate || '')}` : 'Pending'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* Leave Conflicts */}
              {attendanceDetail.status === 'PRESENT' && leaveConflicts.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <div className="mb-3 flex items-center gap-2">
                    <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h4 className="text-base font-semibold text-red-900 dark:text-red-200">Leave Conflict Detected</h4>
                  </div>
                  <p className="mb-3 text-sm text-red-800 dark:text-red-300">
                    Employee has approved leave but attendance is logged for this date.
                  </p>
                  {leaveConflicts.map((conflict) => (
                    <div key={conflict.leaveId} className="mb-3 rounded-lg border border-red-200 bg-white p-3 dark:border-red-700 dark:bg-slate-800">
                      <div className="mb-2 text-sm font-medium text-red-900 dark:text-red-200">
                        {conflict.leaveType} - {conflict.numberOfDays} day(s)
                      </div>
                      <div className="mb-2 text-xs text-red-700 dark:text-red-300">
                        {new Date(conflict.fromDate).toLocaleDateString()}
                        {conflict.fromDate !== conflict.toDate && ` - ${new Date(conflict.toDate).toLocaleDateString()}`}
                        {conflict.isHalfDay && ` (${conflict.halfDayType === 'first_half' ? 'First Half' : 'Second Half'})`}
                      </div>
                      <div className="flex gap-2">
                        {conflict.conflictType === 'full_day' ? (
                          <button
                            onClick={() => handleRevokeLeave(conflict.leaveId)}
                            disabled={revokingLeave}
                            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {revokingLeave ? 'Revoking...' : 'Revoke Leave'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateLeave(conflict.leaveId)}
                            disabled={updatingLeave}
                            className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {updatingLeave ? 'Updating...' : 'Update Leave'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {hasAttendancePunches(attendanceDetail) &&
                isFullDayOdEligibleForConflictRevoke(attendanceDetail) && (
                  <div className="mt-4 rounded-lg border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
                    <div className="mb-3 flex items-center gap-2">
                      <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="text-base font-semibold text-indigo-900 dark:text-indigo-200">OD Conflict Detected</h4>
                    </div>
                    <p className="mb-3 text-sm text-indigo-800 dark:text-indigo-300">
                      Check-in/check-out is recorded and a full-day OD is still approved for this date. Revoke the OD if attendance alone should stand.
                    </p>
                    <div className="mb-1 rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-700 dark:bg-slate-800">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <div className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                            {attendanceDetail.odInfo.odType || 'OD'} - Full Day
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Reason:{' '}
                            {attendanceDetail.odInfo.reason || attendanceDetail.odInfo.purpose || 'Official Duty'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokeOD(attendanceDetail.odInfo.odId)}
                          disabled={revokingOD}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {revokingOD ? 'Revoking...' : 'Revoke OD'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {attendanceDetail.policyMeta?.partialDayRule?.applied && (
                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-800/60 dark:bg-violet-900/20">
                  <label className="text-[10px] font-black uppercase tracking-widest text-violet-700/80 dark:text-violet-300/80">
                    Policy Split
                  </label>
                  <div className="mt-1 text-sm font-semibold text-violet-900 dark:text-violet-100">
                    {String(attendanceDetail.policyMeta?.partialDayRule?.firstHalfStatus || '-').toUpperCase()} / {String(attendanceDetail.policyMeta?.partialDayRule?.secondHalfStatus || '-').toUpperCase()}
                    {typeof attendanceDetail.policyMeta?.partialDayRule?.lopPortion === 'number'
                      ? ` (LOP: ${attendanceDetail.policyMeta.partialDayRule.lopPortion})`
                      : ''}
                  </div>
                  {attendanceDetail.policyMeta?.partialDayRule?.note && (
                    <div className="mt-1 text-xs text-violet-800/90 dark:text-violet-200/90">
                      {attendanceDetail.policyMeta.partialDayRule.note}
                    </div>
                  )}
                </div>
              )}
              {attendanceDetail.policyMeta?.sandwichRule?.applied && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-900/20">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-700/80 dark:text-amber-300/80">
                    Sandwich Policy
                  </label>
                  <div className="mt-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {String(attendanceDetail.policyMeta?.sandwichRule?.effect || 'applied').replaceAll('_', ' ')}
                  </div>
                  <div className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                    Neighbours: {attendanceDetail.policyMeta?.sandwichRule?.previousNeighborKind || '-'} / {attendanceDetail.policyMeta?.sandwichRule?.nextNeighborKind || '-'}
                  </div>
                  {attendanceDetail.policyMeta?.sandwichRule?.note && (
                    <div className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                      {attendanceDetail.policyMeta.sandwichRule.note}
                    </div>
                  )}
                </div>
              )}

              {/* Leave Information */}
              {attendanceDetail.hasLeave && attendanceDetail.leaveInfo && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                  <h4 className="mb-3 text-base font-semibold text-orange-900 dark:text-orange-200">Leave Information</h4>

                  {/* Purpose/Reason */}
                  {attendanceDetail.leaveInfo.purpose ? (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Purpose/Reason</label>
                      <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.purpose}
                      </div>
                    </div>
                  ) : null}

                  {/* Remarks / Notes */}
                  {attendanceDetail.notes && (
                    <div className="col-span-2 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 p-4 mt-2">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-blue-600 dark:text-blue-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-blue-600/70 dark:text-blue-400/70">System Remarks</label>
                          <div className="mt-1 text-sm font-bold text-blue-900 dark:text-blue-100 leading-relaxed italic">
                            &quot;{attendanceDetail.notes}&quot;
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Leave Type</label>
                      <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.leaveType || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Half Day</label>
                      <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.isHalfDay ? 'Yes' : 'No'}
                        {attendanceDetail.leaveInfo.isHalfDay && attendanceDetail.leaveInfo.halfDayType && (
                          <span className="ml-1 text-xs">({attendanceDetail.leaveInfo.halfDayType === 'first_half' ? 'First Half' : 'Second Half'})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Date Range */}
                  {attendanceDetail.leaveInfo.fromDate && attendanceDetail.leaveInfo.toDate && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Date Range</label>
                      <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">
                        {new Date(attendanceDetail.leaveInfo.fromDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })} - {new Date(attendanceDetail.leaveInfo.toDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
                      </div>
                    </div>
                  )}

                  {/* Number of Days and Day in Leave */}
                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Total Days</label>
                      <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.numberOfDays !== undefined && attendanceDetail.leaveInfo.numberOfDays !== null
                          ? `${attendanceDetail.leaveInfo.numberOfDays} ${attendanceDetail.leaveInfo.numberOfDays === 1 ? 'day' : 'days'}`
                          : 'N/A'}
                      </div>
                    </div>
                    {attendanceDetail.leaveInfo.dayInLeave !== undefined && attendanceDetail.leaveInfo.dayInLeave !== null && (
                      <div>
                        <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Day in Leave</label>
                        <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                          {attendanceDetail.leaveInfo.dayInLeave === 1 ? '1st day' : attendanceDetail.leaveInfo.dayInLeave === 2 ? '2nd day' : attendanceDetail.leaveInfo.dayInLeave === 3 ? '3rd day' : `${attendanceDetail.leaveInfo.dayInLeave}th day`}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Applied Date */}
                  {attendanceDetail.leaveInfo.appliedAt && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Applied On</label>
                      <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                        {new Date(attendanceDetail.leaveInfo.appliedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}

                  {/* Approved By and When */}
                  {attendanceDetail.leaveInfo.approvedBy && (
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Approved By</label>
                        <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">
                          {attendanceDetail.leaveInfo.approvedBy.name || attendanceDetail.leaveInfo.approvedBy.email || 'N/A'}
                        </div>
                      </div>
                      {attendanceDetail.leaveInfo.approvedAt && (
                        <div>
                          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Approved On</label>
                          <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                            {new Date(attendanceDetail.leaveInfo.approvedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {attendanceDetail.isConflict && (
                    <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                      ⚠️ Conflict: Leave approved but attendance logged for this date
                    </div>
                  )}
                </div>
              )}

              {/* OD Information */}
              {attendanceDetail.hasOD && attendanceDetail.odInfo && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <h4 className="mb-3 text-base font-semibold text-blue-900 dark:text-blue-200">On Duty (OD) Information</h4>

                  {/* Early-Out Info */}
                  {attendanceDetail.earlyOutMinutes !== undefined && attendanceDetail.earlyOutMinutes !== null && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Early-Out Minutes</p>
                          <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                            {attendanceDetail.earlyOutMinutes} min
                          </p>
                        </div>
                        {attendanceDetail.earlyOutDeduction?.deductionApplied && (
                          <div className="text-right">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Deduction Applied</p>
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 capitalize">
                              {attendanceDetail.earlyOutDeduction.deductionType?.replace('_', ' ') || 'N/A'}
                            </p>
                            {attendanceDetail.earlyOutDeduction.deductionDays && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                {attendanceDetail.earlyOutDeduction.deductionDays} day(s)
                              </p>
                            )}
                            {attendanceDetail.earlyOutDeduction.deductionAmount && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                ₹{attendanceDetail.earlyOutDeduction.deductionAmount}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {attendanceDetail.earlyOutDeduction?.reason && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          {attendanceDetail.earlyOutDeduction.reason}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Purpose/Reason */}
                  {(attendanceDetail.odInfo.reason || attendanceDetail.odInfo.purpose) && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Purpose/Reason</label>
                      <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.reason || attendanceDetail.odInfo.purpose}
                      </div>
                    </div>
                  )}

                  {/* Photo Evidence & Location (Modern Card) */}
                  {(attendanceDetail.odInfo.photoEvidence || attendanceDetail.odInfo.geoLocation) && (
                    <div className="mt-4 rounded-xl bg-white dark:bg-slate-800/50 p-4 border border-blue-100 dark:border-blue-900/30">
                      <p className="text-xs uppercase font-black text-blue-500 mb-3 tracking-widest flex items-center gap-2">
                        <Camera className="w-4 h-4" />
                        Evidence & Location
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Photo Card */}
                        {attendanceDetail.odInfo.photoEvidence && (
                          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 shadow-sm">
                            <a
                              href={attendanceDetail.odInfo.photoEvidence.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative group block shrink-0"
                            >
                              <img
                                src={attendanceDetail.odInfo.photoEvidence.url}
                                alt="Evidence"
                                className="w-20 h-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-sm"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg">
                                <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </a>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">Photo Evidence</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-black">Captured via App</p>
                              {attendanceDetail.odInfo.placeVisited && (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-2 font-bold flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {attendanceDetail.odInfo.placeVisited}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Location Details & Map Preview */}
                        <div className="space-y-3">
                          {attendanceDetail.odInfo.geoLocation && (
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 shadow-sm">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-3 h-3 text-red-500" />
                                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Live Location</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div>
                                  <span className="text-slate-400 font-bold uppercase">Lat:</span>
                                  <span className="ml-1 font-mono text-slate-700 dark:text-slate-300">{attendanceDetail.odInfo.geoLocation.latitude?.toFixed(6)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 font-bold uppercase">Lon:</span>
                                  <span className="ml-1 font-mono text-slate-700 dark:text-slate-300">{attendanceDetail.odInfo.geoLocation.longitude?.toFixed(6)}</span>
                                </div>
                              </div>
                              {attendanceDetail.odInfo.geoLocation.address && (
                                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 line-clamp-2">
                                  {attendanceDetail.odInfo.geoLocation.address}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Dynamic Leaflet Map */}
                          {(() => {
                            const geo = attendanceDetail.odInfo.geoLocation;
                            const exif = attendanceDetail.odInfo.photoEvidence?.exifLocation;
                            const lat = geo?.latitude ?? exif?.latitude;
                            const lng = geo?.longitude ?? exif?.longitude;
                            const address = geo?.address ?? null;
                            if (lat == null || lng == null) return null;
                            return (
                              <div className="p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                                <LocationMap latitude={lat} longitude={lng} address={address} height="120px" className="rounded-lg" />
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">OD Type</label>
                      <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.odType || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        {attendanceDetail.odInfo.odType_extended === 'hours' ? 'Duration Type' : 'Half Day'}
                      </label>
                      <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.odType_extended === 'hours' ? (
                          'Hour-Based OD'
                        ) : attendanceDetail.odInfo.isHalfDay ? (
                          <>
                            Yes
                            {attendanceDetail.odInfo.halfDayType && (
                              <span className="ml-1 text-xs">({attendanceDetail.odInfo.halfDayType === 'first_half' ? 'First Half' : 'Second Half'})</span>
                            )}
                          </>
                        ) : (
                          'No'
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Date Range */}
                  {attendanceDetail.odInfo.fromDate && attendanceDetail.odInfo.toDate && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Date Range</label>
                      <div className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
                        {new Date(attendanceDetail.odInfo.fromDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })} - {new Date(attendanceDetail.odInfo.toDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
                      </div>
                    </div>
                  )}

                  {/* Hour-Based OD: Show Hours */}
                  {attendanceDetail.odInfo.odType_extended === 'hours' && attendanceDetail.odInfo.durationHours && (
                    <div className="mb-3 p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300 block mb-2">OD Hours</label>
                      <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        {(() => {
                          const hours = Math.floor(attendanceDetail.odInfo.durationHours || 0);
                          const mins = Math.round((attendanceDetail.odInfo.durationHours || 0) % 1 * 60);
                          return `${hours}h ${mins}m`;
                        })()}
                      </div>
                      {attendanceDetail.odInfo.odStartTime && attendanceDetail.odInfo.odEndTime && (
                        <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Time: {attendanceDetail.odInfo.odStartTime} - {attendanceDetail.odInfo.odEndTime}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Full Day / Half Day: Show Days */}
                  {attendanceDetail.odInfo.odType_extended !== 'hours' && (
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Total Days</label>
                        <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                          {attendanceDetail.odInfo.numberOfDays || (attendanceDetail.odInfo.isHalfDay ? '0.5' : '1')} {attendanceDetail.odInfo.numberOfDays === 1 ? 'day' : 'days'}
                        </div>
                      </div>
                      {attendanceDetail.odInfo.dayInOD && (
                        <div>
                          <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Day in OD</label>
                          <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                            {attendanceDetail.odInfo.dayInOD === 1 ? '1st day' : attendanceDetail.odInfo.dayInOD === 2 ? '2nd day' : attendanceDetail.odInfo.dayInOD === 3 ? '3rd day' : `${attendanceDetail.odInfo.dayInOD}th day`}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Applied Date */}
                  {attendanceDetail.odInfo.appliedAt && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Applied On</label>
                      <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                        {new Date(attendanceDetail.odInfo.appliedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}

                  {/* Approved By and When */}
                  {attendanceDetail.odInfo.approvedBy && (
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Approved By</label>
                        <div className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
                          {attendanceDetail.odInfo.approvedBy.name || attendanceDetail.odInfo.approvedBy.email || 'N/A'}
                        </div>
                      </div>
                      {attendanceDetail.odInfo.approvedAt && (
                        <div>
                          <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Approved On</label>
                          <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                            {new Date(attendanceDetail.odInfo.approvedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Only show conflict for full-day OD (not for half-day or hour-based OD) */}
              {attendanceDetail.isConflict &&
                attendanceDetail.odInfo &&
                attendanceDetail.odInfo.odType_extended !== 'half_day' &&
                attendanceDetail.odInfo.odType_extended !== 'hours' && (
                  <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    ⚠️ Conflict: OD approved but attendance logged for this date
                  </div>
                )}

              {/* Audit Log / Edit History */}
              {attendanceDetail.editHistory && attendanceDetail.editHistory.length > 0 && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h4 className="mb-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">Edit History</h4>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                    {attendanceDetail.editHistory.map((edit: any, index: number) => (
                      <div key={index} className="flex flex-col text-xs border-l-2 border-slate-200 pl-3 py-1 last:border-0 last:pb-0 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-[9px]">
                            {edit.action?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(edit.modifiedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 font-medium">
                          {edit.details}
                        </div>
                        <div className="text-slate-500 dark:text-slate-500 text-[10px] mt-1 italic">
                          Modified by: <span className="font-bold text-slate-700 dark:text-slate-300">
                            {edit.modifiedByName || (edit.modifiedBy && typeof edit.modifiedBy === 'object' ? (edit.modifiedBy.name || 'Unknown') : 'System')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        {attendanceDeductionInfo && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-24"
            onClick={() => setAttendanceDeductionInfo(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-violet-200 bg-white p-4 shadow-2xl dark:border-violet-800 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-bold text-violet-900 dark:text-violet-200">Attendance Deduction Split</h4>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => setAttendanceDeductionInfo(null)}
                >
                  Close
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{attendanceDeductionInfo.employeeName}</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Late/Early deduction days</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-300">{attendanceDeductionInfo.lateEarlyDays.toFixed(2).replace(/\.?0+$/, '') || '0'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Absent extra deduction days</span>
                  <span className="font-semibold text-red-700 dark:text-red-300">{attendanceDeductionInfo.absentDays.toFixed(2).replace(/\.?0+$/, '') || '0'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Total deduction days</span>
                  <span className="font-bold text-violet-900 dark:text-violet-200">{attendanceDeductionInfo.total.toFixed(2).replace(/\.?0+$/, '') || '0'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Monthly Summary Modal */}
        {
          showSummaryModal && selectedEmployeeForSummary !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 print:shadow-none">
                <div className="mb-4 flex items-center justify-between print:hidden">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Monthly Attendance Summary</h3>
                  <button
                    onClick={() => {
                      setShowSummaryModal(false);
                      setSelectedEmployeeForSummary(null);
                      setMonthlySummary(null);
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {loadingSummary ? (
                  <div className="flex items-center justify-center p-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                  </div>
                ) : monthlySummary ? (
                  <div className="space-y-6">
                    {/* Employee Details */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                      <h4 className="mb-3 text-base font-bold text-slate-900 dark:text-white">Employee Details</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-slate-600 dark:text-slate-400">Name:</span>
                          <span className="ml-2 text-slate-900 dark:text-white">{selectedEmployeeForSummary?.employee_name || '-'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-slate-600 dark:text-slate-400">Employee Number:</span>
                          <span className="ml-2 text-slate-900 dark:text-white">{selectedEmployeeForSummary?.emp_no || '-'}</span>
                        </div>
                        {selectedEmployeeForSummary.department && (
                          <div>
                            <span className="font-medium text-slate-600 dark:text-slate-400">Department:</span>
                            <span className="ml-2 text-slate-900 dark:text-white">{((selectedEmployeeForSummary as any).department_id?.name || (selectedEmployeeForSummary.department as any)?.name || '-')}</span>
                          </div>
                        )}
                        {selectedEmployeeForSummary.designation && (
                          <div>
                            <span className="font-medium text-slate-600 dark:text-slate-400">Designation:</span>
                            <span className="ml-2 text-slate-900 dark:text-white">{((selectedEmployeeForSummary as any).designation_id?.name || (selectedEmployeeForSummary.designation as any)?.name || '-')}</span>
                          </div>
                        )}
                        {selectedEmployeeForSummary.leftDate && (
                          <div>
                            <span className="font-medium text-slate-600 dark:text-slate-400">Resignation Date:</span>
                            <span className="ml-2 text-amber-600 dark:text-amber-400 font-bold">
                              {new Date(selectedEmployeeForSummary.leftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Monthly Summary Table */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="border border-slate-300 px-4 py-2 text-left font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Month</th>
                            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Total Leaves</th>
                            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Total ODs</th>
                            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Present Days</th>
                            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Total Days</th>
                            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Payable Shifts</th>
                            <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white" title="Late/early policy + absent extra (same as payroll)">Att. deduction days</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-slate-300 px-4 py-2 text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.monthName || `${monthNames[month - 1]} ${year}`}</td>
                            <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalLeaves || 0}</td>
                            <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalODs || 0}</td>
                            <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">
                              {Number(monthlySummary.totalPresentDays) || 0}
                            </td>
                            <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalDaysInMonth || 0}</td>
                            <td className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalPayableShifts?.toFixed(2) || '0.00'}</td>
                            <td className="border border-slate-300 px-4 py-2 text-right font-semibold text-purple-800 dark:text-purple-200">{Number(monthlySummary.totalAttendanceDeductionDays ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Footer with Signature and Timestamp */}
                    <div className="mt-8 flex items-end justify-between border-t border-slate-200 pt-4 dark:border-slate-700 print:mt-12">
                      <div>
                        <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Authorized Signature</div>
                        <div className="h-12 w-48 border-b border-slate-300 dark:border-slate-600"></div>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Printed: {new Date().toLocaleString()}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 print:hidden">
                      <button
                        onClick={handleExportPDF}
                        className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600"
                      >
                        Export as PDF
                      </button>
                      <button
                        onClick={() => {
                          setShowSummaryModal(false);
                          setSelectedEmployeeForSummary(null);
                          setMonthlySummary(null);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                    No summary data available
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* Payslip Modal */}
        {
          showPayslipModal && selectedEmployeeForPayslip !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 print:shadow-none print:max-w-full print:rounded-none">
                <div className="mb-4 flex items-center justify-between print:hidden">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payslip</h3>
                  <div className="flex items-center gap-2">
                    {error && error.includes('not found') && (
                      <button
                        onClick={handleCalculatePayroll}
                        disabled={calculatingPayroll}
                        className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50"
                      >
                        {calculatingPayroll ? 'Calculating...' : 'Calculate Payroll'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowPayslipModal(false);
                        setSelectedEmployeeForPayslip(null);
                        setPayslipData(null);
                        setError('');
                      }}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {loadingPayslip ? (
                  <div className="flex items-center justify-center p-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                  </div>
                ) : error && !error.includes('not found') ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                  </div>
                ) : payslipData ? (
                  <div className="space-y-4 print:space-y-3">
                    {/* Payslip Header */}
                    <div className="border-b-2 border-slate-300 pb-3 dark:border-slate-600">
                      <h2 className="text-center text-xl font-bold text-slate-900 dark:text-white">
                        PAYSLIP FOR THE MONTH OF: {(() => {
                          const monthStr = payslipData.month || `${monthNames[month - 1]} ${year}`;
                          // Format as "DEC 19" style
                          const monthMatch = monthStr.match(/(\w+)\s+(\d{4})/);
                          if (monthMatch) {
                            const monthName = monthMatch[1].substring(0, 3).toUpperCase();
                            const yearShort = monthMatch[2].substring(2);
                            return `${monthName} ${yearShort}`;
                          }
                          return monthStr.toUpperCase();
                        })()}
                      </h2>
                    </div>

                    {/* Employee Details - Matching exact format from image */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">Emp Code:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.emp_no || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">Emp Name:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.name || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">Department:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.department || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">Designation:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.designation || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">Location:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.location || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">Bank A/c No.:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.bank_account_no || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">PAID LEAVES:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.paidLeaves || 0}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">PAID DAYS:</span>
                        <span className="font-bold text-slate-900 dark:text-white">{payslipData.paidDays || payslipData.totalPayableShifts || 0}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">PF Code No.:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.pf_number || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">PF UAN:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.pf_number || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">ESI No.:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.employee?.esi_number || '-'}</span>
                      </div>
                    </div>

                    {/* Earnings and Deductions Side by Side */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Earnings Section - Left Side */}
                      <div className="border border-slate-300 dark:border-slate-600">
                        <h3 className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-left font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                          EARNINGS
                        </h3>
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                          <div className="flex justify-between px-4 py-2">
                            <span className="text-slate-700 dark:text-slate-300">Basic:</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{payslipData.earnings?.basicPay?.toFixed(2) || '0.00'}</span>
                          </div>
                          {/* Map allowances - VDA, HRA, WA, etc. */}
                          {payslipData.earnings?.allowances && payslipData.earnings.allowances.length > 0 && payslipData.earnings.allowances.map((allowance: any, idx: number) => (
                            <div key={idx} className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">{allowance.name?.toUpperCase() || 'ALLOWANCE'}:</span>
                              <span className="font-semibold text-slate-900 dark:text-white">{allowance.amount?.toFixed(2) || '0.00'}</span>
                            </div>
                          ))}
                          {payslipData.earnings?.incentive !== 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">INCENTIVE:</span>
                              <span className="font-semibold text-slate-900 dark:text-white">{payslipData.earnings?.incentive?.toFixed(2) || '0.00'}</span>
                            </div>
                          )}
                          {payslipData.earnings?.otPay > 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">OT PAY:</span>
                              <span className="font-semibold text-slate-900 dark:text-white">{payslipData.earnings?.otPay?.toFixed(2) || '0.00'}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t-2 border-slate-300 bg-slate-100 px-4 py-2 font-bold dark:border-slate-600 dark:bg-slate-800">
                            <span className="text-slate-900 dark:text-white">Gross Salary Rs.:</span>
                            <span className="text-slate-900 dark:text-white">{payslipData.earnings?.grossSalary?.toFixed(2) || '0.00'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Deductions Section - Right Side */}
                      <div className="border border-slate-300 dark:border-slate-600">
                        <h3 className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-left font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                          DEDUCTIONS
                        </h3>
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                          {/* Other deductions first (PF, ESIC, TDS, etc.) */}
                          {payslipData.deductions?.otherDeductions && payslipData.deductions.otherDeductions.length > 0 && payslipData.deductions.otherDeductions.map((deduction: any, idx: number) => (
                            <div key={idx} className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">{deduction.name || 'Deduction'}:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{deduction.amount?.toFixed(2) || '0.00'}</span>
                            </div>
                          ))}
                          {/* TDS - if exists in other deductions, otherwise show if configured */}
                          {payslipData.deductions?.attendanceDeduction > 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">Attendance Deduction:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.deductions.attendanceDeduction.toFixed(2)}</span>
                            </div>
                          )}
                          {payslipData.deductions?.permissionDeduction > 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">Permission Deduction:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.deductions.permissionDeduction.toFixed(2)}</span>
                            </div>
                          )}
                          {payslipData.deductions?.leaveDeduction > 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">Leave Deduction:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.deductions.leaveDeduction.toFixed(2)}</span>
                            </div>
                          )}
                          {payslipData.loanAdvance?.advanceDeduction > 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">AdV:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.loanAdvance.advanceDeduction.toFixed(2)}</span>
                            </div>
                          )}
                          {payslipData.loanAdvance?.totalEMI > 0 && (
                            <div className="flex justify-between px-4 py-2">
                              <span className="text-slate-700 dark:text-slate-300">Loan EMI:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.loanAdvance.totalEMI.toFixed(2)}</span>
                            </div>
                          )}
                          {/* BANK PAY and CASH PAY - these would be calculated from net salary */}
                          <div className="flex justify-between border-t-2 border-slate-300 bg-slate-100 px-4 py-2 font-bold dark:border-slate-600 dark:bg-slate-800">
                            <span className="text-slate-900 dark:text-white">Total Deductions:</span>
                            <span className="text-red-600 dark:text-red-400">
                              {((payslipData.deductions?.totalDeductions || 0) + (payslipData.loanAdvance?.totalEMI || 0) + (payslipData.loanAdvance?.advanceDeduction || 0)).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Net Salary and Payment Details */}
                    <div className="space-y-3">
                      {/* Net Salary */}
                      <div className="border-2 border-green-500 bg-green-50 p-3 dark:border-green-600 dark:bg-green-900/20">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-bold text-green-900 dark:text-green-200">Net Salary:</span>
                          <span className="text-2xl font-bold text-green-900 dark:text-green-200">{payslipData.netSalary?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>

                      {/* Rupees In Words */}
                      <div className="border border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-600 dark:bg-slate-800">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rupees In Words:</span>
                        {/* removed numberToWords display */}
                      </div>
                    </div>

                    {/* Print Button */}
                    <div className="flex justify-end gap-3 print:hidden">
                      <button
                        onClick={() => window.print()}
                        className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-700"
                      >
                        Print Payslip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                    {error || 'Payslip not found. Please calculate payroll first.'}
                  </div>
                )}
              </div>
            </div>
          )
        }
      </div>
    </div>
  );
}
