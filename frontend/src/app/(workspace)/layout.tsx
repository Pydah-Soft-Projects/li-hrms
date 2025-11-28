'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { WorkspaceProvider, useWorkspace, setWorkspaceDataFromLogin, Workspace } from '@/contexts/WorkspaceContext';

// Icon components
type IconProps = React.SVGProps<SVGSVGElement>;

const DashboardIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const LeavesIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const EmployeesIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ShiftsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const DepartmentsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M3 21h18" />
    <path d="M5 21V7l8-4v18" />
    <path d="M19 21V11l-6-4" />
  </svg>
);

const AttendanceIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
);

const ProfileIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const SettingsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const LogoutIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const ChevronDownIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CollapseIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M9 18l-6-6 6-6" />
  </svg>
);

const ExpandIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M15 18l6-6-6-6" />
  </svg>
);

// Module code to icon mapping
const moduleIcons: Record<string, React.ComponentType<IconProps>> = {
  DASHBOARD: DashboardIcon,
  LEAVE: LeavesIcon,
  OD: LeavesIcon,
  EMPLOYEE: EmployeesIcon,
  EMPLOYEES: EmployeesIcon,
  SHIFT: ShiftsIcon,
  SHIFTS: ShiftsIcon,
  DEPARTMENT: DepartmentsIcon,
  DEPARTMENTS: DepartmentsIcon,
  ATTENDANCE: AttendanceIcon,
  PROFILE: ProfileIcon,
  SETTINGS: SettingsIcon,
};

// Module code to route mapping
const moduleRoutes: Record<string, string> = {
  DASHBOARD: '/dashboard',
  LEAVE: '/leaves',
  OD: '/od',
  EMPLOYEE: '/employees',
  EMPLOYEES: '/employees',
  SHIFT: '/shifts',
  SHIFTS: '/shifts',
  DEPARTMENT: '/departments',
  DEPARTMENTS: '/departments',
  ATTENDANCE: '/attendance',
  PROFILE: '/profile',
  SETTINGS: '/settings',
};

