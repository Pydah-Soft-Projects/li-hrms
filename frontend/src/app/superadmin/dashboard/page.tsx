'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type InAppNotification } from '@/lib/api';
import { Calendar, Bell, BellRing, X, CheckCheck } from 'lucide-react';
import { useSocket } from '@/contexts/SocketContext';

interface WeeklyDay {
  label: string;
  date: string;
  present: number;
  leave: number;
  od: number;
}

interface DivisionAttendance {
  name: string;
  present: number;
  total: number;
  rate: number;
}

interface OnLeaveRow {
  id: string;
  name: string;
  empNo: string;
  leaveType: string;
  daysLeft: number;
  photo: string | null;
}

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
  pendingApplications: number;
  pendingSalaryVerification?: number;
  monthlyPresent: number;
  monthlyAbsent: number;
  monthlyLeaves: number;
  attendanceRate: number;
  leaveUtilization: number;
  departmentLeaveDistribution: Record<string, number>;
  departmentODDistribution: Record<string, number>;
  newEmployeesThisMonth?: number;
  newEmployeesLastMonth?: number;
  resignedThisMonth?: number;
  resignedLastMonth?: number;
  trendNewEmployeesPct?: number;
  trendResignedPct?: number;
  trendOnLeavePct?: number;
  trendApplicationsPct?: number;
  weeklyTracker?: WeeklyDay[];
  divisionAttendanceToday?: DivisionAttendance[];
  onLeaveEmployeesList?: OnLeaveRow[];
  presentRateToday?: number;
  presentRateYesterday?: number;
  performanceDeltaVsYesterday?: number;
  /** IST calendar date (YYYY-MM-DD) used for all analytics queries — use for attendance list */
  analyticsDateStr?: string;
  trackerPeriod?: string;
}

interface BirthdayItem {
  id: string;
  name: string;
  dateLabel: string;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextBirthdayFromDob(dob: Date, from: Date): Date {
  const m = dob.getMonth();
  const day = dob.getDate();
  let y = from.getFullYear();
  let next = new Date(y, m, day);
  next.setHours(0, 0, 0, 0);
  if (next < from) next = new Date(y + 1, m, day);
  return next;
}

function buildUpcomingBirthdays(employees: any[], daysAhead: number): BirthdayItem[] {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const until = new Date(from);
  until.setDate(until.getDate() + daysAhead);
  const raw: (BirthdayItem & { sort: number })[] = [];
  for (const emp of employees) {
    if (!emp?.dob) continue;
    const dob = new Date(emp.dob);
    if (Number.isNaN(dob.getTime())) continue;
    const next = nextBirthdayFromDob(dob, from);
    if (next >= from && next <= until) {
      raw.push({
        id: String(emp._id || emp.emp_no),
        name: emp.employee_name || emp.emp_no || 'Employee',
        dateLabel: next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sort: next.getTime(),
      });
    }
  }
  raw.sort((a, b) => a.sort - b.sort);
  return raw.map(({ sort: _s, ...rest }) => rest);
}

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
  pendingApplications: 0,
  pendingSalaryVerification: 0,
  monthlyPresent: 0,
  monthlyAbsent: 0,
  monthlyLeaves: 0,
  attendanceRate: 0,
  leaveUtilization: 0,
  departmentLeaveDistribution: {},
  departmentODDistribution: {},
  newEmployeesThisMonth: 0,
  newEmployeesLastMonth: 0,
  resignedThisMonth: 0,
  resignedLastMonth: 0,
  trendNewEmployeesPct: 0,
  trendResignedPct: 0,
  trendOnLeavePct: 0,
  trendApplicationsPct: 0,
  weeklyTracker: [],
  divisionAttendanceToday: [],
  onLeaveEmployeesList: [],
  presentRateToday: 0,
  presentRateYesterday: 0,
  performanceDeltaVsYesterday: 0,
};

