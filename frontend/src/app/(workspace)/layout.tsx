'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { MODULE_CATEGORIES, isModuleEnabled, isCategoryEnabled } from '@/config/moduleCategories';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider, useWorkspace, setWorkspaceDataFromLogin, Workspace } from '@/contexts/WorkspaceContext';
import Spinner from '@/components/Spinner';

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

const LoansIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const OTPermissionIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ConfusedShiftIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
    <path d="M9 12h6" />
  </svg>
);

const UsersIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ReportsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const AllowancesDeductionsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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

const PayslipsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 18v-6" />
    <path d="M9 15l3 3 3-3" />
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
  LOANS: LoansIcon,
  LOAN: LoansIcon,
  OT_PERMISSIONS: OTPermissionIcon,
  CONFUSED_SHIFTS: ConfusedShiftIcon,
  USERS: UsersIcon,
  REPORTS: ReportsIcon,
  ALLOWANCES_DEDUCTIONS: AllowancesDeductionsIcon,
  PAYROLL_TRANSACTIONS: ReportsIcon,
  PAY_REGISTER: ReportsIcon,
  PAYSLIPS: PayslipsIcon,
  PAYROLL: PayslipsIcon,
  LOANS_SALARY_ADVANCE: LoansIcon,
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
  LOANS: '/loans',
  LOAN: '/loans',
  OT_PERMISSIONS: '/ot-permissions',
  CONFUSED_SHIFTS: '/confused-shifts',
  USERS: '/users',
  REPORTS: '/reports',
  ALLOWANCES_DEDUCTIONS: '/allowances-deductions',
  PAYROLL_TRANSACTIONS: '/payroll-transactions',
  PAY_REGISTER: '/pay-register',
  PAYSLIPS: '/payslips',
  LOANS_SALARY_ADVANCE: '/loans-salary-advance',
};

function WorkspaceLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, isLoading } = useWorkspace();
  const [user, setUser] = useState<{ name: string; email: string; role: string; emp_no?: string; featureControl?: string[] | null } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [featureControl, setFeatureControl] = useState<string[] | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (categoryCode: string) => {
    setCollapsedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryCode)) {
        newSet.delete(categoryCode);
      } else {
        newSet.add(categoryCode);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const fetchFeatureControl = async () => {
      if (!user?.role) return;

      // Priority 1: Check individual user overrides from session
      if (user.featureControl && Array.isArray(user.featureControl) && user.featureControl.length > 0) {
        console.log(`[RBAC] Using individual overrides for user ${user.name}`);
        setFeatureControl(user.featureControl);
        return;
      }

      // Priority 2: Fallback to universal role-based setting from backend
      try {
        const response = await api.getSetting(`feature_control_${user.role}`);
        if (response.success && response.data?.value?.activeModules) {
          console.log(`[RBAC] Using universal role setting for ${user.role}`);
          setFeatureControl(response.data.value.activeModules);
        } else {
          // Priority 3: Hardcoded fallback if setting is not found
          const managementRoles = ['manager', 'hr', 'hod'];
          if (managementRoles.includes(user.role)) {
            setFeatureControl(['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS', 'EMPLOYEES', 'SHIFTS', 'DEPARTMENTS', 'REPORTS']);
          } else {
            setFeatureControl(['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS']);
          }
        }
      } catch (error) {
        console.error('Error fetching RBAC settings:', error);
        const managementRoles = ['manager', 'hr', 'hod'];
        if (managementRoles.includes(user.role)) {
          setFeatureControl(['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS', 'EMPLOYEES', 'SHIFTS', 'DEPARTMENTS', 'REPORTS']);
        } else {
          setFeatureControl(['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS']);
        }
      }
    };
    fetchFeatureControl();
  }, [user?.role, user?.featureControl]);

  useEffect(() => {
    const userData = auth.getUser();
    if (userData) {
      setUser({
        name: userData.name,
        email: userData.email,
        role: userData.role,
        emp_no: userData.emp_no,
        featureControl: userData.featureControl || null
      });
    }
  }, []);

  const handleLogout = () => {
    auth.logout();
    router.push('/login');
  };

  // No workspace switcher needed anymore
  // Unified Theme Colors (Slate/Blue)
  const themeColor = { bg: 'bg-slate-800', text: 'text-slate-900', border: 'border-slate-200' };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-10 h-10" />
          <p className="text-gray-500">Loading modules...</p>
        </div>
      </div>
    );
  }

  // Fallback if no workspace context is loaded yet (should be rare with new context)
  if (!activeWorkspace) {
    // We can just render a skeleton or minimal state
    // But strictly speaking, with the new plan, activeWorkspace should always be present as a dummy
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 ease-in-out z-40 ${sidebarCollapsed ? 'w-[70px]' : 'w-64'
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
          {/* Workspace Header - Simplified */}
          <div className={`p-4 border-b border-gray-200 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
            <div className="flex items-center gap-3 justify-center w-full">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm text-white font-bold">
                L
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-slate-900">Li-HRMS</h2>
                </div>
              )}
            </div>
          </div>

          {/* Navigation - Categorized */}
          <nav className="flex-1 overflow-y-auto py-4 space-y-2">
            {MODULE_CATEGORIES.map(category => {
              // Check if category has any enabled modules
              if (!isCategoryEnabled(category.code, featureControl)) {
                return null;
              }

              const isCategoryCollapsed = collapsedCategories.has(category.code);
              const enabledModules = category.modules.filter(module =>
                isModuleEnabled(module.code, featureControl)
              );

              if (enabledModules.length === 0) return null;

              return (
                <div key={category.code} className="space-y-1">
                  {/* Category Header */}
                  {!sidebarCollapsed && (
                    <button
                      onClick={() => toggleCategory(category.code)}
                      className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span>{category.icon}</span>
                        <span>{category.name}</span>
                      </span>
                      <ChevronDownIcon
                        className={`w-4 h-4 transition-transform ${isCategoryCollapsed ? '-rotate-90' : ''}`}
                      />
                    </button>
                  )}

                  {/* Category Modules */}
                  {(!isCategoryCollapsed || sidebarCollapsed) && (
                    <ul className="space-y-1 px-2">
                      {enabledModules.map(module => {
                        const isActive = pathname === module.href ||
                          (module.code === 'LEAVE_OD' && (pathname === '/leaves' || pathname === '/od'));

                        const Icon = moduleIcons[module.code] || DashboardIcon;

                        return (
                          <li key={module.code}>
                            <Link
                              href={module.href}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive
                                ? 'bg-blue-50 text-blue-600 font-medium shadow-sm'
                                : 'text-gray-700 hover:bg-gray-100'
                                } ${sidebarCollapsed ? 'justify-center' : ''}`}
                              title={sidebarCollapsed ? module.label : ''}
                            >
                              <Icon className="w-5 h-5 flex-shrink-0" />
                              {!sidebarCollapsed && (
                                <span className="text-sm">{module.label}</span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User Section & Logout */}
          <div className="border-t border-gray-200 p-3 space-y-2">
            <div className={`flex items-center gap-3 px-3 py-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              {!sidebarCollapsed && user ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-semibold text-sm flex-shrink-0">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    {user.emp_no && (
                      <p className="text-xs text-blue-600 font-medium">ID: {user.emp_no}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-semibold text-sm">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-red-600 hover:bg-red-50 ${sidebarCollapsed ? 'justify-center' : ''
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
          <Spinner className="w-10 h-10" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <AuthProvider>
      <WorkspaceProvider>
        <WorkspaceLayoutContent>{children}</WorkspaceLayoutContent>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

