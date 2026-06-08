'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { canManageLoans } from '@/lib/permissions';
import { ToastContainer } from 'react-toastify';
import Swal from 'sweetalert2';
import 'react-toastify/dist/ReactToastify.css';

import {
  Wallet,
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  ChevronRight,
  Search,
  Plus,
  LayoutList,
  LayoutGrid,
  Printer,
} from 'lucide-react';
import { MultiSelect } from '@/components/MultiSelect';
import {
  loanMatchesListOrgAndStatus,
  loanMatchesSearch,
  LOAN_LIST_STATUS_OPTIONS,
} from '@/lib/loanListUi';
import { LoanListEmployeeCell } from '@/components/LoanListEmployeeCell';
import LoanEditDialog, { canShowLoanEditButton } from '@/components/loans/LoanEditDialog';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansTabBar,
  LoansToolbar,
  LoansContentPanel,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanDetailField,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansDialogPrimaryButtonClass,
  loansDialogPrimaryButtonStyle,
  loansDialogSecondaryButtonClass,
  loansDialogSecondaryButtonStyle,
  loansDialogDangerButtonClass,
  loansDialogSuccessButtonClass,
  LoanDialogFooter,
  LoanDialogTypeToggle,
  LoanFormLabel,
  LoanFormPanel,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansFormTextareaClass,
} from '@/components/loans/LoanDetailDialogShell';
import {
  LedgerApprovalPanel,
  LedgerApprovalTimeline,
  LedgerFinalApprovalPayPeriod,
  LedgerLoanRecalculationPreview,
  LedgerRecordPaymentPanel,
  LedgerReleaseFundsPanel,
  LedgerTransactionHistory,
  LedgerWaitingBanner,
} from '@/components/ledger';
import { downloadLoanAdvanceRequestPdf, type LoanAdvancePdfLoan } from '@/lib/loanAdvanceRequestPdf';
import {
  buildLeaveODPayPeriodOptions,
  formatPayrollMonthKeyLabel,
  getPayPeriodRangeForCalendarMonth,
  loanNeedsDisbursementPayPeriod,
  payPeriodSelectValueToMonthKey,
  payrollMonthKeyToPayPeriodSelectValue,
} from '@/lib/payPeriodRange';
import {
  buildLoanTimelineSteps,
  canUserActOnLoan,
  isLoanFinalApprovalStep,
} from '@/lib/loanWorkflowUi';

interface LoanApplication {
  _id: string;
  employeeId?: {
    _id: string;
    employee_name?: string;
    emp_no: string;
    gross_salary?: number;
  };
  emp_no?: string;
  requestType: 'loan' | 'salary_advance';
  amount: number;
  reason: string;
  remarks?: string;
  duration: number;
  status: string;
  appliedAt: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
  division_id?: { _id: string; name?: string; code?: string } | string;
  loanConfig?: {
    emiAmount: number;
    interestRate: number;
    totalAmount: number;
  };
  advanceConfig?: {
    deductionCycles: number;
    deductionPerCycle: number;
    deductionStartCycle?: string;
  };
  approvals?: {
    final?: {
      firstDeductionPayrollMonth?: string;
    };
  };
  repayment?: {
    totalPaid: number;
    remainingBalance: number;
    installmentsPaid: number;
    totalInstallments: number;
    lastPaymentDate?: string;
    nextPaymentDate?: string;
  };
  transactions?: Array<{
    transactionType: string;
    amount: number;
    transactionDate: string;
    payrollCycle?: string;
    processedBy?: { name: string; email: string };
    remarks?: string;
    createdAt: string;
  }>;
  changeHistory?: Array<{
    field: string;
    originalValue: any;
    newValue: any;
    modifiedBy?: { _id: string; name: string; email: string; role: string };
    modifiedByName: string;
    modifiedByRole: string;
    modifiedAt: string;
    reason?: string;
  }>;
  workflow?: {
    currentStep?: string;
    nextApprover?: string | null;
    nextApproverRole?: string | null;
    isCompleted?: boolean;
    approvalChain?: Array<{
      role: string;
      label?: string;
      status: string;
      isCurrent?: boolean;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      updatedAt?: string;
    }>;
    history?: Array<{
      step?: string;
      action?: string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      timestamp?: string;
    }>;
  };
  guarantors?: Array<{
    employeeId: any;
    emp_no: string;
    name: string;
    status: 'pending' | 'accepted' | 'rejected';
    actionAt?: string;
    remarks?: string;
  }>;
}

/** Pay period containing today (IST); matches PayrollRecord.month when that period is processed. */
interface PresentPayPeriod {
  payrollMonthKey: string;
  startDate: string;
  endDate: string;
  lastDate: string;
  totalDays?: number;
}

interface Employee {
  _id: string;
  employee_name: string;
  emp_no: string;
  department?: { _id: string; name: string };
  department_id?: string;
  designation?: { _id: string; name: string };
  division?: { _id: string; name: string };
  division_id?: string;
  first_name?: string;
  last_name?: string;
}
// Icon Wrappers for compatibility
const LoanIcon = () => <Banknote className="w-4 h-4" />;
const AdvanceIcon = () => <Wallet className="w-4 h-4" />;

const LoanSkeleton = () => (
  <tr className="animate-pulse border-b border-slate-100 dark:border-slate-800">
    <td className="px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700"></div>
        <div>
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-1"></div>
          <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    </td>
    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div></td>
    <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div></td>
    <td className="px-4 py-4"><div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded-full"></div></td>
    <td className="px-4 py-4"><div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div></td>
    <td className="px-4 py-4"><div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg"></div></td>
  </tr>
);

const LoanCardSkeleton = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700"></div>
        <div>
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-1"></div>
          <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
      <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
    </div>
    <div className="space-y-3">
      <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
      <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
    </div>
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
      <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
      <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
    </div>
  </div>
);

