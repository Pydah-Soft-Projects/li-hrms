'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';

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

export default function DepartmentalSettingsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<DepartmentSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [newRange, setNewRange] = useState({
    minMinutes: '',
    maxMinutes: '',
    deductionType: 'quarter_day' as 'quarter_day' | 'half_day' | 'full_day' | 'custom_amount',
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

  useEffect(() => {
    loadDepartments();
    loadDivisions();
  }, []);

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

  useEffect(() => {
    if (selectedDepartmentId) {
      loadDepartmentSettings(selectedDepartmentId);
    } else {
      setSettings(null);
      resetForm();
    }
  }, [selectedDepartmentId]);

  /* 
   * Load departments based on user role and division scope.
   * - Super Admin & All Access: Fetch all departments
   * - Division Scope: Fetch only departments belonging to the user's division
   */
  const loadDepartments = async () => {
    try {
      setLoading(true);
      const userResponse = await api.getCurrentUser();
      const userData = userResponse?.data?.user;

      // Determine if we need to filter by division
      // This logic depends on how the user's scope is defined in your auth system
      // For now, checks if user has specific allowed divisions or a single division assigned

      const response = await api.getDepartments(true);

      if (response.success && response.data) {
        let depts = response.data;

        // FILTER LOGIC:
        // If user is NOT super_admin, we might need to filter based on their assigned division(s).
        // Accessing division ID from local auth helper or the API response
        // Assuming `userData` has `allowedDivisions` or similar if not super_admin.

        // This is a simplified check. Adjust property names based on your actual User object structure.
        if (userData && userData.role !== 'super_admin') {
          const userAny = userData as any;
          // Example: if user has `allowedDivisions` array of IDs
          const allowedDivs = userAny.allowedDivisions || [];
          // Or if user has a single `division` property
          const userDivisionId = userAny.division?._id || userAny.division;

          if (allowedDivs.length > 0) {
            depts = depts.filter(d =>
              d.divisions?.some(div =>
                allowedDivs.includes(typeof div === 'string' ? div : (div as any)._id)
              )
            );
          } else if (userDivisionId) {
            depts = depts.filter(d =>
              d.divisions?.some(div =>
                (typeof div === 'string' ? div : (div as any)._id) === userDivisionId
              )
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

  const loadDepartmentSettings = async (deptId: string) => {
    try {
      setLoadingSettings(true);
      const response = await api.getDepartmentSettings(deptId);
      if (response.success && response.data) {
        setSettings(response.data);
        // Populate form with existing settings
        const s = response.data;
        setFormData({
          leaves: {
            leavesPerDay: s.leaves?.leavesPerDay ?? null,
            paidLeavesCount: s.leaves?.paidLeavesCount ?? null,
            dailyLimit: s.leaves?.dailyLimit ?? null,
            monthlyLimit: s.leaves?.monthlyLimit ?? null,
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
      }
    } catch (error) {
      console.error('Error loading department settings:', error);
      toast.error('Failed to load department settings');
      resetForm();
    } finally {
      setLoadingSettings(false);
    }
  };

  const resetForm = () => {
    setFormData({
      leaves: {
        leavesPerDay: null,
        paidLeavesCount: null,
        dailyLimit: null,
        monthlyLimit: null,
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
  };

  const handleInputChange = (
    section: 'leaves' | 'loans' | 'salaryAdvance' | 'permissions' | 'ot' | 'attendance' | 'payroll',
    field: string,
    value: any,
    nestedField?: string
  ) => {
    setFormData(prev => {
      if (nestedField && (section === 'permissions' || section === 'attendance')) {
        // Handle nested fields like deductionRules
        return {
          ...prev,
          [section]: {
            ...prev[section],
            [field]: {
              ...(prev[section] as any)?.[field],
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

  const handleSave = async () => {
    if (!selectedDepartmentId) {
      toast.error('Please select a department');
      return;
    }

    try {
      setSaving(true);

      // Prepare data for API
      const updateData = {
        leaves: formData.leaves,
        loans: formData.loans,
        salaryAdvance: formData.salaryAdvance,
        permissions: formData.permissions,
        ot: formData.ot,
        attendance: formData.attendance,
        payroll: formData.payroll,
      };

      const response = await api.updateDepartmentSettings(selectedDepartmentId, updateData);

      if (response.success) {
        toast.success('Department settings saved successfully!');
        // Reload settings
        await loadDepartmentSettings(selectedDepartmentId);
      } else {
        toast.error(response.message || 'Failed to save settings');
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const selectedDepartment = departments.find(d => d._id === selectedDepartmentId);

  return (
    <div className="max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Departmental Settings</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Configure department-specific settings for leaves, loans, salary advances, and permissions
        </p>
      </div>

      {/* Division Selection */}
      <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Division Selection */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Filter by Division (Optional)
            </label>
            <div className="relative">
              <select
                value={selectedDivisionId}
                onChange={(e) => {
                  setSelectedDivisionId(e.target.value);
                  setSelectedDepartmentId(''); // Reset department when division changes
                }}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">All Divisions</option>
                {divisions.map((div) => (
                  <option key={div._id} value={div._id}>
                    {div.name} ({div.code})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Department Selection */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Select Department
            </label>
            <div className="relative">
              <select
                value={selectedDepartmentId}
                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                disabled={loading}
              >
                <option value="">-- Select a Department --</option>
                {departments
                  .filter(dept => !selectedDivisionId || dept.divisions?.some(div => (typeof div === 'string' ? div : div._id) === selectedDivisionId))
                  .map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name} {dept.code ? `(${dept.code})` : ''}
                    </option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {selectedDepartment && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Configuring settings for <span className="font-semibold">{selectedDepartment.name}</span></span>
          </div>
        )}
      </div>

      {loadingSettings ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
          <span className="ml-3 text-sm text-slate-600 dark:text-slate-400">Loading settings...</span>
        </div>
      ) : selectedDepartmentId ? (
        <div className="space-y-4">
          {/* Leaves Settings */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              Leaves Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Leaves Per Day (Accrual Rate)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.leaves.leavesPerDay ?? ''}
                  onChange={(e) => handleInputChange('leaves', 'leavesPerDay', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 1.5, 2.0, 2.5"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Leave blank to use global default</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paid Leaves Count
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.leaves.paidLeavesCount ?? ''}
                  onChange={(e) => handleInputChange('leaves', 'paidLeavesCount', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 12, 15"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Total paid leaves per month</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Daily Leave Limit
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.leaves.dailyLimit ?? ''}
                  onChange={(e) => handleInputChange('leaves', 'dailyLimit', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="0 = unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Monthly Leave Limit
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.leaves.monthlyLimit ?? ''}
                  onChange={(e) => handleInputChange('leaves', 'monthlyLimit', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="0 = unlimited"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Loans Settings */}
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

          {/* Salary Advance Settings */}
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

          {/* Permissions Settings */}
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

          {/* Overtime (OT) Settings */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              Overtime (OT) Settings
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Configure department-specific overtime settings. Leave blank to use global defaults.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  OT Pay Per Hour (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.ot.otPayPerHour ?? ''}
                  onChange={(e) => handleInputChange('ot', 'otPayPerHour', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 100, 150, 200"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Leave blank to use global default</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Minimum OT Hours
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.ot.minOTHours ?? ''}
                  onChange={(e) => handleInputChange('ot', 'minOTHours', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 1, 2, 2.5"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Minimum hours required for OT pay eligibility</p>
              </div>
            </div>
          </div>

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
                    onChange={(e) => setNewRange(prev => ({ ...prev, deductionType: e.target.value as any }))}
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

          {/* Payroll Settings */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Payroll</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Department override for “Include Missing Allowances &amp; Deductions for Employees”. If unset, global applies.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={(formData.payroll?.includeMissingEmployeeComponents ?? true)}
                  onChange={(e) => handleInputChange('payroll', 'includeMissingEmployeeComponents', e.target.checked)}
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-green-800"></div>
              </label>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Enabled: partial employee overrides fill missing items from Department then Global. Disabled: only employee overrides are used.
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setSelectedDepartmentId('');
                resetForm();
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <svg
            className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-base font-medium text-slate-900 dark:text-white">Select a Department</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Please select a department from the dropdown above to configure its settings
          </p>
        </div>
      )}
    </div>
  );
}

