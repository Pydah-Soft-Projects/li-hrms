'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import {
  Calendar,
  Banknote,
  Wallet,
  ArrowRight,
  Percent,
  AlertTriangle,
  Receipt,
  Menu,
  X,
  Search,
  ChevronRight,
  Settings,
} from 'lucide-react';
import {
  DepartmentEarnedLeaveOverridesSection,
  buildEarnedLeaveApiPayload,
  defaultEarnedLeaveForm,
  mapApiLeavesToEarnedLeaveForm,
} from '@/components/settings/DepartmentEarnedLeaveOverrides';
import WorkflowManager, { WorkflowData } from '@/components/settings/shared/WorkflowManager';
import { IncludeMissingPayrollComponentsCard } from '@/components/settings/shared/IncludeMissingPayrollComponentsCard';
import OTSettingsDepartment from '@/components/settings/OTSettingsDepartment';

interface Department {
  _id: string;
  name: string;
  code?: string;
  divisions?: (string | { _id: string })[];
}

interface Division {
  _id: string;
  name: string;
  code: string;
}


interface DepartmentSettings {
  _id?: string;
  department: Department | string;
  payroll?: {
    includeMissingEmployeeComponents?: boolean | null;
  };
  leaves: {
    leavesPerDay: number | null;
    paidLeavesCount: number | null;
    dailyLimit: number | null;
    monthlyLimit: number | null;
    elMaxCarryForward?: number | null;
    cclExpiryMonths?: number | null;
    earnedLeave?: import('@/components/settings/DepartmentEarnedLeaveOverrides').DepartmentEarnedLeaveForm;
  };
  loans: {
    interestRate: number | null;
    isInterestApplicable: boolean | null;
    minTenure: number | null;
    maxTenure: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    maxPerEmployee: number | null;
    maxActivePerEmployee: number | null;
    minServicePeriod: number | null;
  };
  salaryAdvance: {
    interestRate: number | null;
    isInterestApplicable: boolean | null;
    minTenure: number | null;
    maxTenure: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    maxPerEmployee: number | null;
    maxActivePerEmployee: number | null;
    minServicePeriod: number | null;
  };
  permissions: {
    perDayLimit: number | null;
    monthlyLimit: number | null;
    deductFromSalary: boolean | null;
    deductionAmount: number | null;
    deductionRules?: {
      countThreshold: number | null;
      deductionType: 'half_day' | 'full_day' | 'custom_amount' | null;
      deductionAmount: number | null;
      minimumDuration: number | null;
      calculationMode: 'proportional' | 'floor' | null;
    };
  };
  ot: {
    otPayPerHour: number | null;
    minOTHours: number | null;
    recognitionMode?: string | null;
    thresholdHours?: number | null;
    roundUpIfFractionMinutesGte?: number | null;
    roundingMinutes?: number | null;
    autoCreateOtRequest?: boolean | null;
    otHourRanges?: { minMinutes: number; maxMinutes: number; creditedMinutes: number; label?: string }[];
    defaultWorkingHoursPerDay?: number | null;
    workingHoursPerDay?: number | null;
    groupWorkingHours?: { employeeGroupId: string; hoursPerDay: number }[];
    otMultiplier?: number | null;
    allowBackdated?: boolean | null;
    maxBackdatedDays?: number | null;
    allowFutureDated?: boolean | null;
    maxAdvanceDays?: number | null;
    workflow?: WorkflowData | null;
  };
  attendance?: {
    deductionRules?: {
      combinedCountThreshold: number | null;
      deductionType: 'half_day' | 'full_day' | 'custom_amount' | null;
      deductionAmount: number | null;
      minimumDuration: number | null;
      calculationMode: 'proportional' | 'floor' | null;
    };
    earlyOut?: {
      isEnabled: boolean;
      allowedDurationMinutes: number;
      minimumDuration: number;
      deductionRanges: {
        _id?: string;
        minMinutes: number;
        maxMinutes: number;
        deductionType: 'quarter_day' | 'half_day' | 'full_day' | 'custom_amount';
        deductionAmount?: number | null;
        description?: string;
      }[];
    };
  };
}

type DeptSettingsTab =
  | 'leaves'
  | 'loans'
  | 'salary_advance'
  | 'permissions'
  | 'ot'
  | 'attendance'
  | 'payroll';

type EarlyOutDeductionType = NonNullable<
  NonNullable<DepartmentSettings['attendance']>['earlyOut']
>['deductionRanges'][number]['deductionType'];

type DepartmentSettingsUpdatePayload = Parameters<typeof api.updateDepartmentSettings>[1];

const DEPT_SETTINGS_MENU: {
  id: DeptSettingsTab;
  label: string;
  icon: typeof Calendar;
  color: string;
  group: string;
}[] = [
  { id: 'leaves', label: 'Leaves', icon: Calendar, color: 'text-emerald-500', group: 'Human Resources' },
  { id: 'loans', label: 'Loans', icon: Banknote, color: 'text-green-500', group: 'Finance' },
  { id: 'salary_advance', label: 'Salary advance', icon: Wallet, color: 'text-lime-500', group: 'Finance' },
  { id: 'permissions', label: 'Out-pass (permissions)', icon: ArrowRight, color: 'text-slate-500', group: 'Operations' },
  { id: 'ot', label: 'Overtime (OT)', icon: Percent, color: 'text-rose-500', group: 'Operations' },
  { id: 'attendance', label: 'Attendance deductions', icon: AlertTriangle, color: 'text-red-500', group: 'Operations' },
  { id: 'payroll', label: 'Payroll', icon: Receipt, color: 'text-cyan-500', group: 'Finance' },
];

