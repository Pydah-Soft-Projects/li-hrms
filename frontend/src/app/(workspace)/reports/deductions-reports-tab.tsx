'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Search, TrendingDown, Users, Building2, Calendar, Loader2 } from 'lucide-react';

interface DeductionData {
  employeeId?: string;
  employeeName?: string;
  empNo?: string;
  department?: string;
  departmentId?: string;
  division?: string;
  divisionId?: string;
  designation?: string;
  employeeGroup?: string;
  employeeGroupId?: string;
  departmentName?: string;
  divisionName?: string;
  month?: string;
  totalDeductions: number;
  deductionsByType: Record<string, number>;
  deductionsByMonth?: Record<string, number>;
  transactionCount: number;
  employeeCount?: number;
  departmentCount?: number;
}

interface DeductionsSummary {
  totalDeductions: number;
  totalEmployees: number;
  monthsAnalyzed: number;
  deductionTypes: Record<string, number>;
  groupBy: string;
  startMonth: string;
  endMonth: string;
}

type GroupByType = 'employee' | 'department' | 'division' | 'month';

export default function DeductionsReportsTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DeductionData[]>([]);
  const [summary, setSummary] = useState<DeductionsSummary | null>(null);

  // Filters
  const [startMonth, setStartMonth] = useState(() => {
    const now = new Date();
    now.setMonth(now.getMonth() - 2); // Default to 3 months ago
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [endMonth, setEndMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [groupBy, setGroupBy] = useState<GroupByType>('employee');
  const [searchQuery, setSearchQuery] = useState('');

  const loadDeductionsAnalytics = useCallback(async () => {
    if (!startMonth || !endMonth) return;

    setLoading(true);
    try {
      const response = await api.getDeductionsAnalytics({
        startMonth,
        endMonth,
        groupBy,
      });

      if (response.success) {
        setData((response as any).data || []);
        setSummary((response as any).summary || null);
      } else {
        toast.error(response.message || 'Failed to load deductions analytics');
        setData([]);
        setSummary(null);
      }
    } catch (error: any) {
      console.error('Error loading deductions analytics:', error);
      toast.error('Error loading deductions analytics');
      setData([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [startMonth, endMonth, groupBy]);

  useEffect(() => {
    loadDeductionsAnalytics();
  }, [loadDeductionsAnalytics]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getDeductionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      attendance_deduction: 'Attendance Deduction',
      permission_deduction: 'Permission Deduction',
      leave_deduction: 'Leave Deduction',
      loan_emi: 'Loan EMI',
      salary_advance: 'Salary Advance',
      pf: 'PF',
      esi: 'ESI',
      professional_tax: 'Professional Tax',
      pt: 'PT',
      tds: 'TDS',
      other_deduction: 'Other Deduction',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const categorizeDeductionType = (type: string): 'statutory' | 'attendance' | 'other' => {
    const statutory = ['pf', 'esi', 'professional_tax', 'pt', 'tds'];
    const attendance = ['attendance_deduction', 'permission_deduction', 'leave_deduction'];

    if (statutory.includes(type.toLowerCase())) return 'statutory';
    if (attendance.includes(type.toLowerCase())) return 'attendance';
    return 'other';
  };

  const filteredData = data.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();

    if (groupBy === 'employee') {
      return (
        item.employeeName?.toLowerCase().includes(query) ||
        item.empNo?.toLowerCase().includes(query) ||
        item.department?.toLowerCase().includes(query) ||
        item.division?.toLowerCase().includes(query) ||
        item.employeeGroup?.toLowerCase().includes(query)
      );
    } else if (groupBy === 'department') {
      return (
        item.departmentName?.toLowerCase().includes(query) ||
        item.division?.toLowerCase().includes(query)
      );
    } else if (groupBy === 'division') {
      return item.divisionName?.toLowerCase().includes(query);
    } else if (groupBy === 'month') {
      return item.month?.includes(query);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Start Month */}
          <div>
            <label htmlFor="startMonth" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Start Month
            </label>
            <input
              type="month"
              id="startMonth"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          {/* End Month */}
          <div>
            <label htmlFor="endMonth" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              End Month
            </label>
            <input
              type="month"
              id="endMonth"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          {/* Group By */}
          <div>
            <label htmlFor="groupBy" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Group By
            </label>
            <select
              id="groupBy"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="employee">Employee</option>
              <option value="department">Department</option>
              <option value="division">Division</option>
              <option value="month">Month</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="search"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Deductions */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Deductions</p>
                <p className="mt-1 text-2xl font-bold text-red-900 dark:text-red-100">
                  ₹{formatCurrency(summary.totalDeductions)}
                </p>
              </div>
              <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/40">
                <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </div>

          {/* Total Employees */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Employees</p>
                <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {summary.totalEmployees}
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/40">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          {/* Months Analyzed */}
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-sm dark:border-purple-800 dark:bg-purple-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Months Analyzed</p>
                <p className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {summary.monthsAnalyzed}
                </p>
              </div>
              <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900/40">
                <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>

          {/* Average per Employee */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Avg per Employee</p>
                <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
                  ₹{formatCurrency(summary.totalEmployees > 0 ? summary.totalDeductions / summary.totalEmployees : 0)}
                </p>
              </div>
              <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/40">
                <Building2 className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deduction Types Breakdown - Categorized */}
      {summary && Object.keys(summary.deductionTypes).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
            Deduction Types Breakdown
          </h3>

          {/* Categorize deductions */}
          {(() => {
            const statutory: [string, number][] = [];
            const attendance: [string, number][] = [];
            const other: [string, number][] = [];

            Object.entries(summary.deductionTypes).forEach(([type, amount]) => {
              const category = categorizeDeductionType(type);
              if (category === 'statutory') statutory.push([type, amount]);
              else if (category === 'attendance') attendance.push([type, amount]);
              else other.push([type, amount]);
            });

            return (
              <div className="space-y-6">
                {/* Statutory Deductions */}
                {statutory.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full bg-indigo-600" />
                      Statutory Deductions
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {statutory.sort(([, a], [, b]) => b - a).map(([type, amount]) => (
                        <div
                          key={type}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-900/20"
                        >
                          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                            {getDeductionTypeLabel(type)}
                          </p>
                          <p className="mt-1 text-lg font-bold text-indigo-900 dark:text-indigo-100">
                            ₹{formatCurrency(amount)}
                          </p>
                          <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                            {summary.totalDeductions > 0 ? ((amount / summary.totalDeductions) * 100).toFixed(1) : '0.0'}% of total
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attendance Deductions */}
                {attendance.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full bg-amber-600" />
                      Attendance Deductions
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {attendance.sort(([, a], [, b]) => b - a).map(([type, amount]) => (
                        <div
                          key={type}
                          className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
                        >
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            {getDeductionTypeLabel(type)}
                          </p>
                          <p className="mt-1 text-lg font-bold text-amber-900 dark:text-amber-100">
                            ₹{formatCurrency(amount)}
                          </p>
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            {summary.totalDeductions > 0 ? ((amount / summary.totalDeductions) * 100).toFixed(1) : '0.0'}% of total
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Deductions */}
                {other.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full bg-rose-600" />
                      Other Deductions
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {other.sort(([, a], [, b]) => b - a).map(([type, amount]) => (
                        <div
                          key={type}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20"
                        >
                          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                            {getDeductionTypeLabel(type)}
                          </p>
                          <p className="mt-1 text-lg font-bold text-rose-900 dark:text-rose-100">
                            ₹{formatCurrency(amount)}
                          </p>
                          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                            {summary.totalDeductions > 0 ? ((amount / summary.totalDeductions) * 100).toFixed(1) : '0.0'}% of total
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Data Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Loading deductions analytics...</p>
              </div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400">No deductions data found for the selected period.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                <tr>
                  {groupBy === 'employee' && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Department
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Division
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Employee Group
                      </th>
                    </>
                  )}
                  {groupBy === 'department' && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Department
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Division
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Employees
                      </th>
                    </>
                  )}
                  {groupBy === 'division' && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Division
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Departments
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Employees
                      </th>
                    </>
                  )}
                  {groupBy === 'month' && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Month
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Employees
                      </th>
                    </>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Total Deductions
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Top Deduction Types
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {filteredData.map((item, index) => (
                  <tr key={index} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {groupBy === 'employee' && (
                      <>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="min-w-0">
                            <div className="font-semibold truncate text-slate-900 dark:text-white text-sm">
                              {item.employeeName || 'N/A'}
                            </div>
                            {item.empNo && (
                              <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">
                                {item.empNo}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {item.department || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {item.division || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {item.employeeGroup || 'N/A'}
                        </td>
                      </>
                    )}
                    {groupBy === 'department' && (
                      <>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                          {item.departmentName || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {item.division || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                          {item.employeeCount || 0}
                        </td>
                      </>
                    )}
                    {groupBy === 'division' && (
                      <>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                          {item.divisionName || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                          {item.departmentCount || 0}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                          {item.employeeCount || 0}
                        </td>
                      </>
                    )}
                    {groupBy === 'month' && (
                      <>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                          {item.month ? new Date(item.month + '-01').toLocaleDateString('en-IN', { year: 'numeric', month: 'long' }) : 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                          {item.employeeCount || 0}
                        </td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                        ₹{formatCurrency(item.totalDeductions)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                      {item.transactionCount}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(item.deductionsByType)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3)
                          .map(([type, amount]) => (
                            <span
                              key={type}
                              className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              title={`${getDeductionTypeLabel(type)}: ₹${formatCurrency(amount)}`}
                            >
                              {getDeductionTypeLabel(type).split(' ')[0]}
                            </span>
                          ))}
                        {Object.keys(item.deductionsByType).length > 3 && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                            +{Object.keys(item.deductionsByType).length - 3}
                          </span>
                        )}
                      </div>
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

// Made with Bob
