"use client";

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { auth } from '@/lib/auth';
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
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = auth.getUser();
    if (userData) {
      setUser({ name: userData.name, role: userData.role });
    }

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

    fetchStats();
  }, []);

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Welcome Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-green-950 via-green-800 to-green-950 rounded-3xl p-8 md:p-12 text-white shadow-2xl shadow-indigo-900/20">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <p className="text-emerald-300/80 text-sm font-semibold tracking-wider uppercase mb-2">{getGreeting()}</p>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              Welcome back, <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">{user?.name?.split(' ')[0] || 'User'}</span>
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="h-24 w-px bg-white/10 hidden md:block" />
            <div className="text-center md:text-left">
              <div className="text-3xl font-bold text-white mb-1">{new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
              <div className="text-emerald-300/60 font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</div>
            </div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          highlight={true}
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
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          highlight={true}
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

        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Department Feed</h2>
          </div>
          <div className="space-y-4">
            {stats.departmentFeed && stats.departmentFeed.length > 0 ? (
              stats.departmentFeed.map((req: any) => (
                <div key={req._id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                      {req.employeeId?.employee_name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{req.employeeId?.employee_name || 'Unknown Employee'}</h4>
                      <p className="text-slate-500 text-xs">{req.leaveType} • {req.numberOfDays} days</p>
                    </div>
                  </div>
                  <Link href={`/leaves/${req._id}`} className="text-xs font-semibold text-indigo-600 hover:underline">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
  const themes = {
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    blue: 'bg-blue-500/10 text-blue-600',
    indigo: 'bg-indigo-500/10 text-indigo-600',
  };

  const borderColors = {
    emerald: 'emerald-500',
    amber: 'amber-500',
    blue: 'blue-500',
    indigo: 'indigo-500',
  };

  return (
    <div className={`
      relative bg-white rounded-3xl p-6 border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group
      ${highlight ? `border-${borderColors[color]} border-2 shadow-lg shadow-${borderColors[color]}/5` : 'border-slate-100'}
    `}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl ${themes[color]} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        {highlight && (
          <span className={`animate-pulse inline-flex h-3 w-3 rounded-full bg-${borderColors[color]}`} />
        )}
      </div>
      <div>
        <p className="text-slate-500 font-medium text-sm mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-black text-slate-900">{value}</h3>
          <span className="text-slate-400 text-xs font-semibold">{title.toLowerCase().includes('score') ? '%' : ''}</span>
        </div>
        <p className="text-slate-400 text-xs mt-2 flex items-center gap-1 font-medium">
          {trend}
        </p>
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
  const iconColors = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
  };

  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 rounded-2xl border border-slate-50 hover:border-slate-200 hover:bg-slate-50/50 transition-all group"
    >
      <div className={`w-12 h-12 rounded-xl border ${iconColors[color]} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-6 h-6' }) : icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-slate-900 font-bold truncate group-hover:text-emerald-600 transition-colors">{label}</h4>
        <p className="text-slate-500 text-xs truncate">{description}</p>
      </div>
      <div className="text-slate-300 group-hover:translate-x-1 transition-transform">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

