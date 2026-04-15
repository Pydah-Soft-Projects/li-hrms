'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type InAppNotification } from '@/lib/api';
import {
  Calendar,
  Bell,
  BellRing, X,
  CheckCheck,
  Users,
  UserCheck,
  Timer,
  ClipboardCheck,
  TrendingUp,
  Cake,
  Activity,
  PlusCircle,
  FileBarChart,
  Settings
} from 'lucide-react';
import { useSocket } from '@/contexts/SocketContext';
import {
  AttendancePulse,
  LeaveSpectrum,
  WorkforceHeatmap,
  DashboardCard
} from './components/HRWidgets';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  totalDepartments: number;
  totalUsers: number;
  todayPresent: number;
  todayAbsent: number;
  todayOnLeave: number;
  todayODs: number;
  pendingLeaves: number;
  pendingODs: number;
  pendingPermissions: number;
  pendingApplications: number;
  monthlyPresent: number;
  attendanceRate: number;
  departmentLeaveDistribution: Record<string, number>;
  leaveTypeDistribution: Record<string, number>;
  departmentHeadcount: Array<{ name: string, count: number }>;
  newEmployeesThisMonth: number;
  resignedThisMonth: number;
  weeklyTracker: any[];
  divisionAttendanceToday: any[];
  onLeaveEmployeesList: any[];
  upcomingBirthdays: any[];
  presentRateToday: number;
  performanceDeltaVsYesterday: number;
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
  pendingLeaves: 0,
  pendingODs: 0,
  pendingPermissions: 0,
  pendingApplications: 0,
  monthlyPresent: 0,
  attendanceRate: 0,
  departmentLeaveDistribution: {},
  leaveTypeDistribution: {},
  departmentHeadcount: [],
  newEmployeesThisMonth: 0,
  resignedThisMonth: 0,
  weeklyTracker: [],
  divisionAttendanceToday: [],
  onLeaveEmployeesList: [],
  upcomingBirthdays: [],
  presentRateToday: 0,
  performanceDeltaVsYesterday: 0,
};

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [trackerPeriod, setTrackerPeriod] = useState<'week' | 'month' | 'lastMonth'>('week');
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
        const [listRes, countRes] = await Promise.all([
          api.getNotifications({ page: 1, limit: 15 }),
          api.getNotificationUnreadCount(),
        ]);
        if (listRes?.success) setNotifications(listRes.data || []);
        if (countRes?.success) setUnreadCount(countRes.unreadCount || 0);
      } catch (err) {
        console.error('Failed to load notifications:', err);
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
    socket.on('in_app_notification', onNew);
    return () => { socket.off('in_app_notification', onNew); };
  }, [socket]);

  const getBirthdayBadgeLabel = (emp: any) => {
    const normalize = (value: string) => value.trim().toUpperCase();
    const incomingLabel = typeof emp?.label === 'string' ? normalize(emp.label) : '';
    if (incomingLabel === 'TODAY' || incomingLabel === 'TOMORROW' || incomingLabel === 'TOMMOROW') {
      return incomingLabel === 'TOMMOROW' ? 'TOMORROW' : incomingLabel;
    }

    if (!emp?.nextBirthday) return '';

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const bday = new Date(emp.nextBirthday);
    const asKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const bdayKey = asKey(bday);

    if (bdayKey === asKey(today)) return 'TODAY';
    if (bdayKey === asKey(tomorrow)) return 'TOMORROW';
    return '';
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 font-sans dark:bg-[#09090b] sm:p-6 lg:p-8">
      {/* Header Section */}
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-300 sm:text-xl">
            Real-time workforce intelligence & analytics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 sm:flex">
            <Calendar className="h-4 w-4" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
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
                className="relative h-9 w-9 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center"
                aria-label="Open notifications"
              >
                <Bell className="h-4 w-4" />
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

                    {/* Attendance Pulse */}
                    <DashboardCard
                      title="Attendance Pulse"
                      subtitle="Organization-wide participation trend"
                      icon={Timer}
                    >
                      <div className="mb-4 flex gap-4">
                        <select
                          value={trackerPeriod}
                          onChange={(e) => setTrackerPeriod(e.target.value as any)}
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                        >
                          <option value="week">This Week</option>
                          <option value="month">This Month</option>
                          <option value="lastMonth">Last Month</option>
                        </select>
                      </div>
                      <AttendancePulse data={stats.weeklyTracker} />
                    </DashboardCard>

                    {/* Workforce Heatmap */}
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                      <DashboardCard title="Leave Spectrum" subtitle="Current month composition" icon={FileBarChart}>
                        <LeaveSpectrum data={stats.leaveTypeDistribution} />
                      </DashboardCard>

                      <DashboardCard title="Department Load" subtitle="Workforce distribution" icon={Settings}>
                        <WorkforceHeatmap data={stats.departmentHeadcount} />
                      </DashboardCard>
                    </div>
                  </div>

        {/* Right Column: Actions & Feed */}
                <div className="space-y-6 lg:col-span-4">
                  {/* Birthday Widget */}
                  <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                          <Cake className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">Future Birthdays</h3>
                          <p className="text-[10px] font-semibold text-zinc-400">Upcoming celebrations</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 dark:bg-emerald-900/20">
                        <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-[10px] font-black text-emerald-600">{(stats.upcomingBirthdays || []).length}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                      {(stats.upcomingBirthdays || []).slice(0, 4).map((emp: any) => (
                        <div key={emp.id} className="group relative flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 transition-all hover:border-emerald-100 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/40">
                          <div className="flex items-start justify-between">
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              <div className="relative">
                                <div className="h-10 w-10 rounded-xl bg-emerald-50 p-0.5 dark:bg-zinc-800">
                                  <img
                                    src={emp.photo || `https://ui-avatars.com/api/?name=${emp.name}&background=random`}
                                    className="h-full w-full rounded-xl object-cover"
                                  />
                                </div>
                              </div>
                              <div className="overflow-hidden">
                                <h4 className="truncate text-xs font-black text-zinc-900 dark:text-white">{emp.name}</h4>
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{emp.empNo}</p>
                              </div>
                            </div>
                            <div className="ml-2 shrink-0">
                              <div className="flex min-h-10 min-w-16 flex-col items-center justify-center rounded-xl bg-emerald-50 px-3 py-1.5 text-center dark:bg-emerald-900/20">
                                {getBirthdayBadgeLabel(emp) ? (
                                  <span className="text-[10px] font-black uppercase text-emerald-600 animate-pulse">
                                    {getBirthdayBadgeLabel(emp)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[9px] font-black text-emerald-600">
                                      {new Date(emp.dob).toLocaleDateString('en-US', { day: 'numeric' })}
                                    </span>
                                    <span className="text-[7px] font-bold uppercase text-emerald-600/60">
                                      {new Date(emp.dob).toLocaleDateString('en-US', { month: 'short' })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="rounded-xl bg-zinc-50/50 p-2 dark:bg-zinc-800/20">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400">Division</span>
                              <p className="mt-0.5 truncate text-[9px] font-black text-zinc-600 dark:text-zinc-400">
                                {emp.division?.name || 'N/A'}
                              </p>
                            </div>
                            <div className="rounded-xl bg-zinc-50/50 p-2 dark:bg-zinc-800/20">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400">Department</span>
                              <p className="mt-0.5 truncate text-[9px] font-black text-zinc-600 dark:text-zinc-400">
                                {emp.department?.name || 'N/A'}
                              </p>
                            </div>
                            <div className="rounded-xl bg-zinc-50/50 p-2 dark:bg-zinc-800/20">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400">Age</span>
                              <p className="mt-0.5 text-[10px] font-black text-zinc-600 dark:text-zinc-400">{emp.age}</p>
                            </div>
                            <div className="rounded-xl bg-zinc-50/50 p-2 dark:bg-zinc-800/20">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400">Next B-Day</span>
                              <p className="mt-0.5 text-[9px] font-black text-zinc-600 dark:text-zinc-400">
                                {new Date(emp.nextBirthday).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {(stats.upcomingBirthdays || []).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10">
                        <Cake className="mb-2 h-6 w-6 text-zinc-200" />
                        <p className="text-[10px] font-medium text-zinc-400">No birthdays this month</p>
                      </div>
                    )}

                    <button className="mt-5 w-full rounded-xl border border-dashed border-zinc-200 py-2.5 text-[9px] font-black uppercase tracking-widest text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-800">
                      Explore All Celebrations
                    </button>
                  </section>

                  {/* Activity Timeline */}
                  <DashboardCard title="Recent Activity" icon={Activity}>
                    <div className="relative space-y-6 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
                      {notifications.slice(0, 4).map((n) => (
                        <div key={n._id} className="relative flex gap-4 pl-8">
                          <div className="absolute left-0 top-1 h-8 w-8 rounded-full border-4 border-white bg-emerald-500 shadow-sm dark:border-zinc-900" />
                          <div>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white">{n.title}</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{n.message}</p>
                            <time className="mt-2 block text-[9px] font-bold uppercase text-zinc-400">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </div>
                        </div>
                      ))}
                    </div>
                  </DashboardCard>
                </div>
              </main>

              {/* Notification Panel Overlay */}
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
                      className="relative h-full w-full max-w-md bg-white shadow-2xl dark:bg-zinc-950"
                    >
                      <div className="flex items-center justify-between border-b p-6 dark:border-zinc-800">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Notifications</h3>
                        <button onClick={() => setNotificationPanelOpen(false)}>
                          <X className="h-6 w-6 text-zinc-400" />
                        </button>
                      </div>
                      <div className="p-4 space-y-3">
                        {notifications.map(n => (
                          <div key={n._id} className={`rounded-2xl p-4 border ${n.isRead ? 'bg-zinc-50 border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800'}`}>
                            <p className="text-xs font-bold text-zinc-900 dark:text-white">{n.title}</p>
                            <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">{n.message}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>
            );
}
