'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, Division, Department, Designation } from '@/lib/api';
import {
  buildDivisionToDepartmentIdsMap,
  getDepartmentsForDivision,
} from '@/lib/divisionDepartmentUtils';
import {
  collectEmployeeGroupIdsFromEmployees,
  getScopedEmployeeGroupsForFilter,
  getUserAllowedEmployeeGroupIds,
} from '@/lib/employeeGroupScopeUtils';
import type { EmployeeGroup } from '@/lib/api';
import { auth } from '@/lib/auth';
import { toast, ToastContainer } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import 'react-toastify/dist/ReactToastify.css';
import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart,
} from 'recharts';
import { TrendingUp, TrendingDown, Users, CalendarX, AlertTriangle, Timer } from 'lucide-react';

import {
  LogOut,
  Search,
  Eye,
  Check,
  X,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Clock3,
  ListTodo,
  Plus,
  Calendar,
  Save,
  Printer,
  LayoutGrid,
  List,
  Pencil,
  UserPlus,
  UserCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import RejoinEmployeeModal from '@/components/employee/RejoinEmployeeModal';
import {
  buildLeaveODPayPeriodOptions,
  getPayPeriodRangeForCalendarMonth,
} from '@/lib/payPeriodRange';

type CompareTrend = { text: string; positive: boolean; isUp: boolean };

const formatComparePct = (current: number, previous: number): CompareTrend => {
  const diff = current - previous;
  const isUp = diff > 0;
  const text = diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff}`;
  return { text, positive: diff >= 0, isUp };
};

const formatComparePctLowerIsBetter = (current: number, previous: number): CompareTrend | null => {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  const isUp = diff > 0;
  const text = diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff}`;
  return { text, positive: diff <= 0, isUp };
};

const endOfPayPeriodDay = (dateStr: string) => {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const startOfPayPeriodDay = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

// ─── Pay-Period Stat Card with sparkline ────────────────────────────────────
const PayPeriodStatCard = ({
  title, value, subLabel, delta, chartData, color, bgClass, iconClass, icon: Icon, loading,
}: {
  title: string;
  value: number | string;
  subLabel?: string;
  delta?: number;
  chartData?: number[];
  color: string;
  bgClass: string;
  iconClass: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) => {
  const sparkData = (chartData || []).map((v, i) => ({ i, v }));
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 truncate">{title}</p>
          <div className="mt-1 sm:mt-2 flex items-baseline gap-2">
            {loading ? (
              <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{value}</h3>
            )}
          </div>
          {!loading && subLabel && (
            <div className="mt-1 flex items-center gap-1">
              {delta !== undefined && (
                isPositive
                  ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                  : <TrendingDown className="w-3 h-3 text-rose-500" />
              )}
              <span className={`text-[10px] font-bold ${delta !== undefined ? (isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-slate-500'}`}>
                {subLabel}
              </span>
            </div>
          )}
        </div>
        <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl shrink-0 ${bgClass} ${iconClass}`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
      </div>
      {chartData && chartData.length > 1 && (
        <div className="mt-3 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`pp-grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#pp-grad-${color.replace('#','')})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ─── Section heading helper ──────────────────────────────────────────────────
const SectionHeading = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-4">
    <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{title}</h2>
    {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
  </div>
);

// ─── Reusable mini table card ────────────────────────────────────────────────
const MiniTableCard = ({ title, subtitle, icon: Icon, iconClass, headerAction, children }: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-7 w-7 items-center justify-center rounded-xl shrink-0 ${iconClass || 'bg-slate-100 dark:bg-slate-800'}`}>
          <Icon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-800 dark:text-slate-100">{title}</p>
          {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {headerAction}
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

const StatCard = ({ title, value, icon: Icon, bgClass, iconClass, dekorClass, loading }: { title: string; value: number | string; icon: React.ComponentType<{ className?: string }>; bgClass: string; iconClass: string; dekorClass?: string; loading?: boolean }) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 truncate">{title}</p>
        <div className="mt-1 sm:mt-2 flex items-baseline gap-2">
          {loading ? (
            <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          ) : (
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{value}</h3>
          )}
        </div>
      </div>
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl shrink-0 ${bgClass} ${iconClass}`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
    </div>
    {dekorClass && <div className={`absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 rounded-full ${dekorClass}`} />}
  </div>
);

interface ResignationRequest {
  _id: string;
  employeeId?: {
    _id: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no: string;
    profilePhoto?: string;
    department_id?: { _id: string; name: string };
    division_id?: { _id: string; name: string };
    designation_id?: { name: string } | string;
    designation?: { name: string };
    employee_group_id?: { _id: string; name: string };
    doj?: string;
    dynamicFields?: Record<string, any>;
    agreementStartDate?: string;
    agreementEndDate?: string;
    agreement_start_date?: string;
    agreement_end_date?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    contract_start_date?: string;
    contract_end_date?: string;
  };
  emp_no: string;
  leftDate: string;
  remarks: string;
  status: string;
  requestedBy?: { _id: string; name: string; email?: string };
  createdAt: string;
  workflow?: {
    currentStepRole?: string;
    nextApproverRole?: string;
    isCompleted?: boolean;
    approvalChain?: Array<{
      stepOrder?: number;
      role?: string;
      label?: string;
      status?: string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      updatedAt?: string;
      updatedAtIST?: string;
      canEditLWD?: boolean;
    }>;
    history?: Array<{
      step?: string;
      action?: string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      timestamp?: string;
    }>;
    reportingManagerIds?: string[];
  };
  requestType?: 'resignation' | 'termination';
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'final_approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'hod_approved':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'manager_approved':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
    case 'reporting_manager_approved':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
    case 'hr_approved':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'approved':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'rejected':
    case 'cancelled':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
  }
};

const getDisplayStatus = (req?: ResignationRequest | null) => {
  if (!req) return 'pending';
  const baseStatus = (req.status || 'pending').toLowerCase();
  if (baseStatus === 'pending') {
    const hasApprovedStep = (req.workflow?.approvalChain || []).some(
      (step) => (step.status || '').toLowerCase() === 'approved'
    );
    if (hasApprovedStep) return 'approved';
  }
  return baseStatus;
};

const normalizeApprovalStageLabel = (label?: string) => {
  if (!label) return '';
  return String(label).replace(/\s*approval\s*$/i, '').trim();
};

const toDisplayCase = (value: string) => {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

const getLatestApprovedByLabel = (req?: ResignationRequest | null) => {
  const approvedSteps = (req?.workflow?.approvalChain || []).filter(
    (step) => (step.status || '').toLowerCase() === 'approved'
  );
  if (approvedSteps.length === 0) return '';
  const latestApprovedStep = approvedSteps[approvedSteps.length - 1];
  const fallbackRole = (latestApprovedStep.role || '').replace(/_/g, ' ');
  return normalizeApprovalStageLabel(latestApprovedStep.label || fallbackRole);
};

const getStatusVisualKey = (req?: ResignationRequest | null) => {
  const displayStatus = getDisplayStatus(req);
  if (displayStatus !== 'approved') return displayStatus;

  if ((req?.status || '').toLowerCase() === 'approved' || req?.workflow?.isCompleted) {
    return 'final_approved';
  }

  const approvedBy = getLatestApprovedByLabel(req).toLowerCase();
  if (approvedBy.includes('reporting manager')) return 'reporting_manager_approved';
  if (approvedBy.includes('manager')) return 'manager_approved';
  if (approvedBy.includes('hod') || approvedBy.includes('head of department')) return 'hod_approved';
  if (approvedBy.includes('hr')) return 'hr_approved';
  return 'approved';
};

const getDisplayStatusText = (req?: ResignationRequest | null) => {
  const displayStatus = getDisplayStatus(req);
  if (displayStatus === 'approved') {
    if ((req?.status || '').toLowerCase() === 'approved' || req?.workflow?.isCompleted) {
      return 'Approved';
    }
    const approvedBy = getLatestApprovedByLabel(req);
    return approvedBy ? `${toDisplayCase(approvedBy)} approved` : 'Approved';
  }
  return toDisplayCase(displayStatus);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateDash = (dateStr?: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).replace(/\s+/g, '-');
};

/** Format date as YYYY-MM-DD in local time (avoids UTC shift that makes "today + 90" show as previous day) */
const toLocalDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getEmployeeName = (req: ResignationRequest) => {
  const emp = req.employeeId;
  if (!emp) return req.emp_no || '—';
  if (emp.employee_name) return emp.employee_name;
  if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
  if (emp.first_name) return emp.first_name;
  return emp.emp_no || '—';
};

const getEmployeeInitials = (req: ResignationRequest) => {
  const name = getEmployeeName(req);
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (name[0] || 'E').toUpperCase();
};

const LWD_CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const lwdStatusDotClass = (req: ResignationRequest) => {
  const key = getStatusVisualKey(req);
  if (key === 'pending') return 'bg-amber-400';
  if (['rejected', 'cancelled'].includes(key)) return 'bg-rose-400';
  return 'bg-emerald-400';
};

const ResignationLWDCalendarModal = ({
  open,
  onClose,
  resignationsByDate,
  onSelectRequest,
}: {
  open: boolean;
  onClose: () => void;
  resignationsByDate: Map<string, ResignationRequest[]>;
  onSelectRequest: (req: ResignationRequest) => void;
}) => {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(() => toLocalDateString(new Date()));
  const [showPending, setShowPending] = useState(false);

  const filteredResignationsByDate = useMemo(() => {
    const map = new Map<string, ResignationRequest[]>();
    resignationsByDate.forEach((list, key) => {
      const filtered = list.filter((req) => req.status === 'approved' || (showPending && req.status === 'pending'));
      if (filtered.length > 0) {
        map.set(key, filtered);
      }
    });
    return map;
  }, [resignationsByDate, showPending]);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setViewMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDay(toLocalDateString(now));
  }, [open]);

  const shiftMonth = useCallback((delta: number) => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  if (!open) return null;

  const monthLabel = new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
  const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const todayKey = toLocalDateString(new Date());

  const cells: Array<{ key: string | null; day: number | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ key: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewMonth.year, viewMonth.month, d);
    cells.push({ key: toLocalDateString(date), day: d });
  }

  const selectedResignations = selectedDay ? (filteredResignationsByDate.get(selectedDay) || []) : [];
  const monthResignationCount = Array.from(filteredResignationsByDate.entries()).reduce((acc, [key, list]) => {
    const d = new Date(`${key}T12:00:00`);
    if (d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month) {
      return acc + list.length;
    }
    return acc;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="relative z-50 w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Last Working Days Calendar</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Showing {showPending ? 'approved and pending' : 'approved only'} employees — {monthResignationCount} resignation{monthResignationCount === 1 ? '' : 's'} in view
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-end">
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showPending}
                onChange={() => setShowPending((v) => !v)}
                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              Show pending
            </label>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close calendar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-black text-slate-800 dark:text-slate-100">{monthLabel}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {LWD_CALENDAR_WEEKDAYS.map((day) => (
              <div key={day} className="py-1 text-center text-[9px] font-black uppercase tracking-wider text-slate-400">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell.key || cell.day === null) {
                return <div key={`empty-${idx}`} className="min-h-[3.25rem]" />;
              }

              const dayResignations = filteredResignationsByDate.get(cell.key) || [];
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedDay;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell.key)}
                  className={`min-h-[3.25rem] rounded-xl border p-1.5 text-left transition-all ${
                    isSelected
                      ? 'border-orange-400 bg-orange-50 dark:border-orange-500/60 dark:bg-orange-900/20 ring-2 ring-orange-400/30'
                      : dayResignations.length > 0
                      ? 'border-orange-100 bg-orange-50/40 hover:bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20 dark:hover:bg-orange-900/20'
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                      isToday
                        ? 'bg-orange-500 text-white'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {dayResignations.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {dayResignations.slice(0, 3).map((req) => (
                        <span key={req._id} className="inline-flex h-6 w-6 overflow-hidden rounded-full border border-white bg-slate-100 shadow-sm dark:bg-slate-800">
                          {req.employeeId?.profilePhoto ? (
                            <img
                              src={req.employeeId.profilePhoto}
                              alt={getEmployeeName(req)}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-slate-300 text-[10px] font-black uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                              {getEmployeeInitials(req)}
                            </span>
                          )}
                        </span>
                      ))}
                      {dayResignations.length > 3 && (
                        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          +{dayResignations.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {selectedDay
                  ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Select a date'}
              </p>
            </div>
            {selectedResignations.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">No last working days on this date</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                {selectedResignations.map((req) => (
                  <button
                    key={req._id}
                    type="button"
                    onClick={() => onSelectRequest(req)}
                    className="w-full px-4 py-3 text-left hover:bg-white dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                          {req.employeeId?.profilePhoto ? (
                            <img
                              src={req.employeeId.profilePhoto}
                              alt={getEmployeeName(req)}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-300 text-[10px] font-black uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {getEmployeeInitials(req)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {getEmployeeName(req)}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {req.emp_no} · {req.employeeId?.division_id?.name || '—'} / {req.employeeId?.department_id?.name || '—'}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${getStatusColor(getStatusVisualKey(req))}`}>
                        {getDisplayStatusText(req)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[9px] text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Approved</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Rejected</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const getNocStatus = () => 'N/A';

const getLatestApprovedStep = (req: ResignationRequest) => {
  return (req.workflow?.approvalChain || [])
    .filter((step) => (step.status || '').toLowerCase() === 'approved')
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || '').getTime() || 0;
      const bTime = new Date(b.updatedAt || '').getTime() || 0;
      return bTime - aTime;
    })[0];
};

