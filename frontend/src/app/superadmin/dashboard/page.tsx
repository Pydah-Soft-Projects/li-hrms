'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type InAppNotification } from '@/lib/api';
import { auth } from '@/lib/auth';
import {
  Calendar,
  Bell,
  BellRing,
  X,
  CheckCheck,
  Users,
  UserCheck,
  CalendarClock,
  ClipboardCheck,
  UserMinus,
  UserPlus,
  PlusCircle,
  FileBarChart,
  Settings,
  Fingerprint,
  Megaphone,
  Receipt,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { useSocket } from '@/contexts/SocketContext';
import { useDashboardPushBell } from '@/hooks/useDashboardPushBell';
import {
  StatCard,
  LeaveOdTodayCard,
  PendingApprovalsCard,
  AttendanceOverview,
  LeaveSummaryDonut,
  EmployeeGrowthChart,
  JoinResignChart,
  DonutProgress,
} from './components/HRWidgets';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  todayPresent: number;
  pendingLeaves: number;
  pendingODs: number;
  pendingPermissions: number;
  pendingApplications: number;
  pendingApprovalsTotal?: number;
  resignedThisMonth: number;
  resignedLastMonth: number;
  newEmployeesThisMonth: number;
  newEmployeesLastMonth: number;
  leaveTypeDistribution: Record<string, number>;
  weeklyTracker: Array<{ label: string; present?: number; leave?: number; od?: number; pendingLeave?: number; pendingOd?: number; date?: string }>;
  employeeGrowthTrend: Array<{ label: string; total: number }>;
  joinResignTrend: Array<{ label: string; joined: number; resigned: number }>;
  employeeGrowthPct: number;
  netGrowth12Months: number;
  upcomingEvents: Array<{ id: string; title: string; date: string; description: string; status: string }>;
  presentRateToday: number;
  trendOnLeavePct?: number;
  yesterdayOnLeave?: number;
  todayOnLeave?: number;
  todayODs?: number;
}

const DEFAULT_STATS: DashboardStats = {
  totalEmployees: 0,
  activeEmployees: 0,
  todayPresent: 0,
  pendingLeaves: 0,
  pendingODs: 0,
  pendingPermissions: 0,
  pendingApplications: 0,
  resignedThisMonth: 0,
  resignedLastMonth: 0,
  newEmployeesThisMonth: 0,
  newEmployeesLastMonth: 0,
  leaveTypeDistribution: {},
  weeklyTracker: [],
  employeeGrowthTrend: [],
  joinResignTrend: [],
  employeeGrowthPct: 0,
  netGrowth12Months: 0,
  upcomingEvents: [],
  presentRateToday: 0,
  todayOnLeave: 0,
  todayODs: 0,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function TrendText({ current, previous, suffix }: { current: number; previous: number; suffix: string }) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-zinc-400">No change {suffix}</span>;
  const up = diff > 0;
  return (
    <span className={up ? 'text-emerald-600' : 'text-orange-500'}>
      {up ? '↑' : '↓'} {Math.abs(diff)} {suffix}
    </span>
  );
}

