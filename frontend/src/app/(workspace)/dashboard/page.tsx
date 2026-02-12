"use client";

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import Link from 'next/link';
import RecentActivityFeed from '@/components/attendance/RecentActivityFeed';
import {
  Users,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  FileText,
  Star,
  LayoutDashboard,
  ChevronRight
} from 'lucide-react';

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

interface DashboardCardProps {
  title: string;
  value: string | number;
  description: string;
  change?: string;
  statusBadge?: React.ReactNode;
  icon?: React.ReactElement<{ className?: string }>;
}

const DashboardCard = ({ title, value, description, change, statusBadge, icon }: DashboardCardProps) => (
  <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-3 md:p-6 hover:bg-bg-surface/80 transition-all duration-300 shadow-sm group">
    <div className="flex justify-between items-start mb-3 md:mb-4 gap-2">
      <div className="flex flex-col gap-0.5 md:gap-1 min-w-0">
        <p className="text-[10px] md:text-sm font-semibold text-text-secondary uppercase tracking-wide md:tracking-wider truncate">{title}</p>
        <h3 className="text-lg md:text-3xl font-black text-text-primary tracking-tight truncate">{value}</h3>
      </div>
      <div className="p-1.5 md:p-3 rounded-lg md:rounded-xl bg-bg-base border border-border-base text-text-secondary group-hover:scale-110 transition-transform duration-300 shrink-0">
        {icon && React.cloneElement(icon, { className: 'w-4 h-4 md:w-6 md:h-6' })}
      </div>
    </div>

    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-1.5 md:gap-2 mt-auto">
      <div className="flex flex-col">
        <p className="text-[9px] md:text-xs text-text-secondary font-medium truncate">{description}</p>
        {change && <span className="text-[8px] md:text-[10px] text-text-secondary font-normal">{change}</span>}
      </div>
      {statusBadge}
    </div>
  </div>
);

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState<any[] | null>(null);
  const [currentDate] = useState(new Date());

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsRes, attendanceRes] = await Promise.all([
          api.getDashboardStats(),
          (async () => {
            const empNo = user?.emp_no || user?.employeeId || (user as any)?.employeeNumber;
            if (!empNo) return { success: false };
            const today = new Date().toISOString().split('T')[0];
            return api.getAttendanceDetail(empNo, today);
          })()
        ]);

        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data);
        }

        if (attendanceRes.success && attendanceRes.data) {
          setAttendanceData([attendanceRes.data]);
        } else {
          setAttendanceData([]);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const userRole = user?.role || activeWorkspace?.type || 'employee';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderDashboardContent = () => {
    if (userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') {
      return <HRDashboard stats={stats} />;
    }
    if (userRole === 'hod' || userRole === 'manager') {
      return <HODDashboard stats={stats} />;
    }
    return <EmployeeDashboard stats={stats} />;
  };

  const isPresent = (data: any[] | null) => {
    if (!data || data.length === 0) return false;
    const status = data[0].status?.toUpperCase();
    return status === 'PRESENT' || status === 'PARTIAL' || status === 'HALF_DAY';
  };

  const getStatusDisplay = (data: any[] | null) => {
    if (!data || data.length === 0) return 'ABSENT';
    return data[0].status || 'Running';
  };

  return (
    <div className="relative min-h-screen -m-4 sm:-m-5 lg:-m-6">
      {/* Background Grid Pattern */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-bg-base/50 bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px]"></div>

      <div className="relative z-10 pt-11 p-4 sm:p-5 lg:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-text-primary capitalize">Welcome Back, {user?.name?.split(' ')[0]}</h1>
              <p className="text-sm text-text-secondary font-medium">Here&apos;s what&apos;s happening today</p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-bold text-text-secondary">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>

        {/* Global Attendance Card (Always relevant for employees/managers) */}
        {userRole !== 'super_admin' && (
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 p-4 md:p-6 shadow-xl shadow-indigo-500/20 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all duration-500 group-hover:bg-white/20" />

            <div className="relative z-10 flex flex-col md:flex-row md:flex-wrap items-start md:items-center justify-between gap-4 md:gap-6">
              <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner shrink-0">
                  <Clock className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <div className="flex-1 md:flex-initial">
                  <p className="text-[10px] md:text-xs font-bold text-white/70 uppercase tracking-wide md:tracking-widest">Your Work Status</p>
                  <h3 className="text-base md:text-2xl font-black text-white capitalize">{isPresent(attendanceData) ? 'Clocked In' : 'Not Clocked In'}</h3>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:gap-4 items-center w-full md:w-auto">
                <div className="flex-1 md:flex-initial px-3 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl bg-black/10 backdrop-blur-md border border-white/10 flex flex-col items-center min-w-[80px] md:min-w-[100px]">
                  <span className="text-[8px] md:text-[10px] font-bold text-white/60 uppercase">In Time</span>
                  <span className="text-sm md:text-lg font-black text-white font-mono">{attendanceData?.[0]?.inTime ? new Date(attendanceData[0].inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
                <div className="flex-1 md:flex-initial px-3 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl bg-black/10 backdrop-blur-md border border-white/10 flex flex-col items-center min-w-[80px] md:min-w-[100px]">
                  <span className="text-[8px] md:text-[10px] font-bold text-white/60 uppercase">Expected Out</span>
                  <span className="text-sm md:text-lg font-black text-white font-mono">{attendanceData?.[0]?.outTime ? new Date(attendanceData[0].outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
                <div className={`px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wide md:tracking-widest shadow-lg ${isPresent(attendanceData) ? 'bg-white text-indigo-700' : 'bg-white/10 text-white border border-white/20'
                  }`}>
                  {getStatusDisplay(attendanceData)}
                </div>
              </div>
            </div>
            <div className="bg-black/10 rounded-xl md:rounded-2xl p-3 md:p-4 border border-white/10 backdrop-blur-sm mt-3 md:mt-4">
              {attendanceData && attendanceData.length > 0 ? (
                attendanceData.map((record: any, recordIdx: number) => (
                  <div key={recordIdx} className="w-full">
                    {record.shifts && record.shifts.length > 0 ? (
                      record.shifts.map((shift: any, shiftIdx: number) => (
                        <div key={`${recordIdx}-${shiftIdx}`} className={`flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 ${shiftIdx > 0 ? 'mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/10' : ''}`}>
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Shift Info</span>
                            <span className="text-[10px] md:text-xs font-bold text-white">{shift.shiftName || shift.shiftId?.name || 'General Shift'}</span>
                          </div>
                          <div className="flex gap-4 md:gap-0">
                            <div className="flex flex-col flex-1 md:flex-initial md:items-center">
                              <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">In Time</span>
                              <span className="text-xs md:text-sm font-bold text-white font-mono">{shift.inTime ? new Date(shift.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            </div>
                            <div className="flex flex-col flex-1 md:flex-initial md:items-end">
                              <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Out Time</span>
                              <span className="text-xs md:text-sm font-bold text-white font-mono">{shift.outTime ? new Date(shift.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
                        <div className="flex flex-col">
                          <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Shift Info</span>
                          <span className="text-[10px] md:text-xs font-bold text-white">{record.shiftId?.name || record.shift || 'General Shift'}</span>
                        </div>
                        <div className="flex gap-4 md:gap-0">
                          <div className="flex flex-col flex-1 md:flex-initial md:items-center">
                            <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">In Time</span>
                            <span className="text-xs md:text-sm font-bold text-white font-mono">{record.inTime ? new Date(record.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                          </div>
                          <div className="flex flex-col flex-1 md:flex-initial md:items-end">
                            <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Out Time</span>
                            <span className="text-xs md:text-sm font-bold text-white font-mono">{record.outTime ? new Date(record.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-2 flex flex-col items-center">
                  <p className="text-emerald-50 text-xs md:text-sm font-medium">No check-in found</p>
                  <p className="text-emerald-200/60 text-[10px] md:text-xs">Waiting for attendance log</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Role-specific dashboards */}
        {renderDashboardContent()}
      </div>
    </div>
  );
}

// HR/Admin Dashboard Component
function HRDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <DashboardCard
          title="Total Workforce"
          value={stats.totalEmployees || 0}
          description="Active employees"
          icon={<Users className="w-full h-full" />}
          statusBadge={<span className="text-[10px] font-bold text-status-positive bg-status-positive/10 px-2 py-0.5 rounded-full">+4 this mo</span>}
        />
        <DashboardCard
          title="Pending Approvals"
          value={stats.pendingLeaves || 0}
          description="Requires your action"
          icon={<Clock className="w-full h-full" />}
          statusBadge={stats.pendingLeaves ? <span className="text-[10px] font-bold text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full animate-pulse">Urgent</span> : null}
        />
        <DashboardCard
          title="Ready for Payroll"
          value={stats.approvedLeaves || 0}
          description="Finalized records"
          icon={<CheckCircle2 className="w-full h-full" />}
        />
        <DashboardCard
          title="Active Today"
          value={stats.todayPresent || 0}
          description="92% Attendance"
          icon={<Calendar className="w-full h-full" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-1 p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
            Quick Access
          </h2>
          <div className="grid grid-cols-1 gap-2 md:gap-4">
            <QuickLink href="/employees" label="Directory" desc="Manage workforce info" icon={<Users />} color="indigo" />
            <QuickLink href="/attendance" label="Time Logs" desc="Track daily presence" icon={<Calendar />} color="blue" />
            <QuickLink href="/leaves" label="Absence" desc="Review leave/OD requests" icon={<Clock />} color="amber" />
            <QuickLink href="/pay-register" label="Payroll" desc="Calculate earnings" icon={<Building2 />} color="indigo" />
          </div>
        </div>

        <div className="lg:col-span-2 p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-blue-500 rounded-full" />
            System Updates
          </h2>
          <div className="space-y-2 md:space-y-4">
            <NotificationItem icon="✓" title="Sync Complete" desc="Biometric logs processed today" status="Success" color="positive" />
            <NotificationItem icon="!" title="Payroll Deadline" desc="Finalize arrears by tomorrow" status="Urgent" color="warning" />
            <NotificationItem icon="i" title="Policy Update" desc="New OT rules active next cycle" status="Info" color="primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

// HOD Dashboard Component
function HODDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <DashboardCard
          title="Team Strength"
          value={stats.totalEmployees || 0}
          description="Total members"
          icon={<Users className="w-full h-full" />}
        />
        <DashboardCard
          title="Team Present"
          value={stats.todayPresent || 0}
          description={`${stats.totalEmployees ? stats.totalEmployees - (stats.todayPresent || 0) : 0} Away today`}
          icon={<Calendar className="w-full h-full" />}
        />
        <DashboardCard
          title="Pending Team Requests"
          value={stats.teamPendingApprovals || 0}
          description="Awaiting decision"
          icon={<Clock className="w-full h-full" />}
          statusBadge={stats.teamPendingApprovals ? <span className="text-[10px] font-bold text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full">Urgent</span> : null}
        />
        <DashboardCard
          title="Efficiency Score"
          value={`${stats.efficiencyScore || 0}%`}
          description="Department avg"
          icon={<CheckCircle2 className="w-full h-full" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
            Team Management
          </h2>
          <div className="grid grid-cols-1 gap-2 md:gap-4">
            <QuickLink href="/leaves" label="Reviews" desc="Approve team requests" icon={<CheckCircle2 />} color="amber" />
            <QuickLink href="/attendance" label="Time Tracking" desc="Review daily presence" icon={<Calendar />} color="blue" />
            <QuickLink href="/employees" label="Staff Directory" desc="Member profiles" icon={<Users />} color="indigo" />
          </div>
        </div>

        <div className="p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm overflow-hidden">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6">Recent Team Requests</h2>
          <div className="space-y-2 md:space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.departmentFeed && stats.departmentFeed.length > 0 ? (
              stats.departmentFeed.map((req: any) => (
                <div key={req._id} className="flex items-center justify-between p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-bg-base/50 border border-border-base group hover:bg-bg-base transition-colors">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-xs md:text-base">
                      {req.employeeId?.employee_name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="font-bold text-text-primary text-xs md:text-sm">{req.employeeId?.employee_name || 'Staff'}</h4>
                      <p className="text-text-secondary text-[10px] md:text-xs">{req.leaveType} • {req.numberOfDays}d</p>
                    </div>
                  </div>
                  <Link href={`/leaves`} className="text-[10px] md:text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 md:px-3 py-1 md:py-1.5 rounded-md md:rounded-lg transition-colors">
                    Review
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-center py-8 md:py-12">
                <p className="text-text-secondary font-medium text-sm md:text-base">No pending requests</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Employee Dashboard Component
function EmployeeDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <DashboardCard
          title="Leave Balance"
          value={stats.leaveBalance || 0}
          description="Available days"
          icon={<Calendar className="w-full h-full" />}
        />
        <DashboardCard
          title="Active Requests"
          value={stats.myPendingLeaves || 0}
          description="Awaiting approval"
          icon={<Clock className="w-full h-full" />}
        />
        <DashboardCard
          title="Monthly Presence"
          value={stats.todayPresent || 0}
          description="Total present days"
          icon={<CheckCircle2 className="w-full h-full" />}
        />
        <DashboardCard
          title="Next Holiday"
          value={stats.upcomingHolidays || 0}
          description="Upcoming events"
          icon={<Star className="w-full h-full" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-1 p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm h-fit">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
            My Portal
          </h2>
          <div className="grid grid-cols-1 gap-2 md:gap-4">
            <QuickLink href="/leaves" label="Apply Absence" desc="Leave or OD request" icon={<Calendar />} color="indigo" />
            <QuickLink href="/attendance" label="Time Card" desc="Review daily logs" icon={<Clock />} color="blue" />
            <QuickLink href="/payslips" label="Earnings" desc="View monthly payslips" icon={<FileText />} color="teal" />
          </div>
        </div>

        <div className="lg:col-span-2 h-[500px] overflow-hidden">
          <RecentActivityFeed />
        </div>
      </div>
    </div>
  );
}

// Helper Components
function QuickLink({ href, label, desc, icon, color }: { href: string; label: string; desc: string; icon: any; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    teal: 'text-teal-600 bg-teal-50 border-teal-100',
  };

  return (
    <Link href={href} className="flex items-center gap-2 md:gap-4 p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-bg-surface border border-border-base hover:border-indigo-200 hover:shadow-md transition-all group">
      <div className={`p-2 md:p-3 rounded-lg md:rounded-xl ${colors[color]} group-hover:scale-110 transition-transform shrink-0`}>
        {React.cloneElement(icon, { className: 'w-4 h-4 md:w-5 md:h-5' })}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-text-primary text-xs md:text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{label}</h4>
        <p className="text-[10px] md:text-xs text-text-secondary truncate">{desc}</p>
      </div>
      <ChevronRight className="w-3 h-3 md:w-4 md:h-4 text-text-secondary/30 group-hover:translate-x-1 transition-transform shrink-0" />
    </Link>
  );
}

function NotificationItem({ icon, title, desc, status, color }: { icon: string; title: string; desc: string; status: string; color: string }) {
  const colors: Record<string, string> = {
    positive: 'text-status-positive bg-status-positive/10',
    warning: 'text-status-warning bg-status-warning/10',
    primary: 'text-indigo-600 bg-indigo-600/10',
  };

  return (
    <div className="flex items-center justify-between p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-bg-base/50 border border-border-base group hover:bg-bg-base transition-colors">
      <div className="flex items-center gap-2 md:gap-4">
        <div className={`w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center font-black text-base md:text-xl group-hover:scale-110 transition-transform shrink-0 ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-text-primary text-xs md:text-sm">{title}</h3>
          <p className="text-[10px] md:text-xs text-text-secondary">{desc}</p>
        </div>
      </div>
      <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-wide md:tracking-widest px-2 md:px-3 py-0.5 md:py-1 rounded-full shrink-0 ${colors[color]}`}>
        {status}
      </span>
    </div>
  );
}

