import type { ComponentType, CSSProperties } from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
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
  Shield,
  CalendarHeart,
  Timer,
  Fingerprint,
  Briefcase,
  UserCircle,
  LineChart,
  Calculator,
  HandCoins,
  TrendingDown,
  BadgeDollarSign,
  AlertOctagon,
  ClipboardCheck,
  FolderSearch,
} from 'lucide-react';

export type SidebarIcon = ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;

export type SidebarNavItem = {
  code: string;
  label: string;
  href: string;
  icon: SidebarIcon;
  feature?: 'second_salary';
};

export type SidebarNavCategory = {
  code: string;
  label: string;
  icon: SidebarIcon;
  items: SidebarNavItem[];
  forceDropdown?: boolean;
};

/** Shared icon map keyed by module code (workspace + superadmin). */
export const SIDEBAR_MODULE_ICONS: Record<string, SidebarIcon> = {
  DASHBOARD: LayoutDashboard,
  SECURITY: ShieldCheck,
  EMPLOYEES: Users,
  ASSETS_MANAGEMENT: HandCoins,
  EMPLOYEE_BIRTHDAYS: Cake,
  RESIGNATION: LogOut,
  PROMOTIONS_TRANSFERS: TrendingUp,
  FORM_SETTINGS: FileCog,
  ATTENDANCE: Fingerprint,
  ATTENDANCE_AUDIT: FolderSearch,
  AUDITS: FolderSearch,
  LIVE_ATTENDANCE: Clock,
  OT_PERMISSIONS: Timer,
  CONFUSED_SHIFTS: AlertOctagon,
  SHIFT_ROSTER: CalendarDays,
  HOLIDAY_CALENDAR: CalendarHeart,
  LEAVE_OD: Briefcase,
  LEAVE_REGISTER: ScrollText,
  CCL: Gift,
  SHIFTS: Watch,
  DIVISIONS: Building2,
  DEPARTMENTS: Building,
  EMPLOYEE_GROUPS: Layers,
  DEPARTMENTAL_SETTINGS: Settings2,
  USERS: UserCog,
  REPORTS: LineChart,
  MOBILE_ANALYTICS: Smartphone,
  PAYMENTS: CreditCard,
  SECOND_SALARY_PAYMENTS: Banknote,
  PAY_REGISTER: Table2,
  PAYROLL_CONFIG: Settings,
  STATUTORY_DEDUCTIONS: Shield,
  PAYSLIPS: Receipt,
  PAYSHEET: BadgeDollarSign,
  SECOND_SALARY_PAYSLIPS: Receipt,
  ARREARS: Banknote,
  MANUAL_DEDUCTIONS: TrendingDown,
  ALLOWANCES_DEDUCTIONS: Calculator,
  LOANS: PiggyBank,
  GENERAL_SETTINGS: Settings,
  PROFILE: UserCircle,
  LEAVE: CalendarClock,
  OD: Briefcase,
  EMPLOYEE: Users,
  SHIFT: Watch,
  DEPARTMENT: Building2,
  PAYROLL: BadgeDollarSign,
  LOANS_SALARY_ADVANCE: PiggyBank,
  PAYROLL_TRANSACTIONS: Wallet,
};

const SUPERADMIN_PREFIX = '/superadmin';

