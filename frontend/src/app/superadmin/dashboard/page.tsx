'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  totalDepartments: number;
  totalUsers: number;
  todayPresent: number;
  todayAbsent: number;
  todayOnLeave: number;
  todayODs: number;
  yesterdayPresent: number;
  yesterdayAbsent: number;
  yesterdayOnLeave: number;
  yesterdayODs: number;
  pendingLeaves: number;
  pendingODs: number;
  pendingPermissions: number;
  monthlyPresent: number;
  monthlyAbsent: number;
  monthlyLeaves: number;
  attendanceRate: number;
  leaveUtilization: number;
  departmentLeaveDistribution: Record<string, number>;
  departmentODDistribution: Record<string, number>;
}

interface DashboardCardProps {
  title: string;
  value: string | number;
  description: React.ReactNode;
  change?: string;
  statusBadge?: React.ReactNode;
}

const DashboardCard = ({ title, value, description, change, statusBadge }: DashboardCardProps) => (
  <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-2.5 md:p-4 hover:bg-bg-surface/80 transition shadow-sm">
    <div className="flex justify-between items-center mb-1.5 md:mb-2 gap-2">
      <p className="text-xs md:text-sm font-medium text-text-primary truncate">{title}</p>
      {statusBadge && (
        <span className="text-[10px] md:text-xs bg-accent/15 text-accent px-1.5 py-0.5 md:px-2 md:py-0.5 rounded font-medium shrink-0">
          {statusBadge}
        </span>
      )}
    </div>

    <div className="flex flex-col gap-0.5 md:gap-1">
      <p className="text-lg md:text-2xl font-bold text-text-primary mb-0.5 md:mb-1 truncate">{value}</p>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] md:text-xs text-text-secondary font-normal truncate">{description}</p>
        {change && <span className="text-[9px] md:text-[10px] text-text-secondary shrink-0">{change}</span>}
      </div>
    </div>
  </div>
);

