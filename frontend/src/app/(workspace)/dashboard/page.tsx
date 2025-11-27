'use client';

import { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';

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
    setLoading(false);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const workspaceType = activeWorkspace?.type || 'employee';

  // Render different dashboard content based on workspace type
  const renderDashboardContent = () => {
    switch (workspaceType) {
      case 'hr':
        return <HRDashboard stats={stats} hasPermission={hasPermission} />;
      case 'department':
        return <HODDashboard stats={stats} hasPermission={hasPermission} />;
      case 'employee':
        return <EmployeeDashboard stats={stats} hasPermission={hasPermission} />;
      default:
        return <EmployeeDashboard stats={stats} hasPermission={hasPermission} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium">{getGreeting()}</p>
            <h1 className="text-3xl font-bold mt-1">{user?.name || 'User'}</h1>
            <p className="text-blue-100 mt-2">
              Welcome to your {activeWorkspace?.name || 'Dashboard'}
            </p>
          </div>
          <div className="hidden md:block">
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      {renderDashboardContent()}
    </div>
  );
}

// HR Dashboard Component
function HRDashboard({ stats, hasPermission }: { stats: DashboardStats; hasPermission: any }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Employees"
          value={stats.totalEmployees || 0}
          icon={<UsersIcon />}
          color="blue"
        />
        <StatCard
          title="Pending Leave Requests"
          value={stats.pendingLeaves || 0}
          icon={<ClockIcon />}
          color="yellow"
        />
        <StatCard
          title="Approved Leaves"
          value={stats.approvedLeaves || 0}
          icon={<CheckIcon />}
          color="green"
        />
        <StatCard
          title="Today Present"
          value={stats.todayPresent || 0}
          icon={<CalendarIcon />}
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction href="/employees" label="Manage Employees" icon={<UsersIcon />} />
          <QuickAction href="/leaves" label="Leave Requests" icon={<CalendarIcon />} />
          <QuickAction href="/shifts" label="Manage Shifts" icon={<ClockIcon />} />
          <QuickAction href="/departments" label="Departments" icon={<BuildingIcon />} />
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="text-center py-8 text-gray-500">
          <p>No recent activity to display</p>
        </div>
      </div>
    </div>
  );
}

// HOD Dashboard Component
function HODDashboard({ stats, hasPermission }: { stats: DashboardStats; hasPermission: any }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Team Members"
          value={stats.totalEmployees || 0}
          icon={<UsersIcon />}
          color="blue"
        />
        <StatCard
          title="Pending Approvals"
          value={stats.teamPendingApprovals || 0}
          icon={<ClockIcon />}
          color="yellow"
        />
        <StatCard
          title="Approved This Month"
          value={stats.approvedLeaves || 0}
          icon={<CheckIcon />}
          color="green"
        />
        <StatCard
          title="Team Present Today"
          value={stats.todayPresent || 0}
          icon={<CalendarIcon />}
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction href="/leaves" label="Pending Approvals" icon={<ClockIcon />} />
          <QuickAction href="/employees" label="Team Members" icon={<UsersIcon />} />
          <QuickAction href="/attendance" label="Team Attendance" icon={<CalendarIcon />} />
          <QuickAction href="/profile" label="My Profile" icon={<UserIcon />} />
        </div>
      </div>

      {/* Pending Approvals List */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
          <a href="/leaves" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All →</a>
        </div>
        <div className="text-center py-8 text-gray-500">
          <p>No pending approvals</p>
        </div>
      </div>
    </div>
  );
}

// Employee Dashboard Component
function EmployeeDashboard({ stats, hasPermission }: { stats: DashboardStats; hasPermission: any }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="My Pending Leaves"
          value={stats.myPendingLeaves || 0}
          icon={<ClockIcon />}
          color="yellow"
        />
        <StatCard
          title="Approved Leaves"
          value={stats.myApprovedLeaves || 0}
          icon={<CheckIcon />}
          color="green"
        />
        <StatCard
          title="Leave Balance"
          value={12}
          icon={<CalendarIcon />}
          color="blue"
        />
        <StatCard
          title="Upcoming Holidays"
          value={stats.upcomingHolidays || 0}
          icon={<StarIcon />}
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction href="/leaves" label="Apply Leave" icon={<CalendarIcon />} />
          <QuickAction href="/od" label="Apply OD" icon={<BriefcaseIcon />} />
          <QuickAction href="/attendance" label="My Attendance" icon={<ClockIcon />} />
          <QuickAction href="/profile" label="My Profile" icon={<UserIcon />} />
        </div>
      </div>

      {/* Recent Leave Requests */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">My Recent Requests</h2>
          <a href="/leaves" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All →</a>
        </div>
        <div className="text-center py-8 text-gray-500">
          <p>No recent requests</p>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Quick Action Component
function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
    >
      <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center text-gray-600 group-hover:text-blue-600 transition-colors">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700 text-center">{label}</span>
    </a>
  );
}

// Icon Components
function UsersIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

