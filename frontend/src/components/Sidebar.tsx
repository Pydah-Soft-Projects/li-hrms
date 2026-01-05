'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';
import { useState, useEffect } from 'react';
import { isModuleEnabled } from '@/config/moduleCategories';
import { User } from '@/lib/auth';


// Icon Components
type IconProps = React.SVGProps<SVGSVGElement>;



const DashboardIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
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

const SettingsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
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

const ClockIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const BuildingIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M3 21h18" />
    <path d="M5 21V7l8-4v18" />
    <path d="M19 21V11l-6-4" />
    <path d="M9 9v0" />
    <path d="M9 12v0" />
    <path d="M9 15v0" />
    <path d="M9 18v0" />
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

const AttendanceIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </svg>
);

const OTPermissionIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const LeaveIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M9 12l2 2 4-4" />
    <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3" />
    <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3" />
    <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3" />
    <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3" />
  </svg>
);

const ConfusedShiftIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
    <path d="M9 12h6" />
  </svg>
);

const DepartmentSettingsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const AllowancesDeductionsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const ArrearsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    <circle cx="12" cy="12" r="1" />
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

const PayRegisterIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    <path d="M9 12h6" />
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

const FormSettingsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

const LogoutIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const PaymentsIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);

const LoansIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

const BonusIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M20 12v10H4V12" />
    <path d="M2 7h20v5H2z" />
    <path d="M12 22V7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<IconProps>;
  category: string;
  moduleCode: string;
};

const SecurityIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6-8 10-8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const navItems: NavItem[] = [
  { href: '/superadmin/dashboard', label: 'Dashboard', icon: DashboardIcon, category: 'Main', moduleCode: 'DASHBOARD' },
  { href: '/superadmin/security/gate', label: 'Security Gate', icon: SecurityIcon, category: 'Main', moduleCode: 'SECURITY' },
  { href: '/superadmin/employees', label: 'Employees', icon: EmployeesIcon, category: 'Employee Management', moduleCode: 'EMPLOYEES' },
  { href: '/superadmin/employees/form-settings', label: 'Form Settings', icon: FormSettingsIcon, category: 'Employee Management', moduleCode: 'EMPLOYEES' },
  { href: '/superadmin/attendance', label: 'Attendance', icon: AttendanceIcon, category: 'Time & Attendance', moduleCode: 'ATTENDANCE' },
  { href: '/superadmin/ot-permissions', label: 'OT & Permissions', icon: OTPermissionIcon, category: 'Time & Attendance', moduleCode: 'OT_PERMISSIONS' },
  { href: '/superadmin/confused-shifts', label: 'Confused Shifts', icon: ConfusedShiftIcon, category: 'Time & Attendance', moduleCode: 'CONFUSED_SHIFTS' },
  { href: '/superadmin/shift-roster', label: 'Shift Roster', icon: ClockIcon, category: 'Time & Attendance', moduleCode: 'SHIFT_ROSTER' },
  { href: '/superadmin/leaves', label: 'Leave & OD', icon: LeaveIcon, category: 'Time & Attendance', moduleCode: 'LEAVE_OD' },
  { href: '/superadmin/shifts', label: 'Shifts', icon: ClockIcon, category: 'Time & Attendance', moduleCode: 'SHIFTS' },
  { href: '/superadmin/divisions', label: 'Divisions', icon: BuildingIcon, category: 'Organization', moduleCode: 'DIVISIONS' },
  { href: '/superadmin/departments', label: 'Departments', icon: BuildingIcon, category: 'Organization', moduleCode: 'DEPARTMENTS' },
  { href: '/superadmin/settings/departmental', label: 'Departmental Settings', icon: DepartmentSettingsIcon, category: 'Organization', moduleCode: 'DEPARTMENTAL_SETTINGS' },
  { href: '/superadmin/users', label: 'Users', icon: UsersIcon, category: 'Administration', moduleCode: 'USERS' },
  { href: '/superadmin/reports', label: 'Reports', icon: ReportsIcon, category: 'Administration', moduleCode: 'REPORTS' },
  { href: '/superadmin/payments', label: 'Payments', icon: PaymentsIcon, category: 'Finance & Payroll', moduleCode: 'PAYMENTS' },
  { href: '/superadmin/pay-register', label: 'Pay Register', icon: PayRegisterIcon, category: 'Finance & Payroll', moduleCode: 'PAY_REGISTER' },
  { href: '/superadmin/payslips', label: 'Payslips', icon: PayslipsIcon, category: 'Finance & Payroll', moduleCode: 'PAYSLIPS' },
  { href: '/superadmin/arrears', label: 'Arrears', icon: ArrearsIcon, category: 'Finance & Payroll', moduleCode: 'ARREARS' },
  { href: '/superadmin/allowances-deductions', label: 'Allowances & Deductions', icon: AllowancesDeductionsIcon, category: 'Finance & Payroll', moduleCode: 'ALLOWANCES_DEDUCTIONS' },
  { href: '/superadmin/loans', label: 'Loans & Salary Advance', icon: LoansIcon, category: 'Finance & Payroll', moduleCode: 'LOANS_SALARY_ADVANCE' },
  { href: '/superadmin/bonus/policies', label: 'Bonus Policies', icon: BonusIcon, category: 'Bonus Management', moduleCode: 'BONUS_POLICIES' },
  { href: '/superadmin/bonus/calculator', label: 'Bonus Calculator', icon: BonusIcon, category: 'Bonus Management', moduleCode: 'BONUS_CALCULATOR' },
  { href: '/superadmin/bonus/batches', label: 'Bonus Batches', icon: BonusIcon, category: 'Bonus Management', moduleCode: 'BONUS_BATCHES' },
  { href: '/superadmin/settings', label: 'General Settings', icon: SettingsIcon, category: 'Settings', moduleCode: 'GENERAL_SETTINGS' },
];

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userData = auth.getUser();
    if (userData) {
      setUser(userData);
    }
  }, []);

  if (!mounted) return null;

  // Filter items based on user permissions
  const filteredNavItems = user?.role === 'super_admin'
    ? navItems
    : navItems.filter(item => isModuleEnabled(item.moduleCode, user?.featureControl || null));

  const handleLogout = () => {
    auth.logout();
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

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        type="button"
        className="fixed top-3 left-3 z-50 inline-flex items-center p-2 text-sm text-slate-500 rounded-lg sm:hidden hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-slate-400 dark:hover:bg-slate-700 dark:focus:ring-gray-600"
      >
        <span className="sr-only">Open sidebar</span>
        <svg className="w-6 h-6" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path clipRule="evenodd" fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"></path>
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-gray-900/50 sm:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Aside */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-white dark:bg-black border-r border-slate-200/60 dark:border-slate-800 transition-transform duration-300 ease-in-out z-40 
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} 
          sm:translate-x-0 
          ${isCollapsed ? 'sm:w-[60px]' : 'sm:w-[220px]'} 
          w-60`}
        aria-label="Sidebar"
      >
        {/* Collapse/Expand Button (Desktop only) */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-6 h-5 w-5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hidden sm:flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-all z-50 text-slate-500 dark:text-slate-400"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ExpandIcon className="h-2.5 w-2.5" />
          ) : (
            <CollapseIcon className="h-2.5 w-2.5" />
          )}
        </button>

        {/* Sidebar Content */}
        <div className="flex flex-col h-full overflow-hidden ">
          {/* Logo/Header */}
          <div className={`px-3 py-3 flex items-center border-b border-slate-200/60 dark:border-slate-800 ${isCollapsed ? 'flex-col gap-3 justify-center' : 'justify-between'}`}>
            <div className={`flex items-center gap-2.5  ${isCollapsed ? 'justify-center w-full' : ''}`}>
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/20 flex-shrink-0">
                <span className="text-xs font-bold text-white">P</span>
              </div>
              {(!isCollapsed || isMobileOpen) && (
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">HRMS</h2>
              )}
            </div>

            {/* Theme Toggle & Mobile Close */}
            <div className="flex items-center gap-2">


              {/* Close button for mobile inside sidebar */}
              <button
                onClick={() => setIsMobileOpen(false)}
                className="sm:hidden text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {Array.from(new Set(filteredNavItems.map(i => i.category))).map(category => {
              const categoryItems = filteredNavItems.filter(i => i.category === category);

              if (categoryItems.length === 0) return null;

              return (
                <div key={category}>
                  {/* Category Header */}
                  {(!isCollapsed || isMobileOpen) && (
                    <h3 className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {category}
                    </h3>
                  )}

                  <ul className="space-y-0.5">
                    {categoryItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setIsMobileOpen(false)}
                            className={`flex items-center px-2 py-1.5 rounded-lg transition-all duration-200 group relative
                              ${isActive
                                ? 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 font-medium'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                              }
                              ${(isCollapsed && !isMobileOpen) ? 'justify-center' : ''}
                            `}
                            title={(isCollapsed && !isMobileOpen) ? item.label : undefined}
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />

                            {(!isCollapsed || isMobileOpen) && (
                              <span className="ms-2.5 text-sm whitespace-nowrap">{item.label}</span>
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
          <div className="border-t border-slate-200/60 dark:border-slate-800 p-3 space-y-1.5 bg-slate-50/50 dark:bg-black/20">
            {/* Profile Link */}
            <Link
              href="/superadmin/profile"
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-2.5 p-1.5 rounded-lg transition-all duration-200 hover:bg-white dark:hover:bg-slate-800 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700
                ${(isCollapsed && !isMobileOpen) ? 'justify-center' : ''}`}
              title={(isCollapsed && !isMobileOpen) ? 'Profile' : undefined}
            >
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-semibold text-[10px] flex-shrink-0 shadow-sm">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              {(!isCollapsed || isMobileOpen) && (
                <div className="shrink-0 max-w-[140px]">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.name || 'User'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user ? getRoleLabel(user.role) : '...'}</p>
                </div>
              )}
            </Link>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 dark:hover:text-red-400
                ${(isCollapsed && !isMobileOpen) ? 'justify-center' : ''}`}
              title={(isCollapsed && !isMobileOpen) ? 'Logout' : undefined}
            >
              <LogoutIcon className="h-4 w-4 flex-shrink-0" />
              {(!isCollapsed || isMobileOpen) && (
                <span className="text-sm font-medium">Logout</span>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