/** Superadmin sidebar — categories and item order. */
export const SUPERADMIN_NAV_CATEGORIES: SidebarNavCategory[] = [
  {
    code: 'MAIN',
    label: 'Main',
    icon: LayoutDashboard,
    items: [
      { code: 'DASHBOARD', label: 'Dashboard', href: `${SUPERADMIN_PREFIX}/dashboard`, icon: LayoutDashboard },
      { code: 'SECURITY', label: 'Security Gate', href: `${SUPERADMIN_PREFIX}/security/gate`, icon: ShieldCheck },
    ],
  },
  {
    code: 'EMPLOYEE_MANAGEMENT',
    label: 'Employees',
    icon: Users,
    items: [
      { code: 'EMPLOYEES', label: 'Employees', href: `${SUPERADMIN_PREFIX}/employees`, icon: Users },
      { code: 'PROMOTIONS_TRANSFERS', label: 'Promotions & Transfers', href: '/promotions-transfers', icon: TrendingUp },
      { code: 'RESIGNATION', label: 'Resignations', href: `${SUPERADMIN_PREFIX}/resignations`, icon: LogOut },
      { code: 'EMPLOYEE_BIRTHDAYS', label: 'Birthdays', href: `${SUPERADMIN_PREFIX}/employee-birthdays`, icon: Cake },
      { code: 'ASSETS_MANAGEMENT', label: 'Assets', href: `${SUPERADMIN_PREFIX}/assets-management`, icon: HandCoins },
    ],
  },
  {
    code: 'TIME_ATTENDANCE',
    label: 'Time & Attendance',
    icon: CalendarClock,
    items: [
      { code: 'ATTENDANCE', label: 'Attendance', href: `${SUPERADMIN_PREFIX}/attendance`, icon: Fingerprint },
      { code: 'LIVE_ATTENDANCE', label: 'Live Attendance', href: `${SUPERADMIN_PREFIX}/live-attendance`, icon: Clock },
      { code: 'LEAVE_OD', label: 'Leave & OD', href: `${SUPERADMIN_PREFIX}/leaves`, icon: Briefcase },
      { code: 'LEAVE_REGISTER', label: 'Leave Register', href: `${SUPERADMIN_PREFIX}/leave-register`, icon: ScrollText },
      { code: 'CCL', label: 'CCL', href: `${SUPERADMIN_PREFIX}/ccl`, icon: Gift },
      { code: 'OT_PERMISSIONS', label: 'OT & Permissions', href: `${SUPERADMIN_PREFIX}/ot-permissions`, icon: Timer },
      { code: 'SHIFT_ROSTER', label: 'Shift Roster', href: `${SUPERADMIN_PREFIX}/shift-roster`, icon: CalendarDays },
      { code: 'SHIFTS', label: 'Shifts', href: `${SUPERADMIN_PREFIX}/shifts`, icon: Watch },
      { code: 'CONFUSED_SHIFTS', label: 'Confused Shifts', href: `${SUPERADMIN_PREFIX}/confused-shifts`, icon: AlertOctagon },
      { code: 'HOLIDAY_CALENDAR', label: 'Holidays', href: `${SUPERADMIN_PREFIX}/holidays`, icon: CalendarHeart },
    ],
  },
  {
    code: 'AUDITS',
    label: 'Audits',
    icon: FolderSearch,
    forceDropdown: true,
    items: [
      { code: 'ATTENDANCE_AUDIT', label: 'Audits', href: `${SUPERADMIN_PREFIX}/audits`, icon: FolderSearch },
    ],
  },
  {
    code: 'ORGANIZATION',
    label: 'Organization',
    icon: Building2,
    items: [
      { code: 'DIVISIONS', label: 'Divisions', href: `${SUPERADMIN_PREFIX}/divisions`, icon: Building2 },
      { code: 'DEPARTMENTS', label: 'Departments', href: `${SUPERADMIN_PREFIX}/departments`, icon: Building },
      { code: 'EMPLOYEE_GROUPS', label: 'Employee Groups', href: `${SUPERADMIN_PREFIX}/employee-groups`, icon: Layers },
      { code: 'DEPARTMENTAL_SETTINGS', label: 'Dept. Settings', href: `${SUPERADMIN_PREFIX}/settings/departmental`, icon: Settings2 },
    ],
  },
  {
    code: 'FINANCE_PAYROLL',
    label: 'Payroll',
    icon: BadgeDollarSign,
    items: [
      { code: 'PAY_REGISTER', label: 'Pay Register', href: `${SUPERADMIN_PREFIX}/pay-register`, icon: Table2 },
      { code: 'PAYSHEET', label: 'Paysheet', href: `${SUPERADMIN_PREFIX}/paysheet`, icon: BadgeDollarSign },
      { code: 'PAYMENTS', label: 'Payments', href: `${SUPERADMIN_PREFIX}/payments`, icon: CreditCard },
      { code: 'PAYSLIPS', label: 'Payslips', href: `${SUPERADMIN_PREFIX}/payslips`, icon: Receipt },
      {
        code: 'SECOND_SALARY_PAYMENTS',
        label: '2nd Salary Payments',
        href: `${SUPERADMIN_PREFIX}/payments/second-salary`,
        icon: Banknote,
        feature: 'second_salary',
      },
      {
        code: 'SECOND_SALARY_PAYSLIPS',
        label: '2nd Salary Payslips',
        href: `${SUPERADMIN_PREFIX}/payslips/second-salary`,
        icon: Receipt,
        feature: 'second_salary',
      },
      { code: 'ARREARS', label: 'Arrears', href: `${SUPERADMIN_PREFIX}/arrears`, icon: Banknote },
      { code: 'MANUAL_DEDUCTIONS', label: 'Manual Deductions', href: `${SUPERADMIN_PREFIX}/manual-deductions`, icon: TrendingDown },
      { code: 'ALLOWANCES_DEDUCTIONS', label: 'Allowances & Deductions', href: `${SUPERADMIN_PREFIX}/allowances-deductions`, icon: Calculator },
      { code: 'LOANS', label: 'Loans & Advance', href: `${SUPERADMIN_PREFIX}/loans`, icon: PiggyBank },
      { code: 'PAYROLL_CONFIG', label: 'Payroll Config', href: `${SUPERADMIN_PREFIX}/payroll-config`, icon: Settings },
      { code: 'STATUTORY_DEDUCTIONS', label: 'Statutory Deductions', href: `${SUPERADMIN_PREFIX}/statutory-deductions`, icon: Shield },
    ],
  },
  {
    code: 'ADMINISTRATION',
    label: 'Administration',
    icon: Shield,
    items: [
      { code: 'USERS', label: 'Users', href: `${SUPERADMIN_PREFIX}/users`, icon: UserCog },
      { code: 'REPORTS', label: 'Reports', href: `${SUPERADMIN_PREFIX}/reports`, icon: BarChart3 },
      { code: 'MOBILE_ANALYTICS', label: 'Mobile Usage', href: `${SUPERADMIN_PREFIX}/mobile-analytics`, icon: Smartphone },
    ],
  },
  {
    code: 'SETTINGS',
    label: 'Settings',
    icon: Settings,
    items: [
      { code: 'GENERAL_SETTINGS', label: 'General Settings', href: `${SUPERADMIN_PREFIX}/settings`, icon: Settings },
      { code: 'FORM_SETTINGS', label: 'Form Settings', href: `${SUPERADMIN_PREFIX}/employees/form-settings`, icon: FileCog },
    ],
  },
];

