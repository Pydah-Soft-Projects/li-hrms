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

interface RecentActivity {
  _id: string;
  type: 'leave' | 'od' | 'permission' | 'attendance' | 'employee' | 'user';
  title: string;
  description: string;
  timestamp: string;
  status?: string;
}
interface DashboardCardProps {
  title: string;
  value: string | number;
  description: string;
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

      // Calculate today's and yesterday's dates
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Calculate today's attendance
      const [todayAttendanceRes, yesterdayAttendanceRes] = await Promise.all([
        api.getEmployeesWithAttendance(today),
        api.getEmployeesWithAttendance(yesterdayStr)
      ]);

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

      // Calculate yesterday's stats
      const yesterdayAttendance = yesterdayAttendanceRes.success ? yesterdayAttendanceRes.data || {} : {};
      let yesterdayPresent = 0;
      let yesterdayAbsent = 0;
      let yesterdayOnLeave = 0;
      let yesterdayODs = 0;

      Object.values(yesterdayAttendance).forEach((record: any) => {
        if (record && record.status === 'PRESENT') yesterdayPresent++;
        else if (record && record.status === 'ABSENT') yesterdayAbsent++;
        if (record && record.hasLeave) yesterdayOnLeave++;
        if (record && record.hasOD) yesterdayODs++;
      });

      // Calculate today's approved leaves
      const allLeaves = todayLeavesRes.success ? (todayLeavesRes.data?.data || todayLeavesRes.data || []) : [];
      const todayApprovedLeaves = allLeaves.filter((leave: any) => {
        if (leave.status !== 'approved') return false;
        const fromDate = leave.fromDate ? new Date(leave.fromDate).toISOString().split('T')[0] : null;
        const toDate = leave.toDate ? new Date(leave.toDate).toISOString().split('T')[0] : null;
        return fromDate && toDate && today >= fromDate && today <= toDate;
      });

      // Calculate yesterday's approved leaves
      const yesterdayApprovedLeaves = allLeaves.filter((leave: any) => {
        if (leave.status !== 'approved') return false;
        const fromDate = leave.fromDate ? new Date(leave.fromDate).toISOString().split('T')[0] : null;
        const toDate = leave.toDate ? new Date(leave.toDate).toISOString().split('T')[0] : null;
        return fromDate && toDate && yesterdayStr >= fromDate && yesterdayStr <= toDate;
      });

      // Calculate today's approved ODs
      const allODs = todayODsRes.success ? (todayODsRes.data?.data || todayODsRes.data || []) : [];
      const todayApprovedODs = allODs.filter((od: any) => {
        if (od.status !== 'approved') return false;
        const fromDate = od.fromDate ? new Date(od.fromDate).toISOString().split('T')[0] : null;
        const toDate = od.toDate ? new Date(od.toDate).toISOString().split('T')[0] : null;
        return fromDate && toDate && today >= fromDate && today <= toDate;
      });

      // Calculate yesterday's approved ODs
      const yesterdayApprovedODs = allODs.filter((od: any) => {
        if (od.status !== 'approved') return false;
        const fromDate = od.fromDate ? new Date(od.fromDate).toISOString().split('T')[0] : null;
        const toDate = od.toDate ? new Date(od.toDate).toISOString().split('T')[0] : null;
        return fromDate && toDate && yesterdayStr >= fromDate && yesterdayStr <= toDate;
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
        yesterdayPresent,
        yesterdayAbsent,
        yesterdayOnLeave: yesterdayApprovedLeaves.length,
        yesterdayODs: yesterdayApprovedODs.length,
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
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'od':
        return (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'permission':
        return (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      value: stats?.totalEmployees || 0,
      change: `${stats?.activeEmployees || 0} active`,
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
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-base bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:42px_42px] dark:bg-black"></div>

      <div className="relative z-10 mx-auto max-w-[1920px] ">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">Dashboard</h1>
            <p className="mt-1 text-xs text-text-secondary font-normal">Overview of your HRMS system</p>
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
                description={card.change.toString()}
                statusBadge={
                  card.change.toString().includes('absent') || card.change.toString().includes('No') ? (
                    null // No badge for negative/neutral states on top right, per preference, or use consistent styling
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

          {/* Recent Activities */}
          <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 hover:bg-bg-surface/80 transition shadow-sm">
            <h2 className="mb-4 text-base font-semibold tracking-tight text-text-primary">Recent Activities</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200 dark:bg-white/5"></div>
                ))}
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-secondary">
                No recent activities
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-start gap-3 rounded-lg border border-border-base bg-bg-surface/40 p-3 transition-all hover:bg-bg-surface/60"
                  >
                    <div className={`rounded p-2 ${activity.type === 'leave' ? 'bg-status-warning/15 text-status-warning' :
                      activity.type === 'od' ? 'bg-blue-500/15 text-blue-500' :
                        'bg-purple-500/15 text-purple-500'
                      }`}>
                      <div className="h-4 w-4">{getActivityIcon(activity.type)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {activity.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {activity.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getStatusColor(activity.status)}`}>
                          {activity.status || 'new'}
                        </span>
                        <span className="text-[10px] text-text-secondary">
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
