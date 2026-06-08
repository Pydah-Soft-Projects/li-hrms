'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { MODULE_CATEGORIES, isModuleEnabled, isCategoryEnabled } from '@/config/moduleCategories';
import { CompanyBrandMark } from '@/components/CompanyBrandMark';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import {
  LedgerSidebarShell,
  LedgerSidebarCategory,
  LedgerSidebarLink,
  LedgerSidebarUserCard,
} from '@/components/ledger/LedgerSidebar';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  Settings,
  PiggyBank,
  Receipt,
  LogOut,
  Layers,
  Briefcase,
  Gift,
  Clock,
  Cake,
  CalendarHeart,
  CalendarClock,
  CalendarDays,
  Timer,
  Fingerprint,
  UserCircle,
  HandCoins,
  AlertOctagon,
  LineChart,
  Calculator,
  ArrowRightLeft,
  ScrollText,
  BadgeDollarSign,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

const moduleIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  DASHBOARD: LayoutDashboard,
  LEAVE: CalendarClock,
  OD: Briefcase,
  LEAVE_OD: CalendarDays,
  LEAVE_REGISTER: ScrollText,
  CCL: Gift,
  EMPLOYEE: Users,
  EMPLOYEES: Users,
  SHIFT: Clock,
  SHIFTS: Clock,
  SHIFT_ROSTER: CalendarDays,
  DEPARTMENT: Building2,
  DEPARTMENTS: Building2,
  EMPLOYEE_GROUPS: Layers,
  ATTENDANCE: Fingerprint,
  PROFILE: UserCircle,
  SETTINGS: Settings,
  LOANS: PiggyBank,
  LOAN: PiggyBank,
  OT_PERMISSIONS: Timer,
  CONFUSED_SHIFTS: AlertOctagon,
  USERS: UserCog,
  REPORTS: LineChart,
  ALLOWANCES_DEDUCTIONS: Calculator,
  PAYROLL_TRANSACTIONS: ArrowRightLeft,
  PAY_REGISTER: ScrollText,
  PAYSHEET: Receipt,
  PAYSLIPS: Receipt,
  PAYROLL: BadgeDollarSign,
  LOANS_SALARY_ADVANCE: HandCoins,
  MANUAL_DEDUCTIONS: TrendingDown,
  HOLIDAY_CALENDAR: CalendarHeart,
  RESIGNATION: LogOut,
  PROMOTIONS_TRANSFERS: TrendingUp,
  EMPLOYEE_BIRTHDAYS: Cake,
  ASSETS_MANAGEMENT: HandCoins,
};

function isModulePathActive(moduleCode: string, pathname: string): boolean {
  const checks: Record<string, boolean> = {
    LEAVE_OD: pathname === '/leaves' || pathname === '/od',
    LEAVE_REGISTER: pathname === '/leave-register',
    CCL: pathname === '/ccl',
    RESIGNATION: pathname === '/resignations',
    PROMOTIONS_TRANSFERS: pathname === '/promotions-transfers',
    ASSETS_MANAGEMENT: pathname === '/assets-management',
    EMPLOYEE_BIRTHDAYS: pathname === '/employee-birthdays',
    EMPLOYEE_GROUPS: pathname === '/employee-groups',
    LOANS: pathname === '/loans',
  };
  if (moduleCode in checks) return checks[moduleCode];
  const module = MODULE_CATEGORIES.flatMap((c) => c.modules).find((m) => m.code === moduleCode);
  return module ? pathname === module.href : false;
}

export default function WorkspaceSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: string;
    emp_no?: string;
    featureControl?: string[] | null;
  } | null>(null);
  const { profile: companyProfile } = useCompanyProfile();
  const [featureControl, setFeatureControl] = useState<string[] | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userData = auth.getUser();
    if (userData) {
      setUser({
        name: userData.name,
        email: userData.email,
        role: userData.role,
        emp_no: userData.emp_no,
        featureControl: userData.featureControl || null,
      });
    }
  }, []);

  useEffect(() => {
    const fetchFeatureControl = async () => {
      if (!user?.role) return;

      if (user.featureControl && Array.isArray(user.featureControl) && user.featureControl.length > 0) {
        setFeatureControl(user.featureControl);
        return;
      }

      try {
        const response = await api.getSetting(`feature_control_${user.role}`);
        if (response.success && response.data?.value && Array.isArray(response.data.value.activeModules)) {
          setFeatureControl(response.data.value.activeModules);
          return;
        }
      } catch (error) {
        console.error('Error fetching RBAC settings:', error);
      }

      const managementRoles = ['manager', 'hr', 'hod'];
      if (managementRoles.includes(user.role)) {
        setFeatureControl(MODULE_CATEGORIES.flatMap((c) => c.modules.map((m) => m.code)));
      } else {
        setFeatureControl(['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS']);
      }
    };
    fetchFeatureControl();
  }, [user?.role, user?.featureControl]);

  const handleLogout = async () => {
    if (!(await auth.logoutWithConfirmation())) return;
    router.push('/login');
  };

  if (!mounted) return null;

  const navCollapsed = isCollapsed && !isMobileOpen;

  return (
    <LedgerSidebarShell
      isCollapsed={isCollapsed}
      isMobileOpen={isMobileOpen}
      onToggleCollapse={toggleSidebar}
      onMobileOpen={() => setIsMobileOpen(true)}
      onMobileClose={() => setIsMobileOpen(false)}
      header={
        <CompanyBrandMark
          profile={companyProfile}
          collapsed={navCollapsed}
        />
      }
      footer={
        <LedgerSidebarUserCard
          profileHref="/profile"
          name={user?.name || 'User'}
          subtitle={user?.role?.replace(/_/g, ' ') || '...'}
          collapsed={navCollapsed}
          onNavigate={() => setIsMobileOpen(false)}
          onLogout={handleLogout}
        />
      }
    >
      {MODULE_CATEGORIES.map((category) => {
        if (!isCategoryEnabled(category.code, featureControl)) return null;

        const enabledModules = category.modules.filter((module) =>
          isModuleEnabled(module.code, featureControl),
        );
        if (enabledModules.length === 0) return null;

        return (
          <div key={category.code}>
            <LedgerSidebarCategory label={category.name} hidden={navCollapsed} />
            <ul className="space-y-0.5">
              {enabledModules.map((module) => {
                const Icon = moduleIcons[module.code] || LayoutDashboard;
                return (
                  <LedgerSidebarLink
                    key={module.code}
                    href={module.href}
                    label={module.label}
                    icon={Icon}
                    isActive={isModulePathActive(module.code, pathname)}
                    collapsed={navCollapsed}
                    onNavigate={() => setIsMobileOpen(false)}
                  />
                );
              })}
            </ul>
          </div>
        );
      })}
    </LedgerSidebarShell>
  );
}