export default function LoansPage() {
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [activeTab, setActiveTab] = useState<'loans' | 'advances' | 'pending' | 'guarantor_requests'>('loans');
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [advances, setAdvances] = useState<LoanApplication[]>([]);
  const [pendingLoans, setPendingLoans] = useState<LoanApplication[]>([]);
  const [pendingAdvances, setPendingAdvances] = useState<LoanApplication[]>([]);
  const [guarantorRequests, setGuarantorRequests] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [listFilterDivisions, setListFilterDivisions] = useState<string[]>([]);
  const [listFilterDepartments, setListFilterDepartments] = useState<string[]>([]);
  const [listFilterDesignations, setListFilterDesignations] = useState<string[]>([]);
  const [listFilterStatuses, setListFilterStatuses] = useState<string[]>([]);
  const [loanOrgDivisions, setLoanOrgDivisions] = useState<any[]>([]);
  const [loanOrgDepartments, setLoanOrgDepartments] = useState<any[]>([]);
  const [loanOrgDesignations, setLoanOrgDesignations] = useState<any[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<LoanApplication | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showEditDialog, setShowEditDialog] = useState(false);

  // Apply dialog state
  const [showApplyDialog, setShowApplyDialog] = useState(false);

  // Payment form state (inline in detail dialog)
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    remarks: '',
    payrollCycle: '',
  });
  // Disbursement dialog state
  const [showDisbursementDialog, setShowDisbursementDialog] = useState(false);
  const [disbursementData, setDisbursementData] = useState({
    disbursementMethod: 'bank_transfer',
    transactionReference: '',
    remarks: '',
  });
  const [disbursementPayPeriod, setDisbursementPayPeriod] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Settlement preview state
  const [settlementPreview, setSettlementPreview] = useState<any>(null);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [applyType, setApplyType] = useState<'loan' | 'salary_advance'>('loan');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loanSettings, setLoanSettings] = useState<any>(null);
  const [resolvedLoanSettings, setResolvedLoanSettings] = useState<any>(null);
  const [loadingResolvedSettings, setLoadingResolvedSettings] = useState(false);
  const [interestCalculation, setInterestCalculation] = useState<{
    principal: number;
    interestRate: number;
    duration: number;
    emiAmount: number;
    totalInterest: number;
    totalAmount: number;
  } | null>(null);

  const [guarantorSearch, setGuarantorSearch] = useState('');
  const [showGuarantorDropdown, setShowGuarantorDropdown] = useState(false);
  const [guarantorSearchResults, setGuarantorSearchResults] = useState<Employee[]>([]);
  const [isGuarantorSearching, setIsGuarantorSearching] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
    duration: '',
    remarks: '',
    needAmount: '', // Optional higher amount request
    guarantorIds: [] as string[],
  });

  // User detection and role-based UI
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isEmployee, setIsEmployee] = useState(false);

  // Permission Check
  const hasManagePermission = currentUser ? canManageLoans(currentUser) : false;

  // Eligibility calculator state (from backend)
  const [eligibilityData, setEligibilityData] = useState<any>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  // Approval state (for final authority)
  const [approvalAmount, setApprovalAmount] = useState<string>('');
  const [approvalDuration, setApprovalDuration] = useState<string>('');
  const [approvalInterestRate, setApprovalInterestRate] = useState<string>('');
  const [approvalValidation, setApprovalValidation] = useState<{ level: 'warning' | 'error'; message: string } | null>(null);

  const [presentPayPeriod, setPresentPayPeriod] = useState<PresentPayPeriod | null>(null);
  const [payCycleStartDay, setPayCycleStartDay] = useState(1);
  const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);
  const [finalApprovalPayPeriod, setFinalApprovalPayPeriod] = useState('');

  // User detection on mount
  useEffect(() => {
    const user = auth.getUser();
    if (user) {
      setCurrentUser(user);
      setIsEmployee(user.role === 'employee');
    }
  }, []);

  useEffect(() => {
    loadData();
    loadEmployees();
    loadLoanSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser]);

  useEffect(() => {
    const fetchPayrollCycleSettings = async () => {
      try {
        const [startRes, endRes] = await Promise.all([
          api.getSetting('payroll_cycle_start_day'),
          api.getSetting('payroll_cycle_end_day'),
        ]);
        if (startRes?.data?.value) {
          const startDay = parseInt(startRes.data.value, 10);
          if (!isNaN(startDay) && startDay >= 1 && startDay <= 31) setPayCycleStartDay(startDay);
        }
        if (endRes?.data?.value) {
          const endDay = parseInt(endRes.data.value, 10);
          if (!isNaN(endDay) && endDay >= 1 && endDay <= 31) setPayCycleEndDay(endDay);
        }
      } catch (err) {
        console.error('Failed to fetch payroll cycle settings:', err);
      }
    };
    fetchPayrollCycleSettings();
  }, []);

  useEffect(() => {
    if (showDetailDialog && selectedLoan) {
      loadTransactions(selectedLoan._id);
      // Load settlement preview for loans
      if (selectedLoan.requestType === 'loan' && ['disbursed', 'active'].includes(selectedLoan.status)) {
        loadSettlementPreview(selectedLoan._id);
      }

      // Pre-fill approval amount/rate (final authority)
      if (selectedLoan.amount) {
        setApprovalAmount(selectedLoan.amount.toString());
      }
      if (selectedLoan.requestType === 'loan' && selectedLoan.loanConfig?.interestRate !== undefined) {
        setApprovalInterestRate(selectedLoan.loanConfig.interestRate.toString());
      }
      if (selectedLoan.duration) {
        setApprovalDuration(selectedLoan.duration.toString());
      }

      loadLoanSettings(selectedLoan.requestType);
      const pk = presentPayPeriod?.payrollMonthKey;
      setFinalApprovalPayPeriod(pk ? payrollMonthKeyToPayPeriodSelectValue(pk) : '__default__');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetailDialog, selectedLoan?._id, presentPayPeriod?.payrollMonthKey]);

  const isFinalApprovalStep = useMemo(
    () => isLoanFinalApprovalStep(selectedLoan as any, loanSettings),
    [selectedLoan, loanSettings]
  );

  const canActOnSelectedLoan = useMemo(
    () => canUserActOnLoan(selectedLoan as any, currentUser, loanSettings),
    [selectedLoan, loanSettings]
  );

  const timelineSteps = useMemo(
    () => (selectedLoan && loanSettings ? buildLoanTimelineSteps(selectedLoan as any, loanSettings) : []),
    [selectedLoan, loanSettings]
  );

  const finalApprovalPayPeriodOptions = useMemo(
    () =>
      buildLeaveODPayPeriodOptions({
        payrollCycleStartDay: payCycleStartDay,
        payrollCycleEndDay: payCycleEndDay,
        monthsBack: 3,
        monthsForward: 12,
        getDefaultRange: () => {
          const pk = presentPayPeriod?.payrollMonthKey;
          if (pk) {
            const [y, m] = pk.split('-').map(Number);
            return getPayPeriodRangeForCalendarMonth(y, m, payCycleStartDay, payCycleEndDay);
          }
          const now = new Date();
          return getPayPeriodRangeForCalendarMonth(
            now.getFullYear(),
            now.getMonth() + 1,
            payCycleStartDay,
            payCycleEndDay
          );
        },
        defaultLabel: 'Current pay period',
      }),
    [payCycleStartDay, payCycleEndDay, presentPayPeriod?.payrollMonthKey]
  );

  const selectedFinalPayPeriodPreview = useMemo(() => {
    const opt = finalApprovalPayPeriodOptions.find((o) => o.value === finalApprovalPayPeriod);
    return opt?.range?.to ?? null;
  }, [finalApprovalPayPeriod, finalApprovalPayPeriodOptions]);

  const needsDisbursementPayPeriod = useMemo(
    () => (selectedLoan ? loanNeedsDisbursementPayPeriod(selectedLoan) : false),
    [selectedLoan]
  );

  const disbursementPayPeriodOptions = useMemo(
    () =>
      buildLeaveODPayPeriodOptions({
        payrollCycleStartDay: payCycleStartDay,
        payrollCycleEndDay: payCycleEndDay,
        monthsBack: 3,
        monthsForward: 12,
        getDefaultRange: () => {
          const pk = presentPayPeriod?.payrollMonthKey;
          if (pk) {
            const [y, m] = pk.split('-').map(Number);
            return getPayPeriodRangeForCalendarMonth(y, m, payCycleStartDay, payCycleEndDay);
          }
          const now = new Date();
          return getPayPeriodRangeForCalendarMonth(
            now.getFullYear(),
            now.getMonth() + 1,
            payCycleStartDay,
            payCycleEndDay
          );
        },
        defaultLabel: 'Current pay period',
      }),
    [payCycleStartDay, payCycleEndDay, presentPayPeriod?.payrollMonthKey]
  );

  const selectedDisbursementPayPeriodPreview = useMemo(() => {
    const opt = disbursementPayPeriodOptions.find((o) => o.value === disbursementPayPeriod);
    return opt?.range?.to ?? null;
  }, [disbursementPayPeriod, disbursementPayPeriodOptions]);

  useEffect(() => {
    if (!showDisbursementDialog) return;
    const pk = presentPayPeriod?.payrollMonthKey;
    setDisbursementPayPeriod(pk ? payrollMonthKeyToPayPeriodSelectValue(pk) : '__default__');
  }, [showDisbursementDialog, presentPayPeriod?.payrollMonthKey]);

  // Fetch eligibility when viewing/editing a salary advance
  useEffect(() => {
    if ((showDetailDialog || showEditDialog) && selectedLoan && selectedLoan.requestType === 'salary_advance') {
      const empNo = selectedLoan.employeeId?.emp_no;
      if (empNo) {
        fetchEligibility(empNo);
      }
    }
  }, [showDetailDialog, showEditDialog, selectedLoan?._id]);

  // Validate approval amount
  useEffect(() => {
    if (selectedLoan?.requestType === 'salary_advance' && approvalAmount && eligibilityData) {
      const amount = parseFloat(approvalAmount);
      const basicPay = selectedLoan.employeeId?.gross_salary || 0;
      const maxLimit = eligibilityData.finalMaxAllowed || 0;

      if (amount > basicPay) {
        setApprovalValidation({ level: 'error', message: `Amount (₹${amount.toLocaleString()}) exceeds basic pay (₹${basicPay.toLocaleString()})!` });
      } else if (amount > maxLimit) {
        setApprovalValidation({ level: 'warning', message: `Amount (₹${amount.toLocaleString()}) exceeds the calculated eligibility limit (₹${maxLimit.toLocaleString()}).` });
      } else {
        setApprovalValidation(null);
      }
    } else {
      setApprovalValidation(null);
    }
  }, [approvalAmount, eligibilityData, selectedLoan]);

  // Handle click outside for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmployeeDropdown || showGuarantorDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest('.relative')) {
          setShowEmployeeDropdown(false);
          setShowGuarantorDropdown(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmployeeDropdown, showGuarantorDropdown]);

  useEffect(() => {
    if (applyType === 'loan' && formData.amount && formData.duration && loanSettings) {
      calculateInterest();
    } else {
      setInterestCalculation(null);
    }
  }, [formData.amount, formData.duration, applyType, loanSettings]);

  // Fetch eligibility when employee selected for salary advance
  useEffect(() => {
    if (applyType === 'salary_advance' && selectedEmployee?.emp_no) {
      fetchEligibility(selectedEmployee.emp_no);
    } else {
      setEligibilityData(null);
      setEligibilityError(null);
    }
  }, [selectedEmployee, applyType]);

  // Fetch resolved loan settings when employee is selected
  useEffect(() => {
    const fetchResolvedSettings = async () => {
      if (!selectedEmployee) {
        console.log('[Loan Settings] No employee selected');
        setResolvedLoanSettings(null);
        return;
      }

      // Extract department_id - handle both object and string formats
      const deptId = typeof selectedEmployee.department === 'object'
        ? selectedEmployee.department?._id
        : selectedEmployee.department_id;

      // Extract division_id - handle both object and string formats
      const divId = typeof selectedEmployee.division === 'object'
        ? selectedEmployee.division?._id
        : selectedEmployee.division_id;

      console.log('[Loan Settings] Selected employee:', {
        name: selectedEmployee.employee_name,
        emp_no: selectedEmployee.emp_no,
        department: selectedEmployee.department,
        department_id: selectedEmployee.department_id,
        division: selectedEmployee.division,
        division_id: selectedEmployee.division_id,
        extractedDeptId: deptId,
        extractedDivId: divId
      });

      if (deptId) {
        try {
          setLoadingResolvedSettings(true);
          const settingsType = applyType === 'loan' ? 'loans' : 'salary_advance';

          console.log('[Loan Settings] Fetching resolved settings:', {
            deptId,
            divId,
            settingsType
          });

          const response = await api.getResolvedDepartmentSettings(
            deptId,
            settingsType,
            divId || undefined
          );

          console.log('[Loan Settings] API Response:', response);

          if (response.success && response.data) {
            setResolvedLoanSettings(response.data[settingsType]);
            console.log('[Loan Settings] Resolved settings loaded:', response.data[settingsType]);
          }
        } catch (error) {
          console.error('[Loan Settings] Error fetching resolved settings:', error);
          setResolvedLoanSettings(null);
        } finally {
          setLoadingResolvedSettings(false);
        }
      } else {
        console.log('[Loan Settings] No department_id found, cannot fetch settings');
        setResolvedLoanSettings(null);
      }
    };

    fetchResolvedSettings();
  }, [selectedEmployee, applyType]);

  // Debounced Guarantor Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!guarantorSearch.trim()) {
        setGuarantorSearchResults([]);
        setIsGuarantorSearching(false);
        return;
      }

      setIsGuarantorSearching(true);
      try {
        const res = await api.getEmployees({
          is_active: true,
          search: guarantorSearch,
          limit: 10
        });
        if (res.success && res.data) {
          setGuarantorSearchResults(res.data);
        }
      } catch (error) {
        console.error('Error searching guarantors:', error);
      } finally {
        setIsGuarantorSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [guarantorSearch]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('[Superadmin Loans] Loading data...');

      // Load all loans - show ALL loans in loans tab (like leaves page)
      const loansRes = await api.getLoans({ requestType: 'loan', limit: 100 });
      console.log('[Superadmin Loans] Loans response:', loansRes);
      if (loansRes.success && loansRes.data) {
        const allLoans = Array.isArray(loansRes.data) ? loansRes.data : [];
        console.log('[Superadmin Loans] All loans:', allLoans);
        setLoans(allLoans);
        if (loansRes.presentPayPeriod) setPresentPayPeriod(loansRes.presentPayPeriod);
      } else {
        setLoans([]);
      }

      // Load all advances - show ALL advances in advances tab (like leaves page)
      const advancesRes = await api.getLoans({ requestType: 'salary_advance', limit: 100 });
      console.log('[Superadmin Loans] Advances response:', advancesRes);
      if (advancesRes.success && advancesRes.data) {
        const allAdvances = Array.isArray(advancesRes.data) ? advancesRes.data : [];
        console.log('[Superadmin Loans] All advances:', allAdvances);
        setAdvances(allAdvances);
      } else {
        setAdvances([]);
      }

      // Load pending approvals - only for pending tab
      const pendingRes = await api.getPendingLoanApprovals();
      console.log('[Superadmin Loans] Pending response:', pendingRes);
      if (pendingRes.success && pendingRes.data) {
        const pending = Array.isArray(pendingRes.data) ? pendingRes.data : [];
        console.log('[Superadmin Loans] All pending:', pending);
        setPendingLoans(pending.filter((l: LoanApplication) => l.requestType === 'loan'));
        setPendingAdvances(pending.filter((a: LoanApplication) => a.requestType === 'salary_advance'));
      } else {
        setPendingLoans([]);
        setPendingAdvances([]);
      }

      // Load guarantor requests
      const guarantorRes = await api.getGuarantorRequests();
      if (guarantorRes.success && guarantorRes.data) {
        setGuarantorRequests(guarantorRes.data || []);
      } else {
        setGuarantorRequests([]);
      }
    } catch (err) {
      console.error('[Superadmin Loans] Error loading data:', err);
      setMessage({ type: 'error', text: 'Failed to load loans and advances' });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (loanId: string, action: 'approve' | 'reject' | 'forward') => {
    if (action === 'approve' && approvalValidation?.level === 'error') {
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: approvalValidation.message,
      });
      return;
    }

    if (action === 'approve' && isFinalApprovalStep) {
      const monthKey = payPeriodSelectValueToMonthKey(
        finalApprovalPayPeriod,
        presentPayPeriod?.payrollMonthKey
      );
      if (!monthKey) {
        Swal.fire({
          icon: 'error',
          title: 'Pay period required',
          text: 'Select the first deduction pay period before final approval.',
        });
        return;
      }
    }

    try {
      setSaving(true);
      const payload: any = {
        action,
        comments: actionComment,
      };

      if (action === 'approve') {
        if (approvalAmount) payload.approvalAmount = parseFloat(approvalAmount);
        if (approvalInterestRate) payload.approvalInterestRate = parseFloat(approvalInterestRate);
        if (isFinalApprovalStep) {
          payload.firstDeductionPayrollMonth = payPeriodSelectValueToMonthKey(
            finalApprovalPayPeriod,
            presentPayPeriod?.payrollMonthKey
          );
        }
      }

      const response = await api.processLoanAction(loanId, payload);
      if (response.success) {
        setMessage({ type: 'success', text: `Loan ${action}d successfully` });
        setShowDetailDialog(false);
        setActionComment('');
        loadData();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to process action' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLoan = async (loanId: string) => {
    try {
      setSaving(true);
      const payload: Record<string, number> = {
        amount: parseFloat(approvalAmount),
        duration: parseInt(approvalDuration, 10),
      };

      if (selectedLoan?.requestType === 'loan') {
        payload.interestRate = parseFloat(approvalInterestRate);
      }

      const response = await api.updateLoan(loanId, payload);
      if (response.success) {
        setMessage({ type: 'success', text: 'Loan updated. You can now approve or reject.' });
        loadData();
        const updatedLoan = await api.getLoan(loanId);
        if (updatedLoan.success) {
          setSelectedLoan(updatedLoan.data);
        }
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to update loan' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred while updating loan' });
    } finally {
      setSaving(false);
    }
  };

  const handleGuarantorAction = async (loanId: string, action: 'accepted' | 'rejected') => {
    try {
      const { value: remarks } = await Swal.fire({
        title: `Are you sure you want to ${action} this request?`,
        input: 'textarea',
        inputLabel: 'Remarks (Optional)',
        inputPlaceholder: 'Enter your remarks here...',
        showCancelButton: true,
        confirmButtonText: action.charAt(0).toUpperCase() + action.slice(1),
        confirmButtonColor: action === 'accepted' ? '#10b981' : '#ef4444',
      });

      if (remarks !== undefined) {
        setSaving(true);
        const response = await api.processGuarantorAction(loanId, action, remarks);
        if (response.success) {
          Swal.fire('Success!', `Request ${action} successfully.`, 'success');
          loadData();
        } else {
          Swal.fire('Error!', response.error || `Failed to ${action} request.`, 'error');
        }
      }
    } catch (error) {
      console.error('Error processing guarantor action:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDisburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    if (needsDisbursementPayPeriod) {
      const monthKey = payPeriodSelectValueToMonthKey(
        disbursementPayPeriod,
        presentPayPeriod?.payrollMonthKey
      );
      if (!monthKey) {
        Swal.fire({
          icon: 'error',
          title: 'Pay period required',
          text: 'Select the first deduction pay period before disbursing this record.',
        });
        return;
      }
    }

    try {
      setSaving(true);
      setMessage(null);

      const payload: {
        disbursementMethod: string;
        transactionReference: string;
        remarks: string;
        firstDeductionPayrollMonth?: string;
      } = {
        disbursementMethod: disbursementData.disbursementMethod,
        transactionReference: disbursementData.transactionReference,
        remarks: disbursementData.remarks,
      };
      if (needsDisbursementPayPeriod) {
        payload.firstDeductionPayrollMonth = payPeriodSelectValueToMonthKey(
          disbursementPayPeriod,
          presentPayPeriod?.payrollMonthKey
        )!;
      }

      const response = await api.disburseLoan(selectedLoan._id, payload);

      if (response.success) {
        setMessage({ type: 'success', text: 'Funds released successfully. Transaction recorded.' });
        setShowDisbursementDialog(false);
        setDisbursementData({ disbursementMethod: 'bank_transfer', transactionReference: '', remarks: '' });

        // Reload loan data and transactions
        const loanRes = await api.getLoan(selectedLoan._id);
        if (loanRes.success) {
          setSelectedLoan(loanRes.data);
          if (loanRes.presentPayPeriod) setPresentPayPeriod(loanRes.presentPayPeriod);
        }
        loadTransactions(selectedLoan._id);
        loadData();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to release funds' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const loadTransactions = async (loanId: string) => {
    try {
      setLoadingTransactions(true);
      const response = await api.getLoanTransactions(loanId);
      if (response.success && response.data) {
        setTransactions(response.data.transactions || []);
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleDownloadRequestPdf = async () => {
    if (!selectedLoan) return;
    setExportingPdf(true);
    try {
      const [loanRes, txnRes] = await Promise.all([
        api.getLoan(selectedLoan._id),
        api.getLoanTransactions(selectedLoan._id),
      ]);
      if (!txnRes.success || !txnRes.data) {
        setMessage({ type: 'error', text: txnRes.error || 'Could not load transactions for PDF' });
        return;
      }
      if (!loanRes.success || !loanRes.data) {
        setMessage({ type: 'error', text: loanRes.error || 'Could not load full loan record for PDF' });
        return;
      }
      const txns = txnRes.data.transactions || [];
      const summary = txnRes.data.summary;
      downloadLoanAdvanceRequestPdf(loanRes.data as LoanAdvancePdfLoan, txns, {
        summary,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to generate PDF' });
    } finally {
      setExportingPdf(false);
    }
  };

  const loadSettlementPreview = async (loanId: string) => {
    try {
      setLoadingSettlement(true);
      const response = await api.getSettlementPreview(loanId);
      if (response.success && response.data) {
        setSettlementPreview(response.data);
      }
    } catch (err) {
      console.error('Error loading settlement preview:', err);
      setSettlementPreview(null);
    } finally {
      setLoadingSettlement(false);
    }
  };

  const handleEdit = () => {
    if (!selectedLoan) return;
    setShowEditDialog(true);
  };

  const togglePaymentForm = () => {
    if (!selectedLoan) return;

    if (!showPaymentForm) {
      // Pre-fill EMI amount for loans
      const emiAmount = selectedLoan.requestType === 'loan' && selectedLoan.loanConfig?.emiAmount
        ? selectedLoan.loanConfig.emiAmount
        : selectedLoan.requestType === 'salary_advance' && selectedLoan.advanceConfig?.deductionPerCycle
          ? selectedLoan.advanceConfig.deductionPerCycle
          : '';

      setPaymentData({
        amount: emiAmount.toString(),
        paymentDate: new Date().toISOString().split('T')[0],
        remarks: '',
        payrollCycle: '',
      });
    }
    setShowPaymentForm(!showPaymentForm);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    try {
      setSaving(true);
      setMessage(null);

      if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
        setMessage({ type: 'error', text: 'Please enter a valid payment amount' });
        return;
      }

      const payload = {
        amount: parseFloat(paymentData.amount),
        paymentDate: paymentData.paymentDate,
        remarks: paymentData.remarks,
        payrollCycle: paymentData.payrollCycle || undefined,
      };

      let response;
      if (selectedLoan.requestType === 'loan') {
        response = await api.payEMI(selectedLoan._id, payload);
      } else {
        response = await api.payAdvance(selectedLoan._id, payload);
      }

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `${selectedLoan.requestType === 'loan' ? 'EMI' : 'Advance'} payment recorded successfully`,
          timer: 2000,
          showConfirmButton: false,
        });
        setShowPaymentForm(false);
        setPaymentData({ amount: '', paymentDate: new Date().toISOString().split('T')[0], remarks: '', payrollCycle: '' });

        // Reload loan data and transactions
        const loanRes = await api.getLoan(selectedLoan._id);
        if (loanRes.success) {
          setSelectedLoan(loanRes.data);
          if (loanRes.presentPayPeriod) setPresentPayPeriod(loanRes.presentPayPeriod);
        }
        loadTransactions(selectedLoan._id);
        if (selectedLoan.requestType === 'loan') {
          loadSettlementPreview(selectedLoan._id);
        }
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.error || 'Failed to record payment',
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'An error occurred',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEarlySettlement = async () => {
    if (!selectedLoan || !settlementPreview) return;

    try {
      setSaving(true);
      const payload = {
        amount: settlementPreview.current.settlementAmount,
        paymentDate: new Date().toISOString().split('T')[0],
        remarks: `Early settlement - Interest saved: ₹${settlementPreview.current.interestSavings.toLocaleString()}`,
        isEarlySettlement: true,
      };

      const response = await api.payEMI(selectedLoan._id, payload);

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Settlement Complete!',
          html: `
            <div class="text-left">
              <p class="mb-2">Early settlement payment recorded successfully!</p>
              <p class="text-sm text-gray-600 mb-1"><strong>Amount Paid:</strong> ₹${settlementPreview.current.settlementAmount.toLocaleString()}</p>
              <p class="text-sm text-green-600 mb-1"><strong>Interest Saved:</strong> ₹${settlementPreview.current.interestSavings.toLocaleString()}</p>
              <p class="text-sm text-gray-600"><strong>Months Used:</strong> ${settlementPreview.current.actualMonthsUsed} of ${settlementPreview.current.originalDuration}</p>
            </div>
          `,
          timer: 3000,
        });
        setShowSettlementDialog(false);
        setShowDetailDialog(false);
        setSelectedLoan(null);
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.error || 'Failed to process early settlement',
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Failed to process early settlement',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Fetch eligibility from backend
  const fetchEligibility = async (empNo: string) => {
    try {
      setLoadingEligibility(true);
      setEligibilityError(null);

      const token = auth.getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/loans/calculate-eligibility?empNo=${empNo}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success && data.data) {
        setEligibilityData(data.data);
      } else {
        setEligibilityError(data.message || 'Failed to calculate eligibility');
        setEligibilityData(null);
      }
    } catch (error: any) {
      console.error('Error fetching eligibility:', error);
      setEligibilityError(error.message || 'Error calculating eligibility');
      setEligibilityData(null);
    } finally {
      setLoadingEligibility(false);
    }
  };

  const loadEmployees = async () => {
    try {
      if (!currentUser) return;

      // For employees: Load only self
      if (isEmployee) {
        const identifier = (currentUser as any).emp_no || currentUser.employeeId;
        if (identifier) {
          try {
            const response = await api.getEmployee(identifier);
            if (response.success && response.data) {
              setEmployees([response.data]);
              // Auto-select for employee
              setSelectedEmployee(response.data);
            }
          } catch (err) {
            console.error('Error loading employee details:', err);
          }
        }
      } else {
        // For HOD/HR/Admin: Load all employees
        const response = await api.getEmployees({ is_active: true, limit: 10000 });
        if (response.success && response.data) {
          setEmployees(response.data || []);
        }
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  };

  const loadLoanSettings = async (type: 'loan' | 'salary_advance' = 'loan') => {
    try {
      const response = await api.getLoanSettings(type);
      if (response.success && response.data) {
        setLoanSettings(response.data);
      }
    } catch (err) {
      console.error('Error loading loan settings:', err);
    }
  };

  const calculateInterest = () => {
    const principal = parseFloat(formData.amount);
    const duration = parseInt(formData.duration);
    if (!principal || !duration || !loanSettings) return;

    const interestRate = loanSettings.settings?.interestRate || 0;
    const isInterestApplicable = loanSettings.settings?.isInterestApplicable || false;

    if (!isInterestApplicable || interestRate === 0) {
      const emiAmount = principal / duration;
      setInterestCalculation({
        principal,
        interestRate: 0,
        duration,
        emiAmount: Math.round(emiAmount),
        totalInterest: 0,
        totalAmount: principal,
      });
    } else {
      // Simple Interest Calculation: SI = (P * R * T) / 100
      const totalInterest = (principal * interestRate * (duration / 12)) / 100;
      const totalAmount = principal + totalInterest;
      const emiAmount = totalAmount / duration;

      setInterestCalculation({
        principal,
        interestRate,
        duration,
        emiAmount: Math.round(emiAmount),
        totalInterest: Math.round(totalInterest),
        totalAmount: Math.round(totalAmount),
      });
    }
  };

  const getEmployeeName = (emp: Employee) => {
    if (emp.employee_name) return emp.employee_name;
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    if (emp.first_name) return emp.first_name;
    return emp.emp_no;
  };

  const getEmployeeInitials = (emp: Employee) => {
    const name = getEmployeeName(emp);
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    }
    return (name[0] || 'E').toUpperCase();
  };

  const openApplyDialog = (type: 'loan' | 'salary_advance') => {
    setApplyType(type);
    setFormData({ amount: '', reason: '', duration: '', remarks: '', needAmount: '', guarantorIds: [] });
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setInterestCalculation(null);
    setShowApplyDialog(true);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);

      if (!selectedEmployee) {
        setMessage({ type: 'error', text: 'Please select an employee' });
        return;
      }

      if (!formData.amount || !formData.reason) {
        setMessage({ type: 'error', text: 'Please fill all required fields' });
        return;
      }

      if (applyType === 'loan' && !formData.duration) {
        setMessage({ type: 'error', text: 'Duration is required for loans' });
        return;
      }

      if (applyType === 'loan' && (!formData.guarantorIds || formData.guarantorIds.length < 2)) {
        setMessage({ type: 'error', text: 'At least 2 unique guarantors are required for loan applications' });
        return;
      }

      const payload: any = {
        requestType: applyType,
        amount: parseFloat(formData.amount),
        reason: formData.reason,
        remarks: formData.remarks,
        needAmount: formData.needAmount ? parseFloat(formData.needAmount) : undefined,
        empNo: selectedEmployee.emp_no,
      };

      if (applyType === 'loan') {
        payload.duration = parseInt(formData.duration);
        payload.guarantorIds = formData.guarantorIds;
      } else {
        payload.duration = formData.duration ? parseInt(formData.duration) : 1;
      }

      const response = await api.applyLoan(payload);

      if (response.success) {
        setMessage({ type: 'success', text: `${applyType === 'loan' ? 'Loan' : 'Salary advance'} applied successfully for ${getEmployeeName(selectedEmployee)}` });
        setShowApplyDialog(false);
        setFormData({ amount: '', reason: '', duration: '', remarks: '', needAmount: '', guarantorIds: [] });
        setSelectedEmployee(null);
        setEmployeeSearch('');
        loadData();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to submit application' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const search = employeeSearch.toLowerCase();
    return (
      getEmployeeName(emp).toLowerCase().includes(search) ||
      emp.emp_no.toLowerCase().includes(search) ||
      emp.department?.name.toLowerCase().includes(search)
    );
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      hod_approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      hod_rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      manager_approved: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
      manager_rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      hr_approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      hr_rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      disbursed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      active: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
      completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  useEffect(() => {
    api.getDivisions?.().then((r: any) => {
      if (r?.success && r?.data) setLoanOrgDivisions(r.data);
      else if (Array.isArray(r)) setLoanOrgDivisions(r);
    }).catch(() => {});
    api.getDepartments?.().then((r: any) => {
      if (r?.success && r?.data) setLoanOrgDepartments(r.data);
      else if (Array.isArray(r)) setLoanOrgDepartments(r);
    }).catch(() => {});
    api.getDesignations?.().then((r: any) => {
      if (r?.success && r?.data) setLoanOrgDesignations(r.data);
      else if (Array.isArray(r)) setLoanOrgDesignations(r);
    }).catch(() => {});
  }, []);

  const loanListDepartmentOptions = useMemo(() => {
    if (listFilterDivisions.length === 0) return loanOrgDepartments;
    const allowed = new Set<string>();
    for (const divId of listFilterDivisions) {
      const div = loanOrgDivisions.find((d: any) => String(d._id) === String(divId));
      const deptIds = ((div?.departments ?? []) as any[]).map((d: any) => (typeof d === 'string' ? d : d?._id));
      if (deptIds.length) {
        deptIds.forEach((id) => {
          if (id) allowed.add(String(id));
        });
      } else {
        loanOrgDepartments
          .filter((d: any) => String(d.division_id || d.division) === String(divId))
          .forEach((d: any) => allowed.add(String(d._id)));
      }
    }
    if (allowed.size === 0) {
      return loanOrgDepartments.filter((d: any) => listFilterDivisions.includes(String(d.division_id || d.division)));
    }
    return loanOrgDepartments.filter((d: any) => allowed.has(String(d._id)));
  }, [listFilterDivisions, loanOrgDivisions, loanOrgDepartments]);

  useEffect(() => {
    if (listFilterDepartments.length === 0) return;
    const allowed = new Set(loanListDepartmentOptions.map((d: any) => String(d._id)));
    setListFilterDepartments((prev) => prev.filter((id) => allowed.has(id)));
  }, [loanListDepartmentOptions, listFilterDivisions]);

  const filteredLoansForList = useMemo(
    () =>
      loans.filter(
        (loan) =>
          loanMatchesSearch(loan, searchTerm)
          && loanMatchesListOrgAndStatus(
            loan,
            listFilterDivisions,
            listFilterDepartments,
            listFilterDesignations,
            listFilterStatuses,
          ),
      ),
    [loans, searchTerm, listFilterDivisions, listFilterDepartments, listFilterDesignations, listFilterStatuses],
  );

  const filteredAdvancesForList = useMemo(
    () =>
      advances.filter(
        (loan) =>
          loanMatchesSearch(loan, searchTerm)
          && loanMatchesListOrgAndStatus(
            loan,
            listFilterDivisions,
            listFilterDepartments,
            listFilterDesignations,
            listFilterStatuses,
          ),
      ),
    [advances, searchTerm, listFilterDivisions, listFilterDepartments, listFilterDesignations, listFilterStatuses],
  );

  const anyListFilterActive =
    listFilterDivisions.length > 0
    || listFilterDepartments.length > 0
    || listFilterDesignations.length > 0
    || listFilterStatuses.length > 0;

  const clearLoanListFilters = () => {
    setListFilterDivisions([]);
    setListFilterDepartments([]);
    setListFilterDesignations([]);
    setListFilterStatuses([]);
  };

  const pendingCount = pendingLoans.length + pendingAdvances.length;
  const disbursedCount =
    loans.filter((l) => l.status === 'approved' || l.status === 'disbursed').length
    + advances.filter((a) => a.status === 'approved' || a.status === 'disbursed').length;

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Finance · Workspace"
        title="Loans & Salary Advances"
        subtitle="Manage employee financial assistance requests and repayment tracking"
        action={
          <button
            type="button"
            onClick={() => openApplyDialog('loan')}
            className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            <Plus className="w-4 h-4" />
            <span>Apply request</span>
          </button>
        }
      />

      <LoansStatGrid
        stats={[
          { label: 'Active loans', value: loans.length, accent: true },
          { label: 'Salary advances', value: advances.length, accent: true },
          { label: 'Pending approvals', value: pendingCount, muted: true },
          { label: 'Approved total', value: disbursedCount, highlight: true },
        ]}
      />

      <LoansTabBar
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'loans', label: 'Loans', count: loans.length },
          { id: 'advances', label: 'Salary advances', count: advances.length },
          { id: 'pending', label: 'Pending', count: pendingCount },
          { id: 'guarantor_requests', label: 'Guarantor requests', count: guarantorRequests.length },
        ]}
      />

      {(activeTab === 'loans' || activeTab === 'advances') && (
        <LoansToolbar>
          <div className="flex flex-wrap items-end gap-3">
              <MultiSelect
                variant="ledger"
                label="Division"
                options={loanOrgDivisions.map((d: any) => ({
                  id: String(d._id),
                  name: d.name ?? d.code ?? 'Division',
                }))}
                selectedIds={listFilterDivisions}
                onChange={(vals) => {
                  setListFilterDivisions(vals);
                  setListFilterDepartments([]);
                }}
                placeholder="All divisions"
                className="w-full sm:w-40 md:w-44"
              />
              <MultiSelect
                variant="ledger"
                label="Department"
                options={loanListDepartmentOptions.map((d: any) => ({
                  id: String(d._id),
                  name: d.name ?? d.department_name ?? 'Department',
                }))}
                selectedIds={listFilterDepartments}
                onChange={setListFilterDepartments}
                placeholder="All departments"
                className="w-full sm:w-40 md:w-44"
              />
              <MultiSelect
                variant="ledger"
                label="Designation"
                options={loanOrgDesignations.map((d: any) => ({
                  id: String(d._id),
                  name: d.name ?? d.designation_name ?? d.title ?? 'Designation',
                }))}
                selectedIds={listFilterDesignations}
                onChange={setListFilterDesignations}
                placeholder="All designations"
                className="w-full sm:w-40 md:w-44"
              />
              <MultiSelect
                variant="ledger"
                label="Status"
                options={LOAN_LIST_STATUS_OPTIONS}
                selectedIds={listFilterStatuses}
                onChange={setListFilterStatuses}
                placeholder="All statuses"
                className="w-full sm:w-48 md:w-56"
              />
              <div className="flex w-full flex-col gap-1.5 sm:w-44 md:w-52">
                <label
                  className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--ps-accent-ink)' }}
                >
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Name, ID, reason…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`h-10 pl-9 pr-3 ${loansFormInputClass()}`}
                    style={loansFormInputStyle()}
                  />
                </div>
              </div>
              {anyListFilterActive && (
                <button
                  type="button"
                  onClick={clearLoanListFilters}
                  className="h-10 rounded-md border px-3 text-xs font-semibold uppercase tracking-wider transition hover:opacity-80"
                  style={{ borderColor: 'var(--ps-accent-border)', color: 'var(--ps-accent)' }}
                >
                  Clear filters
                </button>
              )}
              <div
                className="ml-auto flex h-10 shrink-0 items-center gap-1 self-end rounded-md border p-1"
                style={{ borderColor: 'var(--ps-accent-border)' }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="rounded p-2 transition"
                  style={
                    viewMode === 'list'
                      ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }
                      : { color: 'rgb(120 113 108)' }
                  }
                  title="List view"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className="rounded p-2 transition"
                  style={
                    viewMode === 'card'
                      ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }
                      : { color: 'rgb(120 113 108)' }
                  }
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
          </div>
        </LoansToolbar>
      )}

      {message && (
        <div
          className={`mb-5 flex items-center justify-between border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-current hover:opacity-70">
            ×
          </button>
        </div>
      )}

      <LoansContentPanel>
          {activeTab === 'loans' && (
            <>
              {viewMode === 'list' ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Employee</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Amount</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Duration</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Status</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Date</th>
                        <th className={`px-6 py-4 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loading ? (
                        [...Array(5)].map((_, i) => <LoanSkeleton key={i} />)
                      ) : filteredLoansForList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center">
                              <Banknote className="w-12 h-12 text-slate-300 mb-3" />
                              <p className="text-lg font-medium text-slate-900 dark:text-white">No loans found</p>
                              <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredLoansForList.map((loan, idx) => (
                          <tr
                            key={loan._id}
                            className={`border-b border-slate-200 dark:border-slate-700 transition-colors duration-200 ${
                              idx % 2 === 0
                                ? 'bg-white dark:bg-slate-800'
                                : 'bg-slate-50 dark:bg-slate-900/50'
                            } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
                          >
                            <td className="px-6 py-4">
                              <LoanListEmployeeCell
                                loan={loan}
                                divisions={loanOrgDivisions}
                                departments={loanOrgDepartments}
                                designations={loanOrgDesignations}
                                tone="emerald"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-bold text-slate-900 dark:text-white">
                                ₹{loan.amount.toLocaleString()}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                <Calendar className="w-3.5 h-3.5" />
                                {loan.duration} months
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full capitalize ${getStatusColor(loan.status)}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                {loan.status?.replace('_', ' ') || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                              {new Date(loan.appliedAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowDetailDialog(true);
                                }}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6">
                  {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {[...Array(6)].map((_, i) => <LoanCardSkeleton key={i} />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredLoansForList.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                          <Banknote className="w-16 h-16 text-slate-200 mb-4" />
                          <p className="text-xl font-bold text-slate-900 dark:text-white">No loans found</p>
                        </div>
                      ) : (
                        filteredLoansForList.map((loan, idx) => (
                          <div
                            key={loan._id}
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowDetailDialog(true);
                            }}
                            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <LoanListEmployeeCell
                                loan={loan}
                                divisions={loanOrgDivisions}
                                departments={loanOrgDepartments}
                                designations={loanOrgDesignations}
                                tone="emerald"
                              />
                              <div className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${getStatusColor(loan.status)}`}>
                                {loan.status?.replace('_', ' ')}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                <span className="text-xs font-semibold text-slate-500 uppercase">Amount</span>
                                <span className="text-base font-bold text-slate-900 dark:text-white">₹{loan.amount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center px-2">
                                <span className="text-xs text-slate-500">Duration</span>
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{loan.duration} Months</span>
                              </div>
                              <div className="flex justify-between items-center px-2">
                                <span className="text-xs text-slate-500">Applied</span>
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                  {new Date(loan.appliedAt).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'advances' && (
            <>
              {viewMode === 'list' ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Employee</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Amount</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Status</th>
                        <th className={`px-6 py-4 ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Date</th>
                        <th className={`px-6 py-4 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loading ? (
                        [...Array(5)].map((_, i) => <LoanSkeleton key={i} />)
                      ) : filteredAdvancesForList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center">
                              <Wallet className="w-12 h-12 text-slate-300 mb-3" />
                              <p className="text-lg font-medium text-slate-900 dark:text-white">No advances found</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredAdvancesForList.map((advance, idx) => (
                          <tr
                            key={advance._id}
                            className={`border-b border-slate-200 dark:border-slate-700 transition-colors duration-200 ${
                              idx % 2 === 0
                                ? 'bg-white dark:bg-slate-800'
                                : 'bg-slate-50 dark:bg-slate-900/50'
                            } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
                          >
                            <td className="px-6 py-4">
                              <LoanListEmployeeCell
                                loan={advance}
                                divisions={loanOrgDivisions}
                                departments={loanOrgDepartments}
                                designations={loanOrgDesignations}
                                tone="teal"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-bold text-slate-900 dark:text-white">
                                ₹{advance.amount.toLocaleString()}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full capitalize ${getStatusColor(advance.status)}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                {advance.status?.replace('_', ' ') || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                              {new Date(advance.appliedAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedLoan(advance);
                                  setShowDetailDialog(true);
                                }}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6">
                  {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {[...Array(6)].map((_, i) => <LoanCardSkeleton key={i} />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredAdvancesForList.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                          <Wallet className="w-16 h-16 text-slate-200 mb-4" />
                          <p className="text-xl font-bold text-slate-900 dark:text-white">No advances found</p>
                        </div>
                      ) : (
                        filteredAdvancesForList.map((advance, idx) => (
                          <div
                            key={advance._id}
                            onClick={() => {
                              setSelectedLoan(advance);
                              setShowDetailDialog(true);
                            }}
                            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <LoanListEmployeeCell
                                loan={advance}
                                divisions={loanOrgDivisions}
                                departments={loanOrgDepartments}
                                designations={loanOrgDesignations}
                                tone="teal"
                              />
                              <div className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${getStatusColor(advance.status)}`}>
                                {advance.status?.replace('_', ' ')}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                <span className="text-xs font-semibold text-slate-500 uppercase">Amount</span>
                                <span className="text-base font-bold text-slate-900 dark:text-white">₹{advance.amount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center px-2">
                                <span className="text-xs text-slate-500">Applied</span>
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                  {new Date(advance.appliedAt).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'pending' && (
            <div className="p-4 space-y-4">
              {/* Pending Loans */}
              {pendingLoans.length > 0 && (
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white">
                      <LoanIcon />
                    </div>
                    Pending Loans ({pendingLoans.length})
                  </h3>
                  <div className="space-y-4">
                    {pendingLoans.map((loan) => (
                      <div key={loan._id} className="rounded-2xl border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/80 to-yellow-50/50 p-5 dark:border-amber-800/30 dark:from-amber-900/20 dark:to-yellow-900/10 shadow-sm hover:shadow-md transition-all duration-300">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <LoanListEmployeeCell
                                loan={loan}
                                divisions={loanOrgDivisions}
                                departments={loanOrgDepartments}
                                designations={loanOrgDesignations}
                                tone="blue"
                                showAvatar={false}
                              />
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(loan.status)}`}>
                                {loan.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                              <div><strong>Amount:</strong> ₹{loan.amount.toLocaleString()} | <strong>Duration:</strong> {loan.duration} months</div>
                              <div><strong>Reason:</strong> {loan.reason}</div>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            {hasManagePermission && (
                              <button
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowDetailDialog(true);
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-green-600 rounded-xl hover:from-green-600 hover:to-green-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-green-500/30 hover:shadow-lg"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Approve
                              </button>
                            )}
                            {hasManagePermission && (
                              <button
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowDetailDialog(true);
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-red-500/30 hover:shadow-lg"
                              >
                                <XCircle className="w-4 h-4" /> Reject
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Advances */}
              {pendingAdvances.length > 0 && (
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white">
                      <AdvanceIcon />
                    </div>
                    Pending Advances ({pendingAdvances.length})
                  </h3>
                  <div className="space-y-4">
                    {pendingAdvances.map((advance) => (
                      <div key={advance._id} className="rounded-2xl border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/80 to-yellow-50/50 p-5 dark:border-amber-800/30 dark:from-amber-900/20 dark:to-yellow-900/10 shadow-sm hover:shadow-md transition-all duration-300">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <LoanListEmployeeCell
                                loan={advance}
                                divisions={loanOrgDivisions}
                                departments={loanOrgDepartments}
                                designations={loanOrgDesignations}
                                tone="teal"
                                showAvatar={false}
                              />
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(advance.status)}`}>
                                {advance.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                              <div><strong>Amount:</strong> ₹{advance.amount.toLocaleString()}</div>
                              <div><strong>Reason:</strong> {advance.reason}</div>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            {hasManagePermission && (
                              <button
                                onClick={() => {
                                  setSelectedLoan(advance);
                                  setShowDetailDialog(true);
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-green-600 rounded-xl hover:from-green-600 hover:to-green-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-green-500/30 hover:shadow-lg"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Approve
                              </button>
                            )}
                            {hasManagePermission && (
                              <button
                                onClick={() => {
                                  setSelectedLoan(advance);
                                  setShowDetailDialog(true);
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-red-500/30 hover:shadow-lg"
                              >
                                <XCircle className="w-4 h-4" /> Reject
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingLoans.length === 0 && pendingAdvances.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  No pending approvals
                </div>
              )}
            </div>
          )}

          {activeTab === 'guarantor_requests' && (
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                Guarantor Requests
              </h3>
              
              {guarantorRequests.length === 0 ? (
                <div className="text-center py-20 bg-slate-50/50 dark:bg-slate-900/20 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                  <Banknote className="w-16 h-16 text-slate-300 mx-auto mb-4 opacity-50" />
                  <p className="text-xl font-bold text-slate-900 dark:text-white mb-1">No requests to guarantee</p>
                  <p className="text-slate-500">You haven't been requested as a guarantor for any loans yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {guarantorRequests.map((req) => {
                    const myGuarantorInfo = req.guarantors?.find((g: any) => {
                      const currentUserId = currentUser?.employeeRef || currentUser?.id;
                      if (!currentUserId) return false;
                      const gId = typeof g.employeeId === 'object' ? g.employeeId?._id : g.employeeId;
                      return gId?.toString() === currentUserId.toString();
                    });
                    
                    return (
                      <div key={req._id} className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-lg">
                              {(req.employeeId?.employee_name || 'E')[0]}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white line-clamp-1">
                                {req.employeeId?.employee_name || 'Unknown'}
                              </div>
                              <div className="text-xs font-bold text-slate-500">{req.emp_no || 'N/A'}</div>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            myGuarantorInfo?.status === 'accepted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            myGuarantorInfo?.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {myGuarantorInfo?.status || 'pending'}
                          </div>
                        </div>

                        <div className="space-y-3 mb-6">
                          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                            <span className="text-xs font-bold text-slate-500 uppercase">Amount</span>
                            <span className="text-lg font-black text-slate-900 dark:text-white">₹{req.amount.toLocaleString()}</span>
                          </div>
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                            <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Reason</span>
                            <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 italic">"{req.reason}"</p>
                          </div>
                        </div>

                        {myGuarantorInfo?.status === 'pending' ? (
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleGuarantorAction(req._id, 'accepted')}
                              className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2"
                            >
                              <CheckCircle2 className="w-4 h-4" /> Accept
                            </button>
                            <button
                              onClick={() => handleGuarantorAction(req._id, 'rejected')}
                              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl text-xs font-black hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all flex items-center justify-center gap-2 border border-transparent hover:border-red-200 dark:hover:border-red-800"
                            >
                              <XCircle className="w-4 h-4" /> Reject
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled
                            className="w-full py-3 bg-slate-50 dark:bg-slate-800/50 text-slate-400 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border border-slate-100 dark:border-slate-800"
                          >
                            <Clock className="w-4 h-4" /> Action Taken
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
      </LoansContentPanel>

      <LoanDetailDialog
        open={showDetailDialog && !!selectedLoan}
        onClose={() => {
          setShowDetailDialog(false);
          setSelectedLoan(null);
          setTransactions([]);
          setShowPaymentForm(false);
          setShowDisbursementDialog(false);
          setSettlementPreview(null);
        }}
      >
        {selectedLoan && (
          <>
            <LoanDetailDialogHeader
              badge={selectedLoan.requestType === 'loan' ? 'Loan request' : 'Salary advance'}
              title={`${selectedLoan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} Details`}
              subtitle={selectedLoan.emp_no || selectedLoan.employeeId?.emp_no || undefined}
              onClose={() => {
                setShowDetailDialog(false);
                setSelectedLoan(null);
                setTransactions([]);
                setShowPaymentForm(false);
                setShowDisbursementDialog(false);
                setSettlementPreview(null);
              }}
              actions={
                <button
                  type="button"
                  onClick={() => void handleDownloadRequestPdf()}
                  disabled={exportingPdf}
                  className={loansDialogOutlineButtonClass()}
                  style={loansDialogOutlineButtonStyle()}
                  title="Download PDF (request summary, ledger, and one slip per transaction)"
                >
                  <Printer className="h-4 w-4 shrink-0" />
                  {exportingPdf ? '…' : 'Print PDF'}
                </button>
              }
            />

            <LoanDetailDialogBody>
                {/* Status Badge & Dates */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`px-4 py-2 text-sm font-semibold rounded-xl capitalize ${getStatusColor(selectedLoan.status)}`}>
                    {selectedLoan.status?.replace('_', ' ') || 'Unknown'}
                  </span>
                  <div className="flex gap-4 text-sm text-slate-500">
                    <span>Applied: {new Date(selectedLoan.appliedAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}</span>
                  </div>
                </div>

                {presentPayPeriod && (
                  <LoanDetailSection soft>
                    <LoanDetailSectionTitle>Current pay period (today)</LoanDetailSectionTitle>
                    <div className="space-y-1.5 text-xs text-stone-600 dark:text-stone-300">
                    <p>
                      <span className="font-medium text-slate-800 dark:text-slate-200">Last day of period:</span>{' '}
                      {new Date(`${presentPayPeriod.lastDate}T12:00:00`).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      <span className="text-slate-400">(</span>
                      {presentPayPeriod.startDate} → {presentPayPeriod.endDate}
                      <span className="text-slate-400">)</span>
                    </p>
                    <p>
                      <span className="font-medium text-slate-800 dark:text-slate-200">Payroll month key:</span>{' '}
                      <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">{presentPayPeriod.payrollMonthKey}</code>
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-600">
                      Salary advance deductions (and loan EMI) are included when payroll is calculated or completed for that month key; each deduction line stores the same value as{' '}
                      <code className="rounded bg-slate-200 px-1 text-[10px] dark:bg-slate-700">payrollCycle</code> on the advance or loan transaction.
                    </p>
                    </div>
                  </LoanDetailSection>
                )}

                {/* Employee Info */}
                <LoanDetailSection soft>
                  <LoanDetailSectionTitle>Employee Details</LoanDetailSectionTitle>
                  <div className="flex items-start gap-4">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                      style={{ backgroundColor: 'var(--ps-accent)' }}
                    >
                      {(selectedLoan.employeeId?.employee_name || selectedLoan.emp_no || 'E')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-lg text-slate-900 dark:text-white">
                        {selectedLoan.employeeId?.employee_name || selectedLoan.emp_no || 'Unknown'}
                      </p>
                      <p className="text-sm text-slate-500">{selectedLoan.emp_no || selectedLoan.employeeId?.emp_no || 'N/A'}</p>
                      {selectedLoan.department && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {selectedLoan.department.name && (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-lg inline-flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              {selectedLoan.department.name}
                            </span>
                          )}
                          {selectedLoan.designation?.name && (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded-lg inline-flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {selectedLoan.designation.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </LoanDetailSection>

                {/* Eligibility Information - For Salary Advance (View Only) */}
                {selectedLoan.requestType === 'salary_advance' && eligibilityData && (
                  <LoanDetailSection highlight>
                    <LoanDetailSectionTitle>Eligibility Information</LoanDetailSectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <LoanDetailField label="Attendance">
                        <span className="font-mono tabular-nums">{eligibilityData.attendancePercentage}%</span>
                      </LoanDetailField>
                      <LoanDetailField label="Days Worked">
                        <span className="font-mono tabular-nums">{eligibilityData.daysWorked} / {eligibilityData.daysElapsedInMonth}</span>
                      </LoanDetailField>
                      <LoanDetailField label="Prorated Amount">
                        <span className="font-mono tabular-nums">₹{eligibilityData.proratedAmount.toLocaleString()}</span>
                      </LoanDetailField>
                      <LoanDetailField label="Eligible Amount">
                        <span className="font-mono tabular-nums">₹{eligibilityData.eligibleAmount.toLocaleString()}</span>
                      </LoanDetailField>
                      <LoanDetailField label="Max Limit">
                        <span className="font-mono tabular-nums">₹{eligibilityData.maxLimitAmount.toLocaleString()}</span>
                      </LoanDetailField>
                      <LoanDetailField label="Final Max Allowed">
                        <span className="font-mono tabular-nums">₹{eligibilityData.finalMaxAllowed.toLocaleString()}</span>
                      </LoanDetailField>
                    </div>
                  </LoanDetailSection>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <LoanDetailField label="Type">
                    <span className="capitalize">{selectedLoan.requestType === 'loan' ? 'Loan' : 'Salary Advance'}</span>
                  </LoanDetailField>
                  <LoanDetailField label="Amount">
                    <span className="font-mono tabular-nums">₹{selectedLoan.amount.toLocaleString()}</span>
                  </LoanDetailField>
                  {selectedLoan.requestType === 'loan' && (
                    <LoanDetailField label="Duration">
                      {selectedLoan.duration} months
                    </LoanDetailField>
                  )}
                  <LoanDetailField label="Status">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium capitalize ${getStatusColor(selectedLoan.status)}`}>
                      {selectedLoan.status?.replace('_', ' ') || '-'}
                    </span>
                  </LoanDetailField>
                </div>

                {/* Reason */}
                <LoanDetailSection>
                  <LoanDetailSectionTitle>Reason</LoanDetailSectionTitle>
                  <p className="text-sm text-stone-700 dark:text-stone-300">
                    {selectedLoan.reason || 'Not specified'}
                  </p>
                </LoanDetailSection>

                {/* Guarantors Status */}
                {selectedLoan.requestType === 'loan' && selectedLoan.guarantors && selectedLoan.guarantors.length > 0 && (
                  <LoanDetailSection>
                    <LoanDetailSectionTitle>
                      Guarantor Status ({selectedLoan.guarantors.filter(g => g.status === 'accepted').length}/{selectedLoan.guarantors.length} Accepted)
                    </LoanDetailSectionTitle>
                    <div className="space-y-3">
                      {selectedLoan.guarantors.map((guarantor: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 transition-all hover:border-blue-200 dark:hover:border-blue-800">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                              guarantor.status === 'accepted' ? 'bg-emerald-500' : 
                              guarantor.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'
                            }`}>
                              {getEmployeeInitials(guarantor)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">{guarantor.name}</p>
                              <p className="text-[10px] text-slate-500 font-medium">{guarantor.emp_no}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${
                              guarantor.status === 'accepted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              guarantor.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {guarantor.status}
                            </span>
                            {guarantor.actionAt && (
                              <p className="text-[9px] text-slate-400 font-medium">
                                {new Date(guarantor.actionAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </LoanDetailSection>
                )}

                {/* Change History */}
                {selectedLoan.changeHistory && selectedLoan.changeHistory.length > 0 && (
                  <LoanDetailSection>
                    <LoanDetailSectionTitle>Change History ({selectedLoan.changeHistory.length})</LoanDetailSectionTitle>
                    <div className="space-y-3">
                      {selectedLoan.changeHistory.map((change: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-blue-500 uppercase">
                              {change.field.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(change.modifiedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-slate-400 dark:text-slate-500 line-through">
                              {typeof change.originalValue === 'number'
                                ? change.field === 'amount'
                                  ? `₹${change.originalValue.toLocaleString()}`
                                  : change.originalValue
                                : change.originalValue || 'N/A'}
                            </span>
                            <span className="font-semibold text-green-600 dark:text-green-400 ml-2">
                              → {typeof change.newValue === 'number'
                                ? change.field === 'amount'
                                  ? `₹${change.newValue.toLocaleString()}`
                                  : change.newValue
                                : change.newValue || 'N/A'}
                            </span>
                          </div>
                          {change.reason && (
                            <p className="text-xs text-slate-500 mt-1">{change.reason}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            Modified by {change.modifiedByName} ({change.modifiedByRole})
                          </p>
                        </div>
                      ))}
                    </div>
                  </LoanDetailSection>
                )}

                {/* Loan Calculation */}
                {selectedLoan.requestType === 'loan' && selectedLoan.loanConfig && (
                  <LoanDetailSection highlight>
                    <LoanDetailSectionTitle>Loan Calculation</LoanDetailSectionTitle>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">EMI Amount</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">₹{selectedLoan.loanConfig.emiAmount?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Amount (with interest)</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">₹{selectedLoan.loanConfig.totalAmount?.toLocaleString()}</p>
                      </div>
                    </div>
                  </LoanDetailSection>
                )}

                {/* Early Settlement Calculator - Only for active/disbursed loans */}
                {selectedLoan.requestType === 'loan' && ['disbursed', 'active'].includes(selectedLoan.status) && (
                  <LoanDetailSection highlight>
                    <div className="mb-4 flex items-center justify-between">
                      <LoanDetailSectionTitle className="mb-0">Early Settlement Calculator</LoanDetailSectionTitle>
                      {loadingSettlement && (
                        <span className="text-xs text-green-600 animate-pulse">Calculating...</span>
                      )}
                    </div>

                    {settlementPreview && settlementPreview.current ? (
                      <div className="space-y-4">
                        {/* Current Settlement */}
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-green-200 dark:border-green-700">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-green-700 dark:text-green-300">If Paid Now</p>
                            <span className="px-2 py-1 text-xs font-bold text-white bg-green-600 rounded">Current</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-600 dark:text-slate-400">Settlement Amount:</span>
                              <span className="text-lg font-bold text-green-700 dark:text-green-300">₹{settlementPreview.current.settlementAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Principal:</span>
                              <span className="font-medium">₹{settlementPreview.current.remainingPrincipal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Interest (for {settlementPreview.current.actualMonthsUsed} months):</span>
                              <span className="font-medium">₹{settlementPreview.current.settlementInterest.toLocaleString()}</span>
                            </div>
                            <div className="pt-2 border-t border-green-200 dark:border-green-700">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400">Interest Saved:</span>
                                <span className="text-sm font-bold text-green-600 dark:text-green-400">₹{settlementPreview.current.interestSavings.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Next Month Settlement */}
                        {settlementPreview.nextMonth && (
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">If Paid Next Month</p>
                              <span className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 dark:bg-slate-700 rounded">Projected</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-600 dark:text-slate-400">Settlement Amount:</span>
                                <span className="text-base font-bold text-slate-700 dark:text-slate-300">₹{settlementPreview.nextMonth.settlementAmount.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Interest Saved:</span>
                                <span className="font-medium text-slate-600">₹{settlementPreview.nextMonth.interestSavings.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Pay Full Amount Button */}
                        <button
                          onClick={() => setShowSettlementDialog(true)}
                          disabled={saving}
                          className={loansDialogPrimaryButtonClass(true)}
                          style={loansDialogPrimaryButtonStyle()}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Pay Full Amount (₹{settlementPreview.current.settlementAmount.toLocaleString()})
                        </button>
                      </div>
                    ) : !loadingSettlement ? (
                      <p className="text-xs text-slate-500 text-center py-2">Unable to calculate settlement preview</p>
                    ) : null}
                  </LoanDetailSection>
                )}

                {/* Advance Config */}
                {selectedLoan.requestType === 'salary_advance' && selectedLoan.advanceConfig && (
                  <LoanDetailSection>
                    <LoanDetailSectionTitle>Deduction Details</LoanDetailSectionTitle>
                    <p className="text-sm text-stone-700 dark:text-stone-300">
                      ₹{selectedLoan.advanceConfig.deductionPerCycle?.toLocaleString()} per cycle
                    </p>
                  </LoanDetailSection>
                )}

                {/* Repayment Status */}
                <LoanDetailSection>
                  <div className="mb-3 flex items-center justify-between">
                    <LoanDetailSectionTitle className="mb-0">Repayment Status</LoanDetailSectionTitle>
                    {['disbursed', 'active', 'approved'].includes(selectedLoan.status) && (
                      <button
                        onClick={togglePaymentForm}
                        className={showPaymentForm ? loansDialogSecondaryButtonClass() : loansDialogPrimaryButtonClass()}
                        style={showPaymentForm ? loansDialogSecondaryButtonStyle() : loansDialogPrimaryButtonStyle()}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {showPaymentForm ? 'Cancel' : (selectedLoan.requestType === 'loan' ? 'Pay EMI' : 'Record Payment')}
                      </button>
                    )}
                  </div>
                  {selectedLoan.repayment ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Total Paid</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">₹{selectedLoan.repayment.totalPaid?.toLocaleString() || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Remaining Balance</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">₹{selectedLoan.repayment.remainingBalance?.toLocaleString() || (selectedLoan.requestType === 'loan' ? (selectedLoan.loanConfig?.totalAmount || selectedLoan.amount) : selectedLoan.amount)}</p>
                      </div>
                      {selectedLoan.requestType === 'loan' && (
                        <>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">EMIs Paid</p>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                              {selectedLoan.repayment.installmentsPaid || 0} / {selectedLoan.repayment.totalInstallments || selectedLoan.duration}
                            </p>
                          </div>
                          {(selectedLoan.approvals?.final?.firstDeductionPayrollMonth ||
                            selectedLoan.advanceConfig?.deductionStartCycle) && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">First deduction pay period</p>
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {formatPayrollMonthKeyLabel(
                                  selectedLoan.approvals?.final?.firstDeductionPayrollMonth ||
                                    selectedLoan.advanceConfig?.deductionStartCycle ||
                                    '',
                                  payCycleStartDay,
                                  payCycleEndDay
                                )}
                              </p>
                            </div>
                          )}
                          {selectedLoan.repayment.nextPaymentDate && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">Next payment due (period end)</p>
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {new Date(selectedLoan.repayment.nextPaymentDate).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      {selectedLoan.requestType === 'salary_advance' && (
                        <>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Cycles Paid</p>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                              {selectedLoan.repayment.installmentsPaid || 0} / {selectedLoan.repayment.totalInstallments || selectedLoan.duration}
                            </p>
                          </div>
                          {(selectedLoan.approvals?.final?.firstDeductionPayrollMonth ||
                            selectedLoan.advanceConfig?.deductionStartCycle) && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">First deduction pay period</p>
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {formatPayrollMonthKeyLabel(
                                  selectedLoan.approvals?.final?.firstDeductionPayrollMonth ||
                                    selectedLoan.advanceConfig?.deductionStartCycle ||
                                    '',
                                  payCycleStartDay,
                                  payCycleEndDay
                                )}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {selectedLoan.requestType === 'loan'
                          ? `Total Amount: ₹${(selectedLoan.loanConfig?.totalAmount || selectedLoan.amount).toLocaleString()}`
                          : `Total Amount: ₹${selectedLoan.amount.toLocaleString()}`
                        }
                      </p>
                      <p className="text-xs text-slate-400 mt-1">No payments recorded yet</p>
                    </div>
                  )}
                </LoanDetailSection>

                {showPaymentForm && ['disbursed', 'active', 'approved'].includes(selectedLoan.status) && (
                  <LedgerRecordPaymentPanel
                    requestType={selectedLoan.requestType}
                    paymentData={paymentData}
                    onChange={setPaymentData}
                    onSubmit={handlePayment}
                    onCancel={togglePaymentForm}
                    saving={saving}
                    emiHint={selectedLoan.loanConfig?.emiAmount}
                    deductionPerCycleHint={selectedLoan.advanceConfig?.deductionPerCycle}
                  />
                )}

                {selectedLoan.status !== 'pending' && selectedLoan.status !== 'draft' && (
                  <LedgerTransactionHistory
                    transactions={transactions}
                    loading={loadingTransactions}
                    onRefresh={() => loadTransactions(selectedLoan._id)}
                  />
                )}

                {selectedLoan.status === 'approved' && (
                  <LedgerReleaseFundsPanel
                    amount={selectedLoan.amount ?? 0}
                    employeeName={selectedLoan.employeeId?.employee_name || selectedLoan.emp_no || 'Employee'}
                    totalRecovery={
                      selectedLoan.requestType === 'loan' ? selectedLoan.loanConfig?.totalAmount : undefined
                    }
                    onRelease={() => setShowDisbursementDialog(true)}
                    showAction={hasManagePermission}
                  />
                )}

                {canShowLoanEditButton(selectedLoan.status, hasManagePermission) && (
                  <button
                    type="button"
                    onClick={handleEdit}
                    className={`mb-4 w-full ${loansDialogPrimaryButtonClass()}`}
                    style={loansDialogPrimaryButtonStyle()}
                  >
                    Edit {selectedLoan.requestType === 'loan' ? 'Loan' : 'Advance'}
                  </button>
                )}

                <LedgerApprovalTimeline steps={timelineSteps} />

                {hasManagePermission &&
                  !['approved', 'rejected', 'cancelled', 'disbursed', 'active', 'completed'].includes(selectedLoan.status) &&
                  !canActOnSelectedLoan &&
                  selectedLoan.workflow?.nextApprover && (
                    <LedgerWaitingBanner>
                      Waiting for{' '}
                      <span className="font-semibold capitalize">
                        {selectedLoan.workflow.nextApprover === 'final_authority'
                          ? 'final approval'
                          : String(selectedLoan.workflow.nextApprover).replace(/_/g, ' ')}
                      </span>
                      . You cannot act on this step yet.
                    </LedgerWaitingBanner>
                  )}
                {hasManagePermission &&
                  !['approved', 'rejected', 'cancelled', 'disbursed', 'active', 'completed'].includes(selectedLoan.status) &&
                  canActOnSelectedLoan && (
                    <LedgerApprovalPanel
                      showAmount={
                        selectedLoan.requestType === 'salary_advance' ||
                        (selectedLoan.requestType === 'loan' &&
                          ['super_admin', 'hr', 'sub_admin'].includes(currentUser?.role || ''))
                      }
                      amount={approvalAmount}
                      onAmountChange={setApprovalAmount}
                      amountValidation={approvalValidation}
                      showLoanTerms={
                        selectedLoan.requestType === 'loan' &&
                        ['super_admin', 'hr', 'sub_admin'].includes(currentUser?.role || '')
                      }
                      interestRate={approvalInterestRate}
                      onInterestRateChange={setApprovalInterestRate}
                      duration={approvalDuration}
                      onDurationChange={setApprovalDuration}
                      recalculationPreview={
                        selectedLoan.requestType === 'loan' && approvalAmount
                          ? (() => {
                              const principal = parseFloat(approvalAmount);
                              const rate = parseFloat(approvalInterestRate) || 0;
                              const duration = parseInt(approvalDuration, 10) || selectedLoan.duration || 1;
                              let emi = principal / duration;
                              let totalAmt = principal;
                              if (rate > 0) {
                                const totalInterest = (principal * rate * (duration / 12)) / 100;
                                totalAmt = principal + totalInterest;
                                emi = totalAmt / duration;
                              }
                              return (
                                <LedgerLoanRecalculationPreview
                                  emi={emi}
                                  totalInterest={totalAmt - principal}
                                  totalRepayment={totalAmt}
                                />
                              );
                            })()
                          : undefined
                      }
                      showUpdateWarning={
                        approvalAmount !== selectedLoan.amount.toString() ||
                        approvalInterestRate !== selectedLoan.loanConfig?.interestRate?.toString() ||
                        approvalDuration !== selectedLoan.duration?.toString()
                      }
                      onUpdateLoan={() => handleUpdateLoan(selectedLoan._id)}
                      updating={saving}
                      finalApprovalBlock={
                        isFinalApprovalStep ? (
                          <LedgerFinalApprovalPayPeriod
                            value={finalApprovalPayPeriod}
                            onChange={setFinalApprovalPayPeriod}
                            options={finalApprovalPayPeriodOptions}
                            previewLabel={selectedFinalPayPeriodPreview ?? undefined}
                          />
                        ) : undefined
                      }
                      comment={actionComment}
                      onCommentChange={setActionComment}
                      onApprove={() => handleAction(selectedLoan._id, 'approve')}
                      onReject={() => handleAction(selectedLoan._id, 'reject')}
                      saving={saving}
                      approveIcon={<CheckCircle2 className="h-4 w-4" />}
                      rejectIcon={<XCircle className="h-4 w-4" />}
                    />
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setShowDetailDialog(false);
                    setSelectedLoan(null);
                    setTransactions([]);
                    setShowPaymentForm(false);
                    setShowDisbursementDialog(false);
                  }}
                  className={`${loansDialogSecondaryButtonClass()} w-full`}
                  style={loansDialogSecondaryButtonStyle()}
                >
                  Close
                </button>
            </LoanDetailDialogBody>
          </>
        )}
      </LoanDetailDialog>

        {/* Disbursement Dialog */}
        {showDisbursementDialog && selectedLoan && (
          <LoanDetailDialog open onClose={() => setShowDisbursementDialog(false)} maxWidth="max-w-md">
            <LoanDetailDialogHeader
              badge="Disbursement"
              title="Release funds"
              subtitle={`Transfer ₹${(selectedLoan.amount ?? 0).toLocaleString()} (approved principal) to ${selectedLoan.employeeId?.employee_name || selectedLoan.emp_no}.`}
              onClose={() => setShowDisbursementDialog(false)}
            />
            <LoanDetailDialogBody>
              {selectedLoan.requestType === 'loan' &&
                selectedLoan.loanConfig?.totalAmount != null &&
                Number(selectedLoan.loanConfig.totalAmount) !== Number(selectedLoan.amount) && (
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Total to be recovered (principal + interest): ₹
                    {Number(selectedLoan.loanConfig.totalAmount).toLocaleString()}
                  </p>
                )}
              <form onSubmit={handleDisburse} className="space-y-4">
                {needsDisbursementPayPeriod && (
                  <LoanFormPanel soft className="space-y-2">
                    <LoanFormLabel>First deduction pay period *</LoanFormLabel>
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      This record was approved before EMI scheduling was added. Choose when payroll should start deducting.
                    </p>
                    <select
                      required
                      value={disbursementPayPeriod}
                      onChange={(e) => setDisbursementPayPeriod(e.target.value)}
                      className={loansFormSelectClass()}
                      style={loansFormInputStyle()}
                    >
                      {disbursementPayPeriodOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.range.from} → {opt.range.to})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Next payment due = end of selected period
                      {selectedDisbursementPayPeriodPreview ? ` (${selectedDisbursementPayPeriodPreview})` : ''}.
                    </p>
                  </LoanFormPanel>
                )}
                <div>
                  <LoanFormLabel>Disbursement method *</LoanFormLabel>
                  <select
                    required
                    value={disbursementData.disbursementMethod}
                    onChange={(e) => setDisbursementData({ ...disbursementData, disbursementMethod: e.target.value })}
                    className={loansFormSelectClass()}
                    style={loansFormInputStyle()}
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <LoanFormLabel>Transaction reference</LoanFormLabel>
                  <input
                    type="text"
                    value={disbursementData.transactionReference}
                    onChange={(e) => setDisbursementData({ ...disbursementData, transactionReference: e.target.value })}
                    placeholder="e.g., TXN123456789"
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                  />
                </div>

                <div>
                  <LoanFormLabel>Remarks</LoanFormLabel>
                  <textarea
                    value={disbursementData.remarks}
                    onChange={(e) => setDisbursementData({ ...disbursementData, remarks: e.target.value })}
                    placeholder="Add any remarks for this disbursement..."
                    rows={3}
                    className={loansFormTextareaClass()}
                    style={loansFormInputStyle()}
                  />
                </div>

                {message && (
                  <div
                    className={`border px-4 py-2 text-sm ${
                      message.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <LoanDialogFooter
                  onCancel={() => setShowDisbursementDialog(false)}
                  submitLabel="Release funds"
                  loading={saving}
                  submitDisabled={saving}
                  variant="success"
                />
              </form>
            </LoanDetailDialogBody>
          </LoanDetailDialog>
        )}

        {selectedLoan && (
          <LoanEditDialog
            loan={selectedLoan}
            open={showEditDialog}
            onClose={() => setShowEditDialog(false)}
            onSaved={(updated) => {
              setSelectedLoan(updated as typeof selectedLoan);
              loadData();
            }}
            eligibilityData={eligibilityData}
            defaultInterestRate={resolvedLoanSettings?.interestRate ?? loanSettings?.settings?.interestRate ?? 0}
            isInterestApplicable={resolvedLoanSettings?.isInterestApplicable ?? loanSettings?.settings?.isInterestApplicable ?? false}
            payPeriodOptions={finalApprovalPayPeriodOptions}
            presentPayrollMonthKey={presentPayPeriod?.payrollMonthKey}
          />
        )}

        {/* Early Settlement Confirmation Dialog */}
        {showSettlementDialog && selectedLoan && settlementPreview && settlementPreview.current && (
          <LoanDetailDialog open onClose={() => setShowSettlementDialog(false)} maxWidth="max-w-lg">
            <LoanDetailDialogHeader
              badge="Settlement"
              title="Confirm early settlement"
              subtitle="Pay full amount and save on interest"
              onClose={() => setShowSettlementDialog(false)}
            />
            <LoanDetailDialogBody>
              <div className="space-y-4">
                <LoanFormPanel highlight>
                  <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ps-accent-ink)' }}>
                    Settlement breakdown
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Remaining Principal:</span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">₹{settlementPreview.current.remainingPrincipal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Interest (for {settlementPreview.current.actualMonthsUsed} months):</span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">₹{settlementPreview.current.settlementInterest.toLocaleString()}</span>
                    </div>
                    <div className="border-t pt-2" style={{ borderColor: 'var(--ps-accent-border)' }}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-base font-semibold" style={{ color: 'var(--ps-accent-ink)' }}>
                          Total settlement amount
                        </span>
                        <span className="text-xl font-bold" style={{ color: 'var(--ps-accent)' }}>
                          ₹{settlementPreview.current.settlementAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </LoanFormPanel>

                <LoanFormPanel soft>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Interest savings</p>
                  <p className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--ps-accent)' }}>
                    ₹{settlementPreview.current.interestSavings.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">Saved by paying early</p>
                </LoanFormPanel>

                <LoanFormPanel soft>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 mb-1">Original Duration:</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{settlementPreview.current.originalDuration} months</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 mb-1">Months Used:</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{settlementPreview.current.actualMonthsUsed} months</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 mb-1">Original Total:</p>
                      <p className="font-semibold text-slate-900 dark:text-white">₹{settlementPreview.current.originalTotalAmount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 mb-1">Remaining Months:</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{settlementPreview.current.remainingMonths} months</p>
                    </div>
                  </div>
                </LoanFormPanel>

                <LoanDialogFooter
                  onCancel={() => setShowSettlementDialog(false)}
                  submitLabel="Confirm settlement"
                  submitType="button"
                  onSubmit={handleEarlySettlement}
                  loading={saving}
                  submitDisabled={saving}
                  variant="success"
                />
              </div>
            </LoanDetailDialogBody>
          </LoanDetailDialog>
        )}

        {/* Apply Dialog */}
        {showApplyDialog && (
          <LoanDetailDialog open onClose={() => setShowApplyDialog(false)} maxWidth="max-w-lg">
            <LoanDetailDialogHeader
              badge="New request"
              title={`Apply for ${applyType === 'loan' ? 'Loan' : 'Salary Advance'}`}
              subtitle="Submit a request for approval and disbursement"
              onClose={() => setShowApplyDialog(false)}
            />
            <LoanDetailDialogBody>
              <LoanDialogTypeToggle
                value={applyType}
                onChange={(next) => {
                  setApplyType(next);
                  setInterestCalculation(null);
                }}
                options={[
                  { value: 'loan', label: 'Loan', icon: <LoanIcon /> },
                  { value: 'salary_advance', label: 'Salary Advance', icon: <AdvanceIcon /> },
                ]}
              />

              <form onSubmit={handleApply} className="space-y-4">
                {/* Employee Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Apply For Employee *
                  </label>
                  <div className="relative">
                    {selectedEmployee ? (
                      <div className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                            {getEmployeeInitials(selectedEmployee)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">
                              {getEmployeeName(selectedEmployee)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {selectedEmployee.emp_no}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {selectedEmployee.department?.name && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300 rounded">
                                  {selectedEmployee.department.name}
                                </span>
                              )}
                              {selectedEmployee.designation?.name && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300 rounded">
                                  {selectedEmployee.designation.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmployee(null);
                            setEmployeeSearch('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={employeeSearch}
                          onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            setShowEmployeeDropdown(true);
                          }}
                          onFocus={() => setShowEmployeeDropdown(true)}
                          placeholder="Search by name, emp no, or department..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                        />

                        {/* Employee Dropdown */}
                        {showEmployeeDropdown && (
                          <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                            {filteredEmployees.length === 0 ? (
                              <div className="p-4 text-center text-sm text-slate-500">
                                {employeeSearch ? 'No employees found' : 'Type to search employees'}
                              </div>
                            ) : (
                              filteredEmployees.slice(0, 10).map((emp) => (
                                <button
                                  key={emp._id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedEmployee(emp);
                                    setEmployeeSearch('');
                                    setShowEmployeeDropdown(false);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 text-left transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                                >
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-sm font-medium">
                                    {getEmployeeInitials(emp)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 dark:text-white truncate">
                                      {getEmployeeName(emp)}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                      {emp.emp_no} • {emp.department?.name || 'No Department'} • {emp.designation?.name || 'No Designation'}
                                    </div>
                                  </div>
                                </button>
                              ))
                            )}
                            {filteredEmployees.length > 10 && (
                              <div className="px-4 py-2 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-900">
                                Showing 10 of {filteredEmployees.length} results. Type more to filter.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Division-Specific Settings Display */}
                {selectedEmployee && (
                  <div className="mb-4">
                    {loadingResolvedSettings && (
                      <div className="text-sm text-blue-600 mb-2 flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        Loading applicable settings...
                      </div>
                    )}

                    {resolvedLoanSettings && !loadingResolvedSettings && (
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 rounded-xl border border-green-200 dark:border-green-800">
                        <h4 className="font-semibold text-sm mb-3 text-green-900 dark:text-green-100 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Applicable Settings
                          {selectedEmployee.division && (
                            <span className="ml-auto text-[10px] px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 rounded-full font-bold">
                              {selectedEmployee.division.name}
                            </span>
                          )}
                        </h4>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {resolvedLoanSettings.interestRate !== undefined && (
                            <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded-lg">
                              <span className="text-gray-600 dark:text-gray-400">Interest Rate:</span>
                              <span className="ml-2 font-semibold text-slate-900 dark:text-white">{resolvedLoanSettings.interestRate}%</span>
                            </div>
                          )}
                          {resolvedLoanSettings.minAmount !== undefined && (
                            <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded-lg">
                              <span className="text-gray-600 dark:text-gray-400">Min Amount:</span>
                              <span className="ml-2 font-semibold text-slate-900 dark:text-white">₹{resolvedLoanSettings.minAmount?.toLocaleString() || 'N/A'}</span>
                            </div>
                          )}
                          {resolvedLoanSettings.maxAmount !== undefined && (
                            <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded-lg">
                              <span className="text-gray-600 dark:text-gray-400">Max Amount:</span>
                              <span className="ml-2 font-semibold text-slate-900 dark:text-white">
                                {resolvedLoanSettings.maxAmount ? `₹${resolvedLoanSettings.maxAmount.toLocaleString()}` : 'Unlimited'}
                              </span>
                            </div>
                          )}
                          {resolvedLoanSettings.minTenure !== undefined && (
                            <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded-lg">
                              <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                              <span className="ml-2 font-semibold text-slate-900 dark:text-white">
                                {resolvedLoanSettings.minTenure}-{resolvedLoanSettings.maxTenure} months
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Eligibility Calculator - ONLY for Salary Advance */}
                {applyType === 'salary_advance' && selectedEmployee && (
                  <div className="mb-4">
                    {loadingEligibility && (
                      <div className="text-sm text-blue-600 mb-2 flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        Calculating eligibility...
                      </div>
                    )}

                    {eligibilityError && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mb-2">
                        {eligibilityError}
                      </div>
                    )}

                    {eligibilityData && !loadingEligibility && (
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                        <h4 className="font-semibold text-sm mb-3 text-blue-900 dark:text-blue-100 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          Eligibility Calculator
                        </h4>

                        {/* Attendance Info */}
                        <div className="grid grid-cols-2 gap-2 mb-3 text-xs bg-white/50 dark:bg-slate-800/50 p-2 rounded-lg">
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Days Worked:</span>
                            <span className="ml-2 font-semibold text-slate-900 dark:text-white">{eligibilityData.daysWorked} / {eligibilityData.daysElapsedInMonth}</span>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Attendance:</span>
                            <span className="ml-2 font-semibold text-green-600 dark:text-green-400">{eligibilityData.attendancePercentage}%</span>
                          </div>
                        </div>

                        {/* Amount Options */}
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, amount: eligibilityData.proratedAmount.toString() });
                              console.log('Selected Prorated Amount:', eligibilityData.proratedAmount);
                            }}
                            className="w-full text-left p-3 border-2 border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all hover:shadow-md bg-white dark:bg-slate-800"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Prorated Amount (Based on Attendance)</div>
                                <div className="font-bold text-lg text-blue-600 dark:text-blue-400">₹{eligibilityData.proratedAmount.toLocaleString()}</div>
                              </div>
                              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">Select</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, amount: eligibilityData.eligibleAmount.toString() });
                              console.log('Selected Eligible Amount:', eligibilityData.eligibleAmount);
                            }}
                            className="w-full text-left p-3 border-2 border-green-200 dark:border-green-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-800/50 transition-all hover:shadow-md bg-white dark:bg-slate-800"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Eligible Amount (Full Prorated)</div>
                                <div className="font-bold text-lg text-green-600 dark:text-green-400">₹{eligibilityData.eligibleAmount.toLocaleString()}</div>
                              </div>
                              <div className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-2 py-1 rounded">Select</div>
                            </div>
                          </button>

                          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Max Limit ({eligibilityData.maxPercentage}% of Basic Pay)</div>
                            <div className="font-bold text-lg text-gray-700 dark:text-gray-300">₹{eligibilityData.maxLimitAmount.toLocaleString()}</div>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Final Max Allowed:</div>
                          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            ₹{eligibilityData.finalMaxAllowed.toLocaleString()}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            You can request up to this amount
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={resolvedLoanSettings?.minAmount || 1}
                    max={resolvedLoanSettings?.maxAmount || (applyType === 'salary_advance' && eligibilityData ? eligibilityData.finalMaxAllowed : undefined)}
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => {
                      setFormData({ ...formData, amount: e.target.value });
                      console.log('Amount entered:', e.target.value, 'Min:', resolvedLoanSettings?.minAmount, 'Max:', resolvedLoanSettings?.maxAmount);
                    }}
                    className={`w-full rounded-lg border px-4 py-2 text-sm dark:bg-slate-800 ${resolvedLoanSettings && parseFloat(formData.amount) && (
                      parseFloat(formData.amount) < (resolvedLoanSettings.minAmount || 0) ||
                      (resolvedLoanSettings.maxAmount && parseFloat(formData.amount) > resolvedLoanSettings.maxAmount)
                    )
                      ? 'border-red-500 ring-2 ring-red-200 dark:ring-red-900'
                      : applyType === 'salary_advance' && eligibilityData && parseFloat(formData.amount) > eligibilityData.finalMaxAllowed
                        ? 'border-red-500 ring-2 ring-red-200 dark:ring-red-900'
                        : 'border-slate-200 dark:border-slate-700'
                      }`}
                  />
                  {/* Validation warnings for resolved settings */}
                  {resolvedLoanSettings && parseFloat(formData.amount) && (
                    <>
                      {parseFloat(formData.amount) < (resolvedLoanSettings.minAmount || 0) && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Amount is below minimum!
                          </p>
                          <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                            Minimum amount: ₹{resolvedLoanSettings.minAmount?.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {resolvedLoanSettings.maxAmount && parseFloat(formData.amount) > resolvedLoanSettings.maxAmount && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Amount exceeds maximum!
                          </p>
                          <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                            Maximum amount: ₹{resolvedLoanSettings.maxAmount.toLocaleString()}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {applyType === 'salary_advance' && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Need Amount (₹) <span className="text-xs font-normal text-slate-400">(Optional - for higher requests)</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        value={formData.needAmount}
                        onChange={(e) => setFormData({ ...formData, needAmount: e.target.value })}
                        placeholder="Enter amount if you need more than eligible limit"
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  )}
                  {applyType === 'salary_advance' && eligibilityData && parseFloat(formData.amount) > eligibilityData.finalMaxAllowed && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Amount exceeds maximum allowed limit!
                      </p>
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                        Maximum allowed: ₹{eligibilityData.finalMaxAllowed.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Duration - Only for loans */}
                {applyType === 'loan' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Duration (months) *
                    </label>
                    <input
                      type="number"
                      required
                      min={resolvedLoanSettings?.minTenure || 1}
                      max={resolvedLoanSettings?.maxTenure || undefined}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className={`w-full rounded-lg border px-4 py-2 text-sm dark:bg-slate-800 ${resolvedLoanSettings && parseFloat(formData.duration) && (
                        parseFloat(formData.duration) < (resolvedLoanSettings.minTenure || 0) ||
                        (resolvedLoanSettings.maxTenure && parseFloat(formData.duration) > resolvedLoanSettings.maxTenure)
                      )
                        ? 'border-red-500 ring-2 ring-red-200 dark:ring-red-900'
                        : 'border-slate-200 dark:border-slate-700'
                        }`}
                    />
                    {/* Validation warnings for duration */}
                    {resolvedLoanSettings && parseFloat(formData.duration) && (
                      <>
                        {parseFloat(formData.duration) < (resolvedLoanSettings.minTenure || 0) && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Duration is below minimum!
                            </p>
                            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                              Minimum duration: {resolvedLoanSettings.minTenure} months
                            </p>
                          </div>
                        )}
                        {resolvedLoanSettings.maxTenure && parseFloat(formData.duration) > resolvedLoanSettings.maxTenure && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Duration exceeds maximum!
                            </p>
                            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                              Maximum duration: {resolvedLoanSettings.maxTenure} months
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Interest Calculation Display - Only for loans */}
                {applyType === 'loan' && interestCalculation && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">Loan Calculation</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Principal Amount:</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">₹{interestCalculation.principal.toLocaleString()}</span>
                      </div>
                      {interestCalculation.interestRate > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Interest Rate:</span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">{interestCalculation.interestRate}% p.a.</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Total Interest:</span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">₹{interestCalculation.totalInterest.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Total Amount (Principal + Interest):</span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">₹{interestCalculation.totalAmount.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                        <span className="font-semibold text-blue-900 dark:text-blue-100">EMI per Month:</span>
                        <span className="font-bold text-blue-900 dark:text-blue-100">₹{interestCalculation.emiAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Guarantors Selection - Only for loans */}
                {applyType === 'loan' && (
                  <div className="relative mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Guarantors (Select at least 2) *
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {formData.guarantorIds.map(id => {
                        const emp = employees.find(e => e._id === id);
                        if (!emp) return null;
                        return (
                          <div key={id} className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-200 dark:border-blue-800">
                            <span>{getEmployeeName(emp)}</span>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, guarantorIds: formData.guarantorIds.filter(gid => gid !== id) })}
                              className="hover:text-blue-900 dark:hover:text-blue-100"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search for guarantors..."
                        value={guarantorSearch}
                        onChange={(e) => {
                          setGuarantorSearch(e.target.value);
                          setShowGuarantorDropdown(true);
                        }}
                        onFocus={() => setShowGuarantorDropdown(true)}
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                      />
                      
                      {showGuarantorDropdown && (
                        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl">
                          {isGuarantorSearching ? (
                            <div className="p-4 flex flex-col items-center justify-center text-slate-500 gap-2">
                              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-xs">Searching employees...</span>
                            </div>
                          ) : guarantorSearchResults.filter(emp => !formData.guarantorIds.includes(emp._id) && emp._id !== selectedEmployee?._id).length === 0 ? (
                            <div className="p-4 text-center text-sm text-slate-500">
                              {guarantorSearch ? 'No employees found matching your search' : 'Type to search employees'}
                            </div>
                          ) : (
                            guarantorSearchResults
                              .filter(emp =>
                                !formData.guarantorIds.includes(emp._id) &&
                                emp._id !== selectedEmployee?._id
                              )
                              .map(emp => (
                                <button
                                  key={emp._id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, guarantorIds: [...formData.guarantorIds, emp._id] });
                                    setGuarantorSearch('');
                                    setShowGuarantorDropdown(false);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                >
                                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                                    {getEmployeeInitials(emp)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">{getEmployeeName(emp)}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{emp.emp_no} • {emp.department?.name || 'No Dept'}</div>
                                  </div>
                                </button>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                    {formData.guarantorIds.length < 2 && (
                      <p className="mt-1 text-xs text-red-500 font-medium">Selection of at least 2 guarantors is mandatory.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reason *
                  </label>
                  <textarea
                    required
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Remarks
                  </label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    rows={2}
                  />
                </div>

                {/* Buttons */}
                <LoanDialogFooter
                  onCancel={() => setShowApplyDialog(false)}
                  submitLabel={`Apply ${applyType === 'loan' ? 'loan' : 'salary advance'}`}
                  loading={saving}
                  submitDisabled={saving}
                />
              </form>
            </LoanDetailDialogBody>
          </LoanDetailDialog>
        )}

      {/* Toast Container */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </LoansPageShell>
  );
}