const getFormattedApprovalDate = (req: ResignationRequest): string => {
  const step = getLatestApprovedStep(req);
  if (!step?.updatedAt) return '';
  return formatDate(step.updatedAt);
};

const getApprovalStageStatus = (req: ResignationRequest, index: number) => {
  const step = req.workflow?.approvalChain?.[index];
  if (!step) return '';
  const status = (step.status || '').toLowerCase();
  if (status) return toDisplayCase(status);
  return String(step.label || step.role || '').trim();
};

const getWorkflowStageLabel = (req: ResignationRequest, index: number): string => {
  const step = req.workflow?.approvalChain?.[index];
  if (!step) return `Stage ${index + 1}`;
  const label = step.label || step.role || '';
  return String(label).trim() || `Stage ${index + 1}`;
};

const getStageContent = (req: ResignationRequest, index: number): string => {
  const step = req.workflow?.approvalChain?.[index];
  if (!step) return 'N/A';
  
  const status = (step.status || '').toLowerCase();
  const statusDisplay = toDisplayCase(status) || 'Pending';
  
  if (!status || status === 'pending') {
    return statusDisplay;
  }
  
  const userName = step.actionByName || step.actionByRole || '—';
  const dateTime = step.updatedAtIST || (step.updatedAt ? formatDateTime(step.updatedAt) : '');
  
  return `${statusDisplay}\n${userName}${dateTime ? `\n${dateTime}` : ''}`;
};

const groupRequestsByDivisionDepartment = (requests: ResignationRequest[]) => {
  const grouped: Record<string, Record<string, ResignationRequest[]>> = {};
  
  requests.forEach((req) => {
    const division = req.employeeId?.division_id?.name || 'Unknown Division';
    const department = req.employeeId?.department_id?.name || 'Unknown Department';
    
    if (!grouped[division]) {
      grouped[division] = {};
    }
    if (!grouped[division][department]) {
      grouped[division][department] = [];
    }
    grouped[division][department].push(req);
  });
  
  return grouped;
};

const parseDateSafe = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getAgreementDatesFromEmployee = (emp: any): { startDate?: string; endDate?: string } => {
  if (!emp) return {};
  const dynamic = emp.dynamicFields || {};
  const start =
    emp.agreementStartDate ||
    emp.agreement_start_date ||
    emp.contractStartDate ||
    emp.contract_start_date ||
    dynamic.agreementStartDate ||
    dynamic.agreement_start_date ||
    dynamic.contractStartDate ||
    dynamic.contract_start_date;
  const end =
    emp.agreementEndDate ||
    emp.agreement_end_date ||
    emp.contractEndDate ||
    emp.contract_end_date ||
    dynamic.agreementEndDate ||
    dynamic.agreement_end_date ||
    dynamic.contractEndDate ||
    dynamic.contract_end_date;
  return { startDate: start, endDate: end };
};

const canCreateResignation = (user: any) => {
  if (!user?.role) return false;
  const role = String(user.role).toLowerCase();
  return ['manager', 'hod', 'hr', 'sub_admin', 'super_admin'].includes(role);
};