export default function SuperAdminDashboard() {
  const { socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayItem[]>([]);
  const [trackerPeriod, setTrackerPeriod] = useState<'week' | 'month' | 'lastMonth'>('week');
  const [barDetail, setBarDetail] = useState<null | { kind: 'tracker'; day: WeeklyDay }>(null);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fallbackDateStr = useMemo(() => formatYmd(new Date()), []);
  const displayDateStr = stats.analyticsDateStr || fallbackDateStr;

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setConnectionError(null);
      const res = await api.getDashboardAnalytics(trackerPeriod);
      let attendanceDate = fallbackDateStr;

      if (res.success && res.data) {
        const merged = { ...DEFAULT_STATS, ...res.data };
        setStats(merged);
        if (res.data.analyticsDateStr) attendanceDate = res.data.analyticsDateStr;
      } else {
        setStats(DEFAULT_STATS);
        const msg = (res as { message?: string }).message || '';
        const isNetworkError =
          msg.includes('connect to server') || msg.includes('network') || msg.includes('Failed to fetch');
        if (isNetworkError || !res.success) {
          setConnectionError(msg || 'Could not load dashboard. Ensure the backend is running (e.g. port 5000).');
        }
      }

      const empRes = await api.getEmployees({ includeLeft: false, limit: 10000, page: 1 });

      if (empRes?.success && Array.isArray(empRes.data)) {
        setUpcomingBirthdays(buildUpcomingBirthdays(empRes.data, 7));
      } else {
        setUpcomingBirthdays([]);
      }

    } catch (err) {
      setStats(DEFAULT_STATS);
      setConnectionError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
      setUpcomingBirthdays([]);
    } finally {
      setLoading(false);
    }
  }, [trackerPeriod, fallbackDateStr]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setNotificationLoading(true);
        const [listRes, countRes] = await Promise.all([
          api.getNotifications({ page: 1, limit: 25 }),
          api.getNotificationUnreadCount(),
        ]);
        if (listRes?.success) setNotifications(listRes.data || []);
        if (countRes?.success) {
          setUnreadCount(Number(countRes.unreadCount ?? countRes.data?.unreadCount ?? 0));
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setNotificationLoading(false);
      }
    };
    loadNotifications();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNew = (n: InAppNotification) => {
      setNotifications((prev) => [n, ...prev].slice(0, 25));
      if (!n.isRead) setUnreadCount((c) => c + 1);
    };
    const onCount = (payload: { unreadCount: number }) => {
      setUnreadCount(Number(payload?.unreadCount || 0));
    };
    socket.on('in_app_notification', onNew);
    socket.on('notification_unread_count', onCount);
    return () => {
      socket.off('in_app_notification', onNew);
      socket.off('notification_unread_count', onCount);
    };
  }, [socket]);

  const markOneRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const weekly = stats.weeklyTracker?.length ? stats.weeklyTracker : DEFAULT_STATS.weeklyTracker!;
  const maxStack = Math.max(...weekly.map((d) => d.present + d.leave + d.od), 1);

  const divisionsList = stats.divisionAttendanceToday?.length ? stats.divisionAttendanceToday : [];
  const inactiveEmployees = Math.max(0, (stats.totalEmployees ?? 0) - (stats.activeEmployees ?? 0));
  const trackerDense = trackerPeriod !== 'week';

  return (
    <div className="relative min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="relative z-10 mx-auto max-w-[1920px] px-3 pb-10 pt-2 sm:px-4">
        {connectionError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm text-amber-900 dark:text-amber-200">{connectionError}</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConnectionError(null);
                  loadDashboardData();
                }}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setConnectionError(null)}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Dashboard</h1>
            <p className="mt-1 text-sm font-normal text-[#7E7E7E] dark:text-zinc-400">
              Super admin overview — attendance, people, and applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-[#7E7E7E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
            <button
              onClick={() => setNotificationPanelOpen(true)}
              className={`relative h-9 w-9 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center ${
                unreadCount > 0 ? 'animate-bell-wrap-pulse' : ''
              }`}
              aria-label="Open notifications"
            >
              {unreadCount > 0 ? (
                <BellRing className="h-4 w-4 animate-bell-ring" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
          {/* Main column */}
          <div className="space-y-5">
            {/* Compact KPIs + Employee tracker */}
            <div className="overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {loading ? (
                <div className="flex min-h-[240px] animate-pulse flex-col lg:flex-row">
                  <div className="grid flex-1 grid-cols-2 gap-px bg-zinc-100 p-px dark:bg-zinc-800">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-white p-3 dark:bg-zinc-900">
                        <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                        <div className="mt-2 h-6 w-14 bg-zinc-100 dark:bg-zinc-800" />
                      </div>
                    ))}
                  </div>
                  <div className="min-h-[200px] flex-1 border-t border-zinc-100 p-4 dark:border-zinc-800 lg:border-l lg:border-t-0">
                    <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800" />
                    <div className="mt-6 flex h-32 items-end gap-2">
                      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div key={i} className="flex-1 rounded-t bg-zinc-100 dark:bg-zinc-800" style={{ height: `${16 + i * 6}px` }} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row">
                  <div className="grid flex-1 grid-cols-2 gap-px bg-zinc-100 p-px dark:bg-zinc-800 sm:grid-cols-3">
                    {[
                      {
                        title: 'Total Employees',
                        value: stats.totalEmployees ?? 0,
                        iconBg: 'bg-amber-100 dark:bg-amber-950/50',
                        icon: (
                          <svg className="h-4 w-4 text-[#FFB800]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        ),
                      },
                      {
                        title: 'Active Employees',
                        value: stats.activeEmployees ?? 0,
                        iconBg: 'bg-sky-100 dark:bg-sky-950/50',
                        icon: (
                          <svg className="h-4 w-4 text-[#2D5BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        ),
                      },
                      {
                        title: 'Inactive Employees',
                        value: inactiveEmployees,
                        iconBg: 'bg-sky-100 dark:bg-sky-950/50',
                        icon: (
                          <svg className="h-4 w-4 text-[#00A3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        ),
                      },
                      {
                        title: 'New Hires (MTD)',
                        value: stats.newEmployeesThisMonth ?? 0,
                        iconBg: 'bg-pink-100 dark:bg-pink-950/40',
                        icon: (
                          <svg className="h-4 w-4 text-[#FF4D81]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        ),
                      },
                      {
                        title: 'Resigned (MTD)',
                        value: stats.resignedThisMonth ?? 0,
                        iconBg: 'bg-rose-100 dark:bg-rose-950/40',
                        icon: (
                          <svg className="h-4 w-4 text-[#FF4D81]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        ),
                      },
                      {
                        title: 'Pending Applications',
                        value: stats.pendingApplications ?? 0,
                        iconBg: 'bg-pink-100 dark:bg-pink-950/40',
                        icon: (
                          <svg className="h-4 w-4 text-[#FF4D81]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        ),
                      },
                    ].map((cell) => (
                      <div
                        key={cell.title}
                        className="flex items-center justify-between gap-2 bg-white px-3 py-2.5 dark:bg-zinc-900 sm:px-3.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-[#7E7E7E] dark:text-zinc-500">
                            {cell.title}
                          </p>
                          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-zinc-900 dark:text-white">
                            {cell.value}
                          </p>
                        </div>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${cell.iconBg}`}>
                          {cell.icon}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col border-t border-zinc-100 p-3 sm:p-4 dark:border-zinc-800 lg:border-l lg:border-t-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Employee Tracker</h2>
                      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="sr-only">Period</span>
                        <select
                          value={trackerPeriod}
                          onChange={(e) => setTrackerPeriod(e.target.value as 'week' | 'month' | 'lastMonth')}
                          className="rounded-lg border border-zinc-200 bg-white py-1.5 pl-2 pr-8 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          <option value="week">This week</option>
                          <option value="month">This month</option>
                          <option value="lastMonth">Last month</option>
                        </select>
                      </label>
                    </div>
                    <p className="mt-1 text-[10px] text-[#7E7E7E] dark:text-zinc-500">
                      {trackerPeriod === 'week' && 'Mon–Sun (IST) · click a bar for details'}
                      {trackerPeriod === 'month' && 'Each day MTD (IST) · scroll horizontally on small screens'}
                      {trackerPeriod === 'lastMonth' && 'Full previous calendar month (IST)'}
                    </p>
                    <div
                      className={
                        trackerDense
                          ? 'mt-4 flex max-w-full flex-1 items-end gap-0.5 overflow-x-auto pb-1 pt-1'
                          : 'mt-5 flex flex-1 items-end justify-between gap-1 sm:gap-2'
                      }
                    >
                      {weekly.map((day) => {
                        const total = day.present + day.leave + day.od;
                        const barPct = maxStack > 0 ? Math.max(8, (total / maxStack) * 100) : 8;
                        const flex = (n: number) => (total > 0 ? Math.max(n, 0.15) : 0.05);
                        return (
                          <button
                            key={`${day.date}-${day.label}`}
                            type="button"
                            className={
                              trackerDense
                                ? 'flex w-7 shrink-0 flex-col items-center gap-1 rounded-lg p-0.5 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-zinc-800/50'
                                : 'flex flex-1 flex-col items-center gap-1.5 rounded-xl p-1 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-zinc-800/50'
                            }
                            onClick={() => setBarDetail({ kind: 'tracker', day })}
                          >
                            <div
                              className={
                                trackerDense
                                  ? 'flex h-28 w-full max-w-[22px] flex-col justify-end'
                                  : 'flex h-36 w-full max-w-[40px] flex-col justify-end sm:h-44 sm:max-w-[48px]'
                              }
                            >
                              <div
                                className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                                style={{ height: `${barPct}%` }}
                              >
                                <div className="min-h-[2px] w-full bg-[#1e3a5f]" style={{ flex: flex(day.present) }} />
                                <div className="min-h-[2px] w-full bg-[#00A3FF]" style={{ flex: flex(day.leave) }} />
                                <div className="min-h-[2px] w-full bg-[#FFB800]" style={{ flex: flex(day.od) }} />
                              </div>
                            </div>
                            <span className="max-w-[2.25rem] truncate text-center text-[9px] font-medium text-[#7E7E7E] dark:text-zinc-500">
                              {day.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-center text-[10px] text-[#7E7E7E] dark:text-zinc-500">Click a bar for counts</p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-[#7E7E7E] dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-sm bg-[#1e3a5f]" /> Present
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-sm bg-[#00A3FF]" /> Leave
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-sm bg-[#FFB800]" /> OD
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { title: 'Pending Leaves', value: stats.pendingLeaves, dot: 'bg-amber-400' },
                { title: 'Pending ODs', value: stats.pendingODs, dot: 'bg-sky-500' },
                { title: 'Pending Permissions', value: stats.pendingPermissions, dot: 'bg-violet-500' },
                { title: 'Monthly attendance rate', value: `${(stats.attendanceRate || 0).toFixed(1)}%`, dot: 'bg-emerald-500' },
              ].map((q) => (
                <div
                  key={q.title}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${q.dot}`} />
                    <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{q.title}</span>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{q.value}</span>
                </div>
              ))}
            </div>

            {/* Onboarding & Verifications Group */}
            <div className="rounded-[16px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white">Onboarding & Verifications</h2>
                  <p className="text-[11px] text-[#7E7E7E] dark:text-zinc-500">Employee lifecycle status overview</p>
                </div>
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/40">
                  <svg className="h-5 w-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.040 12.02 12.02 0 00-1.131 10.141c.83 2.13 2.58 3.83 4.823 4.746L12 22l4.926-2.127c2.243-.916 3.992-2.616 4.823-4.746a12.02 12.02 0 00-1.131-10.141z" />
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7E7E7E] dark:text-zinc-500">Joined this month</span>
                  <span className="text-2xl font-black text-zinc-900 dark:text-white">{stats.newEmployeesThisMonth}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">New Hires</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100/50 dark:border-amber-900/30">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">Pending Verification</span>
                  <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.pendingApplications}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="text-[10px] font-medium text-amber-600/80">Awaiting HR Review</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 p-4 rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100/50 dark:border-sky-900/30">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-500">Salary Verification</span>
                  <span className="text-2xl font-black text-sky-600 dark:text-sky-400">{stats.pendingSalaryVerification}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                    <span className="text-[10px] font-medium text-sky-600/80">Pending Final Approval</span>
                  </div>
                </div>
              </div>
            </div>

            {/* All divisions — today (IST) */}
            <div className="overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Divisions attendance (today)</h2>
                <p className="mt-1 text-xs text-[#7E7E7E] dark:text-zinc-500">
                  Present includes partial · Date: {displayDateStr} (IST) · {divisionsList.length} division
                  {divisionsList.length === 1 ? '' : 's'}
                </p>
              </div>
              {loading ? (
                <div className="grid animate-pulse grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                  ))}
                </div>
              ) : divisionsList.length === 0 ? (
                <p className="p-6 text-sm text-zinc-500">No division assignment data for active employees.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {divisionsList.map((d, idx) => (
                    <div
                      key={`${d.name}-${idx}`}
                      className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-800/40"
                    >
                      <p className="line-clamp-2 text-sm font-bold text-zinc-900 dark:text-white" title={d.name}>
                        {d.name}
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
                        {d.rate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-[#7E7E7E] dark:text-zinc-400">
                        {d.present} / {d.total} present
                      </p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-sky-500 transition-all"
                          style={{ width: `${Math.min(100, d.rate)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <aside className="space-y-5">
            <div className="rounded-[16px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Upcoming birthdays</h2>
                <span className="text-xs font-medium text-[#7E7E7E] dark:text-zinc-400">Next 7 days</span>
              </div>
              {loading ? (
                <div className="mt-4 space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                  ))}
                </div>
              ) : upcomingBirthdays.length === 0 ? (
                <p className="mt-4 text-sm text-[#7E7E7E] dark:text-zinc-400">No birthdays in the next week.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {upcomingBirthdays.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/50"
                    >
                      <span className="font-semibold text-zinc-900 dark:text-white">{b.name}</span>
                      <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">{b.dateLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </aside>
        </div>

        {barDetail && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bar-detail-title"
            onClick={() => setBarDetail(null)}
            onKeyDown={(e) => e.key === 'Escape' && setBarDetail(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="bar-detail-title" className="text-lg font-bold text-zinc-900 dark:text-white">
                Employee tracker — day detail
              </h3>
              <div className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                <p>
                  <span className="font-semibold text-zinc-900 dark:text-white">{barDetail.day.label}</span>
                  <span className="text-[#7E7E7E] dark:text-zinc-500"> · {barDetail.day.date}</span>
                </p>
                <ul className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <li className="flex justify-between gap-2">
                    <span className="text-[#7E7E7E] dark:text-zinc-400">Present (incl. partial)</span>
                    <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{barDetail.day.present}</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-[#7E7E7E] dark:text-zinc-400">On approved leave</span>
                    <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400">{barDetail.day.leave}</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-[#7E7E7E] dark:text-zinc-400">On duty (OD)</span>
                    <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">{barDetail.day.od}</span>
                  </li>
                  <li className="flex justify-between gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    <span className="font-medium text-zinc-900 dark:text-white">Total (stack height)</span>
                    <span className="font-bold tabular-nums text-zinc-900 dark:text-white">
                      {barDetail.day.present + barDetail.day.leave + barDetail.day.od}
                    </span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                className="mt-6 w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                onClick={() => setBarDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {notificationPanelOpen && (
          <div className="fixed inset-0 z-[140]">
            <button
              onClick={() => setNotificationPanelOpen(false)}
              className="absolute inset-0 bg-slate-900/45"
              aria-label="Close notifications overlay"
            />
            <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl flex flex-col">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">Notifications</h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">Unread: {unreadCount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Read All
                  </button>
                  <button
                    onClick={() => setNotificationPanelOpen(false)}
                    className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 flex items-center justify-center"
                    aria-label="Close notifications"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {notificationLoading ? (
                  <div className="text-xs text-zinc-500 p-3">Loading notifications...</div>
                ) : notifications.length === 0 ? (
                  <div className="text-xs text-zinc-500 p-3">No notifications yet.</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n._id}
                      onClick={() => !n.isRead && markOneRead(n._id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        n.isRead
                          ? 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-700'
                          : 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-black text-zinc-900 dark:text-white">{n.title}</p>
                        {!n.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />}
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1">{n.message}</p>
                      <p className="text-[10px] text-zinc-400 mt-2 uppercase tracking-wider">
                        {n.module.replace('_', ' ')} | {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
