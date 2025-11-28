'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
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
}

interface Employee {
  _id: string;
  employee_name: string;
  emp_no: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
  first_name?: string;
  last_name?: string;
}

export default function LoansPage() {
  const [activeTab, setActiveTab] = useState<'loans' | 'advances' | 'pending'>('loans');
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [advances, setAdvances] = useState<LoanApplication[]>([]);
  const [pendingLoans, setPendingLoans] = useState<LoanApplication[]>([]);
  const [pendingAdvances, setPendingAdvances] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<LoanApplication | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [applyType, setApplyType] = useState<'loan' | 'salary_advance'>('loan');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loanSettings, setLoanSettings] = useState<any>(null);
  const [interestCalculation, setInterestCalculation] = useState<{
    principal: number;
    interestRate: number;
    duration: number;
    emiAmount: number;
    totalInterest: number;
    totalAmount: number;
  } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
    duration: '',
    remarks: '',
  });

  useEffect(() => {
    loadData();
    loadEmployees();
    loadLoanSettings();
  }, [activeTab]);

  useEffect(() => {
    if (showDetailDialog && selectedLoan) {
      loadTransactions(selectedLoan._id);
    }
  }, [showDetailDialog, selectedLoan?._id]);

  useEffect(() => {
    if (applyType === 'loan' && formData.amount && formData.duration && loanSettings) {
      calculateInterest();
    } else {
      setInterestCalculation(null);
    }
  }, [formData.amount, formData.duration, applyType, loanSettings]);

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
    } catch (err) {
      console.error('[Superadmin Loans] Error loading data:', err);
      setMessage({ type: 'error', text: 'Failed to load loans and advances' });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (loanId: string, action: 'approve' | 'reject' | 'forward') => {
    try {
      setSaving(true);
      const response = await api.processLoanAction(loanId, action, actionComment);
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

  const handleDisburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    try {
      setSaving(true);
      setMessage(null);

      const response = await api.disburseLoan(selectedLoan._id, {
        disbursementMethod: disbursementData.disbursementMethod,
        transactionReference: disbursementData.transactionReference,
        remarks: disbursementData.remarks,
      });

      if (response.success) {
        setMessage({ type: 'success', text: 'Funds released successfully. Transaction recorded.' });
        setShowDisbursementDialog(false);
        setDisbursementData({ disbursementMethod: 'bank_transfer', transactionReference: '', remarks: '' });
        
        // Reload loan data and transactions
        const loanRes = await api.getLoan(selectedLoan._id);
        if (loanRes.success) {
          setSelectedLoan(loanRes.data);
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
        setMessage({ type: 'success', text: `${selectedLoan.requestType === 'loan' ? 'EMI' : 'Advance'} payment recorded successfully` });
        setShowPaymentForm(false);
        setPaymentData({ amount: '', paymentDate: new Date().toISOString().split('T')[0], remarks: '', payrollCycle: '' });
        
        // Reload loan data and transactions
        const loanRes = await api.getLoan(selectedLoan._id);
        if (loanRes.success) {
          setSelectedLoan(loanRes.data);
        }
        loadTransactions(selectedLoan._id);
        loadData();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to record payment' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred' });
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

  const loadEmployees = async () => {
    try {
      const response = await api.getEmployees({ is_active: true });
      if (response.success && response.data) {
        setEmployees(response.data || []);
      }
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
    setFormData({ amount: '', reason: '', duration: '', remarks: '' });
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

      const payload: any = {
        requestType: applyType,
        amount: parseFloat(formData.amount),
        reason: formData.reason,
        remarks: formData.remarks,
        empNo: selectedEmployee.emp_no,
      };

      if (applyType === 'loan') {
        payload.duration = parseInt(formData.duration);
      } else {
        payload.duration = formData.duration ? parseInt(formData.duration) : 1;
      }

      const response = await api.applyLoan(payload);

      if (response.success) {
        setMessage({ type: 'success', text: `${applyType === 'loan' ? 'Loan' : 'Salary advance'} applied successfully for ${getEmployeeName(selectedEmployee)}` });
        setShowApplyDialog(false);
        setFormData({ amount: '', reason: '', duration: '', remarks: '' });
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
      hr_approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      disbursed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      active: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
      completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  // Icons for tabs
  const LoanIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const AdvanceIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const ClockIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Loan & Salary Advance Management</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage loan and salary advance applications
          </p>
        </div>
          <button
            onClick={() => openApplyDialog('loan')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
          >
            <PlusIcon />
            Apply Loan / Salary Advance
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <LoanIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{loans.length}</div>
              <div className="text-sm text-slate-500">Total Loans</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <AdvanceIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{advances.length}</div>
              <div className="text-sm text-slate-500">Total Advances</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
              <ClockIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{pendingLoans.length + pendingAdvances.length}</div>
              <div className="text-sm text-slate-500">Pending Approvals</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {loans.filter(l => l.status === 'approved').length + advances.filter(a => a.status === 'approved').length}
              </div>
              <div className="text-sm text-slate-500">Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('loans')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'loans'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <LoanIcon />
              Loans ({loans.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('advances')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'advances'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <AdvanceIcon />
              Salary Advances ({advances.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'pending'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <ClockIcon />
              Pending Approvals ({pendingLoans.length + pendingAdvances.length})
            </span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`mb-6 rounded-xl border px-4 py-3 flex items-center justify-between ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-current hover:opacity-70">×</button>
        </div>
      )}

      {/* Search - Only show for loans and advances tabs */}
      {(activeTab === 'loans' || activeTab === 'advances') && (
        <div className="mb-4">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </div>
            <input
              type="text"
              placeholder="Search by employee name, emp no, or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        {activeTab === 'loans' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Loading...
                    </td>
                  </tr>
                ) : loans.filter((item) => {
                  if (searchTerm) {
                    const searchLower = searchTerm.toLowerCase();
                    const empName = item.employeeId?.employee_name || '';
                    const empNo = item.emp_no || item.employeeId?.emp_no || '';
                    return (
                      empName.toLowerCase().includes(searchLower) ||
                      empNo.toLowerCase().includes(searchLower) ||
                      item.reason.toLowerCase().includes(searchLower)
                    );
                  }
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No loan applications found
                    </td>
                  </tr>
                ) : (
                  loans.filter((item) => {
                    if (searchTerm) {
                      const searchLower = searchTerm.toLowerCase();
                      const empName = item.employeeId?.employee_name || '';
                      const empNo = item.emp_no || item.employeeId?.emp_no || '';
                      return (
                        empName.toLowerCase().includes(searchLower) ||
                        empNo.toLowerCase().includes(searchLower) ||
                        item.reason.toLowerCase().includes(searchLower)
                      );
                    }
                    return true;
                  }).map((loan) => (
                    <tr 
                      key={loan._id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedLoan(loan);
                        setShowDetailDialog(true);
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {loan.employeeId?.employee_name || loan.emp_no || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">{loan.emp_no || loan.employeeId?.emp_no || 'N/A'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                        ₹{loan.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {loan.duration} months
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${getStatusColor(loan.status)}`}>
                          {loan.status?.replace('_', ' ') || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(loan.appliedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'advances' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Loading...
                    </td>
                  </tr>
                ) : advances.filter((item) => {
                  if (searchTerm) {
                    const searchLower = searchTerm.toLowerCase();
                    const empName = item.employeeId?.employee_name || '';
                    const empNo = item.emp_no || item.employeeId?.emp_no || '';
                    return (
                      empName.toLowerCase().includes(searchLower) ||
                      empNo.toLowerCase().includes(searchLower) ||
                      item.reason.toLowerCase().includes(searchLower)
                    );
                  }
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No salary advance applications found
                    </td>
                  </tr>
                ) : (
                  advances.filter((item) => {
                    if (searchTerm) {
                      const searchLower = searchTerm.toLowerCase();
                      const empName = item.employeeId?.employee_name || '';
                      const empNo = item.emp_no || item.employeeId?.emp_no || '';
                      return (
                        empName.toLowerCase().includes(searchLower) ||
                        empNo.toLowerCase().includes(searchLower) ||
                        item.reason.toLowerCase().includes(searchLower)
                      );
                    }
                    return true;
                  }).map((advance) => (
                    <tr 
                      key={advance._id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedLoan(advance);
                        setShowDetailDialog(true);
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {advance.employeeId?.employee_name || advance.emp_no || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">{advance.emp_no || advance.employeeId?.emp_no || 'N/A'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                        ₹{advance.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${getStatusColor(advance.status)}`}>
                          {advance.status?.replace('_', ' ') || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(advance.appliedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {loan.employeeId?.employee_name || loan.emp_no || 'Unknown'}
                            </span>
                            <span className="text-xs text-slate-500">({loan.emp_no || loan.employeeId?.emp_no || 'N/A'})</span>
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
                          <button
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowDetailDialog(true);
                            }}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl hover:from-emerald-600 hover:to-emerald-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-emerald-500/30 hover:shadow-lg"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowDetailDialog(true);
                            }}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-red-500/30 hover:shadow-lg"
                          >
                            <XIcon /> Reject
                          </button>
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
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {advance.employeeId?.employee_name || advance.emp_no || 'Unknown'}
                            </span>
                            <span className="text-xs text-slate-500">({advance.emp_no || advance.employeeId?.emp_no || 'N/A'})</span>
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
                          <button
                            onClick={() => {
                              setSelectedLoan(advance);
                              setShowDetailDialog(true);
                            }}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl hover:from-emerald-600 hover:to-emerald-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-emerald-500/30 hover:shadow-lg"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedLoan(advance);
                              setShowDetailDialog(true);
                            }}
                            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 flex items-center gap-2 transition-all duration-300 shadow-md shadow-red-500/30 hover:shadow-lg"
                          >
                            <XIcon /> Reject
                          </button>
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
      </div>

      {/* Detail Dialog */}
      {showDetailDialog && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => {
            setShowDetailDialog(false);
            setSelectedLoan(null);
            setTransactions([]);
            setShowPaymentForm(false);
            setShowDisbursementDialog(false);
          }} />
          <div className="relative z-50 w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className={`p-6 bg-gradient-to-r ${
              selectedLoan.requestType === 'loan'
                ? 'from-blue-500 to-indigo-600'
                : 'from-purple-500 to-pink-600'
            } text-white`}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {selectedLoan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} Details
                </h2>
                <button
                  onClick={() => {
                    setShowDetailDialog(false);
                    setSelectedLoan(null);
                    setTransactions([]);
                    setShowPaymentForm(false);
                    setShowDisbursementDialog(false);
                  }}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
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

              {/* Employee Info */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Employee Details</h3>
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${
                    selectedLoan.requestType === 'loan' ? 'bg-blue-500' : 'bg-purple-500'
                  }`}>
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
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Type</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">
                    {selectedLoan.requestType === 'loan' ? 'Loan' : 'Salary Advance'}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Amount</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">₹{selectedLoan.amount.toLocaleString()}</p>
                </div>
                {selectedLoan.requestType === 'loan' && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Duration</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {selectedLoan.duration} months
                    </p>
                  </div>
                )}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Status</p>
                  <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${getStatusColor(selectedLoan.status)}`}>
                    {selectedLoan.status?.replace('_', ' ') || '-'}
                  </span>
                </div>
              </div>

              {/* Reason */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Reason</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedLoan.reason || 'Not specified'}
                </p>
              </div>

              {/* Loan Calculation */}
              {selectedLoan.requestType === 'loan' && selectedLoan.loanConfig && (
                <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">Loan Calculation</h3>
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
                </div>
              )}

              {/* Advance Config */}
              {selectedLoan.requestType === 'salary_advance' && selectedLoan.advanceConfig && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Deduction Details</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    ₹{selectedLoan.advanceConfig.deductionPerCycle?.toLocaleString()} per cycle
                  </p>
                </div>
              )}

              {/* Repayment Status */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Repayment Status</p>
                  {['disbursed', 'active', 'approved'].includes(selectedLoan.status) && (
                    <button
                      onClick={togglePaymentForm}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2 ${
                        showPaymentForm
                          ? 'text-slate-700 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
                          : 'text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                      }`}
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
                        {selectedLoan.repayment.nextPaymentDate && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Next Payment Due</p>
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
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Cycles Paid</p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {selectedLoan.repayment.installmentsPaid || 0} / {selectedLoan.repayment.totalInstallments || selectedLoan.duration}
                        </p>
                      </div>
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
              </div>

              {/* Payment Form Section - Inline */}
              {showPaymentForm && ['disbursed', 'active', 'approved'].includes(selectedLoan.status) && (
                <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {selectedLoan.requestType === 'loan' ? 'Record EMI Payment' : 'Record Advance Payment'}
                  </h3>
                  
                  <form onSubmit={handlePayment} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Amount *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={paymentData.amount}
                          onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                          placeholder="Enter payment amount"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {selectedLoan.requestType === 'loan' && selectedLoan.loanConfig?.emiAmount && (
                          <p className="text-xs text-slate-500 mt-1">
                            EMI Amount: ₹{selectedLoan.loanConfig.emiAmount.toLocaleString()}
                          </p>
                        )}
                        {selectedLoan.requestType === 'salary_advance' && selectedLoan.advanceConfig?.deductionPerCycle && (
                          <p className="text-xs text-slate-500 mt-1">
                            Deduction per cycle: ₹{selectedLoan.advanceConfig.deductionPerCycle.toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Payment Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={paymentData.paymentDate}
                          onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Payroll Cycle (Optional)
                      </label>
                      <input
                        type="text"
                        value={paymentData.payrollCycle}
                        onChange={(e) => setPaymentData({ ...paymentData, payrollCycle: e.target.value })}
                        placeholder="e.g., 2024-11"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Remarks (Optional)
                      </label>
                      <textarea
                        value={paymentData.remarks}
                        onChange={(e) => setPaymentData({ ...paymentData, remarks: e.target.value })}
                        placeholder="Add any remarks for this transaction..."
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={togglePaymentForm}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {saving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Processing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Record Payment
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Transaction History */}
              {selectedLoan.status !== 'pending' && selectedLoan.status !== 'draft' && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Transaction History</p>
                    <button
                      onClick={() => loadTransactions(selectedLoan._id)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Refresh
                    </button>
                  </div>
                  {loadingTransactions ? (
                    <div className="text-center py-4 text-slate-500">
                      <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="ml-2">Loading transactions...</span>
                    </div>
                  ) : transactions.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {transactions.map((txn, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded capitalize ${
                                txn.transactionType === 'disbursement' 
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : txn.transactionType === 'emi_payment'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              }`}>
                                {txn.transactionType?.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(txn.transactionDate || txn.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            {txn.remarks && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{txn.remarks}</p>
                            )}
                            {txn.payrollCycle && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cycle: {txn.payrollCycle}</p>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <p className={`text-base font-bold ${
                              txn.transactionType === 'disbursement' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                            }`}>
                              {txn.transactionType === 'disbursement' ? '-' : '+'}₹{txn.amount?.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-500 text-sm">
                      <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>No transactions yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* Release Funds Section - For Approved Loans */}
              {selectedLoan.status === 'approved' && (
                <div className="p-4 rounded-xl border-2 border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Release Funds
                      </h3>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Disburse ₹{selectedLoan.requestType === 'loan' ? (selectedLoan.loanConfig?.totalAmount || selectedLoan.amount) : selectedLoan.amount} to {selectedLoan.employeeId?.employee_name || selectedLoan.emp_no}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowDisbursementDialog(true)}
                      className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-green-600 rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Release Funds
                    </button>
                  </div>
                </div>
              )}

              {/* Action Section */}
              {!['approved', 'rejected', 'cancelled', 'disbursed', 'active', 'completed'].includes(selectedLoan.status) && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Take Action</p>
                  
                  {/* Comment */}
                  <textarea
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder="Add a comment (optional)..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  
                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleAction(selectedLoan._id, 'approve')}
                      disabled={saving}
                      className="px-4 py-2.5 text-sm font-semibold text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <CheckIcon /> Approve
                    </button>
                    <button
                      onClick={() => handleAction(selectedLoan._id, 'reject')}
                      disabled={saving}
                      className="px-4 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <XIcon /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={() => {
                  setShowDetailDialog(false);
                  setSelectedLoan(null);
                  setTransactions([]);
                  setShowPaymentForm(false);
                  setShowDisbursementDialog(false);
                }}
                className="w-full px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disbursement Dialog */}
      {showDisbursementDialog && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDisbursementDialog(false)} />
          <div className="relative z-50 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Release Funds
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Disburse ₹{selectedLoan.amount.toLocaleString()} to {selectedLoan.employeeId?.employee_name || selectedLoan.emp_no}
                </p>
              </div>
              <button
                onClick={() => setShowDisbursementDialog(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <XIcon />
              </button>
            </div>

            <form onSubmit={handleDisburse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Disbursement Method *
                </label>
                <select
                  required
                  value={disbursementData.disbursementMethod}
                  onChange={(e) => setDisbursementData({ ...disbursementData, disbursementMethod: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  value={disbursementData.transactionReference}
                  onChange={(e) => setDisbursementData({ ...disbursementData, transactionReference: e.target.value })}
                  placeholder="e.g., TXN123456789"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Remarks
                </label>
                <textarea
                  value={disbursementData.remarks}
                  onChange={(e) => setDisbursementData({ ...disbursementData, remarks: e.target.value })}
                  placeholder="Add any remarks for this disbursement..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white resize-none"
                />
              </div>

              {message && (
                <div className={`rounded-lg px-4 py-2 text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDisbursementDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-green-600 rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Release Funds
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apply Dialog */}
      {showApplyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApplyDialog(false)} />
          <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            {/* Type Toggle */}
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
                <span className="flex items-center justify-center gap-2">
                  <LoanIcon />
                  Loan
                </span>
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
                <span className="flex items-center justify-center gap-2">
                  <AdvanceIcon />
                  Salary Advance
                </span>
              </button>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Apply for {applyType === 'loan' ? 'Loan' : 'Salary Advance'}
            </h2>

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
                        <XIcon />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <SearchIcon />
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

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowApplyDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-50 ${
                    applyType === 'loan'
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600'
                      : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                  }`}
                >
                  {saving ? 'Submitting...' : `Apply ${applyType === 'loan' ? 'Loan' : 'Salary Advance'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

