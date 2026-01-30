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

import {
  LayoutDashboard,
  Plane,
  Users,
  Watch,
  Building,
  CalendarClock,
  UserCog,
  Settings,
  PiggyBank,
  AlertTriangle,
  BarChart3,
  Wallet,
  Receipt,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  CreditCard,
  Sheet,
  Banknote
} from 'lucide-react';

// Icon Props type is already compatible usually, but let's clear the old definitions

// Module code to icon mapping
const moduleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  DASHBOARD: LayoutDashboard,
  LEAVE: Plane,
  OD: Plane,
  LEAVE_OD: Plane,
  EMPLOYEE: Users,
  EMPLOYEES: Users,
  SHIFT: Watch,
  SHIFTS: Watch,
  SHIFT_ROSTER: CalendarClock, // Using CalendarClock for consistency with superadmin
  DEPARTMENT: Building,
  DEPARTMENTS: Building,
  ATTENDANCE: CalendarClock,
  PROFILE: UserCog,
  SETTINGS: Settings,
  LOANS: PiggyBank,
  LOAN: PiggyBank,
  OT_PERMISSIONS: Watch, // Or Clock, let's stick to valid ones
  CONFUSED_SHIFTS: AlertTriangle,
  USERS: UserCog,
  REPORTS: BarChart3,
  ALLOWANCES_DEDUCTIONS: Wallet,
  PAYROLL_TRANSACTIONS: CreditCard,
  PAY_REGISTER: Sheet,
  PAYSLIPS: Receipt,
  PAYROLL: Banknote,
  LOANS_SALARY_ADVANCE: PiggyBank,
  MY_ROSTER: CalendarClock,
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
  MY_ROSTER: '/my-roster',
};

function WorkspaceLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, isLoading } = useWorkspace();
  const [user, setUser] = useState<{ name: string; email: string; role: string; emp_no?: string; featureControl?: string[] | null } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [featureControl, setFeatureControl] = useState<string[] | null>(null);


  useEffect(() => {
    const fetchFeatureControl = async () => {
      if (!user?.role) return;

      // Priority 1: Check individual user overrides from session
      // NOTE: We are disabling this early return to ensure role-based settings (which might change) are always fetched fresh
      // If we want to support true individual overrides, the backend should merge them or we should do it here
      if (user.featureControl && Array.isArray(user.featureControl) && user.featureControl.length > 0) {
        console.log(`[RBAC] Session has overrides for user ${user.name}, but checking for fresh role updates...`);
        // We don't return here anymore, allowing the API call to potentially update/override
      }

      // Priority 2: Fallback to universal role-based setting from backend
      try {
        const response = await api.getSetting(`feature_control_${user.role}`);
        if (response.success && response.data?.value?.activeModules) {
          console.log(`[RBAC] Using universal role setting for ${user.role}`);
          let modules = response.data.value.activeModules;

          setFeatureControl(modules);
        } else {
          // Priority 3: Hardcoded fallback if setting is not found
          console.log(`[RBAC] Setting not found for ${user.role}, using hardcoded fallback`);
          const managementRoles = ['manager', 'hr', 'hod', 'subadmin', 'sub_admin'];
          if (managementRoles.includes(user.role)) {
            const allModules = MODULE_CATEGORIES.flatMap(c => c.modules.map(m => m.code));
            console.log('[RBAC] Applying full management fallback');
            setFeatureControl(allModules);
          } else {
            console.log('[RBAC] Applying employee fallback');
            setFeatureControl(['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS', 'MY_ROSTER']);
          }
        }
      } catch (error) {
        console.error('Error fetching RBAC settings:', error);
        const managementRoles = ['manager', 'hr', 'hod', 'subadmin', 'sub_admin'];
        if (managementRoles.includes(user.role)) {
          setFeatureControl(MODULE_CATEGORIES.flatMap(c => c.modules.map(m => m.code)));
        } else {
          setFeatureControl(['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS', 'MY_ROSTER']);
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
        className={`fixed top-0 left-0 h-screen bg-white border-r border-slate-200/60 transition-all duration-300 ease-in-out z-10 ${sidebarCollapsed ? 'w-[70px]' : 'w-[240px]'}`}
      >
        {/* Collapse/Expand Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors z-50 text-slate-500"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo/Header */}
          <div className={`px-4 py-4 flex items-center border-b border-slate-200/60 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
                <span className="text-sm font-bold text-white">H</span>
              </div>
              {!sidebarCollapsed && (
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">HRMS</h2>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300">
            {MODULE_CATEGORIES.map(category => {
              if (!isCategoryEnabled(category.code, featureControl)) {
                return null;
              }

              const enabledModules = category.modules.filter(module =>
                isModuleEnabled(module.code, featureControl)
              );

              if (enabledModules.length === 0) return null;

              return (
                <div key={category.code}>
                  {/* Category Header */}
                  {!sidebarCollapsed && (
                    <h3 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {category.name}
                    </h3>
                  )}

                  <ul className="space-y-1">
                    {enabledModules.map(module => {
                      const isActive = pathname === module.href ||
                        (module.code === 'LEAVE_OD' && (pathname === '/leaves' || pathname === '/od'));

                      const Icon = moduleIcons[module.code] || LayoutDashboard;

                      return (
                        <li key={module.code}>
                          <Link
                            href={module.href}
                            className={`flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                              ${isActive
                                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 font-medium shadow-sm'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                              }
                              ${sidebarCollapsed ? 'justify-center px-2' : ''}
                            `}
                            title={sidebarCollapsed ? module.label : undefined}
                          >
                            <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />

                            {!sidebarCollapsed && (
                              <span className="ms-3 text-sm">{module.label}</span>
                            )}

                            {/* Active Indicator Strip */}
                            {isActive && !sidebarCollapsed && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-500 rounded-r-full" />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* User Section & Logout */}
          <div className="border-t border-slate-200/60 p-4 space-y-2 bg-slate-50/50">
            {/* Profile Link - Mimicking Sidebar.tsx style */}
            <div
              className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-200
                ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              {!sidebarCollapsed && (
                <div className="shrink-0 max-w-[140px]">
                  <p className="text-sm font-semibold text-slate-900 truncate">{user?.name || 'User'}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user?.role || '...'}</p>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-slate-500 hover:bg-red-50 hover:text-red-600
                ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? 'Logout' : undefined}
            >
              <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="text-sm font-medium">Logout</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[70px]' : 'ml-[240px]'}`}>


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