const DEFAULT_STATS: DashboardStats = {
  totalEmployees: 0,
  activeEmployees: 0,
  totalDepartments: 0,
  totalUsers: 0,
  todayPresent: 0,
  todayAbsent: 0,
  todayOnLeave: 0,
  todayODs: 0,
  yesterdayPresent: 0,
  yesterdayAbsent: 0,
  yesterdayOnLeave: 0,
  yesterdayODs: 0,
  pendingLeaves: 0,
  pendingODs: 0,
  pendingPermissions: 0,
  monthlyPresent: 0,
  monthlyAbsent: 0,
  monthlyLeaves: 0,
  attendanceRate: 0,
  leaveUtilization: 0,
  departmentLeaveDistribution: {},
  departmentODDistribution: {},
};

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [currentDate] = useState(new Date());
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setConnectionError(null);
      const res = await api.getDashboardAnalytics();
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setStats(DEFAULT_STATS);
        const msg = (res as { message?: string }).message || '';
        const isNetworkError = msg.includes('connect to server') || msg.includes('network') || msg.includes('Failed to fetch');
        if (isNetworkError || !res.success) {
          setConnectionError(msg || 'Could not load dashboard. Ensure the backend is running (e.g. port 5000).');
        }
      }
    } catch (err) {
      setStats(DEFAULT_STATS);
      setConnectionError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  // Get top departments for leaves and ODs
  const topLeaveDepartments = stats?.departmentLeaveDistribution
    ? Object.entries(stats.departmentLeaveDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ')
    : 'None';

  const topODDepartments = stats?.departmentODDistribution
    ? Object.entries(stats.departmentODDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ')
    : 'None';

  const KPICards = [
    {
      title: 'Today Present',
      value: stats?.todayPresent || 0,
      change: `${stats?.todayAbsent || 0} absent`,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: 'from-green-500 to-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'On Leave Today',
      value: stats?.todayOnLeave || 0,
      change: 'Approved leaves',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      title: 'On OD Today',
      value: stats?.todayODs || 0,
      change: 'Approved ODs',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Total Employees',
      value: stats?.activeEmployees ?? 0,
      change: (() => {
        const total = stats?.totalEmployees ?? 0;
        const active = stats?.activeEmployees ?? 0;
        const inactive = Math.max(0, total - active);
        return (
          <span className="text-orange-500 dark:text-orange-400 font-medium text-[10px] md:text-xs">{inactive} inactive</span>
        );
      })(),
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'from-indigo-500 to-purple-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    },
    {
      title: 'Attendance Rate',
      value: `${(stats?.attendanceRate || 0).toFixed(1)}%`,
      change: 'This month',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-purple-500 to-red-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      title: 'Leave Distribution',
      value: Object.keys(stats?.departmentLeaveDistribution || {}).length || 0,
      change: topLeaveDepartments || 'No leaves',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-red-500 to-red-500',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      title: 'OD Distribution',
      value: Object.keys(stats?.departmentODDistribution || {}).length || 0,
      change: topODDepartments || 'No ODs',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'from-green-500 to-cyan-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'Pending Approvals',
      value: (stats?.pendingLeaves || 0) + (stats?.pendingODs || 0),
      change: `${stats?.pendingLeaves || 0} leaves, ${stats?.pendingODs || 0} ODs`,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1920px] ">
        {connectionError && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">{connectionError}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setConnectionError(null); loadDashboardData(); }}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-medium"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setConnectionError(null)}
                className="rounded-lg border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Dashboard</h1>
            <p className="mt-1 text-xs text-text-secondary font-normal">Overview of your HRMS </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-text-secondary bg-bg-surface/50 px-3 py-1.5 rounded-full border border-border-base backdrop-blur-sm">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* KPI Cards Grid */}
        {loading ? (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-border-base bg-white dark:bg-bg-surface/50 backdrop-blur p-4">
                <div className="h-3.5 w-1/2 bg-gray-200 dark:bg-white/5 rounded"></div>
                <div className="mt-3 h-7 w-1/3 bg-gray-200 dark:bg-white/5 rounded"></div>
                <div className="mt-2 h-2.5 w-2/5 bg-gray-200 dark:bg-white/5 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KPICards.map((card, index) => (
              <DashboardCard
                key={index}
                title={card.title}
                value={card.value}
                description={typeof card.change === 'string' ? card.change : card.change}
                statusBadge={
                  (typeof card.change === 'string' && (card.change.includes('absent') || card.change.includes('No'))) ? (
                    null
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      Active
                    </span>
                  )
                }
              />
            ))}
          </div>
        )}

        {/* Analytics and Recent Activities Row */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Yesterday's Stats */}
          <div className="lg:col-span-2 space-y-3.5">
            <h2 className="text-base font-semibold tracking-tight text-text-primary">Yesterday's Overview</h2>
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse rounded-xl border border-border-base bg-white dark:bg-bg-surface/50 backdrop-blur p-2.5 md:p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="h-3.5 md:h-5 w-12 md:w-16 bg-gray-200 dark:bg-white/5 rounded mb-1 md:mb-2"></div>
                        <div className="h-2 md:h-2.5 w-16 md:w-24 bg-gray-200 dark:bg-white/5 rounded"></div>
                      </div>
                      <div className="h-5 w-5 md:h-7 md:w-7 bg-gray-200 dark:bg-white/5 rounded-lg"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border-base bg-white dark:bg-bg-surface/70 backdrop-blur p-2.5 md:p-4 hover:bg-gray-50 dark:hover:bg-bg-surface/80 transition shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-base md:text-lg font-bold text-text-primary tracking-tight truncate">{stats?.yesterdayPresent || 0}</h5>
                      <p className="text-[10px] md:text-sm font-medium text-text-primary mt-1 truncate">Present</p>
                      <p className="mt-0.5 text-[9px] md:text-xs text-text-secondary font-normal truncate">Employees</p>
                    </div>
                    <div className="rounded bg-status-positive/15 p-1 md:p-1.5 text-status-positive shrink-0">
                      <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border-base bg-white dark:bg-bg-surface/70 backdrop-blur p-2.5 md:p-4 hover:bg-gray-50 dark:hover:bg-bg-surface/80 transition shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-base md:text-lg font-bold text-text-primary tracking-tight truncate">{stats?.yesterdayAbsent || 0}</h5>
                      <p className="text-[10px] md:text-sm font-medium text-text-primary mt-1 truncate">Absent</p>
                      <p className="mt-0.5 text-[9px] md:text-xs text-text-secondary font-normal truncate">Employees</p>
                    </div>
                    <div className="rounded bg-status-negative/15 p-1 md:p-1.5 text-status-negative shrink-0">
                      <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border-base bg-white dark:bg-bg-surface/70 backdrop-blur p-2.5 md:p-4 hover:bg-gray-50 dark:hover:bg-bg-surface/80 transition shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-base md:text-lg font-bold text-text-primary tracking-tight truncate">{stats?.yesterdayOnLeave || 0}</h5>
                      <p className="text-[10px] md:text-sm font-medium text-text-primary mt-1 truncate">Leaves</p>
                      <p className="mt-0.5 text-[9px] md:text-xs text-text-secondary font-normal truncate">Approved</p>
                    </div>
                    <div className="rounded bg-status-warning/15 p-1 md:p-1.5 text-status-warning shrink-0">
                      <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border-base bg-white dark:bg-bg-surface/70 backdrop-blur p-2.5 md:p-4 hover:bg-gray-50 dark:hover:bg-bg-surface/80 transition shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-base md:text-lg font-bold text-text-primary tracking-tight truncate">{stats?.yesterdayODs || 0}</h5>
                      <p className="text-[10px] md:text-sm font-medium text-text-primary mt-1 truncate">ODs</p>
                      <p className="mt-0.5 text-[9px] md:text-xs text-text-secondary font-normal truncate">Approved</p>
                    </div>
                    <div className="rounded bg-blue-500/15 p-1 md:p-1.5 text-blue-500 shrink-0"> {/* OD uses blue by convention if needed, or map to warning/info */}
                      <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Activities Live Feed */}

        </div>

        {/* Quick Stats Row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 hover:bg-bg-surface/80 transition shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Pending Leaves</p>
                <p className="mt-3 text-2xl font-bold text-text-primary">{stats?.pendingLeaves || 0}</p>
              </div>
              <div className="rounded bg-status-warning/15 p-1.5 text-status-warning">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 hover:bg-bg-surface/80 transition shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Pending ODs</p>
                <p className="mt-3 text-2xl font-bold text-text-primary">{stats?.pendingODs || 0}</p>
              </div>
              <div className="rounded bg-blue-500/15 p-1.5 text-blue-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 hover:bg-bg-surface/80 transition shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Pending Permissions</p>
                <p className="mt-3 text-2xl font-bold text-text-primary">{stats?.pendingPermissions || 0}</p>
              </div>
              <div className="rounded bg-purple-500/15 p-1.5 text-purple-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 hover:bg-bg-surface/80 transition shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Monthly Leaves</p>
                <p className="mt-3 text-2xl font-bold text-text-primary">{stats?.monthlyLeaves || 0}</p>
              </div>
              <div className="rounded bg-status-positive/15 p-1.5 text-status-positive">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
