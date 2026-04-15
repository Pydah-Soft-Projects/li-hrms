'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type InAppNotification } from '@/lib/api';
import { 
  Calendar, 
  Bell, 
  X, 
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
          
          <button
            onClick={() => setNotificationPanelOpen(true)}
            className="group relative flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white transition-all hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Bell className="h-5 w-5 text-zinc-600 group-hover:text-emerald-600" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-4 ring-[#f8fafc] dark:ring-[#09090b]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Key Stats & Attendance */}
        <div className="space-y-6 lg:col-span-8">
          {/* KPI Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Workforce Overview */}
        <DashboardCard 
          title="Active Employees" 
          subtitle="Workforce Strength" 
          icon={Users}
          onClick={() => router.push('/superadmin/employees')}
        >
          <div className="flex items-end gap-3">
            <div className="text-4xl font-black text-zinc-900 dark:text-white">{stats.activeEmployees}</div>
            <div className="mb-1 text-sm font-bold text-emerald-600">
              <TrendingUp className="mr-1 inline-block h-4 w-4" />
              {stats.newEmployeesThisMonth} New
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div 
              className="h-full rounded-full bg-emerald-600 transition-all duration-1000" 
              style={{ width: `${(stats.activeEmployees / stats.totalEmployees) * 100}%` }}
            />
          </div>
        </DashboardCard>

        {/* Attendance Pulse */}
        <DashboardCard 
          title="Attendance Health" 
          subtitle="Today's Presence" 
          icon={UserCheck}
          className="bg-emerald-50/50"
          onClick={() => router.push('/superadmin/live-attendance')}
        >
          <div className="flex items-end gap-3">
            <div className="text-4xl font-black text-emerald-900 dark:text-white">
              {stats.presentRateToday}%
            </div>
            <div className="mb-1 text-[10px] font-bold uppercase text-emerald-600">
              Partials Included
            </div>
          </div>
          <div className="mt-4 flex gap-4 text-xs font-bold text-emerald-700">
            <span>{stats.todayPresent} Present</span>
            <span className="opacity-50">•</span>
            <span>{stats.todayOnLeave} Leave</span>
          </div>
        </DashboardCard>

        {/* Pending Leaves */}
        <DashboardCard 
          title="Pending Leaves" 
          subtitle="Awaiting Approval" 
          icon={ClipboardCheck}
          className="bg-amber-50/50"
          onClick={() => router.push('/superadmin/leaves?tab=pending')}
        >
          <div className="mt-2 text-4xl font-black text-amber-900 dark:text-white">
            {stats.pendingLeaves}
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase text-amber-600">Applications</p>
        </DashboardCard>

        {/* Pending ODs */}
        <DashboardCard 
          title="Pending ODs" 
          subtitle="On-Duty Requests" 
          icon={Timer}
          className="bg-rose-50/50"
          onClick={() => router.push('/superadmin/leaves?tab=pending')}
        >
          <div className="mt-2 text-4xl font-black text-rose-900 dark:text-white">
            {stats.pendingODs}
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase text-rose-600">Pending Review</p>
        </DashboardCard>
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
