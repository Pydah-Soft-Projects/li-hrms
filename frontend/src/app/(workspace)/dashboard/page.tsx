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
  icon?: React.ReactNode;
}

const DashboardCard = ({ title, value, description, change, statusBadge, icon }: DashboardCardProps) => (
  <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 md:p-6 hover:bg-bg-surface/80 transition-all duration-300 shadow-sm group">
    <div className="flex justify-between items-start mb-4 gap-2">
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-xs md:text-sm font-semibold text-text-secondary uppercase tracking-wider truncate">{title}</p>
        <h3 className="text-xl md:text-3xl font-black text-text-primary tracking-tight truncate">{value}</h3>
      </div>
      <div className="p-2 md:p-3 rounded-xl bg-bg-base border border-border-base text-text-secondary group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
        {icon}
      </div>
    </div>

    <div className="flex items-center justify-between gap-2 mt-auto">
      <div className="flex flex-col">
        <p className="text-[10px] md:text-xs text-text-secondary font-medium truncate">{description}</p>
        {change && <span className="text-[9px] md:text-[10px] text-text-secondary font-normal">{change}</span>}
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

      <div className="relative z-10 p-4 sm:p-5 lg:p-6 space-y-6">
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
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 p-6 shadow-xl shadow-indigo-500/20 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all duration-500 group-hover:bg-white/20" />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner">
                  <Clock className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Your Work Status</p>
                  <h3 className="text-2xl font-black text-white capitalize">{isPresent(attendanceData) ? 'Clocked In' : 'Not Clocked In'}</h3>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                <div className="px-5 py-2.5 rounded-2xl bg-black/10 backdrop-blur-md border border-white/10 flex flex-col items-center min-w-[100px]">
                  <span className="text-[10px] font-bold text-white/60 uppercase">In Time</span>
                  <span className="text-lg font-black text-white font-mono">{attendanceData?.[0]?.inTime ? new Date(attendanceData[0].inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
                <div className="px-5 py-2.5 rounded-2xl bg-black/10 backdrop-blur-md border border-white/10 flex flex-col items-center min-w-[100px]">
                  <span className="text-[10px] font-bold text-white/60 uppercase">Expected Out</span>
                  <span className="text-lg font-black text-white font-mono">{attendanceData?.[0]?.outTime ? new Date(attendanceData[0].outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
                <div className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg ${isPresent(attendanceData) ? 'bg-white text-indigo-700' : 'bg-white/10 text-white border border-white/20'
                  }`}>
                  {getStatusDisplay(attendanceData)}
                </div>
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
                              <span className="text-sm md:text-base font-bold text-white font-mono">{shift.inTime ? new Date(shift.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">Out Time</span>
                              <span className="text-sm md:text-base font-bold text-white font-mono">{shift.outTime ? new Date(shift.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
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
                            <span className="text-sm md:text-base font-bold text-white font-mono">{record.inTime ? new Date(record.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] md:text-xs font-semibold text-emerald-100 uppercase tracking-wider">Out Time</span>
                            <span className="text-sm md:text-base font-bold text-white font-mono">{record.outTime ? new Date(record.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
        <div className="lg:col-span-1 p-6 md:p-8 rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-lg md:text-xl font-black text-text-primary mb-6 flex items-center gap-3">
            <span className="w-2 h-6 bg-indigo-500 rounded-full" />
            Quick Access
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <QuickLink href="/employees" label="Directory" desc="Manage workforce info" icon={<Users />} color="indigo" />
            <QuickLink href="/attendance" label="Time Logs" desc="Track daily presence" icon={<Calendar />} color="blue" />
            <QuickLink href="/leaves" label="Absence" desc="Review leave/OD requests" icon={<Clock />} color="amber" />
            <QuickLink href="/pay-register" label="Payroll" desc="Calculate earnings" icon={<Building2 />} color="indigo" />
          </div>
        </div>

        <div className="lg:col-span-2 p-6 md:p-8 rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-lg md:text-xl font-black text-text-primary mb-6 flex items-center gap-3">
            <span className="w-2 h-6 bg-blue-500 rounded-full" />
            System Updates
          </h2>
          <div className="space-y-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
        <div className="p-6 md:p-8 rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-lg md:text-xl font-black text-text-primary mb-6 flex items-center gap-3">
            <span className="w-2 h-6 bg-indigo-500 rounded-full" />
            Team Management
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <QuickLink href="/leaves" label="Reviews" desc="Approve team requests" icon={<CheckCircle2 />} color="amber" />
            <QuickLink href="/attendance" label="Time Tracking" desc="Review daily presence" icon={<Calendar />} color="blue" />
            <QuickLink href="/employees" label="Staff Directory" desc="Member profiles" icon={<Users />} color="indigo" />
          </div>
        </div>

        <div className="p-6 md:p-8 rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm overflow-hidden">
          <h2 className="text-lg md:text-xl font-black text-text-primary mb-6">Recent Team Requests</h2>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.departmentFeed && stats.departmentFeed.length > 0 ? (
              stats.departmentFeed.map((req: any) => (
                <div key={req._id} className="flex items-center justify-between p-4 rounded-2xl bg-bg-base/50 border border-border-base group hover:bg-bg-base transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                      {req.employeeId?.employee_name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="font-bold text-text-primary text-sm">{req.employeeId?.employee_name || 'Staff'}</h4>
                      <p className="text-text-secondary text-xs">{req.leaveType} • {req.numberOfDays}d</p>
                    </div>
                  </div>
                  <Link href={`/leaves`} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                    Review
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-text-secondary font-medium">No pending requests</p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
        <div className="lg:col-span-1 p-6 md:p-8 rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm h-fit">
          <h2 className="text-lg md:text-xl font-black text-text-primary mb-6 flex items-center gap-3">
            <span className="w-2 h-6 bg-indigo-500 rounded-full" />
            My Portal
          </h2>
          <div className="grid grid-cols-1 gap-4">
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
    <Link href={href} className="flex items-center gap-4 p-4 rounded-2xl bg-bg-surface border border-border-base hover:border-indigo-200 hover:shadow-md transition-all group">
      <div className={`p-3 rounded-xl ${colors[color]} group-hover:scale-110 transition-transform`}>
        {React.cloneElement(icon, { className: 'w-5 h-5' })}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-text-primary text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{label}</h4>
        <p className="text-xs text-text-secondary truncate">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-text-secondary/30 group-hover:translate-x-1 transition-transform" />
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
    <div className="flex items-center justify-between p-4 rounded-2xl bg-bg-base/50 border border-border-base group hover:bg-bg-base transition-colors">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl group-hover:scale-110 transition-transform ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-text-primary text-sm">{title}</h3>
          <p className="text-xs text-text-secondary">{desc}</p>
        </div>
      </div>
      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${colors[color]}`}>
        {status}
      </span>
    </div>
  );
}

