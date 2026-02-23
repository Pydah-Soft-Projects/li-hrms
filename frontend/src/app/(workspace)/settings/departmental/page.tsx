'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';

interface Department {
  _id: string;
  name: string;
  code?: string;
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
    casualLeavePerYear: number | null;
    maxCasualLeavesPerMonth: number | null;
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
      casualLeavePerYear: null,
      maxCasualLeavesPerMonth: null,
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
  }, []);

  useEffect(() => {
    if (selectedDepartmentId) {
      loadDepartmentSettings(selectedDepartmentId);
    } else {
      setSettings(null);
      resetForm();
    }
  }, [selectedDepartmentId]);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        setDepartments(response.data);
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
            casualLeavePerYear: s.leaves?.casualLeavePerYear ?? null,
            maxCasualLeavesPerMonth: s.leaves?.maxCasualLeavesPerMonth ?? null,
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
        casualLeavePerYear: null,
        maxCasualLeavesPerMonth: null,
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

      {/* Department Selection */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Select Department
        </label>
        <select
          value={selectedDepartmentId}
          onChange={(e) => setSelectedDepartmentId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          disabled={loading}
        >
          <option value="">-- Select a Department --</option>
          {departments.map((dept) => (
            <option key={dept._id} value={dept._id}>
              {dept.name} {dept.code ? `(${dept.code})` : ''}
            </option>
          ))}
        </select>
        {selectedDepartment && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Configure settings for <span className="font-medium text-green-600 dark:text-green-400">{selectedDepartment.name}</span>
          </p>
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
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Leaves Settings</h2>
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Casual Leave Per Year
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.leaves.casualLeavePerYear ?? ''}
                  onChange={(e) => handleInputChange('leaves', 'casualLeavePerYear', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 12, 15"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Annual CL entitlement</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Max CL Per Month
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.leaves.maxCasualLeavesPerMonth ?? ''}
                  onChange={(e) => handleInputChange('leaves', 'maxCasualLeavesPerMonth', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 1, 2"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Max CL usage limit per month</p>
              </div>
            </div>
          </div>

          {/* Loans Settings */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Loans Settings</h2>
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Is Interest Applicable
                </label>
                <select
                  value={formData.loans.isInterestApplicable === null ? '' : formData.loans.isInterestApplicable ? 'true' : 'false'}
                  onChange={(e) => handleInputChange('loans', 'isInterestApplicable', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Salary Advance Settings */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Salary Advance Settings</h2>
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Is Interest Applicable
                </label>
                <select
                  value={formData.salaryAdvance.isInterestApplicable === null ? '' : formData.salaryAdvance.isInterestApplicable ? 'true' : 'false'}
                  onChange={(e) => handleInputChange('salaryAdvance', 'isInterestApplicable', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Permissions Settings */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Permissions Settings</h2>
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Deduct From Salary
                </label>
                <select
                  value={formData.permissions.deductFromSalary === null ? '' : formData.permissions.deductFromSalary ? 'true' : 'false'}
                  onChange={(e) => handleInputChange('permissions', 'deductFromSalary', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            {/* Permission Deduction Rules */}
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <h3 className="mb-3 text-sm font-semibold text-blue-900 dark:text-blue-200">Permission Deduction Rules</h3>
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
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-600 dark:bg-slate-700 dark:text-white"
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
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-600 dark:bg-slate-700 dark:text-white"
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
                      className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-600 dark:bg-slate-700 dark:text-white"
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
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-600 dark:bg-slate-700 dark:text-white"
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
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-600 dark:bg-slate-700 dark:text-white"
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
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Overtime (OT) Settings</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Minimum hours required for OT pay eligibility</p>
              </div>
            </div>
          </div>

          {/* Attendance Deduction Rules (Combined Late-in + Early-out) */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Attendance Deduction Rules</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Early-Out Rules</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Independent rules for early-outs. When disabled, combined rules apply.</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={formData.attendance?.earlyOut?.isEnabled ?? false}
                  onChange={(e) => handleInputChange('attendance', 'earlyOut', e.target.checked, 'isEnabled')}
                />
                <div className="peer h-5 w-10 rounded-full bg-slate-300 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-green-500 peer-checked:after:translate-x-5"></div>
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Only early-outs {'>='} this duration will count</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Deduction Ranges</p>
              </div>
              {(formData.attendance?.earlyOut?.deductionRanges || []).length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">No ranges configured.</p>
              )}
              {(formData.attendance?.earlyOut?.deductionRanges || []).map((range, idx) => (
                <div key={range._id || idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <span className="font-semibold">{range.minMinutes}–{range.maxMinutes} min</span>
                  <span className="text-slate-500">|</span>
                  <span className="capitalize">{range.deductionType.replace('_', ' ')}</span>
                  {range.deductionType === 'custom_amount' && range.deductionAmount && <span className="text-slate-500">₹{range.deductionAmount}</span>}
                  {range.description && <span className="text-slate-500">— {range.description}</span>}
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
                    className="ml-auto rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:border-red-400 dark:border-red-700 dark:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              ))}

              {/* Add Range */}
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs dark:border-slate-600 dark:bg-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min (min)"
                    value={newRange.minMinutes}
                    onChange={(e) => setNewRange(prev => ({ ...prev, minMinutes: e.target.value }))}
                    className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Max (min)"
                    value={newRange.maxMinutes}
                    onChange={(e) => setNewRange(prev => ({ ...prev, maxMinutes: e.target.value }))}
                    className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newRange.deductionType}
                    onChange={(e) => setNewRange(prev => ({ ...prev, deductionType: e.target.value as any }))}
                    className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
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
                    className="rounded border border-slate-300 bg-white px-2 py-1 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Description"
                  value={newRange.description}
                  onChange={(e) => setNewRange(prev => ({ ...prev, description: e.target.value }))}
                  className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <div className="flex justify-end">
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

