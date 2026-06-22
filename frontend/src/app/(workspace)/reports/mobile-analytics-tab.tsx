'use client';

import { useState, useEffect } from 'react';
import { Loader2, Calendar, Download, AlertCircle, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface MobileSessionRow {
  date: string;
  emp_no: string;
  userName: string;
  mobileLogins: number;
  totalSessions: number;
  totalDurationSeconds: number;
  totalDurationFormatted: string;
  dailyActiveUsers: number;
}

interface DailySummary {
  date: string;
  activeUsers: number;
}

interface ReportData {
  fromDate: string;
  toDate: string;
  totalRows: number;
  dailySummary: DailySummary[];
  rows: MobileSessionRow[];
}

export default function MobileAnalyticsTab() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MobileSessionRow[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);

  // Filter states
  const [fromDate, setFromDate] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().format('YYYY-MM-DD'));

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Display state
  const [sortBy, setSortBy] = useState<'date' | 'duration' | 'logins' | 'sessions'>('date');
  const [sortDesc, setSortDesc] = useState(true);

  // Summary stats
  const [totalDaysCovered, setTotalDaysCovered] = useState(0);
  const [avgDailyUsers, setAvgDailyUsers] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);

  // Fetch report data
  const fetchReport = async () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both dates');
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      toast.error('Start date must be before end date');
      return;
    }

    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        fromDate,
        toDate,
        page: page.toString(),
        limit: limit.toString(),
      });

      const response = await fetch(
        `/api/mobile-analytics/report/summary?${queryParams}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Unauthorized. Please log in again.');
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        const data = result.data as ReportData;
        setRows(data.rows || []);
        setDailySummary(data.dailySummary || []);
        setTotalCount(data.totalRows || 0);

        // Calculate summary stats
        if (data.dailySummary && data.dailySummary.length > 0) {
          setTotalDaysCovered(data.dailySummary.length);
          const avgUsers = Math.round(
            data.dailySummary.reduce((sum, d) => sum + d.activeUsers, 0) /
              data.dailySummary.length
          );
          setAvgDailyUsers(avgUsers);
        }

        const totalSess = data.rows.reduce((sum, r) => sum + r.totalSessions, 0);
        setTotalSessions(totalSess);

        if (data.rows && data.rows.length > 0) {
          toast.success(`Loaded ${data.rows.length} records`);
        } else {
          toast.success('No data found for the selected date range');
        }
      } else {
        toast.error(result.message || 'Failed to fetch report');
      }
    } catch (error) {
      console.error('Report fetch error:', error);
      toast.error('Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchReport();
  }, []);

  // Sort data
  const sortedRows = [...rows].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortBy) {
      case 'date':
        aVal = a.date;
        bVal = b.date;
        break;
      case 'duration':
        aVal = a.totalDurationSeconds;
        bVal = b.totalDurationSeconds;
        break;
      case 'logins':
        aVal = a.mobileLogins;
        bVal = b.mobileLogins;
        break;
      case 'sessions':
        aVal = a.totalSessions;
        bVal = b.totalSessions;
        break;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    return sortDesc ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
  });

  // Paginate
  const paginatedRows = sortedRows.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(totalCount / limit);

  // Export to CSV
  const handleExport = () => {
    if (rows.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Date', 'Employee', 'Name', 'Mobile Logins', 'Sessions', 'Total Time'];
    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.date,
          r.emp_no,
          r.userName,
          r.mobileLogins,
          r.totalSessions,
          r.totalDurationFormatted,
        ]
          .map((field) => {
            // Escape quotes and wrap in quotes if contains comma
            const str = String(field || '');
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `mobile-app-usage-${fromDate}_to_${toDate}_${new Date().getTime()}.csv`
    );
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Report exported successfully');
  };

  return (
    <div className="w-full space-y-4">
      {/* Filters & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
        <div className="flex flex-col gap-4">
          {/* Date Range Picker */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={() => fetchReport()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Load Report
                </>
              )}
            </button>
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExport}
              disabled={rows.length === 0 || loading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-emerald-400 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export to CSV
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {(totalDaysCovered > 0 || avgDailyUsers > 0 || totalSessions > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  Days with Activity
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {totalDaysCovered}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  Avg Daily Active Users
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {avgDailyUsers}
                </p>
              </div>
              <Users className="h-8 w-8 text-emerald-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  Total Sessions
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {totalSessions}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-20" />
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {paginatedRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">
                      <button
                        onClick={() => {
                          if (sortBy === 'date') setSortDesc(!sortDesc);
                          else setSortBy('date');
                        }}
                        className="hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        Date {sortBy === 'date' && (sortDesc ? '▼' : '▲')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Emp #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">
                      Employee Name
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                      <button
                        onClick={() => {
                          if (sortBy === 'logins') setSortDesc(!sortDesc);
                          else setSortBy('logins');
                        }}
                        className="hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        Mobile Logins {sortBy === 'logins' && (sortDesc ? '▼' : '▲')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                      <button
                        onClick={() => {
                          if (sortBy === 'sessions') setSortDesc(!sortDesc);
                          else setSortBy('sessions');
                        }}
                        className="hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        Sessions {sortBy === 'sessions' && (sortDesc ? '▼' : '▲')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      <button
                        onClick={() => {
                          if (sortBy === 'duration') setSortDesc(!sortDesc);
                          else setSortBy('duration');
                        }}
                        className="hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        Total Time {sortBy === 'duration' && (sortDesc ? '▼' : '▲')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, idx) => (
                    <tr
                      key={`${row.date}-${row.emp_no}-${idx}`}
                      className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">
                        {row.date}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-mono text-xs">
                        {row.emp_no}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {row.userName}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                          {row.mobileLogins}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                          {row.totalSessions}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-semibold">
                        {row.totalDurationFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of{' '}
                  {totalCount} records
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm font-semibold rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 text-sm font-semibold rounded border transition-colors ${
                            page === pageNum
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-sm font-semibold rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              {loading ? 'Loading data...' : 'No data found for the selected date range'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
