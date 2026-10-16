'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  UserHistoryRow,
} from '@/lib/api';
import {
  Search,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  UserPlus,
  Key,
  Clock,
  Eye,
  Filter,
  Trash2,
  Calendar,
  Layers,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  XCircle,
  FileText,
  Building,
  User as UserIcon,
  Check,
  Lock,
  Globe,
} from 'lucide-react';
import {
  LoansStatGrid,
  LoansContentPanel,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansFormInputClass,
  loansFormInputStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerTableActionsHeaderClass } from '@/lib/ledgerUi';
import { userAvatarClass, userAvatarStyle, userRoleBadgeClass } from './userLedgerUi';
import Spinner from '@/components/Spinner';
import { MODULE_CATEGORIES } from '@/config/moduleCategories';

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

// Build human-friendly module name mapping from config
const MODULE_NAME_MAP: Record<string, string> = {
  USERS: 'User Management',
  SECURITY: 'Security & Access',
  EMPLOYEES: 'Employees',
  PROMOTIONS: 'Promotions',
  TRANSFERS: 'Transfers',
  RESIGNATION: 'Resignations',
  EMPLOYEE_BIRTHDAYS: 'Employee Birthdays',
  ASSETS_MANAGEMENT: 'Assets Management',
  PROFILE: 'My Profile',
  ATTENDANCE: 'Attendance',
  LIVE_ATTENDANCE: 'Live Attendance',
  LEAVE_OD: 'Leave & OD',
  LEAVE_REGISTER: 'Leave Register',
  CCL: 'CCL',
  COMPLAINTS: 'Complaints',
  OT_PERMISSIONS: 'OT & Permissions',
  SHIFT_ROSTER: 'Shift Roster',
  SHIFTS: 'Shifts',
  CONFUSED_SHIFTS: 'Confused Shifts',
  HOLIDAY_CALENDAR: 'Holiday Calendar',
  DIVISIONS: 'Divisions',
  DEPARTMENTS: 'Departments',
  EMPLOYEE_GROUPS: 'Employee Groups',
  DEPARTMENTAL_SETTINGS: 'Department Settings',
  PAY_REGISTER: 'Pay Register',
  PAYSHEET: 'Paysheet',
  PAYMENTS: 'Payments',
  PAYSLIPS: 'Payslips',
  SECOND_SALARY_PAYMENTS: '2nd Salary Payments',
  SECOND_SALARY_PAYSLIPS: '2nd Salary Payslips',
  ARREARS: 'Arrears',
  MANUAL_DEDUCTIONS: 'Manual Deductions',
  ALLOWANCES_DEDUCTIONS: 'Allowances & Deductions',
  LOANS: 'Loans & Advance',
  PAYROLL_CONFIG: 'Payroll Config',
  STATUTORY_DEDUCTIONS: 'Statutory Deductions',
  REPORTS: 'Reports',
  COMMUNICATIONS: 'Communications',
  GENERAL_SETTINGS: 'General Settings',
  FORM_SETTINGS: 'Form Settings',
};

// Also populate from MODULE_CATEGORIES dynamically
MODULE_CATEGORIES.forEach((cat) => {
  cat.modules.forEach((mod) => {
    if (mod.code && mod.label) {
      MODULE_NAME_MAP[mod.code.toUpperCase()] = mod.label;
      MODULE_NAME_MAP[mod.code.toLowerCase()] = mod.label;
    }
  });
});

export function formatPermissionActionLabel(permStr: string): { module: string; action: string; label: string } {
  if (!permStr) return { module: '', action: '', label: '' };
  const parts = permStr.split(':');
  const rawMod = parts[0] || '';
  const action = (parts[1] || 'access').toLowerCase();

  const modLabel = MODULE_NAME_MAP[rawMod.toUpperCase()] || rawMod.replace(/_/g, ' ');
  let actionLabel = action;
  if (action === 'read') actionLabel = 'View';
  else if (action === 'write') actionLabel = 'Manage';
  else if (action === 'verify') actionLabel = 'Verify';
  else if (action === 'terminate') actionLabel = 'Terminate';
  else if (action === 'bank') actionLabel = 'Bank Info';
  else if (action === 'release') actionLabel = 'Release';

  return {
    module: modLabel,
    action: actionLabel,
    label: `${modLabel} (${actionLabel})`,
  };
}

export function getUserEffectiveAccess(row: UserHistoryRow) {
  const profile =
    row.targetAccessProfile ||
    row.details?.accessSnapshot ||
    (row.userId && typeof row.userId === 'object' ? (row.userId as any) : null);
  const dataScope = profile?.dataScope || row.details?.diffs?.dataScope?.to || 'all';
  const rawMapping = profile?.divisionMapping || row.details?.diffs?.divisionMapping?.to || [];
  const divisionMapping = Array.isArray(rawMapping) ? rawMapping : [];
  const featureControl = Array.isArray(profile?.featureControl) ? profile.featureControl : [];
  const role = row.targetUserRole || profile?.role || '';
  const isSuperAdmin = role === 'super_admin';

  return {
    dataScope,
    divisionMapping,
    featureControl,
    role,
    isSuperAdmin,
    hasProfile: !!profile,
  };
}