const QUICK_ACTIONS = [
  { label: 'Add Employee', href: '/superadmin/employees', icon: PlusCircle },
  { label: 'Apply Leave', href: '/superadmin/leaves', icon: CalendarClock },
  { label: 'Attendance', href: '/superadmin/attendance', icon: Fingerprint },
  { label: 'Announcement', href: '/superadmin/settings', icon: Megaphone },
  { label: 'Payroll', href: '/superadmin/pay-register', icon: Receipt },
  { label: 'Reports', href: '/superadmin/reports', icon: FileBarChart },
  { label: 'Documents', href: '/superadmin/payslips', icon: FileText },
  { label: 'Settings', href: '/superadmin/settings', icon: Settings },
];

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [trackerPeriod, setTrackerPeriod] = useState<'week' | 'month' | 'lastMonth'>('week');
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userName, setUserName] = useState('Admin');
  const { pushSubscribed } = useDashboardPushBell(true);

  useEffect(() => {
    const user = auth.getUser();
    if (user?.name) setUserName(user.name);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getDashboardAnalytics(trackerPeriod);
      if (res.success && res.data) {
        setStats({ ...DEFAULT_STATS, ...res.data });
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [trackerPeriod]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setNotificationLoading(true);
        const [listRes, countRes] = await Promise.all([
          api.getNotifications({ page: 1, limit: 15 }),
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
      setNotifications((p) => [n, ...p].slice(0, 15));
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

  const growthSpark = useMemo(
    () => (stats.employeeGrowthTrend || []).map((d) => d.total),
    [stats.employeeGrowthTrend],
  );

  const joinSpark = useMemo(
    () => (stats.joinResignTrend || []).map((d) => d.joined),
    [stats.joinResignTrend],
  );

  const resignSpark = useMemo(
    () => (stats.joinResignTrend || []).map((d) => d.resigned),
    [stats.joinResignTrend],
  );

  const formatEventDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans dark:bg-[#09090b]">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            {getGreeting()}, {userName}! 👋
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Here&apos;s what&apos;s happening in your organization today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
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
            title={
              pushSubscribed === true
                ? 'Push notifications active'
                : pushSubscribed === false
                  ? 'Push not registered'
                  : 'Notifications'
            }
            className={`relative flex h-10 w-10 items-center justify-center rounded-xl border bg-white shadow-sm transition-colors ${
              unreadCount > 0 ? 'border-emerald-200' : 'border-zinc-200'
            } dark:border-zinc-700 dark:bg-zinc-900`}
            aria-label="Open notifications"
          >
            {unreadCount > 0 ? (
              <BellRing className="h-4 w-4 text-emerald-600" />
            ) : (
              <Bell className="h-4 w-4 text-zinc-500" />
            )}
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <Link
            href="/superadmin/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm"
          >
            {(userName.charAt(0) || 'A').toUpperCase()}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="h-80 animate-pulse rounded-2xl bg-white xl:col-span-2" />
            <div className="h-80 animate-pulse rounded-2xl bg-white" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              title="Total Employees"
              value={stats.activeEmployees || stats.totalEmployees}
              subtitle={
                stats.newEmployeesThisMonth > 0 ? (
                  <span className="text-emerald-600">↑ {stats.newEmployeesThisMonth} this month</span>
                ) : (
                  'Active workforce'
                )
              }
              icon={<Users className="h-4 w-4" />}
              sparkData={growthSpark}
            />
            <StatCard
              title="Present Today"
              value={stats.todayPresent}
              subtitle={`${stats.presentRateToday}% of active employees (Present / Half Day / Partial)`}
              icon={<UserCheck className="h-4 w-4" />}
              trailing={<DonutProgress percent={stats.presentRateToday} />}
            />
            <LeaveOdTodayCard
              onLeave={stats.todayOnLeave ?? 0}
              onOd={stats.todayODs ?? 0}
              trackerData={stats.weeklyTracker ?? []}
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <PendingApprovalsCard
              pendingLeaves={stats.pendingLeaves}
              pendingODs={stats.pendingODs}
              trackerData={stats.weeklyTracker ?? []}
              icon={<ClipboardCheck className="h-4 w-4" />}
            />
            <StatCard
              title="Resignations"
              value={stats.resignedThisMonth}
              subtitle={
                <TrendText
                  current={stats.resignedThisMonth}
                  previous={stats.resignedLastMonth}
                  suffix="vs last month"
                />
              }
              icon={<UserMinus className="h-4 w-4" />}
              sparkData={resignSpark}
            />
            <StatCard
              title="New Members Joined"
              value={stats.newEmployeesThisMonth}
              subtitle={
                <TrendText
                  current={stats.newEmployeesThisMonth}
                  previous={stats.newEmployeesLastMonth}
                  suffix="vs last month"
                />
              }
              icon={<UserPlus className="h-4 w-4" />}
              sparkData={joinSpark}
              sparkType="bar"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-zinc-900">Attendance Overview</h3>
                  <p className="text-xs text-zinc-500">Daily attendance rate &amp; employee count</p>
                </div>
                <select
                  value={trackerPeriod}
                  onChange={(e) => setTrackerPeriod(e.target.value as 'week' | 'month' | 'lastMonth')}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="lastMonth">Last Month</option>
                </select>
              </div>
              <AttendanceOverview
                data={stats.weeklyTracker}
                activeEmployees={stats.activeEmployees || stats.totalEmployees}
              />
            </section>

            <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="mb-1 text-base font-semibold text-zinc-900">Leave Summary</h3>
              <p className="mb-4 text-xs text-zinc-500">Current cycle composition</p>
              <LeaveSummaryDonut data={stats.leaveTypeDistribution} />
              <Link
                href="/superadmin/leave-register"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                <Calendar className="h-3.5 w-3.5" />
                View Leave Calendar
              </Link>
            </section>
          </div>

          {/* Growth + Quick actions */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-base font-semibold text-zinc-900">Employee Growth</h3>
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  Last 12 Months
                </span>
              </div>
              <p className="mb-3 text-xs text-emerald-600">
                ↑ {stats.employeeGrowthPct}% growth in last 12 months
              </p>
              <EmployeeGrowthChart data={stats.employeeGrowthTrend} />
            </section>

            <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="mb-1 text-base font-semibold text-zinc-900">Joining vs Resignation</h3>
              <p className="mb-3 text-xs text-zinc-500">
                Net Growth:{' '}
                <span className="font-semibold text-emerald-600">
                  {stats.netGrowth12Months >= 0 ? '+' : ''}
                  {stats.netGrowth12Months}
                </span>
              </p>
              <JoinResignChart data={stats.joinResignTrend} />
              <div className="mt-2 flex gap-4 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Joined
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-orange-500" /> Resigned
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-zinc-900">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => router.push(action.href)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-2 py-3 text-center transition hover:border-emerald-200 hover:bg-emerald-50"
                    >
                      <Icon className="h-5 w-5 text-emerald-600" />
                      <span className="text-[10px] font-semibold leading-tight text-zinc-700">
                        {action.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Upcoming events */}
          <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-900">Upcoming Events &amp; Reminders</h3>
              <Link
                href="/superadmin/holidays"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                View Calendar
              </Link>
            </div>
            {stats.upcomingEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No upcoming events scheduled</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stats.upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4"
                  >
                    <p className="text-xs font-bold text-emerald-600">{formatEventDate(event.date)}</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900">{event.title}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{event.description}</p>
                    <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {event.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Notification Panel */}
      <AnimatePresence>
        {notificationPanelOpen && (
          <div className="fixed inset-0 z-[150] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNotificationPanelOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between border-b p-6 dark:border-zinc-800">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Notifications</h3>
                  <p className="mt-1 text-[11px] text-zinc-500">Unread: {unreadCount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Read All
                  </button>
                  <button onClick={() => setNotificationPanelOpen(false)}>
                    <X className="h-6 w-6 text-zinc-400" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {notificationLoading ? (
                  <div className="p-2 text-xs text-zinc-500">Loading notifications...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-2 text-xs text-zinc-500">No notifications yet.</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n._id}
                      onClick={() => !n.isRead && markOneRead(n._id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        n.isRead
                          ? 'border-zinc-100 bg-zinc-50'
                          : 'border-emerald-100 bg-emerald-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-zinc-900">{n.title}</p>
                        {!n.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-600">{n.message}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-400">
                        {n.module.replace('_', ' ')} | {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
