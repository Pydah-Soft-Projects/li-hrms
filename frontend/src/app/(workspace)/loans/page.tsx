'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

interface LoanApplication {
  _id: string;
  employeeId?: {
    _id: string;
    employee_name?: string;
    emp_no: string;
  };
  emp_no?: string;
  requestType: 'loan' | 'salary_advance';
  amount: number;
  reason: string;
  duration: number;
  status: string;
  appliedAt: string;
  department?: { name: string };
  designation?: { name: string };
  loanConfig?: {
    emiAmount: number;
    interestRate: number;
    totalAmount: number;
  };
  advanceConfig?: {
    deductionCycles: number;
    deductionPerCycle: number;
  };
  repayment?: {
    totalPaid: number;
    remainingBalance: number;
  };
}

interface Employee {
  _id: string;
  employee_name: string;
  emp_no: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
  phone_number?: string;
}

export default function LoansPage() {
  const { activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'loans' | 'advances'>('loans');
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [advances, setAdvances] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyType, setApplyType] = useState<'loan' | 'salary_advance'>('loan');
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanApplication | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
    duration: '',
    remarks: '',
  });

  // Interest calculation state (for loans)
  const [interestCalculation, setInterestCalculation] = useState<{
    principal: number;
    interestRate: number;
    duration: number;
    emiAmount: number;
    totalInterest: number;
    totalAmount: number;
  } | null>(null);
  
  // Loan settings for interest calculation
  const [loanSettings, setLoanSettings] = useState<any>(null);

  // Employee selection
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Permissions
  const [canApplyLoanForSelf, setCanApplyLoanForSelf] = useState(false);
  const [canApplyLoanForOthers, setCanApplyLoanForOthers] = useState(false);
  const [canApplyAdvanceForSelf, setCanApplyAdvanceForSelf] = useState(false);
  const [canApplyAdvanceForOthers, setCanApplyAdvanceForOthers] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    loadData();
    loadCurrentUser();
    checkWorkspacePermission();
    loadLoanSettings();
  }, [activeWorkspace]);

  useEffect(() => {
    if (applyType === 'loan' && formData.amount && formData.duration && loanSettings) {
      calculateInterest();
    } else {
      setInterestCalculation(null);
    }
  }, [formData.amount, formData.duration, applyType, loanSettings]);

  useEffect(() => {
    if ((canApplyLoanForOthers || canApplyAdvanceForOthers) && currentUser) {
      loadEmployees();
    }
  }, [canApplyLoanForOthers, canApplyAdvanceForOthers, currentUser, activeWorkspace]);

  const loadCurrentUser = async () => {
    try {
      const response = await api.getCurrentUser();
      if (response.success && response.data?.user) {
        setCurrentUser(response.data.user);
      }
    } catch (err) {
      console.error('Error loading current user:', err);
    }
  };

  const checkWorkspacePermission = async () => {
    try {
      const workspaceId = activeWorkspace?._id;
      if (!workspaceId) {
        setCanApplyLoanForSelf(false);
        setCanApplyLoanForOthers(false);
        setCanApplyAdvanceForSelf(false);
        setCanApplyAdvanceForOthers(false);
        return;
      }

      if (activeWorkspace?.type === 'employee') {
        setCanApplyLoanForSelf(true);
        setCanApplyLoanForOthers(false);
        setCanApplyAdvanceForSelf(true);
        setCanApplyAdvanceForOthers(false);
        return;
      }

      const [loanSettingsRes, advanceSettingsRes] = await Promise.all([
        api.getLoanSettings('loan'),
        api.getLoanSettings('salary_advance'),
      ]);

      const workspaceIdStr = String(workspaceId);

      // Check Loan permissions
      let loanPermissions = null;
      if (loanSettingsRes.success && loanSettingsRes.data?.settings?.workspacePermissions) {
        const perms = loanSettingsRes.data.settings.workspacePermissions;
        loanPermissions = perms[workspaceIdStr];
      }

      // Check Advance permissions
      let advancePermissions = null;
      if (advanceSettingsRes.success && advanceSettingsRes.data?.settings?.workspacePermissions) {
        const perms = advanceSettingsRes.data.settings.workspacePermissions;
        advancePermissions = perms[workspaceIdStr];
      }

      if (loanPermissions) {
        if (typeof loanPermissions === 'boolean') {
          setCanApplyLoanForSelf(false);
          setCanApplyLoanForOthers(loanPermissions);
        } else {
          setCanApplyLoanForSelf(loanPermissions.canApplyForSelf || false);
          setCanApplyLoanForOthers(loanPermissions.canApplyForOthers || false);
        }
      }

      if (advancePermissions) {
        if (typeof advancePermissions === 'boolean') {
          setCanApplyAdvanceForSelf(false);
          setCanApplyAdvanceForOthers(advancePermissions);
        } else {
          setCanApplyAdvanceForSelf(advancePermissions.canApplyForSelf || false);
          setCanApplyAdvanceForOthers(advancePermissions.canApplyForOthers || false);
        }
      }
    } catch (err) {
      console.error('Error checking workspace permission:', err);
    }
  };

  const loadEmployees = async () => {
    try {
      if (!currentUser?.departments || currentUser.departments.length === 0) return;
      
      const departmentIds = currentUser.departments.map((d: any) => d._id || d);
      const allEmployees: Employee[] = [];
      
      for (const deptId of departmentIds) {
        const response = await api.getEmployees({ is_active: true, department_id: deptId });
        if (response.success && response.data) {
          allEmployees.push(...response.data);
        }
      }
      
      setEmployees(allEmployees);
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  };

  const loadLoanSettings = async () => {
    try {
      const response = await api.getLoanSettings('loan');
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
      // No interest
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
      // Calculate with interest
      const monthlyRate = interestRate / 100 / 12;
      const emiAmount = (principal * monthlyRate * Math.pow(1 + monthlyRate, duration)) / (Math.pow(1 + monthlyRate, duration) - 1);
      const totalAmount = emiAmount * duration;
      const totalInterest = totalAmount - principal;

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

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await api.getMyLoans();
      if (response.success && response.data) {
        const all = response.data;
        setLoans(all.filter((l: LoanApplication) => l.requestType === 'loan'));
        setAdvances(all.filter((a: LoanApplication) => a.requestType === 'salary_advance'));
      }
    } catch (err) {
      setError('Failed to load loans');
    } finally {
      setLoading(false);
    }
  };

  const openApplyDialog = (type: 'loan' | 'salary_advance') => {
    setApplyType(type);
    setFormData({ amount: '', reason: '', duration: '', remarks: '' });
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setInterestCalculation(null);
    setShowApplyDialog(true);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      setSuccess('');

      const canApplySelf = applyType === 'loan' ? canApplyLoanForSelf : canApplyAdvanceForSelf;
      const canApplyOthers = applyType === 'loan' ? canApplyLoanForOthers : canApplyAdvanceForOthers;

      if (!canApplySelf && !canApplyOthers) {
        setError('You do not have permission to apply for ' + (applyType === 'loan' ? 'loans' : 'salary advances'));
        return;
      }

      if (canApplyOthers && !selectedEmployee && !canApplySelf) {
        setError('Please select an employee');
        return;
      }

      // Validate duration for loans
      if (applyType === 'loan' && !formData.duration) {
        setError('Duration is required for loans');
        return;
      }

      // For salary advance, duration is not required (will be set to 1 cycle)
      const payload: any = {
        requestType: applyType,
        amount: parseFloat(formData.amount),
        reason: formData.reason,
        remarks: formData.remarks,
        empNo: canApplyOthers && selectedEmployee ? selectedEmployee.emp_no : undefined,
      };

      // Only add duration for loans
      if (applyType === 'loan') {
        payload.duration = parseInt(formData.duration);
      } else {
        // For salary advance, default to 1 cycle if not specified
        payload.duration = formData.duration ? parseInt(formData.duration) : 1;
      }

      const response = await api.applyLoan(payload);

      if (response.success) {
        setSuccess(`${applyType === 'loan' ? 'Loan' : 'Salary advance'} application submitted successfully`);
        setShowApplyDialog(false);
        loadData();
      } else {
        setError(response.error || 'Failed to submit application');
      }
    } catch (err) {
      setError('An error occurred');
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const search = employeeSearch.toLowerCase();
    return (
      emp.employee_name.toLowerCase().includes(search) ||
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
      disbursed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      active: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
      completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const canShowLoanButton = (canApplyLoanForSelf || canApplyLoanForOthers);
  const canShowAdvanceButton = (canApplyAdvanceForSelf || canApplyAdvanceForOthers);
  const canShowBothButtons = canShowLoanButton && canShowAdvanceButton;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loan & Salary Advance Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">View and manage your loan and salary advance applications</p>
        </div>
        <div className="flex gap-2">
          {canShowBothButtons && (
            <button
              onClick={() => openApplyDialog(activeTab === 'loans' ? 'loan' : 'salary_advance')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
            >
              <PlusIcon />
              Apply {activeTab === 'loans' ? 'Loan' : 'Salary Advance'}
            </button>
          )}
          {canShowLoanButton && !canShowAdvanceButton && (
            <button
              onClick={() => openApplyDialog('loan')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
            >
              <PlusIcon />
              Apply Loan
            </button>
          )}
          {canShowAdvanceButton && !canShowLoanButton && (
            <button
              onClick={() => openApplyDialog('salary_advance')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
            >
              <PlusIcon />
              Apply Salary Advance
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{loans.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Loans</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{advances.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Advances</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-300">
              <CheckIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {loans.filter(l => l.status === 'approved').length + advances.filter(a => a.status === 'approved').length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      {canShowBothButtons && (
        <div className="mb-6">
          <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('loans')}
              className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
                activeTab === 'loans'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Loans ({loans.length})
            </button>
            <button
              onClick={() => setActiveTab('advances')}
              className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
                activeTab === 'advances'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Salary Advances ({advances.length})
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-700 hover:text-green-900">×</button>
        </div>
      )}

      {/* Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        ) : (activeTab === 'loans' ? loans : advances).length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            No {activeTab === 'loans' ? 'loans' : 'salary advances'} found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  {activeTab === 'loans' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Duration
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Applied Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {(activeTab === 'loans' ? loans : advances).map((item) => (
                  <tr 
                    key={item._id} 
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedLoan(item);
                      setShowDetailDialog(true);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">₹{item.amount.toLocaleString()}</div>
                    </td>
                    {activeTab === 'loans' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {item.duration} {item.duration === 1 ? 'month' : 'months'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                        {item.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {new Date(item.appliedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLoan(item);
                          setShowDetailDialog(true);
                        }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Apply Dialog */}
      {showApplyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApplyDialog(false)} />
          <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            {/* Type Toggle */}
            {canShowBothButtons && (
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setApplyType('loan');
                    setInterestCalculation(null);
                  }}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                    applyType === 'loan'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Loan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApplyType('salary_advance');
                    setInterestCalculation(null);
                  }}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                    applyType === 'salary_advance'
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Salary Advance
                </button>
              </div>
            )}

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Apply for {applyType === 'loan' ? 'Loan' : 'Salary Advance'}
            </h2>

            <form onSubmit={handleApply} className="space-y-4">
              {/* Employee Selection */}
              {((applyType === 'loan' && canApplyLoanForOthers) || (applyType === 'salary_advance' && canApplyAdvanceForOthers)) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Apply For Employee {!((applyType === 'loan' && canApplyLoanForSelf) || (applyType === 'salary_advance' && canApplyAdvanceForSelf)) && '*'}
                  </label>
                  <div className="relative employee-dropdown-container">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <SearchIcon />
                      </div>
                      <input
                        type="text"
                        placeholder="Search by name, emp no, or department..."
                        value={employeeSearch}
                        onChange={(e) => {
                          setEmployeeSearch(e.target.value);
                          setShowEmployeeDropdown(true);
                        }}
                        onFocus={() => setShowEmployeeDropdown(true)}
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    {showEmployeeDropdown && filteredEmployees.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        {filteredEmployees.map((emp) => (
                          <button
                            key={emp._id}
                            type="button"
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setEmployeeSearch(emp.employee_name);
                              setShowEmployeeDropdown(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <div className="font-medium">{emp.employee_name}</div>
                            <div className="text-xs text-slate-500">{emp.emp_no}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedEmployee && (
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      Selected: {selectedEmployee.employee_name} ({selectedEmployee.emp_no})
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
                  min="1"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
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
                    min="1"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
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

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowApplyDialog(false)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {showDetailDialog && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDetailDialog(false)} />
          <div className="relative z-50 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {selectedLoan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} Details
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Type</label>
                <div className="text-slate-900 dark:text-slate-100">
                  {selectedLoan.requestType === 'loan' ? 'Loan' : 'Salary Advance'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Amount</label>
                <div className="text-slate-900 dark:text-slate-100">₹{selectedLoan.amount.toLocaleString()}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Duration</label>
                <div className="text-slate-900 dark:text-slate-100">
                  {selectedLoan.duration} {selectedLoan.requestType === 'loan' ? 'months' : 'cycles'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Reason</label>
                <div className="text-slate-900 dark:text-slate-100">{selectedLoan.reason}</div>
              </div>
              {selectedLoan.requestType === 'loan' && selectedLoan.loanConfig && (
                <>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">EMI Amount</label>
                    <div className="text-slate-900 dark:text-slate-100">₹{selectedLoan.loanConfig.emiAmount?.toLocaleString()}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Amount (with interest)</label>
                    <div className="text-slate-900 dark:text-slate-100">₹{selectedLoan.loanConfig.totalAmount?.toLocaleString()}</div>
                  </div>
                </>
              )}
              {selectedLoan.requestType === 'salary_advance' && selectedLoan.advanceConfig && (
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Deduction per Cycle</label>
                  <div className="text-slate-900 dark:text-slate-100">₹{selectedLoan.advanceConfig.deductionPerCycle?.toLocaleString()}</div>
                </div>
              )}
              {selectedLoan.repayment && (
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Repayment Status</label>
                  <div className="text-slate-900 dark:text-slate-100">
                    Paid: ₹{selectedLoan.repayment.totalPaid?.toLocaleString()} / Remaining: ₹{selectedLoan.repayment.remainingBalance?.toLocaleString()}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Status</label>
                <div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedLoan.status)}`}>
                    {selectedLoan.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDetailDialog(false)}
              className="mt-6 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

