"use client";
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';
import RecentActivityFeed from '@/components/attendance/RecentActivityFeed';

interface DashboardStats {
  totalEmployees?: number;
  pendingLeaves?: number;
  approvedLeaves?: number;
  rejectedLeaves?: number;
  todayPresent?: number;
  todayAbsent?: number;
  upcomingHolidays?: number;
  myPendingLeaves?: number;
  myApprovedLeaves?: number;
  teamPendingApprovals?: number;
  efficiencyScore?: number;
  departmentFeed?: any[];
  leaveBalance?: number
}

export default function DashboardPage() {
  const { activeWorkspace, hasPermission } = useWorkspace();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState<any>(null);

  useEffect(() => {
    // Simulate/Fetch stats
    const fetchStats = async () => {
      try {
        const response = await api.getDashboardStats();
        if (response.success && response.data) {
          setStats(response.data);
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchAttendance = async () => {
      // Try to get employee number from various possible fields
      // If activeWorkspace.type is 'employee', user.emp_no should be reliable
      const empNo = user?.emp_no || user?.employeeId || (user as any)?.employeeNumber;

      if (!empNo) {
        console.warn('Dashboard: No employee number found for attendance fetch', user);
        return;
      }

      console.log('Fetching attendance for:', empNo);

      try {
        const today = new Date().toISOString().split('T')[0];
        const response = await api.getAttendanceDetail(empNo, today);

        if (response.success && response.data) {
          console.log('Attendance data loaded:', response.data);
          // Wrap in array as UI expects list
          setAttendanceData([response.data]);
        } else {
          console.log('No attendance data found for today');
          setAttendanceData([]);
        }
      } catch (err) {
        console.error("Error fetching attendance:", err);
        setAttendanceData([]);
      }
    };

    if (user) {
      fetchStats();
      fetchAttendance();
    }
  }, [user]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // We now use user role as the primary driver, but fall back to workspace type
  const userRole = user?.role || activeWorkspace?.type || 'employee';

  const renderDashboardContent = () => {
    if (userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') {
      return <HRDashboard stats={stats} hasPermission={hasPermission} />;
    }
    if (userRole === 'hod' || userRole === 'manager') {
      return <HODDashboard stats={stats} hasPermission={hasPermission} />;
    }
    return <EmployeeDashboard stats={stats} hasPermission={hasPermission} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Helper to determine if attendance is present (case insensitive)
  const isPresent = (data: any[]) => {
    if (!data || data.length === 0) return false;
    const status = data[0].status?.toUpperCase();
    return status === 'PRESENT' || status === 'PARTIAL' || status === 'HALF_DAY';
  };

  const getStatusDisplay = (data: any[]) => {
    if (loading) return 'SYNCING...';
    if (!data || data.length === 0) return 'ABSENT';
    return data[0].status || 'Running';
  };

  return (
    <div className="space-y-3 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 bg-green-50 p-2 md:p-6 rounded-xl md:rounded-[2rem]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-6">
        {/* Role Card */}
        <div className="md:col-span-1 bg-white p-3 md:p-6 rounded-xl md:rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-white rounded-full -mr-10 -mt-10 blur-2xl transition-all duration-500 group-hover:bg-indigo-100/60" />

          <div className="relative z-10 flex items-center h-full gap-3 md:gap-5">
            <div className="w-12 h-12 md:w-16 md:h-16 md:ml-10 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 ring-2 md:ring-4 ring-indigo-50 shrink-0">
              <UserIcon className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-slate-500 font-medium text-[10px] md:text-xs uppercase tracking-wider mb-0.5">Welcome back,</p>
              <h3 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight capitalize truncate max-w-[150px] md:max-w-[180px]" title={userRole?.replace(/_/g, ' ')}>
                {userRole?.replace(/_/g, ' ') || 'Employee'}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-slate-400">Online Now</span>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance/OT Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-500 to-teal-600 p-3 md:p-8 rounded-xl md:rounded-3xl shadow-lg shadow-emerald-500/20 border border-emerald-400/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-10 -mt-10 blur-3xl transition-all duration-500 group-hover:bg-white/20" />

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 md:mb-6 gap-3 md:gap-4">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner border border-white/20">
                  <ClockIcon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <p className="text-xs md:text-sm font-medium text-emerald-100 uppercase tracking-wider">Today's Status</p>
                  <h3 className="text-lg md:text-xl font-bold text-white">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </h3>
                </div>
              </div>
              <span className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest shadow-sm border backdrop-blur-md w-full md:w-auto text-center ${loading ? 'bg-white/10 text-white/50 border-white/10' :
                (isPresent(attendanceData) ? 'bg-white text-emerald-600 border-white' : 'bg-white/10 text-white border-white/20')
                }`}>
                {getStatusDisplay(attendanceData)}
              </span>
            </div>

            {loading ? (
              <div className="h-16 flex items-center justify-center">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : (
              <div className="bg-black/10 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                {attendanceData && attendanceData.length > 0 ? (
                  attendanceData.map((record: any, recordIdx: number) => (
                    <div key={recordIdx} className="w-full">
                      {record.shifts && record.shifts.length > 0 ? (
                        record.shifts.map((shift: any, shiftIdx: number) => (
                          <div key={`${recordIdx}-${shiftIdx}`} className={`flex items-center justify-between ${shiftIdx > 0 ? 'mt-4 pt-4 border-t border-white/10' : ''}`}>
                            <div className="flex flex-col">
                              <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">Shift Info</span>
                              <span className="text-xs md:text-sm font-bold text-white">{shift.shiftName || shift.shiftId?.name || 'General Shift'}</span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">In Time</span>
                              <span className="text-sm md:text-base font-bold text-white font-mono">{shift.inTime ? new Date(shift.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '--:--'}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">Out Time</span>
                              <span className="text-sm md:text-base font-bold text-white font-mono">{shift.outTime ? new Date(shift.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '--:--'}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">Shift Info</span>
                            <span className="text-xs md:text-sm font-bold text-white">{record.shiftId?.name || record.shift || 'General Shift'}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">In Time</span>
                            <span className="text-sm md:text-base font-bold text-white font-mono">{record.inTime ? new Date(record.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '--:--'}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">Out Time</span>
                            <span className="text-sm md:text-base font-bold text-white font-mono">{record.outTime ? new Date(record.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '--:--'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 flex flex-col items-center">
                    <p className="text-emerald-50 text-sm font-medium">No check-in found</p>
                    <p className="text-emerald-200/60 text-xs">Waiting for attendance log</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      {renderDashboardContent()}
    </div>
  );
}

// HR/Admin Dashboard Component
function HRDashboard({ stats, hasPermission }: { stats: DashboardStats; hasPermission: any }) {
  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6">
        <StatCard
          title="Total WorkForce"
          value={stats.totalEmployees || 0}
          icon={<UsersIcon className="w-6 h-6" />}
          trend="+4 this month"
          color="emerald"
        />
        <StatCard
          title="Pending Approval"
          value={stats.pendingLeaves || 0}
          icon={<ClockIcon className="w-6 h-6" />}
          trend="Requires action"
          color="amber"
        // highlight={true}
        />
        <StatCard
          title="Ready for Payroll"
          value={stats.approvedLeaves || 0}
          icon={<CheckIcon className="w-6 h-6" />}
          trend="Finalized records"
          color="blue"
        />
        <StatCard
          title="Active Today"
          value={stats.todayPresent || 0}
          icon={<CalendarIcon className="w-6 h-6" />}
          trend="92% Attendance"
          color="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            Control Center
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <QuickAction href="/employees" label="Talent Pool" description="Manage employee records" icon={<UsersIcon />} color="emerald" />
            <QuickAction href="/attendance" label="Time Tracking" description="Attendance & logs" icon={<CalendarIcon />} color="blue" />
            <QuickAction href="/leaves" label="Absence Management" description="Leave & OD requests" icon={<ClockIcon />} color="amber" />
            <QuickAction href="/payments" label="Financials" description="Payroll & payments" icon={<BuildingIcon />} color="indigo" />
          </div>
        </div>

        {/* System Health / Real-time info */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              Organizational Insight
            </h2>
            <button className="text-emerald-600 font-semibold text-sm hover:text-emerald-700 transition-colors">Details →</button>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-all cursor-default group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl group-hover:scale-110 transition-transform">✓</div>
                <div>
                  <h3 className="font-bold text-slate-900">Attendance Sync Complete</h3>
                  <p className="text-sm text-slate-500">All biometric logs processed for today</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider">Success</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-all cursor-default group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xl group-hover:scale-110 transition-transform">!</div>
                <div>
                  <h3 className="font-bold text-slate-900">Payroll Lockdown Approaching</h3>
                  <p className="text-sm text-slate-500">Please finalize all arrears by tomorrow</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-wider">Warning</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-all cursor-default group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl group-hover:scale-110 transition-transform">i</div>
                <div>
                  <h3 className="font-bold text-slate-900">Policy Update</h3>
                  <p className="text-sm text-slate-500">New overtime rules active from next cycle</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider">Update</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// HOD Dashboard Component
function HODDashboard({ stats, hasPermission }: { stats: DashboardStats; hasPermission: any }) {
  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6">
        <StatCard
          title="Team Squad"
          value={stats.totalEmployees || 0}
          icon={<UsersIcon className="w-6 h-6" />}
          trend="All active"
          color="indigo"
        />
        <StatCard
          title="Team Present"
          value={stats.todayPresent || 0}
          icon={<CalendarIcon className="w-6 h-6" />}
          trend={`${stats.totalEmployees ? stats.totalEmployees - (stats.todayPresent || 0) : 0} on leave`}
          color="emerald"
        />
        <StatCard
          title="Action Items"
          value={stats.teamPendingApprovals || 0}
          icon={<ClockIcon className="w-6 h-6" />}
          trend="Pending requests"
          // highlight={true}
          color="amber"
        />
        <StatCard
          title="Efficiency Score"
          value={stats.efficiencyScore || 0}
          icon={<CheckIcon className="w-6 h-6" />}
          trend="Top department"
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            Team Management
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <QuickAction href="/leaves" label="Approve Requests" description="Review team leave & OD" icon={<CheckIcon />} color="amber" />
            <QuickAction href="/attendance" label="Team Attendance" description="Review daily presence" icon={<CalendarIcon />} color="blue" />
            <QuickAction href="/employees" label="My Team" description="Member profiles & records" icon={<UsersIcon />} color="emerald" />
            <QuickAction href="/profile" label="Personal Profile" description="Update your information" icon={<UserIcon />} color="indigo" />
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Department Feed</h2>
          </div>
          <div className="space-y-4">
            {stats.departmentFeed && stats.departmentFeed.length > 0 ? (
              stats.departmentFeed.map((req: any) => (
                <div key={req._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                      {req.employeeId?.employee_name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{req.employeeId?.employee_name || 'Unknown Employee'}</h4>
                      <p className="text-slate-500 text-xs">{req.leaveType} • {req.numberOfDays} days</p>
                    </div>
                  </div>
                  <Link href={`/leaves/${req._id}`} className="text-xs font-semibold text-indigo-600 hover:underline self-end sm:self-auto">
                    Review
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500">
                  <CheckIcon className="w-10 h-10" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Your queue is empty</h3>
                <p className="text-slate-500 max-w-xs mx-auto mt-2">All team requests have been processed. Great job keeping things moving!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Employee Dashboard Component
function EmployeeDashboard({ stats, hasPermission }: { stats: DashboardStats; hasPermission: any }) {
  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6">
        <StatCard
          title="Leave Balance"
          value={stats.leaveBalance || 0}
          icon={<CalendarIcon className="w-6 h-6" />}
          trend="Days remaining"
          color="emerald"
        />
        <StatCard
          title="My Requests"
          value={stats.myPendingLeaves || 0}
          icon={<ClockIcon className="w-6 h-6" />}
          trend="In review"
          color="amber"
          highlight={stats.myPendingLeaves ? stats.myPendingLeaves > 0 : false}
        />
        <StatCard
          title="Attendance"
          value={stats.todayPresent || 0}
          icon={<CheckIcon className="w-6 h-6" />}
          trend="Days this month"
          color="blue"
        />
        <StatCard
          title="Holidays"
          value={stats.upcomingHolidays || 0}
          icon={<StarIcon className="w-6 h-6" />}
          trend="Upcoming soon"
          color="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            My Portal
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <QuickAction href="/leaves" label="Apply for Absence" description="Leave or OD request" icon={<CalendarIcon />} color="emerald" />
            <QuickAction href="/attendance" label="My Attendance" description="Check daily logs" icon={<ClockIcon />} color="blue" />
            <QuickAction href="/profile" label="Update Information" description="Personal record management" icon={<UserIcon />} color="indigo" />
            <QuickAction href="/payslips" label="My Payslips" description="View/Download earnings" icon={<BuildingIcon />} color="teal" />
          </div>
        </div>

        <div className="lg:col-span-2 h-[500px]">
          <RecentActivityFeed />
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, icon, trend, color, highlight = false }: {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend: string;
  color: 'emerald' | 'amber' | 'blue' | 'indigo';
  highlight?: boolean;
}) {
  const gradients = {
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/20',
    amber: 'from-amber-500 to-amber-600 shadow-amber-500/20',
    blue: 'from-blue-500 to-blue-600 shadow-blue-500/20',
    indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-500/20',
  };

  const bgColors = {
    emerald: 'bg-emerald-50 border-emerald-100',
    amber: 'bg-amber-50 border-amber-100',
    blue: 'bg-blue-50 border-blue-100',
    indigo: 'bg-indigo-50 border-indigo-100',
  };

  return (
    <div className={`
      relative p-2.5 md:p-6 rounded-xl md:rounded-3xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group bg-white border border-slate-100
      ${highlight ? `ring-2 ring-${color}-500 ring-offset-2` : ''}
    `}>
      <div className="flex items-start justify-between mb-2 md:mb-6">
        <div className={`w-8 h-8 md:w-14 md:h-14 rounded-lg md:rounded-2xl bg-gradient-to-br ${gradients[color]} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4 md:w-7 md:h-7' }) : icon}
        </div>
        {highlight && (
          <span className="flex h-2 w-2 md:h-3 md:w-3 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-${color}-400`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 md:h-3 md:w-3 bg-${color}-500`}></span>
          </span>
        )}
      </div>
      <div>
        <p className="text-slate-500 font-semibold text-[9px] md:text-sm mb-0.5 md:mb-1 uppercase tracking-wider truncate">{title}</p>
        <div className="flex items-baseline gap-1 md:gap-2">
          <h3 className="text-lg md:text-4xl font-black text-slate-900 tracking-tight">{value}</h3>
          <span className="text-slate-300 text-[9px] md:text-sm font-bold">{title.toLowerCase().includes('score') ? '%' : ''}</span>
        </div>
        <div className={`mt-1.5 md:mt-4 inline-flex items-center gap-1 md:gap-2 px-1.5 py-0.5 md:px-3 md:py-1 rounded-full text-[8px] md:text-xs font-bold ${bgColors[color]} text-${color}-700`}>
          {trend}
        </div>
      </div>
    </div>
  );
}

// Quick Action Component
function QuickAction({ href, label, description, icon, color }: {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: 'emerald' | 'blue' | 'amber' | 'indigo' | 'teal';
}) {
  const gradients = {
    emerald: 'from-emerald-500 to-emerald-600 group-hover:from-emerald-400 group-hover:to-emerald-500',
    blue: 'from-blue-500 to-blue-600 group-hover:from-blue-400 group-hover:to-blue-500',
    amber: 'from-amber-500 to-amber-600 group-hover:from-amber-400 group-hover:to-amber-500',
    indigo: 'from-indigo-500 to-indigo-600 group-hover:from-indigo-400 group-hover:to-indigo-500',
    teal: 'from-teal-500 to-teal-600 group-hover:from-teal-400 group-hover:to-teal-500',
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-3 md:gap-5 p-3 md:p-5 rounded-xl md:rounded-2xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-lg transition-all duration-300 group hover:-translate-y-0.5"
    >
      <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br ${gradients[color]} flex items-center justify-center flex-shrink-0 text-white shadow-md transition-all duration-300`}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5 md:w-7 md:h-7' }) : icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-slate-900 font-bold text-sm md:text-lg group-hover:text-emerald-600 transition-colors">{label}</h4>
        <p className="text-slate-500 text-xs md:text-sm truncate">{description}</p>
      </div>
      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-all">
        <svg className="w-3 h-3 md:w-4 md:h-4 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

// Icon Components (Simple versions)
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