export default function SuperAdminResignationsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [allRequests, setAllRequests] = useState<ResignationRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ResignationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ResignationRequest | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [newLeftDate, setNewLeftDate] = useState('');
  const [detailLwdEditMode, setDetailLwdEditMode] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyEmployees, setApplyEmployees] = useState<{ emp_no: string; name: string }[]>([]);
  const [applyEmployeeMeta, setApplyEmployeeMeta] = useState<Record<string, { agreementStartDate?: string; agreementEndDate?: string }>>({});
  const [applyEmployeeSearch, setApplyEmployeeSearch] = useState('');
  const [applySelectedEmpNo, setApplySelectedEmpNo] = useState('');
  const [applyRemarks, setApplyRemarks] = useState('');
  const [applyLastWorkingDate, setApplyLastWorkingDate] = useState('');
  const [applyType, setApplyType] = useState<'resignation' | 'termination'>('resignation');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyModalLoading, setApplyModalLoading] = useState(false);
  const [applyPendingAssets, setApplyPendingAssets] = useState<any[]>([]);
  const [applyPendingAssetsLoading, setApplyPendingAssetsLoading] = useState(false);
  const [resignationSettings, setResignationSettings] = useState<any>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    requestType: 'all',
    division_id: 'all',
    department_id: 'all',
    employee_group_id: 'all',
  });
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [showRejoinModal, setShowRejoinModal] = useState(false);
  const [rejoinEmployee, setRejoinEmployee] = useState<{ emp_no: string; employee_name?: string } | null>(null);
  const [customGroupingEnabled, setCustomGroupingEnabled] = useState(false);
  const [orgScopeGroupIds, setOrgScopeGroupIds] = useState<Set<string> | null>(null);
  const [viewType, setViewType] = useState<'card' | 'list'>('list');
  const [selectedPayPeriodKey, setSelectedPayPeriodKey] = useState<string>('__default__');
  const [comparePeriodKey, setComparePeriodKey] = useState<string>('__prev__');
  const [pendingAgingView, setPendingAgingView] = useState<'thisMonth' | 'overall'>('overall');

  // Load-more visible row counts for expandable table cards
  const [divisionVisible, setDivisionVisible] = useState(5);
  const [noticeVisible, setNoticeVisible] = useState(5);
  const [lwdVisible, setLwdVisible] = useState(5);
  const [showLWDCalendar, setShowLWDCalendar] = useState(false);

  const payCycleStartDay = (resignationSettings as { payrollCycleStartDay?: number })?.payrollCycleStartDay ?? 1;
  const payCycleEndDay = (resignationSettings as { payrollCycleEndDay?: number | null })?.payrollCycleEndDay ?? null;

  const divisionDeptMap = useMemo(
    () => buildDivisionToDepartmentIdsMap(divisions, departments),
    [divisions, departments]
  );

  const filteredDepartmentsForFilter = useMemo(() => {
    if (!filters.division_id || filters.division_id === 'all') return departments;
    return getDepartmentsForDivision(filters.division_id, divisions, departments, divisionDeptMap);
  }, [filters.division_id, divisions, departments, divisionDeptMap]);

  const userAllowedGroupIds = useMemo(
    () => getUserAllowedEmployeeGroupIds(currentUser),
    [currentUser]
  );

  const scopedGroupsForFilter = useMemo(
    () =>
      getScopedEmployeeGroupsForFilter(groups, {
        divisionId: filters.division_id !== 'all' ? filters.division_id : undefined,
        departmentId: filters.department_id !== 'all' ? filters.department_id : undefined,
        userAllowedGroupIds,
        orgScopeGroupIds,
      }),
    [
      groups,
      filters.division_id,
      filters.department_id,
      userAllowedGroupIds,
      orgScopeGroupIds,
    ]
  );

  const selectedApplyEmployeeAgreement = useMemo(() => {
    return applyEmployeeMeta[applySelectedEmpNo] || {};
  }, [applyEmployeeMeta, applySelectedEmpNo]);

  const filteredApplyEmployees = useMemo(() => {
    const q = applyEmployeeSearch.trim().toLowerCase();
    if (!q) return applyEmployees;
    return applyEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(q) || emp.emp_no.toLowerCase().includes(q)
    );
  }, [applyEmployees, applyEmployeeSearch]);

  useEffect(() => {
    if (!showApplyModal || !applySelectedEmpNo) {
      setApplyPendingAssets([]);
      return;
    }
    let cancelled = false;
    const loadPendingAssets = async () => {
      setApplyPendingAssetsLoading(true);
      try {
        const employeeRes = await api.getEmployee(applySelectedEmpNo);
        const employeeId = employeeRes?.success ? employeeRes?.data?._id : null;
        if (!employeeId) {
          if (!cancelled) setApplyPendingAssets([]);
          return;
        }
        const assetsRes = await api.getAssetAssignments({ employeeId, status: 'assigned' });
        if (cancelled) return;
        setApplyPendingAssets(Array.isArray(assetsRes?.data) ? assetsRes.data : []);
      } catch (_) {
        if (!cancelled) setApplyPendingAssets([]);
      } finally {
        if (!cancelled) setApplyPendingAssetsLoading(false);
      }
    };
    void loadPendingAssets();
    return () => {
      cancelled = true;
    };
  }, [showApplyModal, applySelectedEmpNo]);

  useEffect(() => {
    const user = auth.getUser();
    if (user) setCurrentUser(user);
  }, []);

  useEffect(() => {
    const div = filters.division_id;
    const dept = filters.department_id;
    if ((!div || div === 'all') && (!dept || dept === 'all')) {
      setOrgScopeGroupIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getEmployees({
          is_active: true,
          division_id: div && div !== 'all' ? div : undefined,
          department_id: dept && dept !== 'all' ? dept : undefined,
          limit: 5000,
          page: 1,
        });
        if (cancelled) return;
        const list = res?.data?.employees ?? res?.data ?? [];
        const arr = Array.isArray(list) ? list : [];
        setOrgScopeGroupIds(collectEmployeeGroupIdsFromEmployees(arr));
      } catch {
        if (!cancelled) setOrgScopeGroupIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.division_id, filters.department_id]);

  useEffect(() => {
    if (!customGroupingEnabled || filters.employee_group_id === 'all') return;
    const stillValid = scopedGroupsForFilter.some(
      (g) => String(g._id) === String(filters.employee_group_id)
    );
    if (!stillValid) {
      setFilters((prev) => ({ ...prev, employee_group_id: 'all' }));
    }
  }, [customGroupingEnabled, scopedGroupsForFilter, filters.employee_group_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allRes, pendingRes, settingsRes] = await Promise.all([
        api.getResignationRequests(),
        api.getResignationPendingApprovals(),
        api.getResignationSettings(),
      ]);
      if (allRes.success && allRes.data) setAllRequests(Array.isArray(allRes.data) ? allRes.data : []);
      else setAllRequests([]);
      if (pendingRes.success && pendingRes.data) setPendingRequests(Array.isArray(pendingRes.data) ? pendingRes.data : []);
      else setPendingRequests([]);
      if (settingsRes.success && settingsRes.data) setResignationSettings(settingsRes.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      toast.error(message);
      setAllRequests([]);
      setPendingRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResignations();
    fetchFilterOptions();
  }, []);

  const fetchResignations = async () => {
    await loadData();
  };

  const fetchFilterOptions = async () => {
    try {
      const [divRes, deptRes, desRes, groupRes, groupingSettingRes] = await Promise.all([
        api.getDivisions(true),
        api.getDepartments(true),
        api.getDesignations(),
        api.getEmployeeGroups(true),
        api.getSetting('custom_employee_grouping_enabled'),
      ]);
      if (divRes.success) setDivisions(divRes.data || []);
      if (deptRes.success) setDepartments(deptRes.data || []);
      if (desRes.success) setDesignations(desRes.data || []);
      if (groupRes.success) setGroups(groupRes.data || []);
      const groupingOn = !!(
        groupingSettingRes.success &&
        groupingSettingRes.data &&
        groupingSettingRes.data.value
      );
      setCustomGroupingEnabled(groupingOn);
      if (!groupingOn) {
        setFilters((prev) => ({ ...prev, employee_group_id: 'all' }));
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const openRejoinForRequest = (req: ResignationRequest) => {
    const name =
      req.employeeId?.employee_name ||
      [req.employeeId?.first_name, req.employeeId?.last_name].filter(Boolean).join(' ') ||
      req.emp_no;
    setRejoinEmployee({ emp_no: req.emp_no, employee_name: name });
    setShowRejoinModal(true);
  };

  const openApplyModal = (type: 'resignation' | 'termination' = 'resignation') => {
    setApplySelectedEmpNo('');
    setApplyEmployeeSearch('');
    setApplyRemarks('');
    setApplyPendingAssets([]);
    setApplyType(type);
    if (type === 'termination') {
      setApplyLastWorkingDate(toLocalDateString(new Date()));
    } else {
      setApplyLastWorkingDate('');
    }
    setShowApplyModal(true);
  };

  const handleApplyTypeChange = (type: 'resignation' | 'termination') => {
    setApplyType(type);
    if (type === 'termination') {
      setApplyLastWorkingDate(toLocalDateString(new Date()));
    } else {
      setApplyLastWorkingDate('');
      // Trigger notice period logic if modal is already open
      const raw = resignationSettings?.noticePeriodDays ?? resignationSettings?.value?.noticePeriodDays;
      const noticeDays = Math.max(0, Number(raw) || 0);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + noticeDays);
      minDate.setHours(0, 0, 0, 0);
      setApplyLastWorkingDate(toLocalDateString(minDate));
    }
  };

  useEffect(() => {
    if (!showApplyModal) return;
    let cancelled = false;
    const load = async () => {
      setApplyModalLoading(true);
      try {
        const [settingsRes, empRes] = await Promise.all([
          api.getResignationSettings(),
          api.getEmployeesSummary({ is_active: true, limit: 500, page: 1 }),
        ]);
        if (cancelled) return;
        if (settingsRes.success && settingsRes.data) setResignationSettings(settingsRes.data);
        const raw = settingsRes?.data?.noticePeriodDays ?? settingsRes?.data?.value?.noticePeriodDays;
        const noticeDays = Math.max(0, Number(raw) || 0);
        const minDate = new Date();
        minDate.setDate(minDate.getDate() + noticeDays);
        minDate.setHours(0, 0, 0, 0);
        setApplyLastWorkingDate(toLocalDateString(minDate));
        const list = empRes?.data?.employees ?? empRes?.data ?? [];
        const arr = Array.isArray(list) ? list : [];
        const options = arr
          .filter((e: any) => e.emp_no && !e.leftDate)
          .map((e: any) => ({
            emp_no: e.emp_no,
            name: e.employee_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.emp_no,
          }));
        const meta: Record<string, { agreementStartDate?: string; agreementEndDate?: string }> = {};
        arr.forEach((e: any) => {
          if (!e?.emp_no) return;
          const agreementDates = getAgreementDatesFromEmployee(e);
          meta[e.emp_no] = {
            agreementStartDate: agreementDates.startDate,
            agreementEndDate: agreementDates.endDate,
          };
        });
        setApplyEmployeeMeta(meta);
        setApplyEmployees(options);
      setApplyEmployeeSearch('');
      } catch (_) {
        if (!cancelled) {
          setApplyEmployees([]);
          setApplyEmployeeMeta({});
        }
      } finally {
        if (!cancelled) setApplyModalLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [showApplyModal]);

  const handleSubmitResignation = async () => {
    if (!applySelectedEmpNo || !applyLastWorkingDate) {
      toast.error('Please select an employee and ensure last working date is set.');
      return;
    }
    if (applyPendingAssets.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Pending asset return required',
        text: 'This employee still has assigned assets. Please return all assets before submitting resignation.',
      });
      return;
    }
    setApplyLoading(true);
    try {
      if (applyType === 'resignation') {
        const agreementEnd = parseDateSafe(selectedApplyEmployeeAgreement.agreementEndDate);
        const lwd = parseDateSafe(applyLastWorkingDate);
        if (agreementEnd && lwd && lwd < agreementEnd) {
          const now = new Date();
          const remainingDays = Math.max(1, Math.ceil((agreementEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          const result = await Swal.fire({
            icon: 'warning',
            title: 'Agreement period not completed',
            text: `Agreement end date is ${agreementEnd.toLocaleDateString('en-IN')}. It still has around ${remainingDays} day(s). Do you want to continue resignation submission?`,
            showCancelButton: true,
            confirmButtonText: 'Yes, continue',
            cancelButtonText: 'Cancel',
          });
          if (!result.isConfirmed) {
            setApplyLoading(false);
            return;
          }
        }
      }

      const res = await api.createResignationRequest({
        emp_no: applySelectedEmpNo,
        leftDate: applyLastWorkingDate,
        remarks: applyRemarks.trim() || undefined,
        requestType: applyType,
      });
      if (res?.success) {
        Swal.fire({ icon: 'success', title: 'Submitted', text: 'Resignation request submitted successfully.', timer: 2000, showConfirmButton: false });
        setShowApplyModal(false);
        loadData();
      } else {
        Swal.fire({ icon: 'error', title: 'Failed', text: (res as any)?.message || 'Submit failed.' });
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err?.message || 'Submit failed.' });
    } finally {
      setApplyLoading(false);
    }
  };

  const canPerformAction = (item: ResignationRequest) => {
    if (!currentUser) return false;
    if (item.status !== 'pending') return false;

    const role = (currentUser.role || '').toLowerCase();
    if (['super_admin', 'sub_admin'].includes(role)) return true;

    const nextRole = String(item.workflow?.nextApproverRole || '').toLowerCase().trim();
    if (!nextRole) return false;
    if (role === nextRole) return true;
    if (nextRole === 'final_authority' && role === 'hr') return true;
    if (nextRole === 'reporting_manager') {
      const reportingManagerIds = item.workflow?.reportingManagerIds;
      const userId = (currentUser as any)._id || (currentUser as any).id;
      if (reportingManagerIds?.length && userId && reportingManagerIds.some((id: string) => String(id).trim() === String(userId).trim())) return true;
    }
    return false;
  };

  const handleSaveLWD = async () => {
    if (!selectedRequest || !newLeftDate) return;
    
    setSaveLoading(true);
    try {
      const response = await api.updateResignationLWD(selectedRequest._id, {
        newLeftDate: newLeftDate,
        comments: actionComment.trim() || undefined
      });
      
      if (response.success) {
        toast.success('Last working date updated successfully');
        setSelectedRequest(response.data);
        setDetailLwdEditMode(false);
        loadData();
      } else {
        toast.error(response.message || 'Failed to update date');
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message || 'Failed to update date');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDetailAction = async (action: 'approve' | 'reject') => {
    if (!selectedRequest) return;
    try {
      const response = await api.approveResignationRequest(selectedRequest._id, { 
        action, 
        comments: actionComment,
        newLeftDate: action === 'approve' && newLeftDate !== (selectedRequest.leftDate ? selectedRequest.leftDate.split('T')[0] : '') ? newLeftDate : undefined
      });
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Done',
          text: action === 'approve' ? 'Resignation approved.' : 'Resignation rejected.',
          timer: 2000,
          showConfirmButton: false,
        });
        setShowDetailDialog(false);
        setSelectedRequest(null);
        setActionComment('');
        setDetailLwdEditMode(false);
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.message || (response as any).error || 'Action failed',
        });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Action failed',
      });
    }
  };

  const handleCardAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const response = await api.approveResignationRequest(id, { action, comments: '' });
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Done',
          text: action === 'approve' ? 'Resignation approved.' : 'Resignation rejected.',
          timer: 2000,
          showConfirmButton: false,
        });
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.message || (response as any).error || 'Action failed',
        });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Action failed',
      });
    }
  };



  const baseFiltered = useMemo(() => {
    return allRequests.filter((req) => {
      const employee = req.employeeId;
      const matchesSearch = !filters.search || employee?.employee_name?.toLowerCase().includes(filters.search.toLowerCase()) || employee?.emp_no?.toLowerCase().includes(filters.search.toLowerCase());
      const matchesRequestType = filters.requestType === 'all' || 
        (filters.requestType === 'resignation' ? (req.requestType !== 'termination') : (req.requestType === filters.requestType));
      const matchesDivision = filters.division_id === 'all' || (employee?.division_id?._id || employee?.division_id) === filters.division_id;
      const matchesDepartment = filters.department_id === 'all' || (employee?.department_id?._id || employee?.department_id) === filters.department_id;
      const matchesGroup = filters.employee_group_id === 'all' || (employee?.employee_group_id?._id || employee?.employee_group_id) === filters.employee_group_id;
      return matchesSearch && matchesRequestType && matchesDivision && matchesDepartment && matchesGroup;
    });
  }, [allRequests, filters]);

  const baseFilteredPending = useMemo(() => {
    return pendingRequests.filter((req) => {
      const employee = req.employeeId;
      const matchesSearch = !filters.search || employee?.employee_name?.toLowerCase().includes(filters.search.toLowerCase()) || employee?.emp_no?.toLowerCase().includes(filters.search.toLowerCase());
      const matchesRequestType = filters.requestType === 'all' || 
        (filters.requestType === 'resignation' ? (req.requestType !== 'termination') : (req.requestType === filters.requestType));
      const matchesDivision = filters.division_id === 'all' || (employee?.division_id?._id || employee?.division_id) === filters.division_id;
      const matchesDepartment = filters.department_id === 'all' || (employee?.department_id?._id || employee?.department_id) === filters.department_id;
      const matchesGroup = filters.employee_group_id === 'all' || (employee?.employee_group_id?._id || employee?.employee_group_id) === filters.employee_group_id;
      return matchesSearch && matchesRequestType && matchesDivision && matchesDepartment && matchesGroup;
    });
  }, [pendingRequests, filters]);

  const stats = useMemo(() => {
    const approved = baseFiltered.filter((r) => r.status === 'approved');
    const relieved = baseFiltered.filter((r) => r.status === 'approved' && r.workflow?.isCompleted === true);
    const resolved = baseFiltered.filter((r) => ['approved', 'rejected'].includes(r.status));
    let avgProcessingDays: number | null = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((acc, r) => {
        const chain = r.workflow?.approvalChain ?? [];
        const lastAction = chain
          .filter((s) => s.updatedAt)
          .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())[0];
        if (!lastAction?.updatedAt) return acc;
        return acc + (new Date(lastAction.updatedAt).getTime() - new Date(r.createdAt).getTime());
      }, 0);
      avgProcessingDays = Math.round(totalMs / resolved.length / 86_400_000);
    }
    return {
      applied: baseFiltered.length,
      total: baseFiltered.length,
      approved: approved.length,
      pending: baseFiltered.filter((r) => r.status === 'pending').length,
      rejected: baseFiltered.filter((r) => ['rejected', 'cancelled'].includes(r.status)).length,
      relieved: relieved.length,
      pendingApprovals: baseFilteredPending.length,
      avgProcessingDays,
    };
  }, [baseFiltered, baseFilteredPending]);

  // ─── Analytics computations ──────────────────────────────────────────────

  const payPeriodOptions = useMemo(
    () =>
      buildLeaveODPayPeriodOptions({
        payrollCycleStartDay: payCycleStartDay,
        payrollCycleEndDay: payCycleEndDay,
        monthsBack: 12,
        getDefaultRange: () => {
          const now = new Date();
          return getPayPeriodRangeForCalendarMonth(
            now.getFullYear(),
            now.getMonth() + 1,
            payCycleStartDay,
            payCycleEndDay
          );
        },
        defaultLabel: 'Current pay period',
      }),
    [payCycleStartDay, payCycleEndDay]
  );

  const comparePeriodOptions = useMemo(
    () => [{ value: '__prev__', label: 'Previous period (auto)' }, ...payPeriodOptions],
    [payPeriodOptions]
  );

  const payPeriodBounds = useMemo(() => {
    const found = payPeriodOptions.find((o) => o.value === selectedPayPeriodKey);
    const range = found?.range ?? payPeriodOptions[0]?.range;
    if (!range) {
      const now = new Date();
      return { from: now, to: now };
    }
    return {
      from: startOfPayPeriodDay(range.from),
      to: endOfPayPeriodDay(range.to),
    };
  }, [selectedPayPeriodKey, payPeriodOptions]);

  const prevPayPeriodBounds = useMemo(() => {
    if (comparePeriodKey === '__prev__') {
      const { from, to } = payPeriodBounds;
      const diffMs = to.getTime() - from.getTime();
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - diffMs);
      return { from: prevFrom, to: prevTo };
    }
    const found = payPeriodOptions.find((o) => o.value === comparePeriodKey);
    if (found) {
      return {
        from: startOfPayPeriodDay(found.range.from),
        to: endOfPayPeriodDay(found.range.to),
      };
    }
    const { from, to } = payPeriodBounds;
    const diffMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    return { from: new Date(prevTo.getTime() - diffMs), to: prevTo };
  }, [comparePeriodKey, payPeriodOptions, payPeriodBounds]);

  const payPeriodStats = useMemo(() => {
    const computeForRange = (from: Date, to: Date) => {
      const inRange = (dateStr: string) => {
        const d = new Date(dateStr);
        return !Number.isNaN(d.getTime()) && d >= from && d <= to;
      };
      const periodReqs = baseFiltered.filter((r) => inRange(r.createdAt));
      const approved = periodReqs.filter((r) => r.status === 'approved');
      const relieved = periodReqs.filter((r) => r.status === 'approved' && r.workflow?.isCompleted === true);
      const resolved = periodReqs.filter((r) => ['approved', 'rejected'].includes(r.status));
      let avgProcessingDays: number | null = null;
      if (resolved.length > 0) {
        const totalMs = resolved.reduce((acc, r) => {
          const chain = r.workflow?.approvalChain ?? [];
          const lastAction = chain
            .filter((s) => s.updatedAt)
            .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())[0];
          if (!lastAction?.updatedAt) return acc;
          return acc + (new Date(lastAction.updatedAt).getTime() - new Date(r.createdAt).getTime());
        }, 0);
        avgProcessingDays = Math.round(totalMs / resolved.length / 86_400_000);
      }
      return {
        applied: periodReqs.length,
        approved: approved.length,
        pending: periodReqs.filter((r) => r.status === 'pending').length,
        rejected: periodReqs.filter((r) => ['rejected', 'cancelled'].includes(r.status)).length,
        relieved: relieved.length,
        avgProcessingDays,
      };
    };

    const curr = computeForRange(payPeriodBounds.from, payPeriodBounds.to);
    const prev = computeForRange(prevPayPeriodBounds.from, prevPayPeriodBounds.to);

    return {
      ...curr,
      compare: {
        applied: formatComparePct(curr.applied, prev.applied),
        approved: formatComparePct(curr.approved, prev.approved),
        pending: formatComparePctLowerIsBetter(curr.pending, prev.pending),
        rejected: formatComparePct(curr.rejected, prev.rejected),
        relieved: formatComparePct(curr.relieved, prev.relieved),
        avgProcessingDays:
          curr.avgProcessingDays !== null && prev.avgProcessingDays !== null
            ? formatComparePctLowerIsBetter(curr.avgProcessingDays, prev.avgProcessingDays)
            : null,
      },
    };
  }, [baseFiltered, payPeriodBounds, prevPayPeriodBounds]);

  // Last 4 months list & statistics
  const lastFourMonths = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      list.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      });
    }
    return list;
  }, []);

  const lastFourMonthsStats = useMemo(() => {
    return lastFourMonths.map((m) => {
      const monthReqs = allRequests.filter((r) => {
        const d = new Date(r.createdAt);
        return !isNaN(d.getTime()) &&
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === m.key;
      });

      const approved = monthReqs.filter((r) => r.status === 'approved').length;
      const pending = monthReqs.filter((r) => r.status === 'pending').length;
      const rejected = monthReqs.filter((r) => ['rejected', 'cancelled'].includes(r.status)).length;
      const relieved = monthReqs.filter((r) => r.status === 'approved' && r.workflow?.isCompleted === true).length;

      return {
        key: m.key,
        label: m.label,
        applied: monthReqs.length,
        approved,
        pending,
        rejected,
        relieved,
      };
    });
  }, [allRequests, lastFourMonths]);

  const statusRows = useMemo(() => [
    { key: 'applied', label: 'Applied', dot: 'bg-slate-400' },
    { key: 'approved', label: 'Approved', dot: 'bg-emerald-400' },
    { key: 'pending', label: 'Pending', dot: 'bg-amber-400' },
    { key: 'rejected', label: 'Rejected', dot: 'bg-rose-400' },
    { key: 'relieved', label: 'Relieved', dot: 'bg-violet-400' },
  ], []);

  // Division-wise summary
  const divisionSummary = useMemo(() => {
    const map: Record<string, { name: string; total: number; approved: number; pending: number; rejected: number; relieved: number; presentPP: number }> = {};
    
    const inRange = (dateStr: string) => {
      const d = new Date(dateStr);
      return !Number.isNaN(d.getTime()) && d >= payPeriodBounds.from && d <= payPeriodBounds.to;
    };

    allRequests.forEach((r) => {
      const div = r.employeeId?.division_id?.name || 'Unknown';
      if (!map[div]) {
        map[div] = { name: div, total: 0, approved: 0, pending: 0, rejected: 0, relieved: 0, presentPP: 0 };
      }
      map[div].total += 1;
      if (r.status === 'approved') {
        map[div].approved += 1;
        if (r.workflow?.isCompleted === true) {
          map[div].relieved += 1;
        }
      }
      else if (r.status === 'pending') map[div].pending += 1;
      else if (['rejected', 'cancelled'].includes(r.status)) map[div].rejected += 1;

      if (inRange(r.createdAt)) {
        map[div].presentPP += 1;
      }
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [allRequests, payPeriodBounds]);

  // Employees in notice period (leftDate >= today, not yet departed)
  const noticePeriodEmployees = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allRequests.filter((r) => {
      if (!['pending', 'approved'].includes(r.status)) return false;
      const lwd = new Date(r.leftDate);
      return !isNaN(lwd.getTime()) && lwd >= today;
    }).map((r) => {
      const lwd = new Date(r.leftDate);
      const daysLeft = Math.ceil((lwd.getTime() - today.getTime()) / 86400000);
      return { ...r, daysLeft };
    }).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [allRequests]);

  // Upcoming last working days (next 30 days, approved or pending with LWD set)
  const upcomingLWDs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today.getTime() + 30 * 86400000);
    return allRequests.filter((r) => {
      const lwd = new Date(r.leftDate);
      return !isNaN(lwd.getTime()) && lwd >= today && lwd <= in30;
    }).map((r) => {
      const lwd = new Date(r.leftDate);
      const daysLeft = Math.ceil((lwd.getTime() - today.getTime()) / 86400000);
      return { ...r, daysLeft };
    }).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [allRequests]);

  const lwdCalendarMap = useMemo(() => {
    const map = new Map<string, ResignationRequest[]>();
    allRequests.forEach((r) => {
      if (!r.leftDate) return;
      const d = new Date(r.leftDate);
      if (Number.isNaN(d.getTime())) return;
      const key = toLocalDateString(d);
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });
    map.forEach((list, key) => {
      map.set(
        key,
        [...list].sort((a, b) => getEmployeeName(a).localeCompare(getEmployeeName(b)))
      );
    });
    return map;
  }, [allRequests]);

  // Pending approvals by aging buckets (mode-aware)
  const pendingByAging = useMemo(() => {
    const today = new Date();

    // Filter by current month if needed
    const source = pendingAgingView === 'thisMonth'
      ? pendingRequests.filter((r) => {
          const d = new Date(r.createdAt);
          return !isNaN(d.getTime()) && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
        })
      : pendingRequests;

    const buckets = pendingAgingView === 'thisMonth'
      ? [
          { label: '0–7 days',  min: 0,  max: 7,  color: '#22c55e', items: [] as ResignationRequest[] },
          { label: '8–15 days', min: 8,  max: 15, color: '#f59e0b', items: [] as ResignationRequest[] },
          { label: '16–20 days', min: 16, max: 20, color: '#f97316', items: [] as ResignationRequest[] },
        ]
      : [
          { label: '0–7 days',  min: 0,  max: 7,         color: '#22c55e', items: [] as ResignationRequest[] },
          { label: '8–15 days', min: 8,  max: 15,        color: '#f59e0b', items: [] as ResignationRequest[] },
          { label: '16–30 days', min: 16, max: 30,       color: '#f97316', items: [] as ResignationRequest[] },
          { label: '> 30 days', min: 31, max: Infinity,  color: '#ef4444', items: [] as ResignationRequest[] },
        ];

    source.forEach((r) => {
      const d = new Date(r.createdAt);
      const age = isNaN(d.getTime()) ? 0 : Math.floor((today.getTime() - d.getTime()) / 86400000);
      const bucket = buckets.find((b) => age >= b.min && age <= b.max);
      if (bucket) bucket.items.push(r);
    });

    return { buckets: buckets.map((b) => ({ ...b, count: b.items.length })), total: source.length };
  }, [pendingRequests, pendingAgingView]);

  // Pending by next approver role
  const pendingByRole = useMemo(() => {
    const today = new Date();
    const source = pendingAgingView === 'thisMonth'
      ? pendingRequests.filter((r) => {
          const d = new Date(r.createdAt);
          return !isNaN(d.getTime()) && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
        })
      : pendingRequests;

    const map: Record<string, number> = {};
    source.forEach((r) => {
      const rawRole = (r.workflow?.nextApproverRole || r.workflow?.currentStepRole || 'Unknown').replace(/_/g, ' ');
      const label = rawRole.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map)
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count);
  }, [pendingRequests, pendingAgingView]);

  // Combo chart data: last 6 months - resignations count + top-division count
  const comboChartData = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      });
    }
    return months.map(({ key, label }) => {
      const monthReqs = allRequests.filter((r) => {
        const d = new Date(r.createdAt);
        return !isNaN(d.getTime()) &&
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
      });
      const approved = monthReqs.filter((r) => r.status === 'approved').length;
      const pending = monthReqs.filter((r) => r.status === 'pending').length;
      // Count unique active divisions that month
      const divs = new Set(monthReqs.map((r) => r.employeeId?.division_id?.name).filter(Boolean));
      return { label, total: monthReqs.length, approved, pending, divisions: divs.size };
    });
  }, [allRequests]);

  const filteredRequests = useMemo(() => {
    return (activeTab === 'pending' ? baseFilteredPending : baseFiltered).filter((req) => {
      if (activeTab === 'all' || activeTab === 'pending') return true;
      return req.status === activeTab;
    });
  }, [baseFiltered, baseFilteredPending, activeTab]);

  const generateResignationPdf = (requests: ResignationRequest[]) => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 10;
    let isFirstSection = true;

    const grouped = groupRequestsByDivisionDepartment(requests);

    Object.keys(grouped).sort().forEach((division) => {
      Object.keys(grouped[division]).sort().forEach((department) => {
        const divisionalRequests = grouped[division][department];

        if (!isFirstSection) {
          doc.addPage();
          currentY = 10;
        }

        doc.setFillColor(15, 23, 42);
        doc.rect(14, currentY, pageWidth - 28, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Resignation Report - ${division} / ${department}`, 14, currentY + 8);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 14, currentY + 16);
        currentY += 28;

        const stageLabels: string[] = [];
        if (divisionalRequests.length > 0) {
          const firstReq = divisionalRequests[0];
          for (let i = 0; i < 3; i++) {
            stageLabels.push(getWorkflowStageLabel(firstReq, i));
          }
        }

        const body = divisionalRequests.map((req) => [
          req.emp_no || '—',
          getEmployeeName(req),
          ((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name)
            ? String(req.employeeId.designation_id.name)
            : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name)
              ? String(req.employeeId.designation.name)
              : '—'),
          req.employeeId?.employee_group_id?.name || '—',
          formatDate(req.createdAt),
          getFormattedApprovalDate(req) || '—',
          getStageContent(req, 0),
          getStageContent(req, 1),
          getStageContent(req, 2),
          getNocStatus(),
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [[
            'EC No',
            'Name of the Employee',
            'Designation',
            'Group',
            'Date Applied',
            'Date Approved',
            stageLabels[0],
            stageLabels[1],
            stageLabels[2],
            'NOC Completed',
          ]],
          body,
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 2 },
          margin: { left: 14, right: 14 },
          columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 35 },
            2: { cellWidth: 28 },
            3: { cellWidth: 22 },
            4: { cellWidth: 22 },
            5: { cellWidth: 22 },
            6: { cellWidth: 28 },
            7: { cellWidth: 28 },
            8: { cellWidth: 28 },
            9: { cellWidth: 18 },
          },
          didDrawPage: (data) => {
            currentY = data.cursor?.y || currentY;
          },
        });

        currentY = (doc as any).lastAutoTable?.finalY || currentY + 10;
        isFirstSection = false;
      });
    });

    return doc;
  };

  const handleExportResignationsPdf = async (requests: ResignationRequest[]) => {
    if (requests.length === 0) {
      toast.info('No resignation records to export.');
      return;
    }
    setExportingPdf(true);
    try {
      const doc = generateResignationPdf(requests);
      doc.save(`Resignation_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Resignation PDF exported successfully.');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to export resignation PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const printPdfDocument = (doc: jsPDF) => {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        URL.revokeObjectURL(url);
      };
    }
  };

  const handlePrintResignations = async () => {
    const doc = await generateResignationPdf(filteredRequests);
    printPdfDocument(doc);
  };

  const canEditLWDOnRequest = (req: ResignationRequest) =>
    ['pending', 'approved'].includes(String(req.status || '').toLowerCase());

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans dark:bg-[#09090b] p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6 pb-10">
      {/* Header - Styled like Dashboard */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Resignations
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Requested resignations & approvals
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">Current Pay Period</span>
            <select
              aria-label="Current pay period"
              value={selectedPayPeriodKey}
              onChange={(e) => setSelectedPayPeriodKey(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
            >
              {payPeriodOptions.map((o) => (
                <option key={o.value} value={o.value} className="dark:bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">Compare With</span>
            <select
              aria-label="Compare with pay period"
              value={comparePeriodKey}
              onChange={(e) => setComparePeriodKey(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
            >
              {comparePeriodOptions.map((o) => (
                <option key={o.value} value={o.value} disabled={o.value !== '__prev__' && o.value === selectedPayPeriodKey} className="dark:bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {canCreateResignation(currentUser) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openApplyModal('resignation')}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-semibold shadow-sm transition active:scale-95 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Apply for Resignation</span>
              </button>
              <button
                type="button"
                onClick={() => openApplyModal('termination')}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 text-xs font-semibold shadow-sm transition active:scale-95 whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                <span>Terminate Employee</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* ── 6 small stat cards in a single row ── */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { title: 'Applied', value: payPeriodStats.applied, compare: payPeriodStats.compare.applied, icon: ListTodo, bg: 'bg-slate-100 dark:bg-slate-800', iconCls: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
            { title: 'Approved', value: payPeriodStats.approved, compare: payPeriodStats.compare.approved, icon: CheckCircle2, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconCls: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400' },
            { title: 'Pending', value: payPeriodStats.pending, compare: payPeriodStats.compare.pending, icon: Clock3, bg: 'bg-amber-50 dark:bg-amber-900/20', iconCls: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400' },
            { title: 'Rejected', value: payPeriodStats.rejected, compare: payPeriodStats.compare.rejected, icon: XCircle, bg: 'bg-rose-50 dark:bg-rose-900/20', iconCls: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-400' },
            { title: 'Relieved', value: payPeriodStats.relieved, compare: payPeriodStats.compare.relieved, icon: UserCheck, bg: 'bg-violet-50 dark:bg-violet-900/20', iconCls: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-400' },
          ] as const).map((card) => (
            <div
              key={card.title}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm hover:shadow-md transition-all"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.iconCls}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate leading-tight">{card.title}</p>
                <div className="flex items-center justify-between gap-1.5 mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                    {loading
                      ? <div className="h-5 w-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                      : <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{card.value}</span>
                    }
                  </div>
                  {!loading && card.compare && (
                    <span className={`inline-flex items-center text-[10px] font-bold ${
                      card.compare.positive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {card.compare.isUp ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {card.compare.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {/* Avg Processing Time */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm hover:shadow-md transition-all">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0 bg-indigo-50 dark:bg-indigo-900/20">
              <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate leading-tight">Avg Processing</p>
              <div className="flex items-center justify-between gap-1.5 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-400" />
                  {loading
                    ? <div className="h-5 w-10 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    : <span className="text-lg font-black text-slate-900 dark:text-white leading-none">
                        {payPeriodStats.avgProcessingDays === null ? '—' : `${payPeriodStats.avgProcessingDays}d`}
                      </span>
                  }
                </div>
                {!loading && payPeriodStats.compare.avgProcessingDays && (
                  <span className={`inline-flex items-center text-[10px] font-bold ${
                    payPeriodStats.compare.avgProcessingDays.positive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {payPeriodStats.compare.avgProcessingDays.isUp ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    {payPeriodStats.compare.avgProcessingDays.text}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Analytics Row 1: Last Month | Division Summary | Notice Period ── */}
        <div className="mb-6">
          <SectionHeading title="Monthly Overview" subtitle="Resignation trends and workforce insights" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Last 4 Months Summary */}
            <MiniTableCard title="Last 4 Months Summary" subtitle="Resignations by status" icon={CalendarX} iconClass="bg-rose-50 dark:bg-rose-900/20">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/10">
                    <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Status</th>
                    {lastFourMonths.map((m) => (
                      <th key={m.key} className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {statusRows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-100 dark:hover:bg-slate-900/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.dot}`} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{row.label}</span>
                        </div>
                      </td>
                      {lastFourMonthsStats.map((monthData) => (
                        <td key={monthData.key} className="px-3 py-2.5 text-center text-[11px] font-black text-slate-800 dark:text-slate-100">
                          {monthData[row.key as keyof typeof monthData]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </MiniTableCard>

            {/* Division-wise Summary */}
            <MiniTableCard title="Division-wise Summary" subtitle={`${divisionSummary.length} divisions`} icon={LayoutGrid} iconClass="bg-violet-50 dark:bg-violet-900/20">
              {divisionSummary.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-slate-400">No data</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/10">
                      <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Division</th>
                      <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Total</th>
                      <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Appr.</th>
                      <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Pend.</th>
                      <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Relieved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {divisionSummary.slice(0, divisionVisible).map((div) => (
                      <tr key={div.name} className="hover:bg-slate-100 dark:hover:bg-slate-900/20 transition-colors">
                        <td className="px-2 py-2">
                          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[80px]" title={div.name}>{div.name}</div>
                          {/* Inline mini progress bar */}
                          <div className="mt-0.5 h-1 w-full rounded bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-1 rounded bg-emerald-400"
                              style={{ width: `${div.total > 0 ? Math.round((div.approved / div.total) * 100) : 0}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center text-[11px] font-black text-slate-700 dark:text-slate-200">{div.total}</td>
                        <td className="px-2 py-2 text-center text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{div.approved}</td>
                        <td className="px-2 py-2 text-center text-[11px] font-bold text-amber-600 dark:text-amber-400">{div.pending}</td>
                        <td className="px-2 py-2 text-center text-[11px] font-bold text-violet-600 dark:text-violet-400">{div.relieved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {divisionSummary.length > 5 && (
                <div className="flex border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold">
                  {divisionSummary.length > divisionVisible && (
                    <button
                      onClick={() => setDivisionVisible((v) => v + 5)}
                      className="flex-1 py-2 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors text-center"
                    >
                      Load more ({divisionSummary.length - divisionVisible} remaining)
                    </button>
                  )}
                  {divisionVisible > 5 && (
                    <button
                      onClick={() => setDivisionVisible(5)}
                      className={`flex-1 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-55/60 dark:hover:bg-slate-800/10 transition-colors text-center ${
                        divisionSummary.length > divisionVisible ? 'border-l border-slate-100 dark:border-slate-800' : ''
                      }`}
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </MiniTableCard>

            {/* Employees in Notice Period */}
            <MiniTableCard title="Employees in Notice Period" subtitle={`${noticePeriodEmployees.length} active`} icon={Timer} iconClass="bg-cyan-50 dark:bg-cyan-900/20">
              {noticePeriodEmployees.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-slate-400">None in notice period</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Employee</th>
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">LWD</th>
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Days Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {noticePeriodEmployees.slice(0, noticeVisible).map((req) => (
                      <tr key={req._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[100px]">{getEmployeeName(req)}</div>
                          <div className="text-[9px] text-slate-400">{req.employeeId?.division_id?.name || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-center text-[10px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {req.leftDate ? formatDate(req.leftDate) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[36px] px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                            req.daysLeft <= 7
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                              : req.daysLeft <= 15
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
                          }`}>
                            {req.daysLeft}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {noticePeriodEmployees.length > 5 && (
                <div className="flex border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold">
                  {noticePeriodEmployees.length > noticeVisible && (
                    <button
                      onClick={() => setNoticeVisible((v) => v + 5)}
                      className="flex-1 py-2 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 transition-colors text-center"
                    >
                      Load more ({noticePeriodEmployees.length - noticeVisible} remaining)
                    </button>
                  )}
                  {noticeVisible > 5 && (
                    <button
                      onClick={() => setNoticeVisible(5)}
                      className={`flex-1 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-55/60 dark:hover:bg-slate-800/10 transition-colors text-center ${
                        noticePeriodEmployees.length > noticeVisible ? 'border-l border-slate-100 dark:border-slate-800' : ''
                      }`}
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </MiniTableCard>
          </div>
        </div>

        {/* ── Analytics Row 2: Upcoming LWDs | Pending Aging | Combo Chart ── */}
        <div className="mb-8">
          <SectionHeading title="Operational Insights" subtitle="Upcoming departures, approval backlogs, and 6-month trend" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Upcoming Last Working Days */}
            <MiniTableCard
              title="Upcoming Last Working Days"
              subtitle="Next 30 days"
              icon={CalendarX}
              iconClass="bg-orange-50 dark:bg-orange-900/20"
              headerAction={
                <button
                  type="button"
                  onClick={() => setShowLWDCalendar(true)}
                  className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-orange-700 transition hover:bg-orange-100 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-900/30"
                >
                  <Calendar className="h-3 w-3" />
                  <span className="hidden sm:inline">Full calendar</span>
                </button>
              }
            >
              {upcomingLWDs.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-slate-400">No upcoming LWDs in 30 days</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Employee</th>
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Division</th>
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">LWD</th>
                      <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {upcomingLWDs.slice(0, lwdVisible).map((req) => (
                      <tr key={req._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[90px]">{getEmployeeName(req)}</div>
                          <div className="text-[9px] text-slate-400">{req.emp_no}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-[10px] text-slate-500 truncate max-w-[70px]">{req.employeeId?.division_id?.name || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-center text-[10px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {req.leftDate ? formatDate(req.leftDate) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[36px] px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                            req.daysLeft === 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30'
                              : req.daysLeft <= 7
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                          }`}>
                            {req.daysLeft === 0 ? 'Today' : `${req.daysLeft}d`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {upcomingLWDs.length > 5 && (
                <div className="flex border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold">
                  {upcomingLWDs.length > lwdVisible && (
                    <button
                      onClick={() => setLwdVisible((v) => v + 5)}
                      className="flex-1 py-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors text-center"
                    >
                      Load more ({upcomingLWDs.length - lwdVisible} remaining)
                    </button>
                  )}
                  {lwdVisible > 5 && (
                    <button
                      onClick={() => setLwdVisible(5)}
                      className={`flex-1 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-55/60 dark:hover:bg-slate-800/10 transition-colors text-center ${
                        upcomingLWDs.length > lwdVisible ? 'border-l border-slate-100 dark:border-slate-800' : ''
                      }`}
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </MiniTableCard>

            {/* Pending Approvals by Aging */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
              {/* Card header with dropdown */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800 dark:text-slate-100">Pending Approvals by Ageing</p>
                    <p className="text-[10px] text-slate-400">{pendingByAging.total} pending</p>
                  </div>
                </div>
                <select
                  value={pendingAgingView}
                  onChange={(e) => setPendingAgingView(e.target.value as 'thisMonth' | 'overall')}
                  className="h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-[9px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="overall">Overall</option>
                  <option value="thisMonth">This Month</option>
                </select>
              </div>
              {/* Two-column split body */}
              {pendingByAging.total === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-slate-400">No pending approvals</div>
              ) : (
                <div className="flex divide-x divide-slate-100 dark:divide-slate-800 flex-1 min-h-0">
                  {/* Left: Aging ranges */}
                  <div className="flex-1 p-3 space-y-2.5 overflow-auto">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">By Age</p>
                    {pendingByAging.buckets.map((bucket) => (
                      <div key={bucket.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{bucket.label}</span>
                          <span className="text-[10px] font-black tabular-nums" style={{ color: bucket.color }}>{bucket.count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: pendingByAging.total > 0 ? `${Math.round((bucket.count / pendingByAging.total) * 100)}%` : '0%',
                              backgroundColor: bucket.color,
                            }}
                          />
                        </div>
                        {bucket.count > 0 && (
                          <div className="mt-0.5 text-[9px] text-slate-400 truncate">
                            {bucket.items.slice(0, 2).map((r) => getEmployeeName(r)).join(', ')}
                            {bucket.count > 2 ? ` +${bucket.count - 2}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Right: Pending with role */}
                  <div className="flex-1 p-3 space-y-2 overflow-auto">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Pending With</p>
                    {pendingByRole.length === 0 ? (
                      <div className="text-[10px] text-slate-400">—</div>
                    ) : pendingByRole.map((item) => (
                      <div key={item.role}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[80px]" title={item.role}>{item.role}</span>
                          <span className="text-[10px] font-black tabular-nums text-indigo-600 dark:text-indigo-400 ml-1 shrink-0">{item.count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-indigo-400 transition-all"
                            style={{ width: pendingByAging.total > 0 ? `${Math.round((item.count / pendingByAging.total) * 100)}%` : '0%' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Combo Chart: 6-month trend */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100">6-Month Trend</p>
                  <p className="text-[10px] text-slate-400">Resignations & approvals by month</p>
                </div>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 px-4 pt-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-4 rounded-sm bg-indigo-400" />
                  <span className="text-[10px] text-slate-500">Total Applied</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-4 rounded-sm bg-emerald-400" />
                  <span className="text-[10px] text-slate-500">Approved</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-0.5 w-4 rounded-sm bg-orange-400" />
                  <span className="text-[10px] text-slate-500">Divisions</span>
                </div>
              </div>
              <div className="flex-1 p-4">
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={comboChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="total" name="Total Applied" fill="#818cf8" radius={[3, 3, 0, 0]} barSize={12} />
                    <Bar dataKey="approved" name="Approved" fill="#34d399" radius={[3, 3, 0, 0]} barSize={12} />
                    <Line type="monotone" dataKey="divisions" name="Divisions" stroke="#fb923c" strokeWidth={2} dot={{ r: 3, fill: '#fb923c' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm p-3 shadow-sm flex flex-nowrap items-center justify-between gap-3 w-full overflow-x-auto no-scrollbar">
            {/* Left: Filters */}
            <div className="flex flex-nowrap items-center gap-2 flex-1 min-w-0">
              {/* Search Input */}
              <div className="relative w-44 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name/emp no..."
                  className="w-full pl-9 pr-3 h-9 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>

              {/* Request Type tabs */}
              <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700 shadow-sm h-9 shrink-0">
                {(['all', 'resignation', 'termination'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilters({ ...filters, requestType: type })}
                    className={`px-2.5 h-8 text-[10px] sm:text-xs font-bold rounded-lg transition-all capitalize whitespace-nowrap ${
                      filters.requestType === type
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {type === 'all' ? 'All Types' : type + 's'}
                  </button>
                ))}
              </div>

              {/* Division Select */}
              <select
                className="h-9 px-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-white w-28 shrink-0"
                value={filters.division_id}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    division_id: e.target.value,
                    department_id: 'all',
                    employee_group_id: 'all',
                  })
                }
              >
                <option value="all">Divisions</option>
                {divisions.map((div) => (
                  <option key={div._id} value={div._id}>
                    {div.name}
                  </option>
                ))}
              </select>

              {/* Department Select */}
              <select
                className="h-9 px-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-white w-32 shrink-0"
                value={filters.department_id}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    department_id: e.target.value,
                    employee_group_id: 'all',
                  })
                }
              >
                <option value="all">Departments</option>
                {filteredDepartmentsForFilter.map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
              </select>

              {/* Group Select */}
              {customGroupingEnabled && (
                <select
                  className="h-9 px-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-white w-28 shrink-0"
                  value={filters.employee_group_id}
                  onChange={(e) => setFilters({ ...filters, employee_group_id: e.target.value })}
                >
                  <option value="all">Groups</option>
                  {scopedGroupsForFilter.map((group) => (
                    <option key={group._id} value={group._id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Reset button */}
              <button
                onClick={() =>
                  setFilters({
                    search: '',
                    requestType: 'all',
                    division_id: 'all',
                    department_id: 'all',
                    employee_group_id: 'all',
                  })
                }
                className="h-9 px-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                Reset
              </button>

              {/* Divider and viewType buttons */}
              <div className="flex items-center border-l border-slate-200 dark:border-slate-800 pl-2 gap-0.5 shrink-0">
                <button
                  onClick={() => setViewType('card')}
                  className={`p-1.5 rounded-lg transition-all ${viewType === 'card'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewType('list')}
                  className={`p-1.5 rounded-lg transition-all ${viewType === 'list'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleExportResignationsPdf(filteredRequests)}
                disabled={exportingPdf}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 text-xs font-bold shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrintResignations}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 text-xs font-bold shadow-sm transition active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-inner w-full sm:w-auto gap-1 sm:gap-0">
            {[
              { id: 'all' as const, label: 'All requests', icon: ListTodo, count: stats.total, activeColor: 'green' },
              { id: 'pending' as const, label: 'Pending approvals', icon: Clock, count: stats.pendingApprovals, activeColor: 'orange' },
              { id: 'approved' as const, label: 'Approved', icon: CheckCircle2, count: stats.approved, activeColor: 'green' },
              { id: 'rejected' as const, label: 'Rejected', icon: XCircle, count: stats.rejected, activeColor: 'red' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex items-center justify-center gap-2 px-2 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 shadow-sm ring-1 ring-slate-200/50 dark:ring-0 ' + (tab.activeColor === 'green' ? 'text-green-600 dark:text-green-400' : tab.activeColor === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400')
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? (tab.activeColor === 'green' ? 'text-green-600 dark:text-green-400' : tab.activeColor === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400') : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-black ${activeTab === tab.id
                    ? (tab.activeColor === 'green' ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300' : tab.activeColor === 'orange' ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300')
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 animate-pulse ${viewType === 'list' ? 'h-16' : 'h-40'}`} />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              No resignation requests found for the selected filters.
            </div>
          ) : viewType === 'list' ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/10">
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Employee</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Type</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Applied</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Organization</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">LWD</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">NOC</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Status</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRequests.map((req) => (
                    <tr key={req._id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            getStatusVisualKey(req).includes('approved') ? 'bg-green-100 text-green-600 dark:bg-green-900/30' :
                            getDisplayStatus(req) === 'pending' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'
                          }`}>
                            {getEmployeeInitials(req)}
                          </div>
                          <div className="min-w-0" title={[String(getEmployeeName(req) || '—'), ((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name) ? String(req.employeeId.designation_id.name) : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name) ? String(req.employeeId.designation.name) : ''), String(req.emp_no || '')].filter(Boolean).join(' · ')}>
                            <div className="font-semibold truncate text-slate-900 dark:text-white text-sm">
                              {getEmployeeName(req) || '—'}
                            </div>
                            {((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name) ? String(req.employeeId.designation_id.name) : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name) ? String(req.employeeId.designation.name) : '') ? (
                              <div className="mt-0.5 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
                                {((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name) ? String(req.employeeId.designation_id.name) : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name) ? String(req.employeeId.designation.name) : '')}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {req.requestType === 'termination' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800/30 uppercase tracking-tighter">
                            <X className="w-2.5 h-2.5" /> Term
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30 uppercase tracking-tighter">
                            <LogOut className="w-2.5 h-2.5" /> Resig
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(req.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                          {req.employeeId?.division_id?.name || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-700 dark:text-slate-300">
                        {formatDate(req.leftDate)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-400">
                        N/A
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusColor(getStatusVisualKey(req))}`}>
                          {getDisplayStatusText(req)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRequest(req);
                              setActionComment('');
                              setNewLeftDate(req.leftDate ? req.leftDate.split('T')[0] : '');
                              setDetailLwdEditMode(false);
                              setShowDetailDialog(true);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {req.status === 'approved' && (
                            <button
                              type="button"
                              onClick={() => openRejoinForRequest(req)}
                              className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 transition-all"
                              title="Rejoin Employee"
                            >
                              <UserPlus className="w-4 h-4" />
                            </button>
                          )}
                          {req.status === 'pending' && canPerformAction(req) && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCardAction(req._id, 'approve')}
                                className="p-1.5 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500 hover:text-white transition-all"
                                title="Approve"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCardAction(req._id, 'reject')}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                                title="Reject"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRequests.map((req) => (
                <div key={req._id} className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900">
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl group-hover:w-1.5 transition-all ${
                    getStatusVisualKey(req) === 'final_approved' ? 'bg-emerald-500/80' :
                    getStatusVisualKey(req) === 'hod_approved' ? 'bg-blue-500/80' :
                    getStatusVisualKey(req) === 'manager_approved' ? 'bg-violet-500/80' :
                    getStatusVisualKey(req) === 'reporting_manager_approved' ? 'bg-cyan-500/80' :
                    getStatusVisualKey(req) === 'hr_approved' ? 'bg-indigo-500/80' :
                    getDisplayStatus(req) === 'approved' ? 'bg-green-500/80' :
                    getDisplayStatus(req) === 'pending' ? 'bg-amber-500/80' : 'bg-rose-500/80'
                  }`} />
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${
                        getStatusVisualKey(req).includes('approved') ? 'bg-green-100 text-green-600 dark:bg-green-900/30' :
                        getDisplayStatus(req) === 'pending' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'
                      }`}>
                        {getEmployeeInitials(req)}
                      </div>
                      <div className="min-w-0" title={[String(getEmployeeName(req) || '—'), ((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name) ? String(req.employeeId.designation_id.name) : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name) ? String(req.employeeId.designation.name) : ''), String(req.emp_no || '')].filter(Boolean).join(' · ')}>
  <div className={`font-semibold truncate text-slate-900 dark:text-white text-sm`}>
    {getEmployeeName(req) || '—'}
  </div>
  {((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name) ? String(req.employeeId.designation_id.name) : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name) ? String(req.employeeId.designation.name) : '') ? (
    <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
      {((typeof req.employeeId?.designation_id === 'object' && req.employeeId?.designation_id?.name) ? String(req.employeeId.designation_id.name) : (typeof req.employeeId?.designation === 'object' && req.employeeId?.designation?.name) ? String(req.employeeId.designation.name) : '')}
    </div>
  ) : null}
  {req.emp_no ? (
    <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{req.emp_no}</div>
  ) : null}
</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${getStatusColor(getStatusVisualKey(req))}`}>
                      <span>{getDisplayStatusText(req)}</span>
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-3">
                    {req.requestType === 'termination' ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/30 w-fit">
                        <X className="w-3 h-3 text-rose-500" />
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 tracking-tighter uppercase">Termination</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 w-fit">
                        <LogOut className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-tighter uppercase">Resignation</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-bold tracking-tighter uppercase text-[10px] whitespace-nowrap">{req.requestType === 'termination' ? 'Termination date' : 'Last working date'}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">{formatDate(req.leftDate)}</span>
                    </div>
                    {req.remarks && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                        {req.remarks}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRequest(req);
                        setActionComment('');
                        setNewLeftDate(req.leftDate ? req.leftDate.split('T')[0] : '');
                        setDetailLwdEditMode(false);
                        setShowDetailDialog(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-[10px] font-black uppercase text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all tracking-tighter"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                    {req.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => openRejoinForRequest(req)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 tracking-tighter"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Rejoin
                      </button>
                    )}
                    {req.status === 'pending' && canPerformAction(req) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCardAction(req._id, 'approve')}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-[10px] font-black text-green-700 hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 transition-all uppercase tracking-tighter"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCardAction(req._id, 'reject')}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-rose-500/10 py-2 text-[10px] font-black text-rose-700 hover:bg-rose-500 hover:text-white dark:bg-rose-500/20 dark:text-rose-400 transition-all uppercase tracking-tighter"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !applyLoading && setShowApplyModal(false)} />
          <div className="relative z-50 w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {applyType === 'termination' ? (
                  <>
                    <X className="w-5 h-5 text-rose-500" />
                    Terminate Employee
                  </>
                ) : (
                  <>
                    <LogOut className="w-5 h-5 text-green-500" />
                    Apply for Resignation
                  </>
                )}
              </h2>
              <button type="button" onClick={() => !applyLoading && setShowApplyModal(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            {applyModalLoading ? (
              <div className="py-8 text-center text-slate-500">Loading...</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Search Employee</label>
                  <input
                    type="text"
                    value={applyEmployeeSearch}
                    onChange={(e) => {
                      setApplyEmployeeSearch(e.target.value);
                      if (applySelectedEmpNo) setApplySelectedEmpNo('');
                    }}
                    placeholder="Search by name or employee ID..."
                    className="mb-3 w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-medium text-slate-900 dark:text-white focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none"
                  />
                  {applyEmployeeSearch.trim() && !applySelectedEmpNo && (
                    <div className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      {filteredApplyEmployees.length > 0 ? (
                        filteredApplyEmployees.map((emp) => (
                          <button
                            key={emp.emp_no}
                            type="button"
                            onClick={() => {
                              setApplySelectedEmpNo(emp.emp_no);
                              setApplyEmployeeSearch(`${emp.name} (${emp.emp_no})`);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <span className="font-medium">{emp.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{emp.emp_no}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No employees found</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Request Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleApplyTypeChange('resignation')}
                      className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                        applyType === 'resignation'
                          ? 'bg-green-500/10 border-green-500 text-green-700 dark:text-green-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <LogOut className="w-4 h-4" />
                      Resignation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyTypeChange('termination')}
                      className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                        applyType === 'termination'
                          ? 'bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <X className="w-4 h-4" />
                      Termination
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{applyType === 'termination' ? 'Reason for termination' : 'Remarks for resignation'}</label>
                  <textarea
                    value={applyRemarks}
                    onChange={(e) => setApplyRemarks(e.target.value)}
                    placeholder="Optional remarks..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{applyType === 'termination' ? 'Termination date' : 'Last working date'}</label>
                  <div className="flex items-center gap-2 h-11 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{applyLastWorkingDate ? new Date(applyLastWorkingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{applyType === 'termination' ? 'Defaults to today; employee will be deactivated upon final approval.' : 'Auto-set from notice period; last day in office.'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Agreement period</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">Start date</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedApplyEmployeeAgreement.agreementStartDate ? new Date(selectedApplyEmployeeAgreement.agreementStartDate).toLocaleDateString('en-IN') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">End date</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedApplyEmployeeAgreement.agreementEndDate ? new Date(selectedApplyEmployeeAgreement.agreementEndDate).toLocaleDateString('en-IN') : '—'}</p>
                    </div>
                  </div>
                  {applyType === 'resignation' &&
                    parseDateSafe(selectedApplyEmployeeAgreement.agreementEndDate) &&
                    parseDateSafe(applyLastWorkingDate) &&
                    parseDateSafe(applyLastWorkingDate)! < parseDateSafe(selectedApplyEmployeeAgreement.agreementEndDate)! && (
                      <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        Agreement end date is still pending. You will see a confirmation warning before submitting this resignation.
                      </p>
                    )}
                </div>
                {applySelectedEmpNo && (
                  <div className={`rounded-xl border p-3 ${
                    applyPendingAssets.length > 0
                      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
                      : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                  }`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Asset return status
                    </p>
                    {applyPendingAssetsLoading ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Checking pending assets...</p>
                    ) : applyPendingAssets.length > 0 ? (
                      <>
                        <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {applyPendingAssets.length} asset{applyPendingAssets.length > 1 ? 's are' : ' is'} still assigned. Return required before resignation.
                        </p>
                        <div className="mt-2 max-h-24 space-y-1 overflow-y-auto rounded-lg border border-amber-200/60 bg-white/70 px-2 py-2 text-xs dark:border-amber-900/40 dark:bg-slate-900/50">
                          {applyPendingAssets.map((item: any) => (
                            <p key={item._id} className="text-slate-700 dark:text-slate-200">
                              - {item?.asset?.name || 'Asset'} ({item?.asset?.visibilityScope === 'division' ? 'Division scoped' : 'Universal'})
                            </p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        No pending assets. Resignation can be submitted.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => !applyLoading && setShowApplyModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                  <button type="button" onClick={handleSubmitResignation} disabled={applyLoading || !applySelectedEmpNo || !applyLastWorkingDate} className={`flex-1 py-2.5 rounded-xl disabled:opacity-50 text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all ${applyType === 'termination' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-green-600 hover:bg-green-700 shadow-green-500/20'}`}>
                    {applyLoading ? 'Submitting...' : applyType === 'termination' ? 'Confirm Termination' : 'Submit Resignation'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showLWDCalendar && (
        <ResignationLWDCalendarModal
          open={showLWDCalendar}
          onClose={() => setShowLWDCalendar(false)}
          resignationsByDate={lwdCalendarMap}
          onSelectRequest={(req) => {
            setShowLWDCalendar(false);
            setSelectedRequest(req);
            setShowDetailDialog(true);
            setDetailLwdEditMode(false);
          }}
        />
      )}

      {showDetailDialog && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => { setShowDetailDialog(false); setSelectedRequest(null); setDetailLwdEditMode(false); }} />
          <div className="relative z-50 w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white min-w-0">
                {selectedRequest.requestType === 'termination' ? 'Termination request' : 'Resignation request'}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                {selectedRequest.requestType === 'termination' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/30">
                    <X className="w-3 h-3 text-rose-500" />
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 tracking-tighter uppercase">Termination</span>
                  </div>
                )}
                {canEditLWDOnRequest(selectedRequest) && !detailLwdEditMode && (
                  <button
                    type="button"
                    onClick={() => setDetailLwdEditMode(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {canEditLWDOnRequest(selectedRequest) && detailLwdEditMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailLwdEditMode(false);
                      setNewLeftDate(selectedRequest.leftDate ? String(selectedRequest.leftDate).split('T')[0] : '');
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setShowDetailDialog(false); setSelectedRequest(null); setDetailLwdEditMode(false); }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mb-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 min-w-0 flex-1" title={[String(getEmployeeName(selectedRequest) || '—'), ((typeof selectedRequest.employeeId?.designation_id === 'object' && selectedRequest.employeeId?.designation_id?.name) ? String(selectedRequest.employeeId.designation_id.name) : (typeof selectedRequest.employeeId?.designation === 'object' && selectedRequest.employeeId?.designation?.name) ? String(selectedRequest.employeeId.designation.name) : ''), String(selectedRequest.emp_no || '')].filter(Boolean).join(' · ')}>
  <div className={`font-semibold truncate text-slate-900 dark:text-white text-sm`}>
    {getEmployeeName(selectedRequest) || '—'}
  </div>
  {((typeof selectedRequest.employeeId?.designation_id === 'object' && selectedRequest.employeeId?.designation_id?.name) ? String(selectedRequest.employeeId.designation_id.name) : (typeof selectedRequest.employeeId?.designation === 'object' && selectedRequest.employeeId?.designation?.name) ? String(selectedRequest.employeeId.designation.name) : '') ? (
    <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
      {((typeof selectedRequest.employeeId?.designation_id === 'object' && selectedRequest.employeeId?.designation_id?.name) ? String(selectedRequest.employeeId.designation_id.name) : (typeof selectedRequest.employeeId?.designation === 'object' && selectedRequest.employeeId?.designation?.name) ? String(selectedRequest.employeeId.designation.name) : '')}
    </div>
  ) : null}
  {selectedRequest.emp_no ? (
    <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{selectedRequest.emp_no}</div>
  ) : null}
</div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${getStatusColor(getStatusVisualKey(selectedRequest))}`}>
                  <span>{getDisplayStatusText(selectedRequest)}</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Division</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedRequest.employeeId?.division_id?.name || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Department</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedRequest.employeeId?.department_id?.name || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Designation</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{(selectedRequest.employeeId as any)?.designation_id?.name || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Employee Group</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedRequest.employeeId?.employee_group_id?.name || '—'}</p></div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-3">
                <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Date of joining</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatDateDash(selectedRequest.employeeId?.doj)}</p></div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500">{selectedRequest.requestType === 'termination' ? 'Termination date' : 'Last working date'}</p>
                    {canEditLWDOnRequest(selectedRequest) && detailLwdEditMode ? (
                      <div className="mt-0.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={newLeftDate || (selectedRequest.leftDate ? String(selectedRequest.leftDate).split('T')[0] : '')}
                            onChange={(e) => setNewLeftDate(e.target.value)}
                            className="h-9 max-w-full rounded-lg border border-amber-200 bg-white px-2 text-sm font-medium text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 dark:border-amber-800 dark:bg-slate-800 dark:text-white dark:focus:border-amber-500 dark:focus:ring-amber-900/40"
                          />
                          {newLeftDate && newLeftDate !== (selectedRequest.leftDate ? selectedRequest.leftDate.split('T')[0] : '') && (
                            <button
                              type="button"
                              onClick={handleSaveLWD}
                              disabled={saveLoading}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"
                              title="Save last working date"
                            >
                              {saveLoading ? (
                                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                              ) : (
                                <Save className="w-3.5 h-3.5" />
                              )}
                              Save
                            </button>
                          )}
                        </div>
                        {!(selectedRequest.status === 'pending' && canPerformAction(selectedRequest)) && (
                          <textarea
                            value={actionComment}
                            onChange={(e) => setActionComment(e.target.value)}
                            placeholder="Optional note for this date change…"
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 resize-none"
                          />
                        )}
                      </div>
                    ) : (
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatDateDash(selectedRequest.leftDate)}</p>
                    )}
                  </div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Agreement start date</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{(() => { const d = getAgreementDatesFromEmployee(selectedRequest.employeeId); return formatDateDash(d.startDate); })()}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Agreement end date</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{(() => { const d = getAgreementDatesFromEmployee(selectedRequest.employeeId); return formatDateDash(d.endDate); })()}</p></div>
                </div>
                {selectedRequest.remarks && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Reason / Remarks</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedRequest.remarks}</p>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Requested by</p>
                    <p className="mt-0.5 font-medium text-slate-900 dark:text-white">{selectedRequest.requestedBy?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Requested on</p>
                    <p className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatDateTime(selectedRequest.createdAt)}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Approval History</h3>
                {selectedRequest.workflow?.approvalChain && selectedRequest.workflow.approvalChain.length > 0 ? (
                  <div className="space-y-3">
                    {selectedRequest.workflow.approvalChain.map((step, idx) => {
                      const isPending = !step.status || step.status === 'pending';
                      const isRejected = step.status === 'rejected';
                      const isApproved = step.status === 'approved';
                      return (
                        <div key={idx} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700 ml-1 pb-4 last:pb-0">
                          <div className={`absolute -left-[9px] top-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-sm ${isApproved ? 'bg-green-500' : isRejected ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{step.label || step.role}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${isApproved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : isRejected ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500'}`}>{step.status || 'pending'}</span>
                            </div>
                            {!isPending && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                <p>By: <span className="font-semibold text-slate-700 dark:text-slate-200">{step.actionByName || '—'}</span></p>
                                <p className="mt-0.5">Action date: <span className="font-semibold text-slate-700 dark:text-slate-200">{step.updatedAtIST || formatDateTime(step.updatedAt)}</span></p>
                                {step.comments && <p className="mt-1 italic border-l-2 border-slate-200 dark:border-slate-700 pl-2">&quot;{step.comments}&quot;</p>}
                              </div>
                            )}
                            {isPending && <p className="text-[11px] text-slate-500 dark:text-slate-400">Action date: <span className="font-semibold text-slate-700 dark:text-slate-200">Awaiting approval</span></p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-slate-500 dark:text-slate-400">No approval history available.</p>}
              </div>
            </div>

            {/* LWD History */}
            {((selectedRequest as any).lwdHistory?.length > 0) && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Last Working Date History</h3>
                <div className="space-y-3">
                  {(selectedRequest as any).lwdHistory.map((h: any, idx: number) => (
                    <div key={idx} className="text-[11px] p-2 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-blue-700 dark:text-blue-400">
                          {formatDate(h.oldDate)} → {formatDate(h.newDate)}
                        </span>
                        <span className="opacity-60">{h.timestampIST || formatDateTime(h.timestamp)}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">Changed by <span className="font-bold">{h.updatedByName}</span> ({h.updatedByRole})</p>
                      {h.comments && <p className="mt-1 italic">&quot;{h.comments}&quot;</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedRequest.status === 'approved' && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    openRejoinForRequest(selectedRequest);
                    setShowDetailDialog(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <UserPlus className="w-4 h-4" />
                  Initiate Rejoin
                </button>
              </div>
            )}

            {selectedRequest.status === 'pending' && canPerformAction(selectedRequest) && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-4">
                <textarea
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder="Add a comment (optional)…"
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm dark:bg-slate-800 dark:text-white resize-none outline-none focus:ring-2 focus:ring-green-500/20"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDetailAction('approve')}
                    className={`flex-1 py-2 text-white text-sm font-bold rounded-lg transition-all ${selectedRequest.requestType === 'termination' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-green-600 hover:bg-green-700'}`}
                  >
                    {selectedRequest.requestType === 'termination' ? 'Consent Termination' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDetailAction('reject')}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop={false} closeOnClick pauseOnFocusLoss draggable pauseOnHover theme="light" />

      {showRejoinModal && rejoinEmployee && (
        <RejoinEmployeeModal
          employee={rejoinEmployee}
          divisions={divisions}
          departments={departments}
          designations={designations}
          employeeGroups={groups}
          onClose={() => {
            setShowRejoinModal(false);
            setRejoinEmployee(null);
          }}
          onSuccess={(msg) => {
            toast.success(msg || 'Rejoin application submitted');
            setShowRejoinModal(false);
            setRejoinEmployee(null);
          }}
        />
      )}
    </div>
  );
}