export function getModuleAccessStatus(
  modCode: string,
  featureControl: string[],
  isSuperAdmin: boolean
): {
  granted: boolean;
  level: 'write' | 'read' | 'scoped' | 'none';
  label: string;
} {
  if (isSuperAdmin) {
    return { granted: true, level: 'write', label: 'Full Access' };
  }

  const upperCode = modCode.toUpperCase();
  const writeKey = `${upperCode}:write`;
  const readKey = `${upperCode}:read`;

  if (featureControl.includes(writeKey)) {
    return { granted: true, level: 'write', label: 'Manage' };
  }
  if (featureControl.includes(readKey)) {
    return { granted: true, level: 'read', label: 'View' };
  }

  const hasScopedWrite = featureControl.some((f) => f.startsWith(`${upperCode}:write:`));
  const hasScopedRead = featureControl.some((f) => f.startsWith(`${upperCode}:read:`));
  if (hasScopedWrite) {
    return { granted: true, level: 'scoped', label: 'Manage (Scoped)' };
  }
  if (hasScopedRead) {
    return { granted: true, level: 'scoped', label: 'View (Scoped)' };
  }

  return { granted: false, level: 'none', label: 'No Access' };
}

interface UserAuditsViewProps {
  /** Optional filter to restrict audits to a specific user */
  userId?: string;
  /** Optional custom title if embedded */
  hideHeaderStats?: boolean;
}