// Workspace type colors
const workspaceColors: Record<string, { bg: string; text: string; border: string }> = {
  employee: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200' },
  department: { bg: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-200' },
  hr: { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-200' },
  subadmin: { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200' },
  superadmin: { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-200' },
  custom: { bg: 'bg-gray-500', text: 'text-gray-600', border: 'border-gray-200' },
};

function WorkspaceLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaces, activeWorkspace, switchWorkspace, getAvailableModules, isLoading } = useWorkspace();
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const userData = auth.getUser();
    if (userData) {
      setUser({ name: userData.name, email: userData.email, role: userData.role });
    }
  }, []);

  const handleLogout = () => {
    auth.logout();
    router.push('/login');
  };

  const handleWorkspaceSwitch = async (workspace: Workspace) => {
    await switchWorkspace(workspace._id);
    setShowWorkspaceSwitcher(false);
    // Navigate to dashboard of new workspace
    router.push('/dashboard');
  };

  const availableModules = getAvailableModules();
  const workspaceColor = workspaceColors[activeWorkspace?.type || 'custom'];

  // Get navigation items from available modules
  // Combine LEAVE and OD into a single "Leave & OD" item
  const hasLeave = availableModules.some(m => m.moduleCode === 'LEAVE');
  const hasOD = availableModules.some(m => m.moduleCode === 'OD');
  const hasLeaveOrOD = hasLeave || hasOD;

  const navItems: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<IconProps>;
    moduleCode: string;
  }> = [];

  // Process modules, but combine LEAVE and OD
  availableModules.forEach((module) => {
    // Skip OD if LEAVE is also present (we'll add combined item)
    if (module.moduleCode === 'OD' && hasLeave) {
      return;
    }
    
    // If this is LEAVE and OD also exists, create combined item
    if (module.moduleCode === 'LEAVE' && hasOD) {
      navItems.push({
        href: '/leaves',
        label: 'Leave & OD',
        icon: LeavesIcon,
        moduleCode: 'LEAVE_OD',
      });
    } else {
      navItems.push({
        href: moduleRoutes[module.moduleCode] || `/${module.moduleCode.toLowerCase()}`,
        label: module.moduleId?.name || module.moduleCode,
        icon: moduleIcons[module.moduleCode] || DashboardIcon,
        moduleCode: module.moduleCode,
      });
    }
  });

  // Always add Profile at the end
  if (!navItems.find((item) => item.moduleCode === 'PROFILE')) {
    navItems.push({
      href: '/profile',
      label: 'Profile',
      icon: ProfileIcon,
      moduleCode: 'PROFILE',
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Workspace Assigned</h2>
          <p className="text-gray-500 mb-6">You don't have access to any workspace. Please contact your administrator.</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 ease-in-out z-40 ${
          sidebarCollapsed ? 'w-[70px]' : 'w-64'
        }`}
      >
        {/* Collapse/Expand Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors z-50"
        >
          {sidebarCollapsed ? (
            <ExpandIcon className="h-3 w-3 text-black" />
          ) : (
            <CollapseIcon className="h-3 w-3 text-black" />
          )}
        </button>

        <div className="flex flex-col h-full">
          {/* Workspace Header */}
          <div className={`p-4 border-b border-gray-200 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${workspaceColor.bg} flex items-center justify-center text-white font-bold`}>
                  {activeWorkspace.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">{activeWorkspace.name}</h2>
                  <p className="text-xs text-gray-500 capitalize">{activeWorkspace.type} Portal</p>
                </div>
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-lg ${workspaceColor.bg} flex items-center justify-center text-white font-bold`}>
                {activeWorkspace.name[0]}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                // For combined Leave & OD, check both /leaves and /od paths
                const isActive = item.moduleCode === 'LEAVE_OD' 
                  ? (pathname === '/leaves' || pathname === '/od')
                  : pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        isActive
                          ? `bg-gray-100 ${workspaceColor.text} font-medium`
                          : 'text-gray-700 hover:bg-gray-50'
                      } ${sidebarCollapsed ? 'justify-center' : ''}`}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? workspaceColor.text : 'text-gray-500'}`} />
                      {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User Section & Logout */}
          <div className="border-t border-gray-200 p-3 space-y-2">
            {/* User Info */}
            <div className={`flex items-center gap-3 px-3 py-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              {!sidebarCollapsed && user ? (
                <>
                  <div className={`w-8 h-8 rounded-full ${workspaceColor.bg} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                </>
              ) : (
                <div className={`w-8 h-8 rounded-full ${workspaceColor.bg} flex items-center justify-center text-white font-semibold text-sm`}>
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-red-600 hover:bg-red-50 ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
              title={sidebarCollapsed ? 'Logout' : undefined}
            >
              <LogoutIcon className="h-5 w-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="text-sm font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[70px]' : 'ml-64'}`}>
        {/* Top Header with Workspace Switcher */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-3">
            <div>
              {/* Breadcrumb or Page Title can go here */}
            </div>

            {/* Right side - Workspace Switcher (if multiple workspaces) */}
            <div className="flex items-center gap-4">
              {workspaces.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowWorkspaceSwitcher(!showWorkspaceSwitcher)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${workspaceColor.border} bg-white hover:bg-gray-50 transition-colors`}
                  >
                    <div className={`w-6 h-6 rounded ${workspaceColor.bg} flex items-center justify-center text-white text-xs font-bold`}>
                      {activeWorkspace.name[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{activeWorkspace.name}</span>
                    <ChevronDownIcon className={`w-4 h-4 text-gray-500 transition-transform ${showWorkspaceSwitcher ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown */}
                  {showWorkspaceSwitcher && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowWorkspaceSwitcher(false)}
                      />
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-xs font-medium text-gray-500 uppercase">Switch Workspace</p>
                        </div>
                        {workspaces.map((ws) => {
                          const wsColor = workspaceColors[ws.type || 'custom'];
                          const isActive = ws._id === activeWorkspace._id;

                          return (
                            <button
                              key={ws._id}
                              onClick={() => handleWorkspaceSwitch(ws)}
                              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                                isActive ? 'bg-gray-50' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg ${wsColor.bg} flex items-center justify-center text-white font-bold text-sm`}>
                                {ws.name[0]}
                              </div>
                              <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900">{ws.name}</p>
                                <p className="text-xs text-gray-500 capitalize">{ws.type} Portal</p>
                              </div>
                              {isActive && (
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Single workspace indicator */}
              {workspaces.length === 1 && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${workspaceColor.border} border bg-white`}>
                  <div className={`w-5 h-5 rounded ${workspaceColor.bg} flex items-center justify-center text-white text-xs font-bold`}>
                    {activeWorkspace.name[0]}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{activeWorkspace.name}</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = auth.getToken();
    const user = auth.getUser();

    if (!token || !user) {
      router.replace('/login');
      return;
    }

    // If super_admin, redirect to admin panel
    if (user.role === 'super_admin') {
      router.replace('/superadmin/dashboard');
      return;
    }

    setIsAuthenticated(true);
    setIsChecking(false);
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <WorkspaceProvider>
      <WorkspaceLayoutContent>{children}</WorkspaceLayoutContent>
    </WorkspaceProvider>
  );
}