const DEPT_INPUT =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all';
const DEPT_LABEL = 'mb-1.5 block text-xs font-bold text-gray-500 uppercase tracking-widest dark:text-gray-400';

export default function DepartmentalSettingsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [effectiveEarnedLeave, setEffectiveEarnedLeave] = useState<Record<string, unknown> | null>(null);
  const [clearingServerEl, setClearingServerEl] = useState(false);
  const [activeDeptTab, setActiveDeptTab] = useState<DeptSettingsTab>('leaves');
  const [deptMenuSearch, setDeptMenuSearch] = useState('');
  const [deptMobileMenuOpen, setDeptMobileMenuOpen] = useState(false);
  const [employeeGroups, setEmployeeGroups] = useState<{ _id: string; name: string }[]>([]);
  const [newRange, setNewRange] = useState<{
    minMinutes: string;
    maxMinutes: string;
    deductionType: EarlyOutDeductionType;
    deductionAmount: string;
    description: string;
  }>({
    minMinutes: '',
    maxMinutes: '',
    deductionType: 'quarter_day',
    deductionAmount: '',
    description: '',
  });

  // Form state
  const [formData, setFormData] = useState<{
    leaves: DepartmentSettings['leaves'];
    loans: DepartmentSettings['loans'];
    salaryAdvance: DepartmentSettings['salaryAdvance'];
    permissions: DepartmentSettings['permissions'];
    ot: DepartmentSettings['ot'];
    attendance?: DepartmentSettings['attendance'];
    payroll?: DepartmentSettings['payroll'];
  }>({
    leaves: {
      leavesPerDay: null,
      paidLeavesCount: null,
      dailyLimit: null,
      monthlyLimit: null,
      elMaxCarryForward: null,
      cclExpiryMonths: null,
      earnedLeave: defaultEarnedLeaveForm(),
    },
    loans: {
      interestRate: null,
      isInterestApplicable: null,
      minTenure: null,
      maxTenure: null,
      minAmount: null,
      maxAmount: null,
      maxPerEmployee: null,
      maxActivePerEmployee: null,
      minServicePeriod: null,
    },
    salaryAdvance: {
      interestRate: null,
      isInterestApplicable: null,
      minTenure: null,
      maxTenure: null,
      minAmount: null,
      maxAmount: null,
      maxPerEmployee: null,
      maxActivePerEmployee: null,
      minServicePeriod: null,
    },
    permissions: {
      perDayLimit: null,
      monthlyLimit: null,
      deductFromSalary: null,
      deductionAmount: null,
      deductionRules: {
        countThreshold: null,
        deductionType: null,
        deductionAmount: null,
        minimumDuration: null,
        calculationMode: null,
      },
    },
    ot: {
      otPayPerHour: null,
      minOTHours: null,
      recognitionMode: null,
      thresholdHours: null,
      roundUpIfFractionMinutesGte: null,
      roundingMinutes: null,
      autoCreateOtRequest: null,
      otHourRanges: [],
      defaultWorkingHoursPerDay: null,
      workingHoursPerDay: null,
      groupWorkingHours: [],
      otMultiplier: null,
      allowBackdated: null,
      maxBackdatedDays: null,
      allowFutureDated: null,
      maxAdvanceDays: null,
      workflow: null,
    },
    attendance: {
      deductionRules: {
        combinedCountThreshold: null,
        deductionType: null,
        deductionAmount: null,
        minimumDuration: null,
        calculationMode: null,
      },
      earlyOut: {
        isEnabled: false,
        allowedDurationMinutes: 0,
        minimumDuration: 0,
        deductionRanges: [],
      },
    },
    payroll: {
      includeMissingEmployeeComponents: null,
    },
  });

  const filteredDeptMenu = useMemo(() => {
    const q = deptMenuSearch.trim().toLowerCase();
    if (!q) return DEPT_SETTINGS_MENU;
    return DEPT_SETTINGS_MENU.filter((item) => item.label.toLowerCase().includes(q));
  }, [deptMenuSearch]);

  const groupedDeptMenu = useMemo(() => {
    return filteredDeptMenu.reduce(
      (acc, item) => {
        if (!acc[item.group]) acc[item.group] = [];
        acc[item.group].push(item);
        return acc;
      },
      {} as Record<string, typeof DEPT_SETTINGS_MENU>
    );
  }, [filteredDeptMenu]);

  const filteredDepartments = useMemo(() => {
    if (!selectedDivisionId) return departments;
    return departments.filter((dept) =>
      dept.divisions?.some((div) => (typeof div === 'string' ? div : div._id) === selectedDivisionId)
    );
  }, [departments, selectedDivisionId]);

  const resetForm = useCallback(() => {
    setEffectiveEarnedLeave(null);
    setFormData({
      leaves: {
        leavesPerDay: null,
        paidLeavesCount: null,
        dailyLimit: null,
        monthlyLimit: null,
        elMaxCarryForward: null,
        cclExpiryMonths: null,
        earnedLeave: defaultEarnedLeaveForm(),
      },
      loans: {
        interestRate: null,
        isInterestApplicable: null,
        minTenure: null,
        maxTenure: null,
        minAmount: null,
        maxAmount: null,
        maxPerEmployee: null,
        maxActivePerEmployee: null,
        minServicePeriod: null,
      },
      salaryAdvance: {
        interestRate: null,
        isInterestApplicable: null,
        minTenure: null,
        maxTenure: null,
        minAmount: null,
        maxAmount: null,
        maxPerEmployee: null,
        maxActivePerEmployee: null,
        minServicePeriod: null,
      },
      permissions: {
        perDayLimit: null,
        monthlyLimit: null,
        deductFromSalary: null,
        deductionAmount: null,
        deductionRules: {
          countThreshold: null,
          deductionType: null,
          deductionAmount: null,
          minimumDuration: null,
          calculationMode: null,
        },
      },
      ot: {
        otPayPerHour: null,
        minOTHours: null,
        recognitionMode: null,
        thresholdHours: null,
        roundUpIfFractionMinutesGte: null,
        roundingMinutes: null,
        autoCreateOtRequest: null,
        otHourRanges: [],
        defaultWorkingHoursPerDay: null,
        workingHoursPerDay: null,
        groupWorkingHours: [],
        otMultiplier: null,
        allowBackdated: null,
        maxBackdatedDays: null,
        allowFutureDated: null,
        maxAdvanceDays: null,
        workflow: null,
      },
      attendance: {
        deductionRules: {
          combinedCountThreshold: null,
          deductionType: null,
          deductionAmount: null,
          minimumDuration: null,
          calculationMode: null,
        },
        earlyOut: {
          isEnabled: false,
          allowedDurationMinutes: 0,
          minimumDuration: 0,
          deductionRanges: [],
        },
      },
      payroll: {
        includeMissingEmployeeComponents: null,
      },
    });
  }, []);

  const loadDepartmentSettings = useCallback(
    async (deptId: string) => {
    try {
      setLoadingSettings(true);
      setEffectiveEarnedLeave(null);
      const response = await api.getDepartmentSettings(deptId, selectedDivisionId || undefined);
      if (response.success && response.data) {
        const s = response.data;
        setFormData({
          leaves: {
            leavesPerDay: s.leaves?.leavesPerDay ?? null,
            paidLeavesCount: s.leaves?.paidLeavesCount ?? null,
            dailyLimit: s.leaves?.dailyLimit ?? null,
            monthlyLimit: s.leaves?.monthlyLimit ?? null,
            elMaxCarryForward: s.leaves?.elMaxCarryForward ?? null,
            cclExpiryMonths: s.leaves?.cclExpiryMonths ?? null,
            earnedLeave: mapApiLeavesToEarnedLeaveForm(s.leaves),
          },
          loans: {
            interestRate: s.loans?.interestRate ?? null,
            isInterestApplicable: s.loans?.isInterestApplicable ?? null,
            minTenure: s.loans?.minTenure ?? null,
            maxTenure: s.loans?.maxTenure ?? null,
            minAmount: s.loans?.minAmount ?? null,
            maxAmount: s.loans?.maxAmount ?? null,
            maxPerEmployee: s.loans?.maxPerEmployee ?? null,
            maxActivePerEmployee: s.loans?.maxActivePerEmployee ?? null,
            minServicePeriod: s.loans?.minServicePeriod ?? null,
          },
          salaryAdvance: {
            interestRate: s.salaryAdvance?.interestRate ?? null,
            isInterestApplicable: s.salaryAdvance?.isInterestApplicable ?? null,
            minTenure: s.salaryAdvance?.minTenure ?? null,
            maxTenure: s.salaryAdvance?.maxTenure ?? null,
            minAmount: s.salaryAdvance?.minAmount ?? null,
            maxAmount: s.salaryAdvance?.maxAmount ?? null,
            maxPerEmployee: s.salaryAdvance?.maxPerEmployee ?? null,
            maxActivePerEmployee: s.salaryAdvance?.maxActivePerEmployee ?? null,
            minServicePeriod: s.salaryAdvance?.minServicePeriod ?? null,
          },
          permissions: {
            perDayLimit: s.permissions?.perDayLimit ?? null,
            monthlyLimit: s.permissions?.monthlyLimit ?? null,
            deductFromSalary: s.permissions?.deductFromSalary ?? null,
            deductionAmount: s.permissions?.deductionAmount ?? null,
            deductionRules: {
              countThreshold: s.permissions?.deductionRules?.countThreshold ?? null,
              deductionType: s.permissions?.deductionRules?.deductionType ?? null,
              deductionAmount: s.permissions?.deductionRules?.deductionAmount ?? null,
              minimumDuration: s.permissions?.deductionRules?.minimumDuration ?? null,
              calculationMode: s.permissions?.deductionRules?.calculationMode ?? null,
            },
          },
          ot: {
            otPayPerHour: s.ot?.otPayPerHour ?? null,
            minOTHours: s.ot?.minOTHours ?? null,
            recognitionMode: s.ot?.recognitionMode ?? null,
            thresholdHours: s.ot?.thresholdHours ?? null,
            roundUpIfFractionMinutesGte: s.ot?.roundUpIfFractionMinutesGte ?? null,
            roundingMinutes: s.ot?.roundingMinutes ?? null,
            autoCreateOtRequest: s.ot?.autoCreateOtRequest ?? null,
            otHourRanges: Array.isArray(s.ot?.otHourRanges) ? s.ot.otHourRanges : [],
            defaultWorkingHoursPerDay: s.ot?.defaultWorkingHoursPerDay ?? null,
            workingHoursPerDay: s.ot?.workingHoursPerDay ?? null,
            groupWorkingHours: Array.isArray(s.ot?.groupWorkingHours) ? s.ot.groupWorkingHours : [],
            otMultiplier: s.ot?.otMultiplier ?? null,
            allowBackdated: s.ot?.allowBackdated ?? null,
            maxBackdatedDays: s.ot?.maxBackdatedDays ?? null,
            allowFutureDated: s.ot?.allowFutureDated ?? null,
            maxAdvanceDays: s.ot?.maxAdvanceDays ?? null,
            workflow: (s.ot?.workflow as WorkflowData | null | undefined) ?? null,
          },
          attendance: {
            deductionRules: {
              combinedCountThreshold: s.attendance?.deductionRules?.combinedCountThreshold ?? null,
              deductionType: s.attendance?.deductionRules?.deductionType ?? null,
              deductionAmount: s.attendance?.deductionRules?.deductionAmount ?? null,
              minimumDuration: s.attendance?.deductionRules?.minimumDuration ?? null,
              calculationMode: s.attendance?.deductionRules?.calculationMode ?? null,
            },
            earlyOut: {
              isEnabled: s.attendance?.earlyOut?.isEnabled ?? false,
              allowedDurationMinutes: s.attendance?.earlyOut?.allowedDurationMinutes ?? 0,
              minimumDuration: s.attendance?.earlyOut?.minimumDuration ?? 0,
              deductionRanges: Array.isArray(s.attendance?.earlyOut?.deductionRanges) ? s.attendance.earlyOut.deductionRanges : [],
            },
          },
          payroll: {
            includeMissingEmployeeComponents:
              s.payroll?.includeMissingEmployeeComponents ?? null,
          },
        });
        try {
          const resolvedRes = await api.getResolvedDepartmentSettings(
            deptId,
            'leaves',
            selectedDivisionId || undefined
          );
          if (resolvedRes.success && resolvedRes.data?.leaves?.earnedLeave) {
            setEffectiveEarnedLeave(resolvedRes.data.leaves.earnedLeave as Record<string, unknown>);
          }
        } catch {
          /* optional preview */
        }
      }
    } catch (error) {
      console.error('Error loading department settings:', error);
      toast.error('Failed to load department settings');
      resetForm();
    } finally {
      setLoadingSettings(false);
    }
  },
  [resetForm, selectedDivisionId]
);

  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions();
      if (response.success && response.data) {
        setDivisions(response.data);
      }
    } catch (error) {
      console.error('Error loading divisions:', error);
    }
  };

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const userResponse = await api.getCurrentUser();
      const userData = userResponse?.data?.user as
        | {
            role?: string;
            allowedDivisions?: string[];
            division?: string | { _id: string };
          }
        | undefined;

      const response = await api.getDepartments(true);

      if (response.success && response.data) {
        let depts = response.data;

        if (userData && userData.role !== 'super_admin') {
          const allowedDivs = userData.allowedDivisions || [];
          const userDivisionId =
            userData.division && typeof userData.division === 'object'
              ? userData.division._id
              : userData.division;

          if (allowedDivs.length > 0) {
            depts = depts.filter((d) =>
              d.divisions?.some((div) =>
                allowedDivs.includes(typeof div === 'string' ? div : div._id)
              )
            );
          } else if (userDivisionId) {
            depts = depts.filter((d) =>
              d.divisions?.some((div) => (typeof div === 'string' ? div : div._id) === userDivisionId)
            );
          }
        }

        setDepartments(depts);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.getEmployeeGroups();
        if (res.success && Array.isArray(res.data)) {
          setEmployeeGroups(res.data as { _id: string; name: string }[]);
        }
      } catch {
        /* optional */
      }
    })();
  }, []);

  useEffect(() => {
    void loadDepartments();
    void loadDivisions();
  }, []);

  useEffect(() => {
    if (selectedDepartmentId) {
      void loadDepartmentSettings(selectedDepartmentId);
    } else {
      resetForm();
    }
  }, [selectedDepartmentId, selectedDivisionId, loadDepartmentSettings, resetForm]);

  useEffect(() => {
    if (!selectedDepartmentId) setActiveDeptTab('leaves');
  }, [selectedDepartmentId]);

  const handleInputChange = (
    section: 'leaves' | 'loans' | 'salaryAdvance' | 'permissions' | 'ot' | 'attendance' | 'payroll',
    field: string,
    value: string | number | boolean | null,
    nestedField?: string
  ) => {
    setFormData((prev) => {
      if (nestedField && (section === 'permissions' || section === 'attendance')) {
        const sectionData = prev[section] as Record<string, unknown>;
        const innerRaw = sectionData[field];
        const inner =
          innerRaw !== null && typeof innerRaw === 'object' && !Array.isArray(innerRaw)
            ? (innerRaw as Record<string, unknown>)
            : {};
        return {
          ...prev,
          [section]: {
            ...sectionData,
            [field]: {
              ...inner,
              [nestedField]: value === '' ? null : value,
            },
          },
        };
      } else if (section === 'payroll') {
        return {
          ...prev,
          payroll: {
            ...(prev.payroll || {}),
            [field]: value === '' ? null : value,
          },
        };
      }
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value === '' ? null : value,
        },
      };
    });
  };

  const buildLeavesPayload = () => {
    const er = formData.leaves.earnedLeave ?? defaultEarnedLeaveForm();
    const earnedLeavePayload = buildEarnedLeaveApiPayload(er);
    const leaves: Record<string, unknown> = {
      leavesPerDay: formData.leaves.leavesPerDay,
      paidLeavesCount: formData.leaves.paidLeavesCount,
      dailyLimit: formData.leaves.dailyLimit,
      monthlyLimit: formData.leaves.monthlyLimit,
      elMaxCarryForward: formData.leaves.elMaxCarryForward,
      cclExpiryMonths: formData.leaves.cclExpiryMonths,
    };
    if (earnedLeavePayload) {
      leaves.earnedLeave = earnedLeavePayload;
      if (er.earningType) leaves.elEarningType = er.earningType;
    }
    return leaves;
  };

  const handleClearElOverridesOnServer = async () => {
    if (!selectedDepartmentId) return;
    try {
      setClearingServerEl(true);
      const response = await api.updateDepartmentSettings(
        selectedDepartmentId,
        { leaves: { earnedLeave: null, elEarningType: null } },
        selectedDivisionId || undefined
      );
      if (response.success) {
        toast.success('Department EL overrides cleared');
        await loadDepartmentSettings(selectedDepartmentId);
      } else {
        toast.error(response.message || 'Failed to clear EL overrides');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear EL overrides');
    } finally {
      setClearingServerEl(false);
    }
  };

  const handleSave = async () => {
    if (!selectedDepartmentId) {
      toast.error('Please select a department');
      return;
    }

    try {
      setSaving(true);

      // Prepare data for API
      const updateData: DepartmentSettingsUpdatePayload = {
        leaves: buildLeavesPayload(),
        loans: formData.loans,
        salaryAdvance: formData.salaryAdvance,
        permissions: formData.permissions,
        // OT is saved only from the OT panel (same UX as global settings) to avoid overwriting with stale form state.
        attendance: formData.attendance,
        payroll: formData.payroll,
      };

      const response = await api.updateDepartmentSettings(
        selectedDepartmentId,
        updateData,
        selectedDivisionId || undefined
      );

      if (response.success) {
        toast.success('Department settings saved successfully!');
        // Reload settings
        await loadDepartmentSettings(selectedDepartmentId);
      } else {
        toast.error(response.message || 'Failed to save settings');
      }
    } catch (error: unknown) {
      console.error('Error saving settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const selectedDepartment = departments.find((d) => d._id === selectedDepartmentId);
  const activeDeptTabLabel = DEPT_SETTINGS_MENU.find((m) => m.id === activeDeptTab)?.label ?? '';

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#F8FAFC] dark:bg-[#0F172A] -m-4 sm:-m-5 lg:-m-6">
      <button
        type="button"
        onClick={() => setDeptMobileMenuOpen(!deptMobileMenuOpen)}
        className="fixed bottom-6 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-all hover:scale-110 hover:bg-indigo-700 lg:hidden"
        aria-label={deptMobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        {deptMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {deptMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setDeptMobileMenuOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-0 z-40 flex h-screen w-64 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out dark:border-gray-800 dark:bg-[#1E293B] sm:w-72 lg:sticky lg:flex lg:translate-x-0 ${
          deptMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/20 sm:h-10 sm:w-10">
              <Settings className="h-4 w-4 text-white sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold text-gray-900 dark:text-white sm:text-lg">Dept. settings</h1>
              <p className="truncate text-[9px] font-bold uppercase tracking-widest text-gray-400 sm:text-[10px]">
                Superadmin · division scope
              </p>
            </div>
          </div>

          <div className="relative mt-4">
            <label className={`${DEPT_LABEL} text-[10px] tracking-wider text-gray-400`}>Division (optional)</label>
            <select
              value={selectedDivisionId}
              onChange={(e) => {
                setSelectedDivisionId(e.target.value);
                setSelectedDepartmentId('');
              }}
              className={`${DEPT_INPUT} px-3 py-2 text-xs`}
            >
              <option value="">All divisions</option>
              {divisions.map((div) => (
                <option key={div._id} value={div._id}>
                  {div.name} ({div.code})
                </option>
              ))}
            </select>
          </div>

          <div className="relative mt-3">
            <label className={`${DEPT_LABEL} text-[10px] tracking-wider text-gray-400`}>Department</label>
            <select
              value={selectedDepartmentId}
              onChange={(e) => setSelectedDepartmentId(e.target.value)}
              className={`${DEPT_INPUT} px-3 py-2 text-xs`}
              disabled={loading}
            >
              <option value="">Select department…</option>
              {filteredDepartments.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name} {dept.code ? `(${dept.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="relative mt-4 sm:mt-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search sections..."
              value={deptMenuSearch}
              onChange={(e) => setDeptMenuSearch(e.target.value)}
              className="w-full rounded-xl border-none bg-gray-50 py-2 pl-9 pr-3 text-xs font-medium text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 dark:bg-[#0F172A] dark:text-white"
            />
          </div>
        </div>

        <nav className="custom-scrollbar-dept flex-1 space-y-5 overflow-y-auto px-3 pb-8 sm:space-y-7 sm:px-4">
          {Object.entries(groupedDeptMenu).map(([group, items]) => (
            <div key={group} className="space-y-1">
              <h3 className="mb-2 truncate px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 sm:px-4 sm:text-[10px]">
                {group}
              </h3>
              {(items as typeof DEPT_SETTINGS_MENU).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!selectedDepartmentId}
                  onClick={() => {
                    setActiveDeptTab(item.id);
                    setDeptMobileMenuOpen(false);
                  }}
                  className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all sm:px-4 sm:py-2.5 sm:text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                    activeDeptTab === item.id
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <item.icon
                      className={`h-3.5 w-3.5 flex-shrink-0 sm:h-4 sm:w-4 ${
                        activeDeptTab === item.id
                          ? item.color
                          : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <ChevronRight
                    className={`h-3 w-3 flex-shrink-0 transition-transform ${
                      activeDeptTab === item.id ? 'translate-x-1' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  />
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 p-3 dark:border-gray-800 sm:p-4">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-3 text-[10px] text-white shadow-xl sm:p-4 sm:text-xs">
            <p className="mb-1 font-bold opacity-90">Division-aware overrides</p>
            <p className="leading-tight opacity-70">
              Pick a division to edit division-specific rows; leave “All divisions” for department defaults.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-7xl p-3 sm:p-6 lg:p-8">
          {!selectedDepartmentId ? (
            <div className="animate-in fade-in rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm duration-500 dark:border-gray-800 dark:bg-[#1E293B]">
              <Settings className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
              <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">Select a department</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Optionally filter by division, then choose a department from the sidebar.
              </p>
            </div>
          ) : loadingSettings ? (
            <div className="flex items-center justify-center py-16">
              <Spinner />
              <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading settings…</span>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-10 duration-500">
              <div className="border-b border-gray-200 pb-5 dark:border-gray-800">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                  <span>Settings</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-indigo-600 dark:text-indigo-400">Departmental</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-gray-600 dark:text-gray-300">{activeDeptTabLabel}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Department overrides</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {selectedDepartment?.name ?? 'Department'}
                  {selectedDivisionId
                    ? ` — ${divisions.find((d) => d._id === selectedDivisionId)?.name ?? 'Division'} (division-specific)`
                    : ' — department default (all divisions)'}
                  . Leave fields blank to inherit organization defaults.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
                <div className="space-y-8 xl:col-span-2">
                  {activeDeptTab === 'leaves' && (
                    <div className="space-y-6">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Earned leave (EL) overrides use the same layout as <strong>Admin → Settings → Leave Policy</strong>. Other leave
                        quotas stay on the global policy for now; save still applies EL overrides with <strong>Save all settings</strong> (or
                        use the actions inside the EL card).
                      </p>
            <DepartmentEarnedLeaveOverridesSection
                        presentation="policy"
              value={formData.leaves.earnedLeave ?? defaultEarnedLeaveForm()}
              onChange={(next) =>
                setFormData((prev) => ({
                  ...prev,
                  leaves: { ...prev.leaves, earnedLeave: next },
                }))
              }
              effectiveEarnedLeave={effectiveEarnedLeave}
              onClearServerOverrides={
                selectedDepartmentId ? handleClearElOverridesOnServer : undefined
              }
              clearingServer={clearingServerEl}
            />
          </div>
                  )}

                  {activeDeptTab === 'loans' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              Loans Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.loans.interestRate ?? ''}
                  onChange={(e) => handleInputChange('loans', 'interestRate', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 8, 10"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Is Interest Applicable
                </label>
                <select
                  value={formData.loans.isInterestApplicable === null ? '' : formData.loans.isInterestApplicable ? 'true' : 'false'}
                  onChange={(e) => handleInputChange('loans', 'isInterestApplicable', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Use Global Default</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Min Tenure (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.loans.minTenure ?? ''}
                  onChange={(e) => handleInputChange('loans', 'minTenure', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 12"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Tenure (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.loans.maxTenure ?? ''}
                  onChange={(e) => handleInputChange('loans', 'maxTenure', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 24"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Min Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.loans.minAmount ?? ''}
                  onChange={(e) => handleInputChange('loans', 'minAmount', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 1000"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.loans.maxAmount ?? ''}
                  onChange={(e) => handleInputChange('loans', 'maxAmount', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Leave blank for unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Per Employee (Lifetime)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.loans.maxPerEmployee ?? ''}
                  onChange={(e) => handleInputChange('loans', 'maxPerEmployee', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Leave blank for unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Active Loans Per Employee
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.loans.maxActivePerEmployee ?? ''}
                  onChange={(e) => handleInputChange('loans', 'maxActivePerEmployee', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 1"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Min Service Period (Months)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.loans.minServicePeriod ?? ''}
                  onChange={(e) => handleInputChange('loans', 'minServicePeriod', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 6"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
                  )}

                  {activeDeptTab === 'salary_advance' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
              Salary Advance Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.salaryAdvance.interestRate ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'interestRate', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 8, 10"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Is Interest Applicable
                </label>
                <select
                  value={formData.salaryAdvance.isInterestApplicable === null ? '' : formData.salaryAdvance.isInterestApplicable ? 'true' : 'false'}
                  onChange={(e) => handleInputChange('salaryAdvance', 'isInterestApplicable', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Use Global Default</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Min Tenure (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.salaryAdvance.minTenure ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'minTenure', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 1"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Tenure (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.salaryAdvance.maxTenure ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'maxTenure', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 3"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Min Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.salaryAdvance.minAmount ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'minAmount', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 1000"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.salaryAdvance.maxAmount ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'maxAmount', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Leave blank for unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Per Employee (Lifetime)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.salaryAdvance.maxPerEmployee ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'maxPerEmployee', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Leave blank for unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max Active Advances Per Employee
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.salaryAdvance.maxActivePerEmployee ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'maxActivePerEmployee', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 1"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Min Service Period (Months)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.salaryAdvance.minServicePeriod ?? ''}
                  onChange={(e) => handleInputChange('salaryAdvance', 'minServicePeriod', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 0"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
                  )}

                  {activeDeptTab === 'permissions' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              Permissions Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Permissions Per Day Limit
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.permissions.perDayLimit ?? ''}
                  onChange={(e) => handleInputChange('permissions', 'perDayLimit', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="0 = unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Monthly Permission Limit
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.permissions.monthlyLimit ?? ''}
                  onChange={(e) => handleInputChange('permissions', 'monthlyLimit', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="0 = unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Deduct From Salary
                </label>
                <select
                  value={formData.permissions.deductFromSalary === null ? '' : formData.permissions.deductFromSalary ? 'true' : 'false'}
                  onChange={(e) => handleInputChange('permissions', 'deductFromSalary', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Use Global Default</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Deduction Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.permissions.deductionAmount ?? ''}
                  onChange={(e) => handleInputChange('permissions', 'deductionAmount', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Amount per permission"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Permission Deduction Rules */}
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-800 dark:bg-blue-900/10">
              <h3 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-200">Permission Deduction Rules</h3>
              <p className="mb-4 text-xs text-blue-700 dark:text-blue-300">
                Configure automatic salary deductions based on permission count.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-blue-800 dark:text-blue-200">
                    Count Threshold
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.permissions.deductionRules?.countThreshold ?? ''}
                    onChange={(e) => handleInputChange('permissions', 'deductionRules', e.target.value ? parseInt(e.target.value) : null, 'countThreshold')}
                    placeholder="e.g., 4"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-blue-600 dark:text-blue-400">Number of permissions to trigger deduction</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-blue-800 dark:text-blue-200">
                    Deduction Type
                  </label>
                  <select
                    value={formData.permissions.deductionRules?.deductionType ?? ''}
                    onChange={(e) => handleInputChange('permissions', 'deductionRules', e.target.value || null, 'deductionType')}
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Select Type</option>
                    <option value="half_day">Half Day</option>
                    <option value="full_day">Full Day</option>
                    <option value="custom_amount">Custom Amount</option>
                  </select>
                </div>
                {formData.permissions.deductionRules?.deductionType === 'custom_amount' && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-blue-800 dark:text-blue-200">
                      Custom Deduction Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.permissions.deductionRules?.deductionAmount ?? ''}
                      onChange={(e) => handleInputChange('permissions', 'deductionRules', e.target.value ? parseFloat(e.target.value) : null, 'deductionAmount')}
                      placeholder="e.g., 500"
                      className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-blue-800 dark:text-blue-200">
                    Minimum Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.permissions.deductionRules?.minimumDuration ?? ''}
                    onChange={(e) => handleInputChange('permissions', 'deductionRules', e.target.value ? parseInt(e.target.value) : null, 'minimumDuration')}
                    placeholder="e.g., 60 (1 hour)"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-blue-600 dark:text-blue-400">Only count permissions {'>='} this duration</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-blue-800 dark:text-blue-200">
                    Calculation Mode
                  </label>
                  <select
                    value={formData.permissions.deductionRules?.calculationMode ?? ''}
                    onChange={(e) => handleInputChange('permissions', 'deductionRules', e.target.value || null, 'calculationMode')}
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Select Mode</option>
                    <option value="proportional">Proportional (with partial deductions)</option>
                    <option value="floor">Floor (only full multiples)</option>
                  </select>
                  <p className="mt-1 text-[10px] text-blue-600 dark:text-blue-400">
                    Proportional: 5 permissions = 1.25× deduction<br />
                    Floor: 5 permissions = 1× deduction (ignores remainder)
                  </p>
                </div>
              </div>
            </div>
          </div>
                  )}

                  {activeDeptTab === 'ot' && selectedDepartmentId && (
                    <OTSettingsDepartment
                      departmentId={selectedDepartmentId}
                      divisionId={selectedDivisionId || undefined}
                      employeeGroups={employeeGroups}
                      onSaved={() => void loadDepartmentSettings(selectedDepartmentId)}
                    />
                  )}

                  {activeDeptTab === 'attendance' && (
          <>
          {/* Attendance Deduction Rules (Combined Late-in + Early-out) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              Attendance Deduction Rules
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Configure automatic salary deductions based on combined late-in and early-out count.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Combined Count Threshold
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.attendance?.deductionRules?.combinedCountThreshold ?? ''}
                  onChange={(e) => handleInputChange('attendance', 'deductionRules', e.target.value ? parseInt(e.target.value) : null, 'combinedCountThreshold')}
                  placeholder="e.g., 4"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Combined count (late-ins + early-outs)</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Deduction Type
                </label>
                <select
                  value={formData.attendance?.deductionRules?.deductionType ?? ''}
                  onChange={(e) => handleInputChange('attendance', 'deductionRules', e.target.value || null, 'deductionType')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Select Type</option>
                  <option value="half_day">Half Day</option>
                  <option value="full_day">Full Day</option>
                  <option value="custom_amount">Custom Amount</option>
                </select>
              </div>
              {formData.attendance?.deductionRules?.deductionType === 'custom_amount' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Custom Deduction Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.attendance?.deductionRules?.deductionAmount ?? ''}
                    onChange={(e) => handleInputChange('attendance', 'deductionRules', e.target.value ? parseFloat(e.target.value) : null, 'deductionAmount')}
                    placeholder="e.g., 500"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Minimum Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.attendance?.deductionRules?.minimumDuration ?? ''}
                  onChange={(e) => handleInputChange('attendance', 'deductionRules', e.target.value ? parseInt(e.target.value) : null, 'minimumDuration')}
                  placeholder="e.g., 60 (1 hour)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Only count late-ins/early-outs {'>='} this duration</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Calculation Mode
                </label>
                <select
                  value={formData.attendance?.deductionRules?.calculationMode ?? ''}
                  onChange={(e) => handleInputChange('attendance', 'deductionRules', e.target.value || null, 'calculationMode')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Select Mode</option>
                  <option value="proportional">Proportional (with partial deductions)</option>
                  <option value="floor">Floor (only full multiples)</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  Proportional: 5 count = 1.25× deduction<br />
                  Floor: 5 count = 1× deduction (ignores remainder)
                </p>
              </div>
            </div>
          </div>

          {/* Early-Out Settings */}
          {/* Early-Out Settings */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Early-Out Rules</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Independent rules for early-outs. When disabled, combined rules apply.</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={formData.attendance?.earlyOut?.isEnabled ?? false}
                  onChange={(e) => handleInputChange('attendance', 'earlyOut', e.target.checked, 'isEnabled')}
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-blue-800"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Allowed Early-Out Per Day (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.attendance?.earlyOut?.allowedDurationMinutes ?? 0}
                  onChange={(e) => handleInputChange('attendance', 'earlyOut', e.target.value ? parseInt(e.target.value) : 0, 'allowedDurationMinutes')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Minutes allowed without deduction</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Minimum Duration to Count (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.attendance?.earlyOut?.minimumDuration ?? 0}
                  onChange={(e) => handleInputChange('attendance', 'earlyOut', e.target.value ? parseInt(e.target.value) : 0, 'minimumDuration')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Only early-outs {'>='} this duration will count</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900 dark:text-white">Deduction Ranges</p>
              </div>
              {(formData.attendance?.earlyOut?.deductionRanges || []).length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  No ranges configured. Add a range below.
                </div>
              )}
              <div className="space-y-3">
                {(formData.attendance?.earlyOut?.deductionRanges || []).map((range, idx) => (
                  <div key={range._id || idx} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700">
                    <span className="font-bold text-slate-900 dark:text-white">{range.minMinutes}–{range.maxMinutes} min</span>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span className="capitalize font-medium text-slate-600 dark:text-slate-300">{range.deductionType.replace('_', ' ')}</span>
                    {range.deductionType === 'custom_amount' && range.deductionAmount && <span className="font-medium text-slate-900 dark:text-white">₹{range.deductionAmount}</span>}
                    {range.description && <span className="text-slate-500 italic">— {range.description}</span>}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(formData.attendance?.earlyOut?.deductionRanges || [])];
                        updated.splice(idx, 1);
                        setFormData((prev) => ({
                          ...prev,
                          attendance: {
                            ...prev.attendance,
                            earlyOut: {
                              ...(prev.attendance?.earlyOut || { isEnabled: false, allowedDurationMinutes: 0, minimumDuration: 0, deductionRanges: [] }),
                              deductionRanges: updated,
                            },
                          },
                        }));
                      }}
                      className="ml-auto rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Range */}
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 mt-4 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Add New Range</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min (min)"
                    value={newRange.minMinutes}
                    onChange={(e) => setNewRange(prev => ({ ...prev, minMinutes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Max (min)"
                    value={newRange.maxMinutes}
                    onChange={(e) => setNewRange(prev => ({ ...prev, maxMinutes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newRange.deductionType}
                    onChange={(e) =>
                      setNewRange((prev) => ({
                        ...prev,
                        deductionType: e.target.value as EarlyOutDeductionType,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="quarter_day">Quarter Day</option>
                    <option value="half_day">Half Day</option>
                    <option value="full_day">Full Day</option>
                    <option value="custom_amount">Custom Amount</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount (if custom)"
                    value={newRange.deductionAmount}
                    disabled={newRange.deductionType !== 'custom_amount'}
                    onChange={(e) => setNewRange(prev => ({ ...prev, deductionAmount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newRange.description}
                  onChange={(e) => setNewRange(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const minVal = Number(newRange.minMinutes);
                      const maxVal = Number(newRange.maxMinutes);

                      if (Number.isNaN(minVal) || Number.isNaN(maxVal)) {
                        toast.error('Enter valid min and max minutes');
                        return;
                      }
                      if (maxVal === minVal) {
                        toast.error('Min and Max cannot be equal');
                        return;
                      }

                      // Normalize so min < max (auto-swap like global settings behavior)
                      const normalizedMin = Math.min(minVal, maxVal);
                      const normalizedMax = Math.max(minVal, maxVal);

                      if (newRange.deductionType === 'custom_amount' && (!newRange.deductionAmount || Number(newRange.deductionAmount) <= 0)) {
                        toast.error('Custom amount must be > 0');
                        return;
                      }
                      const updated = [
                        ...(formData.attendance?.earlyOut?.deductionRanges || []),
                        {
                          minMinutes: normalizedMin,
                          maxMinutes: normalizedMax,
                          deductionType: newRange.deductionType,
                          deductionAmount: newRange.deductionType === 'custom_amount' ? Number(newRange.deductionAmount) : undefined,
                          description: newRange.description || '',
                        },
                      ];
                      setFormData((prev) => ({
                        ...prev,
                        attendance: {
                          ...prev.attendance,
                          earlyOut: {
                            ...(prev.attendance?.earlyOut || { isEnabled: false, allowedDurationMinutes: 0, minimumDuration: 0, deductionRanges: [] }),
                            deductionRanges: updated,
                          },
                        },
                      }));
                      setNewRange({ minMinutes: '', maxMinutes: '', deductionType: 'quarter_day', deductionAmount: '', description: '' });
                    }}
                    className="rounded bg-green-500 px-3 py-1 text-xs font-semibold text-white hover:bg-green-600"
                  >
                    Add Range
                  </button>
                </div>
              </div>
            </div>
          </div>
          </>
                  )}

                  {activeDeptTab === 'payroll' && (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Payroll</h3>
                      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                        Same control as global Payroll settings; saved to this department (and optional division scope) via
                        departmental endpoints.
                      </p>
                      <IncludeMissingPayrollComponentsCard
                        checked={formData.payroll?.includeMissingEmployeeComponents ?? true}
                        onChange={(next) =>
                          handleInputChange('payroll', 'includeMissingEmployeeComponents', next)
                        }
                        contextNote="Enabled: partial employee overrides fill missing items from department then global. Disabled: only employee overrides are used. Leave blank elsewhere to inherit organization defaults where applicable."
                      />
          </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-white shadow-xl shadow-indigo-500/20">
                    <h3 className="text-lg font-bold">Save changes</h3>
                    <p className="mt-2 text-xs leading-relaxed opacity-80">
                      Applies all overrides for{' '}
                      <span className="font-semibold">{selectedDepartment?.name ?? 'this department'}</span>
                      {selectedDivisionId
                        ? ` in ${divisions.find((d) => d._id === selectedDivisionId)?.name ?? 'division'}`
                        : ''}
                      .
                    </p>
                    <div className="mt-6 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDepartmentId('');
                          resetForm();
                        }}
                        className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-xs font-bold transition hover:bg-white/20"
                      >
                        Clear department
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full rounded-xl bg-white px-4 py-3 text-xs font-bold text-indigo-600 shadow-lg transition hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save all settings'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar-dept::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar-dept::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-dept::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .dark .custom-scrollbar-dept::-webkit-scrollbar-thumb {
          background: #334155;
        }
      `}</style>
    </div>
  );
}