export default function UserAuditsView({ userId, hideHeaderStats }: UserAuditsViewProps) {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [audits, setAudits] = useState<UserHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    totalAudits: 0,
    totalAccessChanges: 0,
    eventsToday: 0,
  });

  // Selected audit for detail modal
  const [selectedAudit, setSelectedAudit] = useState<UserHistoryRow | null>(null);

  const fetchAudits = useCallback(async () => {
    if (!authLoading && currentUser && currentUser.role !== 'super_admin') {
      setLoading(false);
      setError('Access restricted to Super Admin only.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.getUserAudits({
        page,
        limit,
        search: search.trim() || undefined,
        event: eventFilter !== 'all' ? eventFilter : undefined,
        userId: userId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (res.success && Array.isArray(res.data)) {
        setAudits(res.data);
        const meta = (res as any).pagination;
        if (meta) {
          setTotalPages(meta.totalPages || 1);
          setTotalRecords(meta.total || 0);
        } else {
          setTotalRecords(res.data.length);
          setTotalPages(1);
        }
        const s = (res as any).stats;
        if (s) {
          setStats(s);
        }
      } else {
        setAudits([]);
        setError(res.message || 'Failed to load audit history.');
      }
    } catch (err: any) {
      console.error('Failed to fetch user audits:', err);
      setError(err?.message || 'Error fetching user audit records.');
      setAudits([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, eventFilter, userId, startDate, endDate, currentUser?.role, authLoading]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  // Handle filter changes (reset to page 1)
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleEventFilterChange = (val: string) => {
    setEventFilter(val);
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setEventFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Format relative timestamp helper
  const formatTime = (ts: string) => {
    if (!ts) return { date: '—', time: '', full: '—' };
    try {
      const d = new Date(ts);
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        full: d.toLocaleString(),
      };
    } catch {
      return { date: ts, time: '', full: ts };
    }
  };

  // Render Action Event Badge with appropriate color & icon
  const renderEventBadge = (event: string) => {
    switch (event) {
      case 'user_saved':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Profile Re-saved
          </span>
        );
      case 'user_updated':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
            <FileText className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            User Updated
          </span>
        );
      case 'access_updated':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            <Key className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            Access Updated
          </span>
        );
      case 'user_promoted':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
            <ShieldCheck className="h-3 w-3 text-violet-600 dark:text-violet-400" />
            Role Promoted
          </span>
        );
      case 'user_demoted':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-200/80 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300">
            <ShieldAlert className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            Role Demoted
          </span>
        );
      case 'user_activated':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            <UserCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Activated
          </span>
        );
      case 'user_deactivated':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200/80 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            <UserX className="h-3 w-3 text-rose-600 dark:text-rose-400" />
            Deactivated
          </span>
        );
      case 'password_reset':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">
            <Key className="h-3 w-3 text-sky-600 dark:text-sky-400" />
            Password Reset
          </span>
        );
      case 'user_created':
      case 'user_created_from_employee':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-200/80 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300">
            <UserPlus className="h-3 w-3 text-teal-600 dark:text-teal-400" />
            User Created
          </span>
        );
      case 'user_deleted':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200/80 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
            User Deleted
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
            <FileText className="h-3 w-3 text-stone-500" />
            {event?.replace(/_/g, ' ') || 'Update'}
          </span>
        );
    }
  };

  // Render Diff summary chip in table
  const renderDiffSummary = (row: UserHistoryRow) => {
    const diffs = row.details?.diffs;
    const hasRoleDiff = !!diffs?.role;
    const hasStatusDiff = diffs?.isActive !== undefined;
    const hasScopeDiff = !!diffs?.dataScope;
    const hasDivisionDiff = !!diffs?.divisionMapping;
    const hasFeatureDiff = !!(
      diffs?.featureControl &&
      ((diffs.featureControl.added?.length || 0) > 0 || (diffs.featureControl.removed?.length || 0) > 0)
    );
    const hasNameDiff = !!diffs?.name;
    const hasPhoneDiff = !!diffs?.phone_number;
    const hasEmpIdDiff = !!diffs?.employeeId;

    const hasAnyDiff = hasRoleDiff || hasStatusDiff || hasScopeDiff || hasDivisionDiff || hasFeatureDiff || hasNameDiff || hasPhoneDiff || hasEmpIdDiff;

    if (!hasAnyDiff) {
      const access = getUserEffectiveAccess(row);
      const activeModuleCount = access.isSuperAdmin
        ? 'All Modules Active (Super Admin)'
        : access.featureControl.length > 0
        ? `${new Set(access.featureControl.map((f: string) => f.split(':')[0])).size} Modules Granted`
        : 'Default Access';

      return (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-stone-800 dark:text-stone-300">
              {access.dataScope === 'division'
                ? '🏢 Division Scoped'
                : access.dataScope === 'own'
                ? '👤 Self Only'
                : '🌐 All Data Scope'}
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Check className="h-2.5 w-2.5 text-emerald-600" />
              {activeModuleCount}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            {row.comments && row.comments !== 'User updated'
              ? row.comments
              : 'Re-saved • No field values or access permissions changed'}
          </p>
        </div>
      );
    }

    const items: React.ReactNode[] = [];

    // Profile field diffs
    if (diffs?.name) {
      items.push(
        <div key="name" className="inline-flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-stone-500 dark:text-stone-400">Name:</span>
          <span className="font-medium text-stone-600 line-through dark:text-stone-400">
            {diffs.name.from}
          </span>
          <ArrowRight className="h-3 w-3 text-stone-400 shrink-0" />
          <span className="font-bold text-stone-900 dark:text-white">
            {diffs.name.to}
          </span>
        </div>
      );
    }
    if (diffs?.phone_number) {
      items.push(
        <div key="phone" className="inline-flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-stone-500 dark:text-stone-400">Phone:</span>
          <span className="font-medium text-stone-600 line-through dark:text-stone-400">
            {diffs.phone_number.from}
          </span>
          <ArrowRight className="h-3 w-3 text-stone-400 shrink-0" />
          <span className="font-bold text-stone-900 dark:text-white">
            {diffs.phone_number.to}
          </span>
        </div>
      );
    }
    if (diffs?.employeeId) {
      items.push(
        <div key="empId" className="inline-flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-stone-500 dark:text-stone-400">Emp ID:</span>
          <span className="font-mono text-stone-600 line-through dark:text-stone-400">
            {diffs.employeeId.from}
          </span>
          <ArrowRight className="h-3 w-3 text-stone-400 shrink-0" />
          <span className="font-mono font-bold text-stone-900 dark:text-white">
            {diffs.employeeId.to}
          </span>
        </div>
      );
    }

    // 1. Role change diff
    if (diffs.role) {
      items.push(
        <div key="role" className="inline-flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-stone-500 dark:text-stone-400">Role:</span>
          <span className="font-medium text-stone-600 line-through dark:text-stone-400">
            {diffs.role.from}
          </span>
          <ArrowRight className="h-3 w-3 text-stone-400 shrink-0" />
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {diffs.role.to}
          </span>
        </div>
      );
    }

    // 2. Division & Department access diff
    if (diffs.divisionMapping) {
      const fromArr = diffs.divisionMapping.from || [];
      const toArr = diffs.divisionMapping.to || [];

      const formatDivList = (arr: any[]) => {
        if (!arr || arr.length === 0) return 'No division assigned';
        return arr
          .map((m) => {
            const depts = (m.departments || []).length > 0 ? m.departments.join(', ') : 'All Depts';
            return `${m.divisionName} (${depts})`;
          })
          .join('; ');
      };

      items.push(
        <div key="divmap" className="flex flex-col gap-1 rounded-lg border border-stone-100 bg-stone-50/60 p-2 text-xs dark:border-stone-800 dark:bg-stone-900/40">
          <div className="flex items-center gap-1.5 font-bold text-stone-700 dark:text-stone-300">
            <Building className="h-3 w-3 text-stone-500" />
            <span>Division &amp; Department Access:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-rose-600 line-through dark:text-rose-400">
              {formatDivList(fromArr)}
            </span>
            <ArrowRight className="h-3 w-3 text-stone-400 shrink-0" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatDivList(toArr)}
            </span>
          </div>
        </div>
      );
    }

    // 3. Pages / Module Permissions diff
    if (diffs.featureControl) {
      const added = diffs.featureControl.added || [];
      const removed = diffs.featureControl.removed || [];

      items.push(
        <div key="perms" className="flex flex-col gap-1.5">
          {added.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                + Pages Granted ({added.length}):
              </span>
              <div className="flex flex-wrap gap-1">
                {added.slice(0, 3).map((perm: string) => {
                  const info = formatPermissionActionLabel(perm);
                  return (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                    >
                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                      {info.label}
                    </span>
                  );
                })}
                {added.length > 3 && (
                  <span className="text-[10px] font-bold text-emerald-600">
                    +{added.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {removed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                - Pages Revoked ({removed.length}):
              </span>
              <div className="flex flex-wrap gap-1">
                {removed.slice(0, 3).map((perm: string) => {
                  const info = formatPermissionActionLabel(perm);
                  return (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
                    >
                      <XCircle className="h-2.5 w-2.5 text-rose-600" />
                      {info.label}
                    </span>
                  );
                })}
                {removed.length > 3 && (
                  <span className="text-[10px] font-bold text-rose-600">
                    +{removed.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 4. Status change diff
    if (diffs.isActive !== undefined) {
      items.push(
        <div key="status" className="inline-flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-stone-500">Account Status:</span>
          <span className={`font-bold ${diffs.isActive.to ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {diffs.isActive.to ? 'Restored / Activated' : 'Disabled / Access Revoked'}
          </span>
        </div>
      );
    }

    // 5. Data scope diff
    if (diffs.dataScope) {
      items.push(
        <div key="datascope" className="inline-flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-stone-500">Data Scope:</span>
          <span className="text-stone-500 line-through">{diffs.dataScope.from || 'all'}</span>
          <ArrowRight className="h-3 w-3 text-stone-400" />
          <span className="font-bold text-stone-800 dark:text-stone-200">
            {diffs.dataScope.to}
          </span>
        </div>
      );
    }

    return <div className="flex flex-col gap-1.5">{items}</div>;
  };

  const targetName = (row: UserHistoryRow) => {
    if (row.targetUserName && row.targetUserName !== '—') return row.targetUserName;
    if (row.userId && typeof row.userId === 'object') return (row.userId as any).name || 'Unknown User';
    return 'Unknown User';
  };

  const targetEmail = (row: UserHistoryRow) => {
    if (row.targetUserEmail && row.targetUserEmail !== '—') return row.targetUserEmail;
    if (row.userId && typeof row.userId === 'object') return (row.userId as any).email || '—';
    return '—';
  };

  const targetEmpId = (row: UserHistoryRow) => {
    if (row.targetEmployeeId && row.targetEmployeeId !== '—') return row.targetEmployeeId;
    if (row.userId && typeof row.userId === 'object') return (row.userId as any).employeeId || '';
    return '';
  };

  const targetRole = (row: UserHistoryRow) => {
    if (row.targetUserRole && row.targetUserRole !== '—') return row.targetUserRole;
    if (row.userId && typeof row.userId === 'object') return (row.userId as any).role || '';
    return '';
  };

  if (!authLoading && currentUser && currentUser.role !== 'super_admin') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-500" />
        <h3 className="mt-3 text-base font-bold text-rose-900 dark:text-rose-200">
          Access Restricted to Super Admin
        </h3>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">
          User access audit logs can only be viewed by authorized Super Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      {!hideHeaderStats && (
        <LoansStatGrid
          columns={3}
          stats={[
            { label: 'Total Audits Recorded', value: stats.totalAudits || totalRecords, accent: true },
            { label: 'Access & Role Changes', value: stats.totalAccessChanges || 0, highlight: true },
            { label: 'Events in Last 24h', value: stats.eventsToday || 0 },
          ]}
        />
      )}

      {/* Main Content Card */}
      <LoansContentPanel>
        {/* Filter & Search Toolbar */}
        <div className="border-b p-4 dark:border-stone-800" style={ledgerBorder}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search and event filters */}
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search user, modifier, page, comments…"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`${loansFormInputClass()} w-full pl-9 pr-3 text-xs`}
                  style={loansFormInputStyle()}
                />
              </div>

              {/* Event filter dropdown */}
              <select
                value={eventFilter}
                onChange={(e) => handleEventFilterChange(e.target.value)}
                className={`${loansFormInputClass()} w-48 text-xs font-medium`}
                style={loansFormInputStyle()}
              >
                <option value="all">All Audit Events</option>
                <option value="access_changes">Access &amp; Role Changes</option>
                <option value="access_updated">Access / Permissions Updated</option>
                <option value="user_updated">User Profile Updated</option>
                <option value="user_activated">Account Activated</option>
                <option value="user_deactivated">Account Deactivated</option>
                <option value="password_reset">Password Reset</option>
                <option value="user_created">User Created</option>
                <option value="user_deleted">User Deleted</option>
              </select>

              {/* Date Filters */}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  title="From date"
                  className={`${loansFormInputClass()} w-32 text-xs`}
                  style={loansFormInputStyle()}
                />
                <span className="text-stone-400 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  title="To date"
                  className={`${loansFormInputClass()} w-32 text-xs`}
                  style={loansFormInputStyle()}
                />
              </div>

              {(search || eventFilter !== 'all' || startDate || endDate) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Refresh button */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={fetchAudits}
                disabled={loading}
                className={loansDialogOutlineButtonClass()}
                style={loansDialogOutlineButtonStyle()}
                title="Refresh audit history"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px]">
            <thead>
              <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                <th className="px-4 py-3 text-left">Target User</th>
                <th className="px-4 py-3 text-left">Action / Event</th>
                <th className="px-4 py-3 text-left">Exact Changes (Pages, Roles, Division/Dept)</th>
                <th className="px-4 py-3 text-left">Changed By</th>
                <th className="px-4 py-3 text-left">Date &amp; Time</th>
                <th className={`px-4 py-3 ${ledgerTableActionsHeaderClass('right')}`}>Details</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-stone-800" style={ledgerBorder}>
              {loading && audits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Spinner />
                      <p className="text-xs text-stone-500 dark:text-stone-400">Loading audit history…</p>
                    </div>
                  </td>
                </tr>
              ) : audits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
                        <FileText className="h-6 w-6 text-stone-400" />
                      </div>
                      <h4 className="mt-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
                        No audit records found
                      </h4>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        No user access, page permission, or division modification records match your filter criteria.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                audits.map((row) => {
                  const name = targetName(row);
                  const email = targetEmail(row);
                  const empId = targetEmpId(row);
                  const role = targetRole(row);
                  const dt = formatTime(row.timestamp);

                  return (
                    <tr
                      key={row._id}
                      className="group transition-colors hover:bg-[var(--ps-accent-soft)]/20"
                    >
                      {/* Target User */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={userAvatarClass('sm')}
                            style={userAvatarStyle()}
                          >
                            {name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-xs font-bold text-stone-900 dark:text-white">
                                {name}
                              </span>
                              {empId && (
                                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                  {empId}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                              {email}
                            </p>
                            {role && (
                              <div className="mt-1">
                                <span className={userRoleBadgeClass(role)}>{role}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action / Event */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {renderEventBadge(row.event)}
                      </td>

                      {/* Access & Permissions Modified (Diff) */}
                      <td className="px-4 py-3.5 max-w-lg">
                        {renderDiffSummary(row)}
                      </td>

                      {/* Changed By / Performed By */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div>
                          <p className="text-xs font-bold text-stone-800 dark:text-stone-200">
                            {row.performedByName || 'System'}
                          </p>
                          {row.performedByRole && (
                            <span className={userRoleBadgeClass(row.performedByRole)}>
                              {row.performedByRole}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-stone-300">
                          <Clock className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                          <span>{dt.date}</span>
                          <span className="text-stone-400 text-[10px]">{dt.time}</span>
                        </div>
                      </td>

                      {/* View Details button */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedAudit(row)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                        >
                          <Eye className="h-3.5 w-3.5 text-stone-500" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalRecords > 0 && (
          <div
            className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3.5 sm:flex-row dark:border-stone-800"
            style={ledgerBorder}
          >
            <div className="text-xs text-stone-500 dark:text-stone-400">
              Showing{' '}
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {(page - 1) * limit + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {Math.min(page * limit, totalRecords)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {totalRecords}
              </span>{' '}
              records
            </div>

            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className={`${loansFormInputClass()} h-8 py-0 px-2 text-xs`}
                style={loansFormInputStyle()}
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>

              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </LoansContentPanel>

      {/* Inspect Audit Modal */}
      {selectedAudit && (() => {
        const diffs = selectedAudit.details?.diffs;
        const hasFeatureDiff = !!(
          diffs?.featureControl &&
          ((diffs.featureControl.added?.length || 0) > 0 || (diffs.featureControl.removed?.length || 0) > 0)
        );
        const hasDivisionDiff = !!diffs?.divisionMapping;
        const hasRoleDiff = !!diffs?.role;
        const hasScopeDiff = !!diffs?.dataScope;
        const hasStatusDiff = diffs?.isActive !== undefined;
        const hasNameDiff = !!diffs?.name;
        const hasPhoneDiff = !!diffs?.phone_number;
        const hasEmpIdDiff = !!diffs?.employeeId;
        const hasAnyDiff = hasFeatureDiff || hasDivisionDiff || hasRoleDiff || hasScopeDiff || hasStatusDiff || hasNameDiff || hasPhoneDiff || hasEmpIdDiff;

        const access = getUserEffectiveAccess(selectedAudit);

        return (
          <LoanDetailDialog open={true} onClose={() => setSelectedAudit(null)} maxWidth="max-w-4xl">
            <LoanDetailDialogHeader
              title="User Access & Security Audit Record"
              subtitle={`Event: ${selectedAudit.event} • ${formatTime(selectedAudit.timestamp).full}`}
              badge="Security audit"
              onClose={() => setSelectedAudit(null)}
            />

            <LoanDetailDialogBody>
              <div className="space-y-6">
                {/* Target & Performer Overview */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Target User */}
                  <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/60">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Target User (Modified)
                    </p>
                    <p className="mt-1 text-sm font-bold text-stone-900 dark:text-white">
                      {targetName(selectedAudit)}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {targetEmail(selectedAudit)}
                    </p>
                    {targetEmpId(selectedAudit) && (
                      <p className="mt-1 text-[11px] font-mono text-stone-600 dark:text-stone-400">
                        Emp ID: {targetEmpId(selectedAudit)}
                      </p>
                    )}
                    {targetRole(selectedAudit) && (
                      <div className="mt-2">
                        <span className={userRoleBadgeClass(targetRole(selectedAudit))}>
                          {targetRole(selectedAudit)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Performed By */}
                  <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-900/60">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Modified By (Authorized User)
                    </p>
                    <p className="mt-1 text-sm font-bold text-stone-900 dark:text-white">
                      {selectedAudit.performedByName || 'System / Auto'}
                    </p>
                    {selectedAudit.performedByRole && (
                      <div className="mt-2">
                        <span className={userRoleBadgeClass(selectedAudit.performedByRole)}>
                          {selectedAudit.performedByRole}
                        </span>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-stone-400">
                      Timestamp: {formatTime(selectedAudit.timestamp).full}
                    </p>
                  </div>
                </div>

                {/* Event & Action Summary */}
                <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Action Recorded
                    </span>
                    {hasAnyDiff ? (
                      renderEventBadge(selectedAudit.event)
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Settings Re-saved (No Changes)
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                      {hasAnyDiff
                        ? (selectedAudit.comments || 'User update recorded')
                        : (selectedAudit.comments && selectedAudit.comments !== 'User updated'
                            ? selectedAudit.comments
                            : 'Form submitted with no field alterations • Existing values and permissions preserved')}
                    </p>
                  </div>
                </div>

                {/* SECTION 1: WHAT CHANGED IN THIS AUDIT EVENT */}
                {hasAnyDiff ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2 dark:border-stone-800" style={ledgerBorder}>
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                        Access Scope &amp; Permission Modifications in this Event
                      </h3>
                    </div>

                    {/* Profile & Identity Field Modifications */}
                    {(hasNameDiff || hasPhoneDiff || hasEmpIdDiff) && (
                      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-stone-600 dark:text-stone-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                            Profile &amp; Identity Field Modifications
                          </h4>
                        </div>
                        <div className="mt-3 space-y-2">
                          {diffs?.name && (
                            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 p-2.5 text-xs dark:border-stone-800 dark:bg-stone-950">
                              <span className="font-semibold text-stone-500">Full Name:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-stone-500 line-through">{diffs.name.from}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                                <span className="font-bold text-stone-900 dark:text-white">{diffs.name.to}</span>
                              </div>
                            </div>
                          )}
                          {diffs?.phone_number && (
                            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 p-2.5 text-xs dark:border-stone-800 dark:bg-stone-950">
                              <span className="font-semibold text-stone-500">Phone Number:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-stone-500 line-through">{diffs.phone_number.from}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                                <span className="font-bold text-stone-900 dark:text-white">{diffs.phone_number.to}</span>
                              </div>
                            </div>
                          )}
                          {diffs?.employeeId && (
                            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 p-2.5 text-xs dark:border-stone-800 dark:bg-stone-950">
                              <span className="font-semibold text-stone-500">Employee ID:</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-stone-500 line-through">{diffs.employeeId.from}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                                <span className="font-mono font-bold text-stone-900 dark:text-white">{diffs.employeeId.to}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Data Scope changes */}
                    {diffs?.dataScope && (
                      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                          Data Scope Visibility Changed
                        </span>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="font-medium text-stone-500 line-through">
                            {diffs.dataScope.from || 'all'}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {diffs.dataScope.to}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Division & Department Access Changes */}
                    {diffs?.divisionMapping && (
                      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-stone-600 dark:text-stone-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                            Division &amp; Department Access Changes
                          </h4>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {/* Previous Division & Depts */}
                          <div className="rounded-lg border border-rose-200/80 bg-rose-50/50 p-3 text-xs dark:border-rose-900/50 dark:bg-rose-950/20">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                              Previous Scoping (From)
                            </p>
                            <div className="mt-2 space-y-2">
                              {(!diffs.divisionMapping.from || diffs.divisionMapping.from.length === 0) ? (
                                <span className="italic text-stone-400">No divisions assigned</span>
                              ) : (
                                diffs.divisionMapping.from.map((m: any, idx: number) => (
                                  <div key={idx} className="rounded border border-rose-200/60 bg-white/80 p-2 dark:border-rose-900/40 dark:bg-black/30">
                                    <p className="font-bold text-stone-800 dark:text-stone-200">
                                      {m.divisionName}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {(m.departments || []).length > 0 ? (
                                        m.departments.map((d: string) => (
                                          <span key={d} className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                            {d}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] italic text-stone-500">All departments</span>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Updated Division & Depts */}
                          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              Updated Scoping (To)
                            </p>
                            <div className="mt-2 space-y-2">
                              {(!diffs.divisionMapping.to || diffs.divisionMapping.to.length === 0) ? (
                                <span className="italic text-stone-400">No divisions assigned</span>
                              ) : (
                                diffs.divisionMapping.to.map((m: any, idx: number) => (
                                  <div key={idx} className="rounded border border-emerald-200/60 bg-white/80 p-2 dark:border-emerald-900/40 dark:bg-black/30">
                                    <p className="font-bold text-stone-800 dark:text-stone-200">
                                      {m.divisionName}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {(m.departments || []).length > 0 ? (
                                        m.departments.map((d: string) => (
                                          <span key={d} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                            {d}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] italic text-stone-500">All departments</span>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pages Access / Granular Module Permissions */}
                    {diffs?.featureControl && (
                      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-stone-600 dark:text-stone-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                            Pages &amp; Module Privileges Modified
                          </h4>
                        </div>

                        <div className="mt-3 space-y-4">
                          {/* Added / Granted Pages */}
                          {diffs.featureControl.added?.length > 0 && (
                            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                + Pages &amp; Privileges Granted ({diffs.featureControl.added.length})
                              </p>
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {diffs.featureControl.added.map((perm: string) => {
                                  const info = formatPermissionActionLabel(perm);
                                  return (
                                    <div
                                      key={perm}
                                      className="flex items-center justify-between rounded border border-emerald-200/70 bg-white px-2.5 py-1.5 shadow-sm dark:border-emerald-900/50 dark:bg-stone-900"
                                    >
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                        <span className="font-semibold text-stone-800 dark:text-stone-200">
                                          {info.module}
                                        </span>
                                      </div>
                                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                        {info.action}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Removed / Revoked Pages */}
                          {diffs.featureControl.removed?.length > 0 && (
                            <div className="rounded-lg border border-rose-200/80 bg-rose-50/40 p-3 text-xs dark:border-rose-900/40 dark:bg-rose-950/20">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                                - Pages &amp; Privileges Revoked ({diffs.featureControl.removed.length})
                              </p>
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {diffs.featureControl.removed.map((perm: string) => {
                                  const info = formatPermissionActionLabel(perm);
                                  return (
                                    <div
                                      key={perm}
                                      className="flex items-center justify-between rounded border border-rose-200/70 bg-white px-2.5 py-1.5 shadow-sm dark:border-rose-900/50 dark:bg-stone-900"
                                    >
                                      <div className="flex items-center gap-2">
                                        <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                        <span className="font-semibold text-stone-800 dark:text-stone-200">
                                          {info.module}
                                        </span>
                                      </div>
                                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                        {info.action}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Role & Status changes */}
                    {(diffs?.role || diffs?.isActive !== undefined) && (
                      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                          Role &amp; System State Adjustments
                        </h4>
                        <div className="mt-3 space-y-2">
                          {diffs.role && (
                            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 p-2.5 text-xs dark:border-stone-800 dark:bg-stone-950">
                              <span className="font-semibold text-stone-500">System Role:</span>
                              <div className="flex items-center gap-2">
                                <span className={userRoleBadgeClass(diffs.role.from)}>
                                  {diffs.role.from}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                                <span className={userRoleBadgeClass(diffs.role.to)}>
                                  {diffs.role.to}
                                </span>
                              </div>
                            </div>
                          )}

                          {diffs.isActive !== undefined && (
                            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 p-2.5 text-xs dark:border-stone-800 dark:bg-stone-950">
                              <span className="font-semibold text-stone-500">Account Access:</span>
                              <span className={`font-bold ${diffs.isActive.to ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {diffs.isActive.to ? 'Enabled (Active)' : 'Disabled (Inactive)'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* EXPLICIT NOTICE WHEN NO FIELD VALUES OR PERMISSIONS WERE MODIFIED */
                  <div className="rounded-2xl border border-amber-200/90 bg-amber-50/70 p-4.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                        <Info className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                          No Field Values, Permissions, or Access Scopes Were Modified
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                          This audit entry was recorded when the user settings were saved by <strong>{selectedAudit.performedByName || 'an administrator'}</strong>. However, all submitted parameters (Name, System Role, Data Scope, Divisions, and Feature Permissions) were identical to the existing account configuration. No field values or privileges were changed.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 text-[11px] font-medium text-amber-950 dark:text-amber-100">
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900">
                            <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>Name &amp; Details: Unchanged</span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900">
                            <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>System Role: Unchanged</span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900">
                            <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>Data Scope: Unchanged</span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900">
                            <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>Divisions: Unchanged</span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900">
                            <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>Page Privileges: Unchanged</span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900">
                            <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>Account Status: Unchanged</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 2: TARGET USER EFFECTIVE ACCESS CONFIGURATION & PAGES BREAKDOWN */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2 dark:border-stone-800" style={ledgerBorder}>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                        Target User Access Scope &amp; Page Permissions
                      </h3>
                    </div>
                    <span className="text-[10px] font-semibold text-stone-500">
                      {access.isSuperAdmin ? 'Full System Access' : `${access.featureControl.length} active permissions`}
                    </span>
                  </div>

                  {/* Scope & Division Card */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Data Visibility Scope
                      </span>
                      <div className="mt-2 flex items-center gap-2">
                        <Globe className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-bold text-stone-900 dark:text-white">
                          {access.dataScope === 'division'
                            ? 'Specific Divisions & Departments'
                            : access.dataScope === 'own'
                            ? 'Self / Own Records Only'
                            : 'All Organization Data (Global)'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                        {access.dataScope === 'division'
                          ? 'Records visible only within assigned divisions and departments.'
                          : access.dataScope === 'own'
                          ? 'Can only view own personal employee records.'
                          : 'Can view records across all divisions and departments.'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Division &amp; Department Assignments
                      </span>
                      <div className="mt-2 space-y-2">
                        {access.divisionMapping.length === 0 ? (
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Building className="h-3.5 w-3.5 text-stone-400" />
                            <span>{access.dataScope === 'all' ? 'All Divisions & Departments Included' : 'No specific division assigned'}</span>
                          </div>
                        ) : (
                          access.divisionMapping.map((m: any, idx: number) => (
                            <div key={idx} className="rounded-lg border border-stone-100 bg-stone-50 p-2 dark:border-stone-800 dark:bg-stone-950">
                              <p className="text-xs font-bold text-stone-900 dark:text-white">
                                {m.divisionName || m.division?.name || 'Division'}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(m.departments || []).length > 0 ? (
                                  m.departments.map((d: any) => (
                                    <span key={d?.name || d} className="rounded bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-medium text-stone-800 dark:bg-stone-800 dark:text-stone-200">
                                      {d?.name || d}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] italic text-stone-500">All departments</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pages / Module Privileges Grid by Category */}
                  <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Pages &amp; Module Access Privileges
                    </span>

                    <div className="mt-3 space-y-4">
                      {MODULE_CATEGORIES.map((cat) => {
                        const modStatuses = cat.modules.map((mod) => ({
                          ...mod,
                          status: getModuleAccessStatus(mod.code, access.featureControl, access.isSuperAdmin),
                        }));

                        const grantedCount = modStatuses.filter((m) => m.status.granted).length;

                        return (
                          <div key={cat.code} className="space-y-2">
                            <div className="flex items-center justify-between border-b border-stone-100 pb-1 dark:border-stone-800">
                              <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                                {cat.icon} {cat.name}
                              </span>
                              <span className="text-[10px] font-semibold text-stone-400">
                                {grantedCount} of {cat.modules.length} accessible
                              </span>
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {modStatuses.map((m) => {
                                const isGranted = m.status.granted;
                                return (
                                  <div
                                    key={m.code}
                                    className={`flex items-center justify-between rounded-lg border p-2 text-xs transition-all ${
                                      isGranted
                                        ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                                        : 'border-stone-100 bg-stone-50/50 opacity-60 dark:border-stone-800/80 dark:bg-stone-950/40'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {isGranted ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                      ) : (
                                        <XCircle className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                                      )}
                                      <span className={`truncate font-medium ${isGranted ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400 line-through'}`}>
                                        {m.label}
                                      </span>
                                    </div>
                                    <span
                                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                        m.status.level === 'write'
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                          : m.status.level === 'read'
                                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                          : m.status.level === 'scoped'
                                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                          : 'bg-stone-200/60 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                                      }`}
                                    >
                                      {m.status.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            </LoanDetailDialogBody>

            <div className="flex justify-end border-t px-6 py-4 dark:border-stone-800" style={ledgerBorder}>
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                className={loansDialogOutlineButtonClass()}
                style={loansDialogOutlineButtonStyle()}
              >
                Close
              </button>
            </div>
          </LoanDetailDialog>
        );
      })()}
    </div>
  );
}
