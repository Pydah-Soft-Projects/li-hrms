'use client';

import { useState, useEffect } from 'react';
import { api, Department, Designation, Division, EmployeeGroup } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
interface PayrollTransaction {
  _id: string;
  employeeName: string;
  emp_no: string;
  transactionType: string;
  category: 'earning' | 'deduction' | 'adjustment';
  description: string;
  amount: number;
  month: string;
  createdAt: string;
  details?: any;
}

interface Analytics {
  totalEarnings: number;
  totalDeductions: number;
  totalNetSalary: number;
  salaryAdvanceRecovered: number;
  loanRecovered: number;
  totalRemainingLoans: number;
  totalRemainingSalaryAdvances: number;
  totalRecords: number;
  totalTransactions: number;
}

export default function PayrollTransactionsTab() {
  const [transactions, setTransactions] = useState<PayrollTransaction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [designationIds, setDesignationIds] = useState<string[]>([]);
  const [employeeGroupIds, setEmployeeGroupIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, [selectedMonth]);

  useEffect(() => {
    const loadExportFilters = async () => {
      const [divisionResponse, departmentResponse, designationResponse, groupResponse] = await Promise.all([
        api.getDivisions(true),
        api.getDepartments(true),
        api.getAllDesignations(),
        api.getEmployeeGroups(true),
      ]);
      if (divisionResponse.success) setDivisions(divisionResponse.data || []);
      if (departmentResponse.success) setDepartments(departmentResponse.data || []);
      if (designationResponse.success) setDesignations(designationResponse.data || []);
      if (groupResponse.success) setEmployeeGroups(groupResponse.data || []);
    };
    loadExportFilters().catch((error) => console.error('Error loading payroll export filters:', error));
  }, []);

  useEffect(() => {
    if (divisionIds.length === 0) {
      api.getDepartments(true).then((response) => {
        if (response.success) setDepartments(response.data || []);
      });
      return;
    }
    api.getDepartments(true, divisionIds[0]).then((response) => {
      if (response.success) setDepartments(response.data || []);
    });
  }, [divisionIds]);

  const exportPayrollSummary = async (format: 'xlsx' | 'pdf') => {
    if (!selectedMonth) {
      toast.error('Select a payroll month first');
      return;
    }
    setExporting(true);
    try {
      const params = {
        month: selectedMonth,
        divisionIds,
        departmentIds,
        designationId: designationIds[0],
        employeeGroupId: employeeGroupIds[0],
        search: searchQuery.trim(),
      };
      const blob = format === 'xlsx'
        ? await api.exportPayRegisterSummary(params)
        : await api.exportPayRegisterSummaryPDF(params);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `payroll_summary_${selectedMonth}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} payroll report downloaded`);
    } catch (error: any) {
      toast.error(error.message || 'Could not export payroll report');
    } finally {
      setExporting(false);
    }
  };

  const loadTransactions = async () => {
    if (!selectedMonth) return;

    setLoading(true);
    try {
      const response = await api.getPayrollTransactionsWithAnalytics({
        month: selectedMonth,
      });

      console.log('API Response:', response);

      if (response.success) {
        // The API client wraps the response, so data is in response.data
        // But also check if transactions/analytics are directly on response
        const responseData = response.data as any;
        const transactionsData = responseData?.transactions || (response as any).transactions || [];
        const analyticsData = responseData?.analytics || (response as any).analytics || null;
        
        console.log('Transactions:', transactionsData);
        console.log('Analytics:', analyticsData);
        
        setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
        setAnalytics(analyticsData);
      } else {
        toast.error(response.message || 'Failed to load transactions');
        setTransactions([]);
        setAnalytics(null);
      }
    } catch (error: any) {
      console.error('Error loading transactions:', error);
      toast.error('Error loading payroll transactions');
      setTransactions([]);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getTransactionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      basic_pay: 'Basic Pay',
      incentive: 'Incentive',
      ot_pay: 'Overtime Pay',
      allowance: 'Allowance',
      deduction: 'Deduction',
      attendance_deduction: 'Attendance Deduction',
      permission_deduction: 'Permission Deduction',
      leave_deduction: 'Leave Deduction',
      loan_emi: 'Loan EMI',
      salary_advance: 'Salary Advance',
      net_salary: 'Net Salary',
    };
    return labels[type] || type;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'earning':
        return 'text-green-600 dark:text-green-400';
      case 'deduction':
        return 'text-red-600 dark:text-red-400';
      case 'adjustment':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-slate-600 dark:text-slate-400';
    }
  };

  const filteredTransactions = transactions.filter((transaction) => {
    // Filter by type
    if (filterType !== 'all') {
      if (filterType === 'earnings' && transaction.category !== 'earning') return false;
      if (filterType === 'deductions' && transaction.category !== 'deduction') return false;
      if (filterType === 'adjustments' && transaction.category !== 'adjustment') return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        transaction.employeeName.toLowerCase().includes(query) ||
        transaction.emp_no.toLowerCase().includes(query) ||
        transaction.description.toLowerCase().includes(query)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Month Selector and Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="month" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Select Month:
            </label>
            <input
              type="month"
              id="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Search by employee name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('earnings')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                filterType === 'earnings'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              Earnings
            </button>
            <button
              onClick={() => setFilterType('deductions')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                filterType === 'deductions'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              Deductions
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Payroll Summary Export</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Uses the selected payroll month and filters below.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportPayrollSummary('xlsx')} disabled={exporting} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Excel
            </button>
            <button onClick={() => exportPayrollSummary('pdf')} disabled={exporting} className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MultiSelect label="Division" options={divisions.map(item => ({ id: item._id, name: item.name }))} selectedIds={divisionIds} onChange={(ids) => { setDivisionIds(ids.slice(-1)); setDepartmentIds([]); }} single />
          <MultiSelect label="Department" options={departments.map(item => ({ id: item._id, name: item.name }))} selectedIds={departmentIds} onChange={(ids) => setDepartmentIds(ids.slice(-1))} disabled={divisionIds.length > 0 && departments.length === 0} single />
          <MultiSelect label="Designation" options={designations.map(item => ({ id: item._id, name: item.name }))} selectedIds={designationIds} onChange={(ids) => setDesignationIds(ids.slice(-1))} single />
          <MultiSelect label="Group" options={employeeGroups.map(item => ({ id: item._id, name: item.name }))} selectedIds={employeeGroupIds} onChange={(ids) => setEmployeeGroupIds(ids.slice(-1))} single />
        </div>
      </section>

      {/* Analytics Cards */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Earnings */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm dark:border-green-800 dark:bg-green-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">Total Earnings</p>
                  <p className="mt-1 text-2xl font-bold text-green-900 dark:text-green-100">
                    {formatCurrency(analytics.totalEarnings)}
                  </p>
                </div>
                <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/40">
                  <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Deductions */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Deductions</p>
                  <p className="mt-1 text-2xl font-bold text-red-900 dark:text-red-100">
                    {formatCurrency(analytics.totalDeductions)}
                  </p>
                </div>
                <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/40">
                  <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Net Salary */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Net Salary</p>
                  <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {formatCurrency(analytics.totalNetSalary)}
                  </p>
                </div>
                <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/40">
                  <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Transactions */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Transactions</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    {analytics.totalTransactions}
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-700">
                  <svg className="h-6 w-6 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Loan & Advance Analytics */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Salary Advance Recovered */}
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-sm dark:border-purple-800 dark:bg-purple-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Salary Advance Recovered</p>
                  <p className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {formatCurrency(analytics.salaryAdvanceRecovered)}
                  </p>
                </div>
                <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900/40">
                  <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Loan Recovered */}
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 shadow-sm dark:border-orange-800 dark:bg-orange-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Loan Recovered</p>
                  <p className="mt-1 text-2xl font-bold text-orange-900 dark:text-orange-100">
                    {formatCurrency(analytics.loanRecovered)}
                  </p>
                </div>
                <div className="rounded-full bg-orange-100 p-3 dark:bg-orange-900/40">
                  <svg className="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Remaining Loans */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Total Remaining Loans</p>
                  <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
                    {formatCurrency(analytics.totalRemainingLoans)}
                  </p>
                </div>
                <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/40">
                  <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Remaining Salary Advances */}
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 shadow-sm dark:border-indigo-800 dark:bg-indigo-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Total Remaining Advances</p>
                  <p className="mt-1 text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                    {formatCurrency(analytics.totalRemainingSalaryAdvances)}
                  </p>
                </div>
                <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/40">
                  <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Transactions Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="flex flex-col items-center gap-4">
                <svg className="h-8 w-8 animate-spin text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-slate-600 dark:text-slate-400">Loading transactions...</p>
              </div>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400">No transactions found for the selected month.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction._id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="min-w-0" title={[String(transaction.employeeName || '—'), String(transaction.emp_no || '')].filter(Boolean).join(' · ')}>
                        <div className="font-semibold truncate text-slate-900 dark:text-white text-sm">
                          {transaction.employeeName || '—'}
                        </div>
                        {transaction.emp_no ? (
                          <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{transaction.emp_no}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`text-sm font-medium ${getCategoryColor(transaction.category)}`}>
                        {getTransactionTypeLabel(transaction.transactionType)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900 dark:text-white">{transaction.description}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <span
                        className={`text-sm font-semibold ${
                          transaction.category === 'earning'
                            ? 'text-green-600 dark:text-green-400'
                            : transaction.category === 'deduction'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {transaction.category === 'earning' ? '+' : '-'}
                        {formatCurrency(Math.abs(transaction.amount))}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(transaction.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

