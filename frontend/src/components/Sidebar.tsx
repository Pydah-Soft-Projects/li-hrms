'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import { isModuleEnabled } from '@/config/moduleCategories';
import { User } from '@/lib/auth';
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
  ShieldCheck,
  Shield,
  Users,
  FileCog,
  CalendarClock,
  Clock,
  AlertTriangle,
  CalendarDays,
  Watch,
  Building2,
  Building,
  Settings2,
  UserCog,
  Gift,
  Cake,
  BarChart3,
  CreditCard,
  Table2,
  ScrollText,
  Receipt,
  Banknote,
  Smartphone,
  Wallet,
  PiggyBank,
  Settings,
  LogOut,
  Layers,
  TrendingUp,
} from 'lucide-react';

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

export type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  category: string;
  moduleCode: string;
  feature?: 'second_salary';
};

const navItems: NavItem[] = [
  { href: '/superadmin/dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'Main', moduleCode: 'DASHBOARD' },
  { href: '/superadmin/security/gate', label: 'Security Gate', icon: ShieldCheck, category: 'Main', moduleCode: 'SECURITY' },
  { href: '/superadmin/employees', label: 'Employees', icon: Users, category: 'Employee Management', moduleCode: 'EMPLOYEES' },
  { href: '/superadmin/assets-management', label: 'Assets Management', icon: CreditCard, category: 'Employee Management', moduleCode: 'ASSETS_MANAGEMENT' },
  { href: '/superadmin/employee-birthdays', label: 'Employee Birthdays', icon: Cake, category: 'Employee Management', moduleCode: 'EMPLOYEE_BIRTHDAYS' },
  { href: '/superadmin/resignations', label: 'Resignations', icon: LogOut, category: 'Employee Management', moduleCode: 'RESIGNATION' },
  { href: '/promotions-transfers', label: 'Promotions & Transfers', icon: TrendingUp, category: 'Employee Management', moduleCode: 'PROMOTIONS_TRANSFERS' },
  { href: '/superadmin/employees/form-settings', label: 'Form Settings', icon: FileCog, category: 'Employee Management', moduleCode: 'EMPLOYEES' },
  { href: '/superadmin/attendance', label: 'Attendance', icon: CalendarClock, category: 'Time & Attendance', moduleCode: 'ATTENDANCE' },
  { href: '/superadmin/ot-permissions', label: 'OT & Permissions', icon: Clock, category: 'Time & Attendance', moduleCode: 'OT_PERMISSIONS' },
  { href: '/superadmin/confused-shifts', label: 'Confused Shifts', icon: AlertTriangle, category: 'Time & Attendance', moduleCode: 'CONFUSED_SHIFTS' },
  { href: '/superadmin/shift-roster', label: 'Shift Roster', icon: CalendarDays, category: 'Time & Attendance', moduleCode: 'SHIFT_ROSTER' },
  { href: '/superadmin/holidays', label: 'Holiday Calendar', icon: CalendarDays, category: 'Time & Attendance', moduleCode: 'HOLIDAY_CALENDAR' },
  { href: '/superadmin/leaves', label: 'Leave & OD', icon: CalendarDays, category: 'Time & Attendance', moduleCode: 'LEAVE_OD' },
  { href: '/superadmin/leave-register', label: 'Leave register', icon: ScrollText, category: 'Time & Attendance', moduleCode: 'LEAVE_REGISTER' },
  { href: '/superadmin/ccl', label: 'CCL (Compensatory)', icon: Gift, category: 'Time & Attendance', moduleCode: 'CCL' },
  { href: '/superadmin/shifts', label: 'Shifts', icon: Watch, category: 'Time & Attendance', moduleCode: 'SHIFTS' },
  { href: '/superadmin/divisions', label: 'Divisions', icon: Building2, category: 'Organization', moduleCode: 'DIVISIONS' },
  { href: '/superadmin/departments', label: 'Departments', icon: Building, category: 'Organization', moduleCode: 'DEPARTMENTS' },
  { href: '/superadmin/employee-groups', label: 'Employee groups', icon: Layers, category: 'Organization', moduleCode: 'EMPLOYEE_GROUPS' },
  { href: '/superadmin/settings/departmental', label: 'Departmental Settings', icon: Settings2, category: 'Organization', moduleCode: 'DEPARTMENTAL_SETTINGS' },
  { href: '/superadmin/users', label: 'Users', icon: UserCog, category: 'Administration', moduleCode: 'USERS' },
  { href: '/superadmin/live-attendance', label: 'Live Attendance', icon: Clock, category: 'Administration', moduleCode: 'LIVE_ATTENDANCE' },
  { href: '/superadmin/reports', label: 'Reports', icon: BarChart3, category: 'Administration', moduleCode: 'REPORTS' },
  { href: '/superadmin/mobile-analytics', label: 'Mobile App Usage', icon: Smartphone, category: 'Administration', moduleCode: 'REPORTS' },
  { href: '/superadmin/payments', label: 'Payments', icon: CreditCard, category: 'Finance & Payroll', moduleCode: 'PAYMENTS' },
  { href: '/superadmin/payments/second-salary', label: '2nd Salary Payments', icon: Banknote, category: 'Finance & Payroll', moduleCode: 'PAYMENTS', feature: 'second_salary' as const },
  { href: '/superadmin/pay-register', label: 'Pay Register', icon: Table2, category: 'Finance & Payroll', moduleCode: 'PAY_REGISTER' },
  { href: '/superadmin/payroll-config', label: 'Payroll Configuration', icon: Settings, category: 'Finance & Payroll', moduleCode: 'PAYROLL_CONFIG' },
  { href: '/superadmin/statutory-deductions', label: 'Statutory Deductions', icon: Shield, category: 'Finance & Payroll', moduleCode: 'STATUTORY_DEDUCTIONS' },
  { href: '/superadmin/payslips', label: 'Payslips', icon: Receipt, category: 'Finance & Payroll', moduleCode: 'PAYSLIPS' },
  { href: '/superadmin/paysheet', label: 'Paysheet', icon: Table2, category: 'Finance & Payroll', moduleCode: 'PAYSLIPS' },
  { href: '/superadmin/payslips/second-salary', label: '2nd Salary Payslips', icon: Receipt, category: 'Finance & Payroll', moduleCode: 'PAYSLIPS', feature: 'second_salary' as const },
  { href: '/superadmin/arrears', label: 'Arrears', icon: Banknote, category: 'Finance & Payroll', moduleCode: 'ARREARS' },
  { href: '/superadmin/manual-deductions', label: 'Manual Deductions', icon: Banknote, category: 'Finance & Payroll', moduleCode: 'MANUAL_DEDUCTIONS' },
  { href: '/superadmin/allowances-deductions', label: 'Allowances & Deductions', icon: Wallet, category: 'Finance & Payroll', moduleCode: 'ALLOWANCES_DEDUCTIONS' },
  { href: '/superadmin/loans', label: 'Loans & Salary Advance', icon: PiggyBank, category: 'Finance & Payroll', moduleCode: 'LOANS' },
  { href: '/superadmin/settings', label: 'General Settings', icon: Settings, category: 'Settings', moduleCode: 'GENERAL_SETTINGS' },
];

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { profile: companyProfile } = useCompanyProfile();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [secondSalaryNavEnabled, setSecondSalaryNavEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userData = auth.getUser();
    if (userData) setUser(userData);
  }, []);

  useEffect(() => {
    if (user?.role !== 'super_admin' && user?.role !== 'sub_admin') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getSetting('enable_second_salary');
        if (cancelled) return;
        setSecondSalaryNavEnabled(res?.success && res?.data ? res.data.value !== false : true);
      } catch {
        if (!cancelled) setSecondSalaryNavEnabled(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.role]);

  if (!mounted) return null;

  const filteredNavItems = (user?.role === 'super_admin' || user?.role === 'sub_admin')
    ? navItems
    : navItems.filter((item) => isModuleEnabled(item.moduleCode, user?.featureControl || null));

  const sidebarNavItems =
    (user?.role === 'super_admin' || user?.role === 'sub_admin') && !secondSalaryNavEnabled
      ? filteredNavItems.filter((item) => item.feature !== 'second_salary')
      : filteredNavItems;

  const handleLogout = async () => {
    if (!(await auth.logoutWithConfirmation())) return;
    router.push('/login');
  };

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      super_admin: 'Super Admin',
      sub_admin: 'Sub Admin',
      hr: 'HR',
      manager: 'Manager',
      hod: 'HOD',
      employee: 'Employee',
    };
    return roleLabels[role] || role;
  };

  const navCollapsed = isCollapsed && !isMobileOpen;
  const categories = Array.from(new Set(sidebarNavItems.map((i) => i.category)));

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
          profileHref="/superadmin/profile"
          name={user?.name || 'User'}
          subtitle={user ? getRoleLabel(user.role) : '...'}
          collapsed={navCollapsed}
          onNavigate={() => setIsMobileOpen(false)}
          onLogout={handleLogout}
        />
      }
    >
      {categories.map((category) => {
        const categoryItems = sidebarNavItems.filter((i) => i.category === category);
        if (categoryItems.length === 0) return null;

        return (
          <div key={category}>
            <LedgerSidebarCategory label={category} hidden={navCollapsed} />
            <ul className="space-y-0.5">
              {categoryItems.map((item) => (
                <LedgerSidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={pathname === item.href}
                  collapsed={navCollapsed}
                  onNavigate={() => setIsMobileOpen(false)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </LedgerSidebarShell>
  );
}