/** Workspace sidebar — same structure and order as superadmin, workspace routes. */
export const WORKSPACE_NAV_CATEGORIES: SidebarNavCategory[] = [
  {
    code: 'MAIN',
    label: 'Main',
    icon: LayoutDashboard,
    items: [
      { code: 'DASHBOARD', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    code: 'EMPLOYEE_MANAGEMENT',
    label: 'Employees',
    icon: Users,
    items: [
      { code: 'EMPLOYEES', label: 'Employees', href: '/employees', icon: Users },
      { code: 'PROMOTIONS_TRANSFERS', label: 'Promotions & Transfers', href: '/promotions-transfers', icon: TrendingUp },
      { code: 'RESIGNATION', label: 'Resignations', href: '/resignations', icon: LogOut },
      { code: 'EMPLOYEE_BIRTHDAYS', label: 'Birthdays', href: '/employee-birthdays', icon: Cake },
      { code: 'ASSETS_MANAGEMENT', label: 'Assets', href: '/assets-management', icon: HandCoins },
      { code: 'PROFILE', label: 'My Profile', href: '/profile', icon: UserCircle },
    ],
  },
  {
    code: 'TIME_ATTENDANCE',
    label: 'Time & Attendance',
    icon: CalendarClock,
    items: [
      { code: 'ATTENDANCE', label: 'Attendance', href: '/attendance', icon: Fingerprint },
      { code: 'LIVE_ATTENDANCE', label: 'Live Attendance', href: '/live-attendance', icon: Clock },
      { code: 'LEAVE_OD', label: 'Leave & OD', href: '/leaves', icon: Briefcase },
      { code: 'LEAVE_REGISTER', label: 'Leave Register', href: '/leave-register', icon: ScrollText },
      { code: 'CCL', label: 'CCL', href: '/ccl', icon: Gift },
      { code: 'OT_PERMISSIONS', label: 'OT & Permissions', href: '/ot-permissions', icon: Timer },
      { code: 'SHIFT_ROSTER', label: 'Shift Roster', href: '/shift-roster', icon: CalendarDays },
      { code: 'SHIFTS', label: 'Shifts', href: '/shifts', icon: Watch },
      { code: 'CONFUSED_SHIFTS', label: 'Confused Shifts', href: '/confused-shifts', icon: AlertOctagon },
      { code: 'HOLIDAY_CALENDAR', label: 'Holidays', href: '/holidays', icon: CalendarHeart },
    ],
  },
  {
    code: 'AUDITS',
    label: 'Audits',
    icon: FolderSearch,
    forceDropdown: true,
    items: [
      { code: 'ATTENDANCE_AUDIT', label: 'Attendance Audits', href: '/attendance-audit', icon: ClipboardCheck },
    ],
  },
  {
    code: 'ORGANIZATION',
    label: 'Organization',
    icon: Building2,
    items: [
      { code: 'DIVISIONS', label: 'Divisions', href: '/divisions', icon: Building2 },
      { code: 'DEPARTMENTS', label: 'Departments', href: '/departments', icon: Building },
      { code: 'EMPLOYEE_GROUPS', label: 'Employee Groups', href: '/employee-groups', icon: Layers },
      { code: 'DEPARTMENTAL_SETTINGS', label: 'Dept. Settings', href: '/departmental-settings', icon: Settings2 },
    ],
  },
  {
    code: 'FINANCE_PAYROLL',
    label: 'Payroll',
    icon: BadgeDollarSign,
    items: [
      { code: 'PAY_REGISTER', label: 'Pay Register', href: '/pay-register', icon: Table2 },
      { code: 'PAYSHEET', label: 'Paysheet', href: '/payroll-sheet', icon: BadgeDollarSign },
      { code: 'PAYMENTS', label: 'Payments', href: '/payments', icon: CreditCard },
      { code: 'PAYSLIPS', label: 'Payslips', href: '/payslips', icon: Receipt },
      { code: 'ARREARS', label: 'Arrears', href: '/arrears', icon: Banknote },
      { code: 'MANUAL_DEDUCTIONS', label: 'Manual Deductions', href: '/manual-deductions', icon: TrendingDown },
      { code: 'ALLOWANCES_DEDUCTIONS', label: 'Allowances & Deductions', href: '/allowances-deductions', icon: Calculator },
      { code: 'LOANS', label: 'Loans & Advance', href: '/loans', icon: PiggyBank },
      { code: 'PAYROLL_CONFIG', label: 'Payroll Config', href: '/payroll-config', icon: Settings },
      { code: 'STATUTORY_DEDUCTIONS', label: 'Statutory Deductions', href: '/statutory-deductions', icon: Shield },
    ],
  },
  {
    code: 'ADMINISTRATION',
    label: 'Administration',
    icon: Shield,
    items: [
      { code: 'USERS', label: 'Users', href: '/users', icon: UserCog },
      { code: 'REPORTS', label: 'Reports', href: '/reports', icon: LineChart },
    ],
  },
  {
    code: 'SETTINGS',
    label: 'Settings',
    icon: Settings,
    items: [
      { code: 'GENERAL_SETTINGS', label: 'General Settings', href: '/settings', icon: Settings },
    ],
  },
];

/** Short labels for mobile bottom nav. */
export const SIDEBAR_SHORT_LABELS: Record<string, string> = {
  DASHBOARD: 'Dash',
  EMPLOYEES: 'Emps',
  PROMOTIONS_TRANSFERS: 'Promo',
  RESIGNATION: 'Resign',
  EMPLOYEE_BIRTHDAYS: 'Bday',
  ASSETS_MANAGEMENT: 'Assets',
  PROFILE: 'Me',
  ATTENDANCE: 'Attn',
  ATTENDANCE_AUDIT: 'Audit',
  LIVE_ATTENDANCE: 'Live',
  LEAVE_OD: 'L/OD',
  LEAVE_REGISTER: 'Leave',
  CCL: 'CCL',
  OT_PERMISSIONS: 'OT',
  SHIFT_ROSTER: 'Roster',
  SHIFTS: 'Shift',
  CONFUSED_SHIFTS: 'Alert',
  HOLIDAY_CALENDAR: 'Hols',
  DIVISIONS: 'Div',
  DEPARTMENTS: 'Dept',
  EMPLOYEE_GROUPS: 'Groups',
  DEPARTMENTAL_SETTINGS: 'Dept',
  PAY_REGISTER: 'Reg',
  PAYSHEET: 'Sheet',
  PAYMENTS: 'Pay',
  PAYSLIPS: 'Slip',
  ARREARS: 'Arr',
  MANUAL_DEDUCTIONS: 'Deduct',
  ALLOWANCES_DEDUCTIONS: 'Allow',
  LOANS: 'Loans',
  PAYROLL_CONFIG: 'Config',
  STATUTORY_DEDUCTIONS: 'Stat',
  USERS: 'Users',
  REPORTS: 'Rpts',
  GENERAL_SETTINGS: 'Sets',
};

/** Map superadmin nav item codes to module permission codes used in feature control. */
export const SIDEBAR_MODULE_PERMISSION_CODES: Record<string, string> = {
  SECURITY: 'SECURITY',
  FORM_SETTINGS: 'EMPLOYEES',
  SECOND_SALARY_PAYMENTS: 'PAYMENTS',
  SECOND_SALARY_PAYSLIPS: 'PAYSLIPS',
  MOBILE_ANALYTICS: 'REPORTS',
};

export function getSidebarPermissionCode(itemCode: string): string {
  return SIDEBAR_MODULE_PERMISSION_CODES[itemCode] || itemCode;
}

export function isSidebarPathActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href.endsWith('/employees') && pathname.startsWith(`${href}/`)) {
    return pathname === `${href}/form-settings` ? false : true;
  }
  if (href.endsWith('/audits') && pathname.startsWith(`${href}`)) return true;
  return false;
}

const WORKSPACE_PATH_CHECKS: Record<string, (pathname: string) => boolean> = {
  LEAVE_OD: (p) => p === '/leaves' || p === '/od',
  LEAVE_REGISTER: (p) => p === '/leave-register',
  CCL: (p) => p === '/ccl',
  RESIGNATION: (p) => p === '/resignations',
  PROMOTIONS_TRANSFERS: (p) => p === '/promotions-transfers',
  ASSETS_MANAGEMENT: (p) => p === '/assets-management',
  EMPLOYEE_BIRTHDAYS: (p) => p === '/employee-birthdays',
  EMPLOYEE_GROUPS: (p) => p === '/employee-groups',
  LOANS: (p) => p === '/loans',
  LIVE_ATTENDANCE: (p) => p === '/live-attendance',
};

export function isWorkspacePathActive(code: string, href: string, pathname: string): boolean {
  const check = WORKSPACE_PATH_CHECKS[code];
  if (check) return check(pathname);
  return pathname === href;
}
