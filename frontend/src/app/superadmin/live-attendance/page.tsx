'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiUsers, FiCheckCircle, FiClock, FiFilter, FiCalendar, FiRefreshCw } from 'react-icons/fi';
import { auth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface Employee {
  id: string;
  empNo: string;
  name: string;
  department: string;
  designation: string;
  division: string;
  shift: string;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  inTime: string;
  outTime: string | null;
  status: string;
  date: string;
  hoursWorked: number;
  isLate: boolean;
  lateMinutes: number;
  isEarlyOut: boolean;
  earlyOutMinutes: number;
  otHours: number;
  extraHours: number;
}

interface ReportData {
  date: string;
  summary: {
    currentlyWorking: number;
    completedShift: number;
    totalEmployees: number;
  };
  currentlyWorking: Employee[];
  completedShift: Employee[];
}

interface FilterOption {
  id: string;
  name: string;
}

export default function LiveAttendancePage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [shifts, setShifts] = useState<FilterOption[]>([]);
  const [selectedDiv, setSelectedDiv] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedShift, setSelectedShift] = useState('');

  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
      const token = auth.getToken();
      const response = await fetch(`${API_URL}/attendance/reports/live/filters`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const result = await response.json();
        setDivisions(result.data.divisions);
        setDepartments(result.data.departments);
        setShifts(result.data.shifts);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  // Fetch report data
  const fetchReportData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedDiv) params.append('division', selectedDiv);
      if (selectedDept) params.append('department', selectedDept);
      if (selectedShift) params.append('shift', selectedShift);

      const token = auth.getToken();
      const response = await fetch(`${API_URL}/attendance/reports/live?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const result = await response.json();
        setReportData(result.data);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDiv, selectedDept, selectedShift]);

  // Initial data fetch
  useEffect(() => {
    fetchFilterOptions();
    fetchReportData();
  }, [fetchReportData]);

  // Auto-refresh every minute for live updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReportData();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [fetchReportData]);

  // Format time
  const formatTime = (dateTimeString: string | null) => {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Format hours worked
  const formatHoursWorked = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Sort employees
  const sortEmployees = (employees: Employee[]) => {
    return [...employees].sort((a, b) => {
      const timeA = new Date(a.inTime).getTime();
      const timeB = new Date(b.inTime).getTime();
      return sortBy === 'latest' ? timeB - timeA : timeA - timeB;
    });
  };

  // Get yesterday's date
  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Live Attendance Report
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Real-time attendance tracking and monitoring
            </p>
          </div>
          <button
            onClick={fetchReportData}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-600"
          >
            <FiRefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Date Selection and Filters */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            {/* Date Selection */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${selectedDate === new Date().toISOString().split('T')[0]
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
              >
                Today
              </button>
              <button
                onClick={() => setSelectedDate(getYesterday())}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${selectedDate === getYesterday()
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
              >
                Yesterday
              </button>
              <div className="relative">
                <FiCalendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
            >
              <FiFilter className="h-4 w-4" />
              Filters
            </button>
          </div>

          {/* Filters Dropdown */}
          {showFilters && (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Division
                </label>
                <select
                  value={selectedDiv}
                  onChange={(e) => setSelectedDiv(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                >
                  <option value="">All Divisions</option>
                  {divisions.map((div) => (
                    <option key={div.id} value={div.id}>
                      {div.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Department
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Shift
                </label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                >
                  <option value="">All Shifts</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {reportData && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6 shadow-sm dark:border-slate-700 dark:from-blue-900/20 dark:to-blue-800/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    Total Employees
                  </p>
                  <p className="mt-2 text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {reportData.summary.totalEmployees}
                  </p>
                </div>
                <FiUsers className="h-12 w-12 text-blue-500 opacity-50" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-green-50 to-green-100 p-6 shadow-sm dark:border-slate-700 dark:from-green-900/20 dark:to-green-800/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Currently Working
                  </p>
                  <p className="mt-2 text-3xl font-bold text-green-900 dark:text-green-100">
                    {reportData.summary.currentlyWorking}
                  </p>
                </div>
                <FiClock className="h-12 w-12 text-green-500 opacity-50" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-purple-50 to-purple-100 p-6 shadow-sm dark:border-slate-700 dark:from-purple-900/20 dark:to-purple-800/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400">
                    Completed Shift
                  </p>
                  <p className="mt-2 text-3xl font-bold text-purple-900 dark:text-purple-100">
                    {reportData.summary.completedShift}
                  </p>
                </div>
                <FiCheckCircle className="h-12 w-12 text-purple-500 opacity-50" />
              </div>
            </div>
          </div>
        )}

        {/* Currently Working Table */}
        {reportData && reportData.currentlyWorking.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Currently Working ({reportData.currentlyWorking.length})
              </h2>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="latest">Latest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Emp No
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Designation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Division
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      In Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Hours Worked
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {sortEmployees(reportData.currentlyWorking).map((employee) => (
                    <tr
                      key={employee.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                        {employee.empNo}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        {employee.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {employee.department}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {employee.designation}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {employee.division}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatTime(employee.inTime)}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {formatHoursWorked(employee.hoursWorked)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {employee.isLate && (
                            <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              Late: {employee.lateMinutes}m
                            </span>
                          )}
                          {employee.otHours > 0 && (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              OT: {employee.otHours.toFixed(1)}h
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completed Shift Table */}
        {reportData && reportData.completedShift.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 p-4 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Completed Shift ({reportData.completedShift.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Emp No
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Designation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      In Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Out Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Hours Worked
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {reportData.completedShift.map((employee) => (
                    <tr
                      key={employee.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                        {employee.empNo}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        {employee.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {employee.department}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {employee.designation}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatTime(employee.inTime)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400">
                        {formatTime(employee.outTime)}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {formatHoursWorked(employee.hoursWorked)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {employee.isLate && (
                            <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              Late: {employee.lateMinutes}m
                            </span>
                          )}
                          {employee.isEarlyOut && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Early: {employee.earlyOutMinutes}m
                            </span>
                          )}
                          {employee.otHours > 0 && (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              OT: {employee.otHours.toFixed(1)}h
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {reportData && reportData.currentlyWorking.length === 0 && reportData.completedShift.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-slate-600 dark:text-slate-400">
              No attendance records found for the selected date and filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
