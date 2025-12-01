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

interface RecentActivity {
  _id: string;
  type: 'leave' | 'od' | 'permission' | 'attendance' | 'employee' | 'user';
  title: string;
  description: string;
  timestamp: string;
  status?: string;
}

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [currentDate] = useState(new Date());

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load all data in parallel
      const today = new Date().toISOString().split('T')[0];
      const [
        employeesRes,
        departmentsRes,
        usersRes,
        monthlyAttendanceRes,
        leavesRes,
        odsRes,
        todayLeavesRes,
        todayODsRes
      ] = await Promise.all([
        api.getEmployees(),
        api.getDepartments(true),
        api.getUsers(),
        api.getMonthlyAttendance(currentDate.getFullYear(), currentDate.getMonth() + 1),
        api.getLeaves({ status: 'pending' }),
        api.getODs({ status: 'pending' }),
        api.getLeaves(),
        api.getODs()
      ]);

      // Calculate today's attendance
      const todayAttendanceRes = await api.getEmployeesWithAttendance(today);
      
      const employees = employeesRes.success ? employeesRes.data || [] : [];
      const activeEmployees = employees.filter((emp: any) => emp.is_active !== false);
      const departments = departmentsRes.success ? departmentsRes.data || [] : [];
      const users = usersRes.success ? usersRes.data || [] : [];
      const monthlyData = monthlyAttendanceRes.success ? monthlyAttendanceRes.data || [] : [];
      const pendingLeaves = leavesRes.success ? (leavesRes.data?.data || leavesRes.data || []).length : 0;
      const pendingODs = odsRes.success ? (odsRes.data?.data || odsRes.data || []).length : 0;
      const pendingPermissions = 0; // TODO: Add permissions API when available
      
      // Calculate today's stats
      const todayAttendance = todayAttendanceRes.success ? todayAttendanceRes.data || {} : {};
      let todayPresent = 0;
      let todayAbsent = 0;
      let todayOnLeave = 0;
      let todayODs = 0;

      Object.values(todayAttendance).forEach((record: any) => {
        if (record && record.status === 'PRESENT') todayPresent++;
        else if (record && record.status === 'ABSENT') todayAbsent++;
        if (record && record.hasLeave) todayOnLeave++;
        if (record && record.hasOD) todayODs++;
      });

      // Calculate today's approved leaves
      const allLeaves = todayLeavesRes.success ? (todayLeavesRes.data?.data || todayLeavesRes.data || []) : [];
      const todayApprovedLeaves = allLeaves.filter((leave: any) => {
        if (leave.status !== 'approved') return false;
        const fromDate = leave.fromDate ? new Date(leave.fromDate).toISOString().split('T')[0] : null;
        const toDate = leave.toDate ? new Date(leave.toDate).toISOString().split('T')[0] : null;
        return fromDate && toDate && today >= fromDate && today <= toDate;
      });

      // Calculate today's approved ODs
      const allODs = todayODsRes.success ? (todayODsRes.data?.data || todayODsRes.data || []) : [];
      const todayApprovedODs = allODs.filter((od: any) => {
        if (od.status !== 'approved') return false;
        const fromDate = od.fromDate ? new Date(od.fromDate).toISOString().split('T')[0] : null;
        const toDate = od.toDate ? new Date(od.toDate).toISOString().split('T')[0] : null;
        return fromDate && toDate && today >= fromDate && today <= toDate;
      });

      // Calculate department distribution for leaves
      const departmentLeaveDistribution: Record<string, number> = {};
      todayApprovedLeaves.forEach((leave: any) => {
        const deptName = leave.employeeId?.department?.name || leave.department?.name || 'Unknown';
        departmentLeaveDistribution[deptName] = (departmentLeaveDistribution[deptName] || 0) + 1;
      });

      // Calculate department distribution for ODs
      const departmentODDistribution: Record<string, number> = {};
      todayApprovedODs.forEach((od: any) => {
        const deptName = od.employeeId?.department?.name || od.department?.name || 'Unknown';
        departmentODDistribution[deptName] = (departmentODDistribution[deptName] || 0) + 1;
      });

      // Calculate monthly stats
      let monthlyPresent = 0;
      let monthlyAbsent = 0;
      let monthlyLeaves = 0;

      monthlyData.forEach((item: any) => {
        Object.values(item.dailyAttendance || {}).forEach((record: any) => {
          if (record) {
            if (record.status === 'PRESENT' || record.status === 'PARTIAL') monthlyPresent++;
            else if (record.status === 'ABSENT') monthlyAbsent++;
            if (record.hasLeave) monthlyLeaves++;
          }
        });
      });

      const totalDays = currentDate.getDate();
      const attendanceRate = totalDays > 0 ? (monthlyPresent / (activeEmployees.length * totalDays)) * 100 : 0;

      setStats({
        totalEmployees: employees.length,
        activeEmployees: activeEmployees.length,
        totalDepartments: departments.length,
        totalUsers: users.length,
        todayPresent,
        todayAbsent,
        todayOnLeave: todayApprovedLeaves.length,
        todayODs: todayApprovedODs.length,
        pendingLeaves,
        pendingODs,
        pendingPermissions,
        monthlyPresent,
        monthlyAbsent,
        monthlyLeaves,
        attendanceRate: Math.min(100, Math.max(0, attendanceRate)),
        leaveUtilization: activeEmployees.length > 0 ? (monthlyLeaves / activeEmployees.length) * 100 : 0,
        departmentLeaveDistribution,
        departmentODDistribution,
      });

      // Load recent activities
      await loadRecentActivities();
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentActivities = async () => {
    try {
      const [leavesRes, odsRes, employeesRes] = await Promise.all([
        api.getLeaves({ limit: 5 }),
        api.getODs({ limit: 5 }),
        api.getEmployees({ is_active: true })
      ]);

      const activities: RecentActivity[] = [];
      const now = Date.now();

      // Add recent leaves
      if (leavesRes.success) {
        const leaves = leavesRes.data?.data || leavesRes.data || [];
        leaves.slice(0, 3).forEach((leave: any) => {
          activities.push({
            _id: leave._id,
            type: 'leave',
            title: `${leave.employeeId?.employee_name || 'Employee'} - ${leave.leaveType || 'Leave'}`,
            description: leave.purpose || 'Leave application',
            timestamp: leave.appliedAt || leave.createdAt,
            status: leave.status,
          });
        });
      }

      // Add recent ODs
      if (odsRes.success) {
        const ods = odsRes.data?.data || odsRes.data || [];
        ods.slice(0, 3).forEach((od: any) => {
          activities.push({
            _id: od._id,
            type: 'od',
            title: `${od.employeeId?.employee_name || 'Employee'} - ${od.odType || 'On Duty'}`,
            description: od.purpose || 'On duty application',
            timestamp: od.appliedAt || od.createdAt,
            status: od.status,
          });
        });
      }

      // TODO: Add permissions when API is available

      // Sort by timestamp and take most recent
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivities(activities.slice(0, 10));
    } catch (err) {
      console.error('Error loading recent activities:', err);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return time.toLocaleDateString();
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'leave':
        return (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'od':
        return (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'permission':
        return (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
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
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'On Leave Today',
      value: stats?.todayOnLeave || 0,
      change: 'Approved leaves',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Total Employees',
      value: stats?.totalEmployees || 0,
      change: `${stats?.activeEmployees || 0} active`,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      title: 'Leave Distribution',
      value: Object.keys(stats?.departmentLeaveDistribution || {}).length || 0,
      change: topLeaveDepartments || 'No leaves',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-rose-500 to-pink-500',
      bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    },
    {
      title: 'OD Distribution',
      value: Object.keys(stats?.departmentODDistribution || {}).length || 0,
      change: topODDepartments || 'No ODs',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'from-teal-500 to-cyan-500',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    },
    {
      title: 'Pending Approvals',
      value: (stats?.pendingLeaves || 0) + (stats?.pendingODs || 0),
      change: `${stats?.pendingLeaves || 0} leaves, ${stats?.pendingODs || 0} ODs`,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
  ];

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-emerald-50/40 via-teal-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Overview of your HRMS system</p>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* KPI Cards Grid */}
        {loading ? (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {KPICards.map((card, index) => (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-xl transition-all hover:shadow-2xl dark:border-slate-700 dark:bg-slate-900/80 ${card.bgColor}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">{card.title}</p>
                    <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate" title={card.change}>{card.change}</p>
                  </div>
                  <div className={`ml-2 flex-shrink-0 rounded-lg bg-gradient-to-r ${card.color} p-2 text-white shadow-lg`}>
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Analytics and Recent Activities Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Attendance Overview */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Attendance Overview</h2>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/20">
                      <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Today Present</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.todayPresent || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Out of {stats?.activeEmployees || 0}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {stats?.activeEmployees ? ((stats.todayPresent / stats.activeEmployees) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/20">
                      <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Today Absent</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.todayAbsent || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">On Leave</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{stats?.todayOnLeave || 0}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/20">
                      <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Monthly Attendance</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {stats?.monthlyPresent || 0} present days
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Rate</p>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {(stats?.attendanceRate || 0).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Activities */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Recent Activities</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                ))}
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No recent activities
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <div className={`rounded-lg p-2 ${
                      activity.type === 'leave' ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' :
                      activity.type === 'od' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                      'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                    }`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {activity.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {activity.description}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(activity.status)}`}>
                          {activity.status || 'new'}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {formatTimeAgo(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Pending Leaves</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats?.pendingLeaves || 0}</p>
              </div>
              <div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900/20">
                <svg className="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Pending ODs</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats?.pendingODs || 0}</p>
              </div>
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/20">
                <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Pending Permissions</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats?.pendingPermissions || 0}</p>
              </div>
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
                <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Monthly Leaves</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{stats?.monthlyLeaves || 0}</p>
              </div>
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/20">
                <svg className="h-5 w-5 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
