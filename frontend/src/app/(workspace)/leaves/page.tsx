'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast, ToastContainer } from 'react-toastify';
import Swal from 'sweetalert2';
import 'react-toastify/dist/ReactToastify.css';
import Spinner from '@/components/Spinner';
import LocationPhotoCapture from '@/components/LocationPhotoCapture';


// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

interface LeaveSplit {
  _id?: string;
  date: string;
  leaveType: string;
  leaveNature?: 'paid' | 'lop' | 'without_pay';
  isHalfDay?: boolean;
  halfDayType?: 'first_half' | 'second_half' | null;
  status: 'approved' | 'rejected';
  numberOfDays?: number;
  notes?: string | null;
}

interface LeaveSplitSummary {
  originalDays: number;
  originalLeaveType: string;
  totalSplits: number;
  approvedDays: number;
  rejectedDays: number;
  breakdown: Record<
    string,
    {
      leaveType: string;
      status: string;
      days: number;
    }
  >;
}

interface Employee {
  _id: string;
  employee_name: string;
  emp_no: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
  phone_number?: string;
  // Some systems may use first_name/last_name
  first_name?: string;
  last_name?: string;
}

// Helper to get display name
const getEmployeeName = (emp: Employee) => {
  if (emp.employee_name) return emp.employee_name;
  if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
  if (emp.first_name) return emp.first_name;
  return emp.emp_no;
};

// Helper to get initials
const getEmployeeInitials = (emp: Employee) => {
  const name = getEmployeeName(emp);
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (name[0] || 'E').toUpperCase();
};

interface LeaveApplication {
  _id: string;
  employeeId?: {
    _id: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no: string;
  };
  emp_no?: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  isHalfDay?: boolean;
  halfDayType?: string;
  purpose: string;
  contactNumber?: string;
  status: string;
  originalLeaveType?: string;
  splitStatus?: 'pending_split' | 'split_approved' | 'split_rejected' | null;
  splits?: LeaveSplit[];
  splitSummary?: LeaveSplitSummary | null;
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  appliedBy?: { _id: string; name: string; email: string };
  workflow?: {
    nextApprover?: string;
    history?: any[];
  };
  changeHistory?: Array<{
    field: string;
    originalValue: any;
    newValue: any;
    modifiedBy?: { _id: string; name: string; email: string; role: string };
    modifiedByName?: string;
    modifiedByRole?: string;
    modifiedAt: string;
    reason?: string;
  }>;
  approvals?: {
    hod?: {
      approvedAt?: string;
    };
    hr?: {
      approvedAt?: string;
    };
  };
}

interface ODApplication {
  _id: string;
  employeeId?: {
    _id?: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no: string;
  };
  emp_no?: string;
  odType: string;
  odType_extended?: 'full_day' | 'half_day' | 'hours' | null;
  odStartTime?: string;
  odEndTime?: string;
  durationHours?: number;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  isHalfDay?: boolean;
  halfDayType?: string;
  purpose: string;
  placeVisited?: string;
  contactNumber?: string;
  status: string;
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  appliedBy?: { _id: string; name: string; email: string };
  assignedBy?: { name: string };
  workflow?: {
    nextApprover?: string;
    history?: any[];
  };
  changeHistory?: Array<{
    field: string;
    originalValue: any;
    newValue: any;
    modifiedBy?: { _id: string; name: string; email: string; role: string };
    modifiedByName?: string;
    modifiedByRole?: string;
    modifiedAt: string;
    reason?: string;
  }>;
  approvals?: {
    hod?: {
      approvedAt?: string;
    };
    hr?: {
      approvedAt?: string;
    };
  };
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'hod_approved':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'rejected':
    case 'hod_rejected':
    case 'hr_rejected':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'cancelled':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
  }
};

// Helper to format date for HTML date input (YYYY-MM-DD)
const formatDateForInput = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const parseDateOnly = (value: Date | string) => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const str = String(value);
  const datePart = str.includes('T') ? str.split('T')[0] : str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return new Date(`${datePart}T00:00:00`);
  }
  const d = new Date(str);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const toISODate = (date: Date | string) => {
  const d = parseDateOnly(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const clampSplitsToRange = (leave: LeaveApplication, splits: LeaveSplit[]) => {
  const start = parseDateOnly(leave.fromDate).getTime();
  const end = parseDateOnly(leave.toDate).getTime();
  const byKey = new Map<string, LeaveSplit>();

  splits.forEach((s) => {
    const d = parseDateOnly(s.date);
    const t = d.getTime();
    if (Number.isNaN(t) || t < start || t > end) return;
    const iso = toISODate(d);
    const key = `${iso}_${s.isHalfDay ? s.halfDayType || 'half' : 'full'}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...s,
        date: iso,
        numberOfDays: s.numberOfDays ?? (s.isHalfDay ? 0.5 : 1),
        halfDayType: s.isHalfDay ? (s.halfDayType as any) || 'first_half' : null,
      });
    }
  });

  return Array.from(byKey.values()).sort(
    (a, b) => parseDateOnly(a.date).getTime() - parseDateOnly(b.date).getTime()
  );
};

const buildDateRange = (fromDate: string, toDate: string, isHalfDay?: boolean, halfDayType?: string | null) => {
  const dates: LeaveSplit[] = [];
  const start = parseDateOnly(fromDate);
  const end = parseDateOnly(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const current = new Date(start);
  while (current <= end) {
    const isSingleHalf = isHalfDay && start.getTime() === end.getTime();
    dates.push({
      date: toISODate(current),
      leaveType: '',
      status: 'approved',
      isHalfDay: Boolean(isSingleHalf),
      halfDayType: isSingleHalf ? (halfDayType as any) || 'first_half' : null,
      numberOfDays: isSingleHalf ? 0.5 : 1,
    });
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export default function LeavesPage() {
  const { getModuleConfig, hasPermission, activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'leaves' | 'od' | 'pending'>('leaves');
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [ods, setODs] = useState<ODApplication[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveApplication[]>([]);
  const [pendingODs, setPendingODs] = useState<ODApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Permission states
  const [canApplyLeaveForSelf, setCanApplyLeaveForSelf] = useState(false);
  const [canApplyLeaveForOthers, setCanApplyLeaveForOthers] = useState(false);
  const [canApplyODForSelf, setCanApplyODForSelf] = useState(false);
  const [canApplyODForOthers, setCanApplyODForOthers] = useState(false);
  const [canApplyForSelf, setCanApplyForSelf] = useState(false);
  const [canApplyForOthers, setCanApplyForOthers] = useState(false);
  const [canRevoke, setCanRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');

  // Dialog states
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyType, setApplyType] = useState<'leave' | 'od'>('leave');
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [isChangeHistoryExpanded, setIsChangeHistoryExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LeaveApplication | ODApplication | null>(null);
  const [detailType, setDetailType] = useState<'leave' | 'od'>('leave');
  const [actionComment, setActionComment] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<LeaveSplit[]>([]);
  const [splitWarnings, setSplitWarnings] = useState<string[]>([]);
  const [splitErrors, setSplitErrors] = useState<string[]>([]);
  const [splitSaving, setSplitSaving] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  // Leave types and OD types
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [odTypes, setODTypes] = useState<any[]>([]);

  // Employees for "Apply For" selection
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    leaveType: string;
    odType: string;
    odType_extended: string;
    odStartTime: string | null;
    odEndTime: string | null;
    fromDate: string;
    toDate: string;
    purpose: string;
    contactNumber: string;
    placeVisited: string;
    isHalfDay: boolean;
    halfDayType: 'first_half' | 'second_half' | null;
    remarks: string;
  }>({
    leaveType: '',
    odType: '',
    odType_extended: 'full_day',
    odStartTime: '',
    odEndTime: '',
    fromDate: '',
    toDate: '',
    purpose: '',
    contactNumber: '',
    placeVisited: '',
    isHalfDay: false,
    halfDayType: null,
    remarks: '',
  });

  // Evidence State
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [locationData, setLocationData] = useState<any | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);

  // Approved records info for conflict checking
  const [approvedRecordsInfo, setApprovedRecordsInfo] = useState<{
    hasLeave: boolean;
    hasOD: boolean;
    leaveInfo: any;
    odInfo: any;
  } | null>(null);
  const [checkingApprovedRecords, setCheckingApprovedRecords] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    if (user) {
      setCurrentUser(user);
      if (user.role === 'super_admin') {
        setIsSuperAdmin(true);
      }
    }
    loadData(user);
    loadTypes();
  }, []);

  // Load employees and permissions when user or workspace changes
  useEffect(() => {
    if (currentUser) {
      // For Admins/HR/HODs, we can load employees even if activeWorkspace is not yet ready
      // as they have a broader scope. For employees, we load self.
      const isAdmin = ['hr', 'super_admin', 'sub_admin', 'manager', 'hod'].includes(currentUser.role);
      if (isAdmin || activeWorkspace) {
        loadEmployees();
        checkWorkspacePermission();
      }
    }
  }, [currentUser, activeWorkspace?._id]);

  const loadData = async (user?: any) => {
    setLoading(true);
    try {
      const role = user?.role || currentUser?.role;
      const isEmployee = role === 'employee';
      // console.log('loadData for role:', currentUser?.role);

      if (isEmployee) {
        // Employee Plan: Fetch MY leaves/ODs
        const [leavesRes, odsRes] = await Promise.all([
          api.getMyLeaves(),
          api.getMyODs(),
        ]);

        const myLeaves = leavesRes.success ? (leavesRes.data as LeaveApplication[]) : [];
        const myODs = odsRes.success ? (odsRes.data as ODApplication[]) : [];

        setLeaves(myLeaves);
        setODs(myODs);

        // For employees, "Pending" means "My Pending Requests"
        setPendingLeaves(myLeaves.filter(l => l.status === 'pending'));
        setPendingODs(myODs.filter(o => o.status === 'pending'));

        // Reset check (management feature)
        setCheckingApprovedRecords(false);

      } else {
        // Manager/Admin Plan: Fetch ALL (limited) + Pending Approvals
        const [leavesRes, odsRes, pendingLeavesRes, pendingODsRes] = await Promise.all([
          api.getLeaves({ limit: 50 }),
          api.getODs({ limit: 50 }),
          api.getPendingLeaveApprovals(),
          api.getPendingODApprovals(),
        ]);

        if (leavesRes.success) setLeaves(leavesRes.data || []);
        if (odsRes.success) setODs(odsRes.data || []);
        if (pendingLeavesRes.success) setPendingLeaves(pendingLeavesRes.data || []);
        if (pendingODsRes.success) setPendingODs(pendingODsRes.data || []);
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const response = await api.getCurrentUser();
      if (response.success) {
        // getCurrentUser returns { user, workspaces, activeWorkspace }
        const userData = (response as any).user || (response as any).data?.user;
        if (userData) {
          setCurrentUser(userData);
        }
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
  };

  const checkWorkspacePermission = async () => {
    try {
      const workspaceId = activeWorkspace?._id;
      const isAdmin = currentUser && ['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser.role);

      console.log('[Workspace Leaves] Checking permissions for workspace:', workspaceId, activeWorkspace?.name);

      if (!workspaceId && !isAdmin) {
        console.log('[Workspace Leaves] No workspace ID found and not an admin. Resetting permissions.');
        setCanApplyLeaveForSelf(false);
        setCanApplyLeaveForOthers(false);
        setCanApplyODForSelf(false);
        setCanApplyODForOthers(false);
        setCanApplyForSelf(false);
        setCanApplyForOthers(false);
        return;
      }

      // Employee workspace: can only apply for self (if enabled)
      if (activeWorkspace?.type === 'employee') {
        console.log('[Workspace Leaves] Employee workspace - allowing self-application only');
        setCanApplyLeaveForSelf(true);
        setCanApplyLeaveForOthers(false);
        setCanApplyODForSelf(true);
        setCanApplyODForOthers(false);
        setCanApplyForSelf(true);
        setCanApplyForOthers(false);
        return;
      }

      // Check both leave and od settings for workspace permissions
      const [leaveSettingsRes, odSettingsRes] = await Promise.all([
        api.getLeaveSettings('leave'),
        api.getLeaveSettings('od'),
      ]);

      console.log('[Workspace Leaves] Leave settings response:', leaveSettingsRes);
      console.log('[Workspace Leaves] OD settings response:', odSettingsRes);

      const workspaceIdStr = String(workspaceId);

      // Check Leave permissions from leave settings
      let leavePermissionsFromLeave = null;
      if (leaveSettingsRes.success && leaveSettingsRes.data?.settings?.workspacePermissions) {
        const allPermissions = leaveSettingsRes.data.settings.workspacePermissions;
        console.log('[Workspace Leaves] Leave settings permissions:', JSON.stringify(allPermissions, null, 2));
        for (const key in allPermissions) {
          if (String(key) === workspaceIdStr) {
            leavePermissionsFromLeave = allPermissions[key];
            console.log('[Workspace Leaves] Found leave permissions in leave settings:', JSON.stringify(leavePermissionsFromLeave, null, 2));
            break;
          }
        }
      }

      // Check OD permissions from od settings
      let odPermissionsFromOD = null;
      if (odSettingsRes.success && odSettingsRes.data?.settings?.workspacePermissions) {
        const allPermissions = odSettingsRes.data.settings.workspacePermissions;
        console.log('[Workspace Leaves] OD settings permissions:', JSON.stringify(allPermissions, null, 2));
        for (const key in allPermissions) {
          if (String(key) === workspaceIdStr) {
            odPermissionsFromOD = allPermissions[key];
            console.log('[Workspace Leaves] Found OD permissions in OD settings:', JSON.stringify(odPermissionsFromOD, null, 2));
            break;
          }
        }
      }

      // Process Leave permissions
      let leaveSelf = false;
      let leaveOthers = false;

      if (leavePermissionsFromLeave) {
        console.log('[Workspace Leaves] Processing leave permissions, type:', typeof leavePermissionsFromLeave, 'has leave prop:', !!leavePermissionsFromLeave.leave);
        if (typeof leavePermissionsFromLeave === 'boolean') {
          // Old format
          console.log('[Workspace Leaves] Using old boolean format for leave');
          leaveSelf = false;
          leaveOthers = leavePermissionsFromLeave;
        } else if (leavePermissionsFromLeave.leave) {
          // New format with separate leave/od - structure: { leave: { canApplyForSelf, canApplyForOthers } }
          console.log('[Workspace Leaves] Using new nested format for leave:', leavePermissionsFromLeave.leave);
          leaveSelf = leavePermissionsFromLeave.leave.canApplyForSelf || false;
          leaveOthers = leavePermissionsFromLeave.leave.canApplyForOthers || false;
        } else {
          // Legacy object format (but check if it has OD data, if so, this is for OD not leave)
          if (!leavePermissionsFromLeave.od) {
            console.log('[Workspace Leaves] Using legacy object format for leave');
            leaveSelf = leavePermissionsFromLeave.canApplyForSelf || false;
            leaveOthers = leavePermissionsFromLeave.canApplyForOthers || false;
          } else {
            console.log('[Workspace Leaves] Leave permissions object contains OD data, skipping');
          }
        }
      } else {
        console.log('[Workspace Leaves] No leave permissions found');
      }


      // Override based on Role (Strict Role-Based Access)
      if (currentUser) {
        if (currentUser.role === 'employee') {
          leaveSelf = true; // Employees can always apply for themselves
          leaveOthers = false;
        } else if (['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser.role)) {
          leaveOthers = true;
          leaveSelf = true; // Admins/Managers/HODs should also be able to apply
        }
      }

      console.log('[Workspace Leaves] Parsed leave permissions:', { self: leaveSelf, others: leaveOthers });
      setCanApplyLeaveForSelf(leaveSelf);
      setCanApplyLeaveForOthers(leaveOthers);

      // Process OD permissions - check OD settings first, then fallback to leave settings
      let odSelf = false;
      let odOthers = false;

      // First try OD settings
      if (odPermissionsFromOD) {
        console.log('[Workspace Leaves] Processing OD permissions from OD settings, type:', typeof odPermissionsFromOD, 'has od prop:', !!odPermissionsFromOD.od);
        if (typeof odPermissionsFromOD === 'boolean') {
          // Old format
          console.log('[Workspace Leaves] Using old boolean format for OD');
          odSelf = false;
          odOthers = odPermissionsFromOD;
        } else if (odPermissionsFromOD.od) {
          // New format with separate leave/od - structure: { od: { canApplyForSelf, canApplyForOthers } }
          console.log('[Workspace Leaves] Using new nested format for OD:', odPermissionsFromOD.od);
          odSelf = odPermissionsFromOD.od.canApplyForSelf || false;
          odOthers = odPermissionsFromOD.od.canApplyForOthers || false;
        } else {
          // Legacy object format
          console.log('[Workspace Leaves] Using legacy object format for OD');
          odSelf = odPermissionsFromOD.canApplyForSelf || false;
          odOthers = odPermissionsFromOD.canApplyForOthers || false;
        }
      }
      // If not found in OD settings, check leave settings (might have OD permissions stored there)
      else if (leavePermissionsFromLeave && typeof leavePermissionsFromLeave === 'object' && leavePermissionsFromLeave.od) {
        console.log('[Workspace Leaves] Found OD permissions in leave settings, using them');
        odSelf = leavePermissionsFromLeave.od.canApplyForSelf || false;
        odOthers = leavePermissionsFromLeave.od.canApplyForOthers || false;
      }
      // Final fallback: use leave permissions if no OD-specific permissions found
      else if (leavePermissionsFromLeave && typeof leavePermissionsFromLeave !== 'boolean' && !leavePermissionsFromLeave.leave && !leavePermissionsFromLeave.od) {
        // Use leave permissions as fallback for OD (legacy behavior)
        console.log('[Workspace Leaves] Using leave permissions as fallback for OD');
        odSelf = leavePermissionsFromLeave.canApplyForSelf || false;
        odOthers = leavePermissionsFromLeave.canApplyForOthers || false;
      } else {
        console.log('[Workspace Leaves] No OD permissions found');
      }


      // Override OD based on Role
      if (currentUser) {
        if (currentUser.role === 'employee') {
          odSelf = true; // Employees can always apply for OD
          odOthers = false;
        } else if (['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser.role)) {
          odOthers = true;
          odSelf = true;
        }
      }

      console.log('[Workspace Leaves] Parsed OD permissions:', { self: odSelf, others: odOthers });
      setCanApplyODForSelf(odSelf);
      setCanApplyODForOthers(odOthers);

      // Set combined permissions (for backward compatibility)
      setCanApplyForSelf(leaveSelf || odSelf);
      setCanApplyForOthers(leaveOthers || odOthers);

      console.log('[Workspace Leaves] Final permissions - Leave:', { self: leaveSelf, others: leaveOthers }, 'OD:', { self: odSelf, others: odOthers });
    } catch (err) {
      console.error('[Workspace Leaves] Failed to check workspace permission:', err);
      setCanApplyLeaveForSelf(false);
      setCanApplyLeaveForOthers(false);
      setCanApplyODForSelf(false);
      setCanApplyODForOthers(false);
      setCanApplyForSelf(false);
      setCanApplyForOthers(false);
    }
  };

  const loadEmployees = async () => {
    try {
      if (!currentUser) return;



      // Load employees logic (based on Role)
      if (currentUser) {
        // 1. Employee: Load self profile only
        if (currentUser.role === 'employee') {
          console.log('[Workspace Leaves] Loading data for employee:', currentUser);
          // Try to get employee details using linked employeeId or emp_no
          const identifier = (currentUser as any).emp_no || currentUser.employeeId;

          let employeeLoaded = false;

          if (identifier) {
            try {
              const response = await api.getEmployee(identifier);
              if (response.success && response.data) {
                setEmployees([response.data]);
                employeeLoaded = true;
              }
            } catch (fetchErr) {
              console.error('Error fetching employee details:', fetchErr);
            }
          }

          // Fallback: If API failed or no identifier, but we are logged in as employee,
          // create a synthetic employee object from currentUser to allow application
          if (!employeeLoaded) {
            console.warn('Using synthetic employee data from currentUser');
            const syntheticEmployee: any = {
              _id: currentUser!.id || 'current-user',
              emp_no: identifier || 'UNKNOWN',
              employee_name: currentUser!.name,
              email: currentUser!.email,
              role: 'employee',
              phone_number: (currentUser as any).phone || '',
              department: currentUser!.department,
            };
            setEmployees([syntheticEmployee]);
          }
          console.log('[Workspace Leaves] Loaded employees list:', employeeLoaded ? 'From API' : 'Synthetic');

        }
        // 2. HOD: Access to own department employees
        else if (['hod', 'manager', 'hr', 'sub_admin', 'super_admin'].includes(currentUser.role)) {
          console.log(`[Workspace Leaves] Loading employees for ${currentUser.role}.`);

          const query: any = { is_active: true };
          if (currentUser.role === 'hod') {
            const deptId = typeof currentUser.department === 'object' && currentUser.department ? currentUser.department._id : currentUser.department;
            if (deptId) {
              query.department_id = deptId;
            }
          }

          const response = await api.getEmployees(query);
          if (response.success && response.data) {
            let employeesList = response.data;

            // Ensure current user is included in the list (if they have an emp_no)
            const identifier = (currentUser as any).emp_no || currentUser.employeeId;
            const selfExists = employeesList.some((emp: any) => emp.emp_no === identifier || emp._id === currentUser.id);

            if (!selfExists && identifier) {
              try {
                const selfRes = await api.getEmployee(identifier);
                if (selfRes.success && selfRes.data) {
                  employeesList = [selfRes.data, ...employeesList];
                }
              } catch (err) {
                console.error('Error fetching self for list:', err);
              }
            }

            setEmployees(employeesList);
          }
        }
      } else {
        // Fallback if currentUser not loaded yet
        setEmployees([]);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
      setEmployees([]);
    }
  };

  const loadTypes = async () => {
    try {
      // Load from settings API
      const [leaveSettingsRes, odSettingsRes] = await Promise.all([
        api.getLeaveSettings('leave'),
        api.getLeaveSettings('od'),
      ]);

      // Extract leave types from settings (field is 'types' not 'leaveTypes')
      let fetchedLeaveTypes: any[] = [];
      if (leaveSettingsRes.success && leaveSettingsRes.data?.types) {
        fetchedLeaveTypes = leaveSettingsRes.data.types.filter((t: any) => t.isActive !== false);
      }

      // Extract OD types from settings (field is 'types' not 'odTypes')
      let fetchedODTypes: any[] = [];
      if (odSettingsRes.success && odSettingsRes.data?.types) {
        fetchedODTypes = odSettingsRes.data.types.filter((t: any) => t.isActive !== false);
      }

      // Use fetched types or defaults
      if (fetchedLeaveTypes.length > 0) {
        setLeaveTypes(fetchedLeaveTypes);
      } else {
        // Fallback defaults
        setLeaveTypes([
          { code: 'CL', name: 'Casual Leave' },
          { code: 'SL', name: 'Sick Leave' },
          { code: 'EL', name: 'Earned Leave' },
          { code: 'LWP', name: 'Leave Without Pay' },
        ]);
      }

      if (fetchedODTypes.length > 0) {
        setODTypes(fetchedODTypes);
      } else {
        // Fallback defaults
        setODTypes([
          { code: 'OFFICIAL', name: 'Official Work' },
          { code: 'TRAINING', name: 'Training' },
          { code: 'MEETING', name: 'Meeting' },
          { code: 'CLIENT', name: 'Client Visit' },
        ]);
      }
    } catch (err) {
      console.error('Failed to load types:', err);
      // Set defaults if API fails
      setLeaveTypes([
        { code: 'CL', name: 'Casual Leave' },
        { code: 'SL', name: 'Sick Leave' },
        { code: 'EL', name: 'Earned Leave' },
        { code: 'LWP', name: 'Leave Without Pay' },
      ]);
      setODTypes([
        { code: 'OFFICIAL', name: 'Official Work' },
        { code: 'TRAINING', name: 'Training' },
        { code: 'MEETING', name: 'Meeting' },
        { code: 'CLIENT', name: 'Client Visit' },
      ]);
    }
  };



  // Filter employees based on search
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const searchLower = employeeSearch.toLowerCase();
      const fullName = getEmployeeName(emp).toLowerCase();
      return (
        fullName.includes(searchLower) ||
        emp.emp_no?.toLowerCase().includes(searchLower) ||
        emp.department?.name?.toLowerCase().includes(searchLower)
      );
    });
  }, [employees, employeeSearch]);
  const openApplyDialog = (type: 'leave' | 'od') => {
    setApplyType(type);
    resetForm();
    setShowApplyDialog(true);
  };

  const handleSelectEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
    if (employee.phone_number) {
      setFormData(prev => ({ ...prev, contactNumber: employee.phone_number || '' }));
    }
  };

  // Auto-select employee for employee role when dialog opens
  useEffect(() => {
    console.log('[Workspace Leaves] Auto-select effect. Show:', showApplyDialog, 'Role:', currentUser?.role, 'Employees:', employees.length);
    if (showApplyDialog && currentUser?.role === 'employee' && employees.length > 0) {
      if (!selectedEmployee || selectedEmployee._id !== employees[0]._id) {
        console.log('[Workspace Leaves] Auto-selecting employee:', employees[0]);
        handleSelectEmployee(employees[0]);
      }
    }
  }, [showApplyDialog, currentUser, employees]);



  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let employeeToApplyFor = selectedEmployee;

      console.log('[Workspace Leaves] Apply. Selected:', selectedEmployee, 'Role:', currentUser?.role, 'Employees count:', employees.length);

      // Fallback: If no employee selected but current user is employee
      if (!employeeToApplyFor && currentUser?.role === 'employee') {
        if (employees.length > 0) {
          employeeToApplyFor = employees[0];
        } else {
          console.warn('[Workspace Leaves] Constructing synthetic employee in handleApply fallback');
          employeeToApplyFor = {
            _id: currentUser.id || 'current-user',
            emp_no: (currentUser as any).emp_no || currentUser.employeeId || 'UNKNOWN',
            employee_name: currentUser.name || 'Current User',
            email: currentUser.email || '',
            role: 'employee',
            phone_number: (currentUser as any).phone || '',
            department: currentUser.department,
          } as Employee;
        }
      }

      if (!employeeToApplyFor) {
        toast.error('Please select an employee');
        setLoading(false);
        return;
      }

      // 1. Validation
      if (applyType === 'leave') {
        if (!formData.leaveType || !formData.fromDate || !formData.toDate || !formData.purpose) {
          toast.error('Please fill all required fields');
          setLoading(false);
          return;
        }
      } else {
        if (!formData.odType || !formData.fromDate || !formData.toDate || !formData.purpose || !formData.placeVisited) {
          toast.error('Please fill all required fields');
          setLoading(false);
          return;
        }
        if (formData.odType_extended === 'hours' && (!formData.odStartTime || !formData.odEndTime)) {
          toast.error('Please provide start and end times for hour-based OD');
          setLoading(false);
          return;
        }
      }

      // Check for conflicts
      if (approvedRecordsInfo) {
        const hasFullDayApproved = (approvedRecordsInfo.hasLeave && !approvedRecordsInfo.leaveInfo?.isHalfDay) ||
          (approvedRecordsInfo.hasOD && !approvedRecordsInfo.odInfo?.isHalfDay);

        if (hasFullDayApproved) {
          toast.error('Employee already has an approved full-day record on this date');
          setLoading(false);
          return;
        }

        if (formData.isHalfDay) {
          const approvedHalfDayType = approvedRecordsInfo.hasLeave ? approvedRecordsInfo.leaveInfo?.halfDayType : approvedRecordsInfo.odInfo?.halfDayType;
          if (approvedHalfDayType === formData.halfDayType) {
            toast.error(`Employee already has ${formData.halfDayType?.replace('_', ' ')} approved on this date`);
            setLoading(false);
            return;
          }
        }
      }

      // 2. Prepare Payload
      const contactNum = formData.contactNumber || employeeToApplyFor.phone_number || '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: any = {
        // Only send empNo if NOT employee role (admin applying for others)
        // Employees applying for self should omit empNo to trigger backend "self" logic
        ...(currentUser?.role !== 'employee' ? { empNo: employeeToApplyFor.emp_no } : {}),
        fromDate: formData.fromDate,
        toDate: formData.toDate,
        purpose: formData.purpose,
        contactNumber: contactNum,
        remarks: formData.remarks,
        isHalfDay: formData.isHalfDay,
        halfDayType: formData.isHalfDay ? formData.halfDayType : null,
      };

      if (applyType === 'leave') {
        payload.leaveType = formData.leaveType;
      } else {
        payload.odType = formData.odType;
        payload.placeVisited = formData.placeVisited;
        payload.odType_extended = formData.odType_extended;
        if (formData.odType_extended === 'hours') {
          payload.odStartTime = formData.odStartTime;
          payload.odEndTime = formData.odEndTime;
        }
      }

      // 3. Evidence Upload
      if (applyType === 'od') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const odSettings = getModuleConfig('OD')?.settings as any;
        if (odSettings?.requirePhotoEvidence && !evidenceFile) {
          toast.error('Photo evidence is required');
          setLoading(false);
          return;
        }

        if (evidenceFile) {
          const uploadRes = await api.uploadEvidence(evidenceFile);
          if (uploadRes.success && uploadRes.data) {
            payload.photoEvidence = {
              url: uploadRes.data.url,
              key: uploadRes.data.key,
              exifLocation: (evidenceFile as any).exifLocation
            };
          } else {
            toast.error('Failed to upload photo evidence');
            setLoading(false);
            return;
          }
        }

        if (locationData) {
          payload.geoLocation = locationData;
        }
      }

      // 4. Submit
      const response = applyType === 'leave'
        ? await api.applyLeave(payload)
        : await api.applyOD(payload);

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `${applyType === 'leave' ? 'Leave' : 'OD'} applied successfully`,
          timer: 2000,
          showConfirmButton: false,
        });
        setShowApplyDialog(false);
        resetForm();
        loadData();
      } else {
        toast.error(response.error || 'Failed to apply');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, type: 'leave' | 'od', action: 'approve' | 'reject' | 'forward', comments: string = '') => {
    try {
      let response;
      if (type === 'leave') {
        response = await api.processLeaveAction(id, action, comments);
      } else {
        response = await api.processODAction(id, action, comments);
      }

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `${type === 'leave' ? 'Leave' : 'OD'} ${action}ed successfully`,
          timer: 2000,
          showConfirmButton: false,
        });
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.error || 'Action failed',
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Action failed',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      leaveType: '',
      odType: '',
      odType_extended: 'full_day',
      odStartTime: '',
      odEndTime: '',
      fromDate: '',
      toDate: '',
      purpose: '',
      contactNumber: '',
      placeVisited: '',
      isHalfDay: false,
      halfDayType: null,
      remarks: '',
    });
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
    setEvidenceFile(null);
    setEvidencePreview(null);
    setLocationData(null);
    setError(null);
  };

  // Check approved records when employee and date are selected
  useEffect(() => {
    const checkApprovedRecords = async () => {
      if (!selectedEmployee || !formData.fromDate) {
        setApprovedRecordsInfo(null);
        return;
      }

      // Only check if it's a single day (same fromDate and toDate)
      if (formData.fromDate === formData.toDate || !formData.toDate) {
        setCheckingApprovedRecords(true);
        try {
          const response = await api.getApprovedRecordsForDate(
            selectedEmployee._id,
            selectedEmployee.emp_no,
            formData.fromDate
          );

          if (response.success && response.data) {
            setApprovedRecordsInfo(response.data);

            // Auto-select opposite half if approved half-day exists
            if (response.data.hasLeave && response.data.leaveInfo?.isHalfDay) {
              const approvedHalf = response.data.leaveInfo.halfDayType;
              if (approvedHalf === 'first_half') {
                setFormData(prev => ({
                  ...prev,
                  isHalfDay: true,
                  halfDayType: 'second_half'
                }));
              } else if (approvedHalf === 'second_half') {
                setFormData(prev => ({
                  ...prev,
                  isHalfDay: true,
                  halfDayType: 'first_half'
                }));
              }
            } else if (response.data.hasOD && response.data.odInfo?.isHalfDay) {
              const approvedHalf = response.data.odInfo.halfDayType;
              if (approvedHalf === 'first_half') {
                setFormData(prev => ({
                  ...prev,
                  isHalfDay: true,
                  halfDayType: 'second_half'
                }));
              } else if (approvedHalf === 'second_half') {
                setFormData(prev => ({
                  ...prev,
                  isHalfDay: true,
                  halfDayType: 'first_half'
                }));
              }
            }
          } else {
            setApprovedRecordsInfo(null);
          }
        } catch (err) {
          console.error('Error checking approved records:', err);
          setApprovedRecordsInfo(null);
        } finally {
          setCheckingApprovedRecords(false);
        }
      } else {
        setApprovedRecordsInfo(null);
      }
    };

    checkApprovedRecords();
  }, [selectedEmployee, formData.fromDate, formData.toDate]);

  const buildInitialSplits = (leave: LeaveApplication) => {
    if (!leave) return [];
    if (leave.splits && leave.splits.length > 0) {
      return clampSplitsToRange(
        leave,
        leave.splits.map((s) => ({
          _id: s._id,
          date: toISODate(s.date),
          leaveType: s.leaveType,
          leaveNature: s.leaveNature,
          isHalfDay: s.isHalfDay,
          halfDayType: (s.halfDayType as any) || null,
          status: s.status,
          numberOfDays: s.numberOfDays ?? (s.isHalfDay ? 0.5 : 1),
          notes: s.notes || null,
        }))
      );
    }
    const defaults = buildDateRange(leave.fromDate, leave.toDate, leave.isHalfDay, leave.halfDayType);
    return defaults.map((d) => ({
      ...d,
      leaveType: leave.leaveType,
      status: 'approved' as const,
      numberOfDays: d.numberOfDays ?? (d.isHalfDay ? 0.5 : 1),
    }));
  };

  const openDetailDialog = async (item: LeaveApplication | ODApplication, type: 'leave' | 'od') => {
    try {
      setSplitMode(false);
      setSplitDrafts([]);
      setSplitWarnings([]);
      setSplitErrors([]);
      setSplitSaving(false);
      setActionComment('');

      let enrichedItem: LeaveApplication | ODApplication = item;
      if (type === 'leave') {
        const response = await api.getLeave(item._id);
        if (response?.success && response.data) {
          enrichedItem = response.data;
        }
        const initialSplits = buildInitialSplits(enrichedItem as LeaveApplication);
        setSplitDrafts(initialSplits);
        const leaveItem = enrichedItem as LeaveApplication;
        setSplitMode((leaveItem.splits && leaveItem.splits.length > 0) || false);
      }

      setSelectedItem(enrichedItem);
      setDetailType(type);
      setShowDetailDialog(true);

      // Check if revocation is possible (within 3 hours)
      if (enrichedItem.status === 'approved' || enrichedItem.status === 'hod_approved' || enrichedItem.status === 'hr_approved') {
        const approvalTime = (enrichedItem as LeaveApplication).approvals?.hr?.approvedAt || (enrichedItem as LeaveApplication).approvals?.hod?.approvedAt;
        if (approvalTime) {
          const hoursSinceApproval = (new Date().getTime() - new Date(approvalTime).getTime()) / (1000 * 60 * 60);
          setCanRevoke(hoursSinceApproval <= 3);
        } else {
          setCanRevoke(false);
        }
      } else {
        setCanRevoke(false);
      }
    } catch (err: any) {
      console.error('Failed to load leave details', err);
      toast.error(err.message || 'Failed to load leave details');
    }
  };

  const updateSplitDraft = (index: number, updates: Partial<LeaveSplit>) => {
    setSplitDrafts((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const next = { ...row, ...updates };
        next.numberOfDays = next.isHalfDay ? 0.5 : 1;
        if (!next.isHalfDay) {
          next.halfDayType = null;
        }
        return next;
      })
    );
  };

  const validateSplitsForLeave = async () => {
    if (detailType !== 'leave' || !selectedItem) return null;
    setSplitErrors([]);
    setSplitWarnings([]);

    try {
      const payload = splitDrafts.map((s) => ({
        date: s.date,
        leaveType: s.leaveType,
        isHalfDay: s.isHalfDay || false,
        halfDayType: s.isHalfDay ? s.halfDayType : null,
        status: s.status,
        notes: s.notes,
      }));

      const resp = await api.validateLeaveSplits(selectedItem._id, payload);
      if (!resp.success && (resp as any).isValid === false) {
        setSplitErrors((resp as any).errors || ['Validation failed']);
      } else {
        setSplitErrors((resp as any).errors || []);
      }
      setSplitWarnings((resp as any).warnings || []);
      return resp;
    } catch (err: any) {
      setSplitErrors([err.message || 'Failed to validate splits']);
      return null;
    }
  };

  const saveSplits = async () => {
    if (detailType !== 'leave' || !selectedItem) return false;
    const validation = await validateSplitsForLeave();
    if (!validation || (validation as any).isValid === false) {
      return false;
    }

    try {
      const payload = splitDrafts.map((s) => ({
        date: s.date,
        leaveType: s.leaveType,
        isHalfDay: s.isHalfDay || false,
        halfDayType: s.isHalfDay ? s.halfDayType : null,
        status: s.status,
        notes: s.notes,
      }));

      const resp = await api.createLeaveSplits(selectedItem._id, payload);
      if (!resp.success) {
        setSplitErrors((resp as any).errors || ['Failed to save splits']);
        setSplitWarnings((resp as any).warnings || []);
        return false;
      }

      setSplitWarnings((resp as any).warnings || []);
      return true;
    } catch (err: any) {
      setSplitErrors([err.message || 'Failed to save splits']);
      return false;
    }
  };

  const handleDetailAction = async (action: 'approve' | 'reject' | 'forward' | 'cancel') => {
    if (!selectedItem) return;

    try {
      if (detailType === 'leave' && action === 'approve' && splitMode) {
        setSplitSaving(true);
        const saved = await saveSplits();
        if (!saved) {
          setSplitSaving(false);
          return;
        }
      }

      let response;

      if (action === 'cancel') {
        if (detailType === 'leave') {
          response = await api.cancelLeave(selectedItem._id);
        } else {
          // OD cancel if available
          response = { success: true };
        }
      } else {
        if (detailType === 'leave') {
          response = await api.processLeaveAction(selectedItem._id, action, actionComment);
        } else {
          response = await api.processODAction(selectedItem._id, action, actionComment);
        }
      }

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `${detailType === 'leave' ? 'Leave' : 'OD'} ${action}${action === 'cancel' ? 'led' : 'ed'} successfully`,
          timer: 2000,
          showConfirmButton: false,
        });
        setShowDetailDialog(false);
        setSelectedItem(null);
        setIsChangeHistoryExpanded(false);
        loadData();
        if (detailType === 'leave') {
          // refresh splits after action
          const refreshed = await api.getLeave(selectedItem._id);
          if (refreshed?.success && refreshed.data) {
            setSelectedItem(refreshed.data);
            setSplitDrafts(buildInitialSplits(refreshed.data));
          }
        }
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.error || `Failed to ${action}`,
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || `Failed to ${action}`,
      });
    } finally {
      setSplitSaving(false);
    }
  };


  const totalPending = pendingLeaves.length + pendingODs.length;

  const canPerformAction = (item: LeaveApplication | ODApplication) => {
    if (!currentUser) return false;

    // Super Admin can always act (safety override) - Commented out to restrict to workflow
    // if (currentUser.role === 'super_admin') return true;

    if (currentUser.role === 'employee') return false;

    // If workflow exists and specifies nextApprover
    if (item.workflow?.nextApprover) {
      const approver = String(item.workflow.nextApprover).toLowerCase().trim();
      const userRole = String(currentUser.role).toLowerCase().trim();

      // 1. Direct Role Match
      if (userRole === approver) return true;

      // 2. ID Match (if approver is a specific User ID)
      if ((currentUser as any)._id === item.workflow.nextApprover || (currentUser as any).id === item.workflow.nextApprover) return true;

      // 3. Special Aliases
      // 'reporting_manager' can be approved by 'manager' or 'hod'
      if (approver === 'reporting_manager' && (userRole === 'manager' || userRole === 'hod')) return true;

      // 'manager' step: allow HOD (Division Head) to approve as they are senior/equivalent in some contexts
      // Also allow 'manager' to approve of course (covered by direct match), but explicit check doesn't hurt
      if (approver === 'manager' && (userRole === 'hod' || userRole === 'division_head')) return true;

      // 'hod' step: allow Manager to approve if they are essentially functioning as HOD
      if (approver === 'hod' && userRole === 'manager') return true;

      // 4. Handle 'final_authority' placeholder
      // If the workflow step is generic "final authority", allow any major role to see the button.
      // The backend validation will still enforce strict permissions if needed.
      if (approver === 'final_authority') {
        return ['manager', 'hr', 'super_admin', 'hod', 'sub_admin'].includes(userRole);
      }

      return false;
    }

    // Safety check: specific status checks preventing duplicates
    // If I am HOD, and status is hod_approved, I shouldn't see buttons
    if ((currentUser.role === 'hod' || currentUser.role === 'manager') &&
      (item.status === 'hod_approved' || item.status === 'manager_approved')) {
      return false;
    }

    // Fallback: only true if status allows (pending or forwarded states)
    return ['pending', 'hod_approved', 'manager_approved'].includes(item.status);
  };

  // Dynamic Column Logic
  const { showDivision, showDepartment } = useMemo(() => {
    const isHOD = currentUser?.role === 'hod';
    if (isHOD) return { showDivision: false, showDepartment: false };

    let dataToCheck: any[] = [];
    if (activeTab === 'leaves') dataToCheck = leaves;
    else if (activeTab === 'od') dataToCheck = ods;

    const uniqueDivisions = new Set(dataToCheck.map(item => item.employeeId?.department?.division?.name).filter(Boolean));

    return {
      showDivision: uniqueDivisions.size > 1,
      showDepartment: true // Always show department for non-HODs as per requirement
    };
  }, [leaves, ods, activeTab, currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Leave & OD Management</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Manage leave applications and on-duty requests
            </p>
          </div>
          {(canApplyForSelf || canApplyForOthers || currentUser?.role === 'employee' || ['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser?.role)) && (
            <button
              onClick={() => openApplyDialog('leave')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all"
            >
              <PlusIcon />
              Apply Leave / OD
            </button>
          )}
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <CalendarIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{leaves.length}</div>
              <div className="text-sm text-slate-500">Total Leaves</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <BriefcaseIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{ods.length}</div>
              <div className="text-sm text-slate-500">Total ODs</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
              <ClockIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totalPending}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Pending Approvals</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {leaves.filter(l => l.status === 'approved').length + ods.filter(o => o.status === 'approved').length}
              </div>
              <div className="text-sm text-slate-500">Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${activeTab === 'leaves'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
          >
            <span className="flex items-center gap-2">
              <CalendarIcon />
              Leaves ({leaves.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('od')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${activeTab === 'od'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
          >
            <span className="flex items-center gap-2">
              <BriefcaseIcon />
              On Duty ({ods.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${activeTab === 'pending'
              ? 'border-yellow-500 text-yellow-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
          >
            <span className="flex items-center gap-2">
              <ClockIcon />
              Pending Approvals ({totalPending})
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        {activeTab === 'leaves' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  {currentUser?.role !== 'employee' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Employee</th>
                  )}
                  {showDivision && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Division</th>
                  )}
                  {showDepartment && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Department</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Days</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Applied By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {leaves.map((leave) => (
                  <tr
                    key={leave._id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => openDetailDialog(leave, 'leave')}
                  >
                    {currentUser?.role !== 'employee' && (
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {leave.employeeId?.employee_name || `${leave.employeeId?.first_name || ''} ${leave.employeeId?.last_name || ''}`.trim() || leave.emp_no}
                        </div>
                        <div className="text-xs text-slate-500">{leave.employeeId?.emp_no || leave.emp_no}</div>
                      </td>
                    )}
                    {showDivision && (
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(leave.employeeId as any)?.division?.name || (leave.employeeId as any)?.department?.division?.name || '-'}
                      </td>
                    )}
                    {showDepartment && (
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(leave.employeeId as any)?.department?.name || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 capitalize">
                      {leave.leaveType?.replace('_', ' ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {formatDate(leave.fromDate)} - {formatDate(leave.toDate)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {leave.numberOfDays}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${getStatusColor(leave.status)}`}>
                        {leave.status?.replace('_', ' ') || '-'}
                      </span>
                    </td>
                    {currentUser?.role !== 'employee' && (
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {leave.appliedBy?.name || 'Self'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(leave.appliedAt)}
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={currentUser?.role !== 'employee' ? (7 + (showDivision ? 1 : 0) + (showDepartment ? 1 : 0)) : 5} className="px-4 py-8 text-center text-slate-500">
                      No leave applications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'od' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  {currentUser?.role !== 'employee' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Employee</th>
                  )}
                  {showDivision && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Division</th>}
                  {showDepartment && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Department</th>}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Place</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                  {currentUser?.role !== 'employee' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Applied By</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {ods.map((od) => (
                  <tr
                    key={od._id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => openDetailDialog(od, 'od')}
                  >
                    {currentUser?.role !== 'employee' && (
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {od.employeeId?.employee_name || `${od.employeeId?.first_name || ''} ${od.employeeId?.last_name || ''}`.trim() || od.emp_no}
                        </div>
                        <div className="text-xs text-slate-500">{od.employeeId?.emp_no || od.emp_no}</div>
                      </td>
                    )}
                    {showDivision && (
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(od.employeeId as any)?.division?.name || (od.employeeId as any)?.department?.division?.name || '-'}
                      </td>
                    )}
                    {showDepartment && (
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(od.employeeId as any)?.department?.name || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 capitalize">
                      {od.odType?.replace('_', ' ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                      {od.placeVisited || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {formatDate(od.fromDate)} - {formatDate(od.toDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${getStatusColor(od.status)}`}>
                        {od.status?.replace('_', ' ') || '-'}
                      </span>
                    </td>
                    {currentUser?.role !== 'employee' && (
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {od.assignedBy?.name || od.appliedBy?.name || 'Self'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(od.appliedAt)}
                    </td>
                  </tr>
                ))}
                {ods.length === 0 && (
                  <tr>
                    <td colSpan={currentUser?.role !== 'employee' ? 7 : 5} className="px-4 py-8 text-center text-slate-500">
                      No OD applications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="p-4 space-y-4">
            {/* Pending Leaves */}
            {pendingLeaves.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <CalendarIcon />
                  Pending Leaves ({pendingLeaves.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pendingLeaves.map((leave) => (
                    <div key={leave._id} className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800">

                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold dark:bg-blue-900/30 dark:text-blue-400">
                            {getEmployeeInitials({ employee_name: leave.employeeId?.employee_name || '', first_name: leave.employeeId?.first_name, last_name: leave.employeeId?.last_name, emp_no: '' } as any)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                              {leave.employeeId?.first_name} {leave.employeeId?.last_name}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <span>{leave.employeeId?.emp_no}</span>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {(leave.employeeId as any)?.department?.name && (
                                <>
                                  <span>•</span>
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  <span className="truncate max-w-[100px]">{(leave.employeeId as any)?.department?.name}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(leave.status)}`}>
                          {leave.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mb-4 space-y-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Type</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{leave.leaveType}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Duration</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{leave.numberOfDays} Day{leave.numberOfDays !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Dates</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 text-right">
                            {formatDate(leave.fromDate)}
                            {leave.fromDate !== leave.toDate && ` - ${formatDate(leave.toDate)}`}
                          </span>
                        </div>
                        {leave.purpose && (
                          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 italic">
                              "{leave.purpose}"
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {currentUser?.role !== 'employee' &&
                        !['approved', 'rejected', 'cancelled'].includes(leave.status) &&
                        !leave.status.includes('rejected') &&
                        !(currentUser?.role === 'hod' && leave.status === 'hod_approved') &&
                        !(currentUser?.role === 'hr' && leave.status === 'hr_approved') &&
                        ['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser?.role || '') && (
                          <div className="flex items-center gap-2 mt-auto">
                            <button
                              onClick={() => handleAction(leave._id, 'leave', 'approve')}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                              title="Approve Leave"
                            >
                              <CheckIcon /> Approve
                            </button>
                            <button
                              onClick={() => handleAction(leave._id, 'leave', 'reject')}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                              title="Reject Leave"
                            >
                              <XIcon /> Reject
                            </button>
                          </div>
                        )}
                      {canPerformAction(leave) && (
                        <div className="flex items-center gap-2 mt-auto">
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'approve')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                            title="Approve Leave"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'reject')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                            title="Reject Leave"
                          >
                            <XIcon /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending ODs */}
            {pendingODs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <BriefcaseIcon />
                  Pending ODs ({pendingODs.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pendingODs.map((od) => (
                    <div key={od._id} className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800">

                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 font-bold dark:bg-purple-900/30 dark:text-purple-400">
                            {getEmployeeInitials({ employee_name: od.employeeId?.employee_name || '', first_name: od.employeeId?.first_name, last_name: od.employeeId?.last_name, emp_no: '' } as any)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                              {od.employeeId?.first_name} {od.employeeId?.last_name}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <span>{od.employeeId?.emp_no}</span>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {(od.employeeId as any)?.department?.name && (
                                <>
                                  <span>•</span>
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  <span className="truncate max-w-[100px]">{(od.employeeId as any)?.department?.name}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(od.status)}`}>
                          {od.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mb-4 space-y-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Type</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{od.odType}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Duration</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{od.numberOfDays} Day{od.numberOfDays !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Dates</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300 text-right">
                            {formatDate(od.fromDate)}
                            {od.fromDate !== od.toDate && ` - ${formatDate(od.toDate)}`}
                          </span>
                        </div>
                        {od.purpose && (
                          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 italic">
                              "{od.purpose}"
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {canPerformAction(od) && (
                        <div className="flex items-center gap-2 mt-auto">
                          <button
                            onClick={() => handleAction(od._id, 'od', 'approve')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                            title="Approve OD"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(od._id, 'od', 'reject')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                            title="Reject OD"
                          >
                            <XIcon /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalPending === 0 && (
              <div className="text-center py-12 text-slate-500">
                No pending approvals
              </div>
            )}
          </div>
        )}


      </div>

      {/* Apply Leave/OD Dialog */}
      {showApplyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApplyDialog(false)} />
          <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            {/* Type Toggle */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setApplyType('leave')}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${applyType === 'leave'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <CalendarIcon />
                  Leave
                </span>
              </button>
              <button
                onClick={() => setApplyType('od')}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${applyType === 'od'
                  ? 'bg-purple-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <BriefcaseIcon />
                  On Duty
                </span>
              </button>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Apply for {applyType === 'leave' ? 'Leave' : 'On Duty'}
            </h2>

            <form onSubmit={handleApply} className="space-y-4">
              {/* Apply For - Employee Selection (Hidden for Employees) */}
              {currentUser?.role !== 'employee' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Apply For Employee *
                  </label>
                  <div className="relative">
                    {selectedEmployee ? (
                      <div className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                            {getEmployeeInitials(selectedEmployee)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">
                              {getEmployeeName(selectedEmployee)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {selectedEmployee.emp_no}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {selectedEmployee.department?.name && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300 rounded">
                                  {selectedEmployee.department.name}
                                </span>
                              )}
                              {selectedEmployee.designation?.name && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300 rounded">
                                  {selectedEmployee.designation.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmployee(null);
                            setFormData(prev => ({ ...prev, contactNumber: '' }));
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <XIcon />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <SearchIcon />
                        </div>
                        <input
                          type="text"
                          value={employeeSearch}
                          onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            setShowEmployeeDropdown(true);
                          }}
                          onFocus={() => setShowEmployeeDropdown(true)}
                          placeholder="Search by name, emp no, or department..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                        />

                        {/* Employee Dropdown */}
                        {showEmployeeDropdown && (
                          <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                            {filteredEmployees.length === 0 ? (
                              <div className="p-4 text-center text-sm text-slate-500">
                                {employeeSearch ? 'No employees found' : 'Type to search employees'}
                              </div>
                            ) : (
                              filteredEmployees.slice(0, 10).map((emp, idx) => (
                                <button
                                  key={emp._id || emp.emp_no || `emp-${idx}`}
                                  type="button"
                                  onClick={() => handleSelectEmployee(emp)}
                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 text-left transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                                >
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-sm font-medium">
                                    {getEmployeeInitials(emp)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 dark:text-white truncate">
                                      {getEmployeeName(emp)}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                      {emp.emp_no} • {emp.department?.name || 'No Department'} • {emp.designation?.name || 'No Designation'}
                                    </div>
                                  </div>
                                </button>
                              ))
                            )}
                            {filteredEmployees.length > 10 && (
                              <div className="px-4 py-2 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-900">
                                Showing 10 of {filteredEmployees.length} results. Type more to filter.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {applyType === 'leave' ? 'Leave Type' : 'OD Type'} *
                </label>
                {((applyType === 'leave' && leaveTypes.length === 1) || (applyType === 'od' && odTypes.length === 1)) ? (
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-700 dark:text-white">
                    <span className="font-medium">
                      {applyType === 'leave'
                        ? leaveTypes[0]?.name || leaveTypes[0]?.code
                        : odTypes[0]?.name || odTypes[0]?.code}
                    </span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">(Only type available)</span>
                  </div>
                ) : (
                  <select
                    value={applyType === 'leave' ? formData.leaveType : formData.odType}
                    onChange={(e) => {
                      if (applyType === 'leave') {
                        setFormData({ ...formData, leaveType: e.target.value });
                      } else {
                        setFormData({ ...formData, odType: e.target.value });
                      }
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Select {applyType === 'leave' ? 'leave' : 'OD'} type</option>
                    {(applyType === 'leave' ? leaveTypes : odTypes).map((type) => (
                      <option key={type.code} value={type.code}>{type.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* OD Type Extended Selector */}
              {applyType === 'od' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Duration Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, odType_extended: 'full_day', isHalfDay: false })}
                      className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${formData.odType_extended === 'full_day'
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                    >
                      Full Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, odType_extended: 'half_day', isHalfDay: true, halfDayType: formData.halfDayType || 'first_half' })}
                      className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${formData.odType_extended === 'half_day'
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                    >
                      Half Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, odType_extended: 'hours', isHalfDay: false })}
                      className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${formData.odType_extended === 'hours'
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                    >
                      Hours
                    </button>
                  </div>
                </div>
              )}

              {/* Date Selection Logic */}
              {((applyType === 'leave' && formData.isHalfDay) ||
                (applyType === 'od' && (formData.odType_extended === 'half_day' || formData.odType_extended === 'hours'))) ? (
                /* Single Date Input for Half Day / Specific Hours */
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date *</label>
                  <input
                    type="date"
                    value={formData.fromDate} // Use fromDate as the single source of truth
                    onChange={(e) => setFormData({ ...formData, fromDate: e.target.value, toDate: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              ) : (
                /* Two Date Inputs for Full Day */
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">From Date *</label>
                    <input
                      type="date"
                      value={formData.fromDate}
                      onChange={(e) => setFormData({ ...formData, fromDate: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">To Date *</label>
                    <input
                      type="date"
                      value={formData.toDate}
                      onChange={(e) => setFormData({ ...formData, toDate: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Hour-Based OD - Time Pickers */}
              {applyType === 'od' && formData.odType_extended === 'hours' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Time *</label>
                    <input
                      type="time"
                      value={formData.odStartTime || ''}
                      onChange={(e) => setFormData({ ...formData, odStartTime: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Time *</label>
                    <input
                      type="time"
                      value={formData.odEndTime || ''}
                      onChange={(e) => setFormData({ ...formData, odEndTime: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  {formData.odStartTime && formData.odEndTime && (
                    <div className="col-span-2 p-3 rounded-lg bg-white dark:bg-slate-800 border border-fuchsia-200 dark:border-fuchsia-700">
                      {(() => {
                        const [startH, startM] = formData.odStartTime!.split(':').map(Number);
                        const [endH, endM] = formData.odEndTime!.split(':').map(Number);
                        const startMin = startH * 60 + startM;
                        const endMin = endH * 60 + endM;

                        if (startMin >= endMin) {
                          return <p className="text-sm text-red-600 dark:text-red-400">⚠️ End time must be after start time</p>;
                        }

                        const durationMin = endMin - startMin;
                        const hours = Math.floor(durationMin / 60);
                        const mins = durationMin % 60;

                        if (durationMin > 480) {
                          return <p className="text-sm text-red-600 dark:text-red-400">⚠️ Maximum duration is 8 hours</p>;
                        }

                        return (
                          <p className="text-sm font-medium text-fuchsia-700 dark:text-fuchsia-300">
                            ✓ Duration: {hours}h {mins}m
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Half Day Selection (Leave Only - OD handled above via buttons) */}
              {applyType === 'leave' && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isHalfDay}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setFormData({ ...formData, isHalfDay: false, halfDayType: null });
                        } else {
                          // When toggling half-day on, sync toDate to fromDate and default to first_half
                          setFormData({ ...formData, isHalfDay: true, halfDayType: formData.halfDayType || 'first_half', toDate: formData.fromDate });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Half Day</span>
                  </label>
                  {formData.isHalfDay && (
                    <select
                      value={formData.halfDayType || 'first_half'}
                      onChange={(e) => setFormData({ ...formData, halfDayType: e.target.value as any })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="first_half">First Half</option>
                      <option value="second_half">Second Half</option>
                    </select>
                  )}
                </div>
              )}

              {/* Purpose */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Purpose *</label>
                <textarea
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  required
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Reason..."
                />
              </div>

              {/* OD Specific - Place & Evidence */}
              {applyType === 'od' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Place to Visit *</label>
                    <input
                      type="text"
                      value={formData.placeVisited}
                      onChange={(e) => setFormData({ ...formData, placeVisited: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder="Location"
                    />
                  </div>
                  <LocationPhotoCapture
                    required={(getModuleConfig('OD')?.settings as any)?.requirePhotoEvidence || false}
                    label="Photo Evidence"
                    onCapture={(loc, photo) => {
                      setEvidenceFile(photo.file);
                      setLocationData(loc);
                    }}
                    onClear={() => {
                      setEvidenceFile(null);
                      setLocationData(null);
                    }}
                  />
                </div>
              )}

              {/* Contact Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Contact Number *</label>
                <input
                  type="tel"
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApplyDialog(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl ${applyType === 'leave' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  Apply {applyType === 'leave' ? 'Leave' : 'OD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {showDetailDialog && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            {/* Header */}
            <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${detailType === 'leave'
              ? 'bg-gradient-to-r from-blue-500 to-indigo-500'
              : 'bg-gradient-to-r from-purple-500 to-red-500'
              }`}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {detailType === 'leave' ? (
                    <>
                      <CalendarIcon />
                      Leave Details
                    </>
                  ) : (
                    <>
                      <BriefcaseIcon />
                      OD Details
                    </>
                  )}
                </h2>
                <button
                  onClick={() => {
                    setShowDetailDialog(false);
                    setSelectedItem(null);
                    setIsChangeHistoryExpanded(false);
                  }}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              {/* Status Badge & Meta Info */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <span className={`px-5 py-2.5 text-sm font-bold rounded-2xl capitalize shadow-sm ${getStatusColor(selectedItem.status)}`}>
                    {selectedItem.status?.replace('_', ' ') || 'Unknown'}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Created: {formatDate((selectedItem as any).createdAt || selectedItem.appliedAt)}</span>
                  </div>
                </div>
              </div>

              {/* Employee Info Card */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-5">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg ${detailType === 'leave'
                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                    : 'bg-gradient-to-br from-purple-500 to-red-600'
                    }`}>
                    {(selectedItem.employeeId?.employee_name?.[0] || selectedItem.emp_no?.[0] || 'E').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xl text-slate-900 dark:text-white mb-1">
                      {selectedItem.employeeId?.employee_name || `${selectedItem.employeeId?.first_name || ''} ${selectedItem.employeeId?.last_name || ''}`.trim() || selectedItem.emp_no}
                    </h3>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                      {selectedItem.employeeId?.emp_no || selectedItem.emp_no}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.department?.name && (
                        <span className="px-3 py-1.5 text-xs font-semibold bg-white/80 dark:bg-slate-700/80 text-blue-700 dark:text-blue-300 rounded-xl shadow-sm inline-flex items-center gap-1.5 backdrop-blur-sm">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {selectedItem.department.name}
                        </span>
                      )}
                      {selectedItem.designation?.name && (
                        <span className="px-3 py-1.5 text-xs font-semibold bg-white/80 dark:bg-slate-700/80 text-green-700 dark:text-green-300 rounded-xl shadow-sm inline-flex items-center gap-1.5 backdrop-blur-sm">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {selectedItem.designation.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details Grid - Modern Cards */}
              <div className="grid grid-cols-2 gap-4">
                {/* Leave/OD Type */}
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-md hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${detailType === 'leave'
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-purple-100 dark:bg-purple-900/30'
                      }`}>
                      {detailType === 'leave' ? (
                        <CalendarIcon />
                      ) : (
                        <BriefcaseIcon />
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {detailType === 'leave' ? 'Leave Type' : 'OD Type'}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white capitalize ml-14">
                    {(detailType === 'leave'
                      ? (selectedItem as LeaveApplication).leaveType
                      : (selectedItem as ODApplication).odType
                    )?.replace('_', ' ') || '-'}
                  </p>
                </div>

                {/* Duration */}
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-md hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Duration
                    </p>
                  </div>
                  <div className="ml-14">
                    {detailType === 'od' && (selectedItem as any).odType_extended === 'hours' ? (
                      (() => {
                        const odItem = selectedItem as any;
                        const start = odItem.odStartTime || odItem.od_start_time || '';
                        const end = odItem.odEndTime || odItem.od_end_time || '';
                        if (start && end && typeof start === 'string' && typeof end === 'string') {
                          try {
                            const [sh, sm] = start.split(':').map(Number);
                            const [eh, em] = end.split(':').map(Number);
                            const sMin = sh * 60 + sm;
                            const eMin = eh * 60 + em;
                            if (isNaN(sMin) || isNaN(eMin) || eMin <= sMin) {
                              return <p className="text-lg font-bold text-slate-900 dark:text-white">Invalid times</p>;
                            }
                            const durationMin = eMin - sMin;
                            const hours = Math.floor(durationMin / 60);
                            const mins = durationMin % 60;
                            // Also show fractional days if available
                            const days = (odItem.numberOfDays !== undefined && odItem.numberOfDays !== null) ? odItem.numberOfDays : (durationMin / 60 / 8);
                            return (
                              <div>
                                <p className="text-lg font-bold text-slate-900 dark:text-white">{hours}h {mins}m</p>
                                <p className="text-sm font-normal text-slate-600 dark:text-slate-400">{start} - {end}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Hour-based OD</p>
                              </div>
                            );
                          } catch (e) {
                            return <p className="text-lg font-bold text-slate-900 dark:text-white">Invalid times</p>;
                          }
                        }
                        return <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedItem.numberOfDays} day{selectedItem.numberOfDays !== 1 ? 's' : ''}</p>;
                      })()
                    ) : (
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {selectedItem.numberOfDays} day{selectedItem.numberOfDays !== 1 ? 's' : ''}
                        {selectedItem.isHalfDay && (
                          <span className="text-sm font-normal text-slate-600 dark:text-slate-400 ml-1">
                            ({selectedItem.halfDayType?.replace('_', ' ')})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* From Date */}
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-md hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-100 dark:bg-green-900/30">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      From
                    </p>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white ml-14">
                    {formatDate(selectedItem.fromDate)}
                  </p>
                </div>

                {/* To Date */}
                <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-md hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      To
                    </p>
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white ml-14">
                    {formatDate(selectedItem.toDate)}
                  </p>
                </div>
              </div>

              {/* Purpose / Reason */}
              <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-md border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30">
                    <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Purpose / Reason
                  </p>
                </div>
                <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed ml-14">
                  {selectedItem.purpose || 'Not specified'}
                </p>
              </div>

              {/* OD Specific - Place Visited */}
              {detailType === 'od' && (selectedItem as ODApplication).placeVisited && (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-md border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                      <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Place Visited
                    </p>
                  </div>
                  <p className="text-base text-slate-700 dark:text-slate-300 ml-14">
                    {(selectedItem as ODApplication).placeVisited}
                  </p>
                </div>
              )}

              {/* Contact Number */}
              {selectedItem.contactNumber && (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-md border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-100 dark:bg-green-900/30">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Contact Number
                    </p>
                  </div>
                  <p className="text-base font-medium text-slate-700 dark:text-slate-300 ml-14">
                    {selectedItem.contactNumber}
                  </p>
                </div>
              )}

              {/* Split Breakdown (read-only) */}
              {detailType === 'leave' && (selectedItem as LeaveApplication)?.splits && (selectedItem as LeaveApplication).splits!.length > 0 && (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-md border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Approved Breakdown
                    </p>
                    {(selectedItem as LeaveApplication).splitSummary && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Approved {((selectedItem as LeaveApplication).splitSummary as LeaveSplitSummary)?.approvedDays ?? 0} / {(selectedItem as LeaveApplication).numberOfDays}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(selectedItem as LeaveApplication).splits!.map((split, idx) => (
                      <div key={split._id || `${split.date}-${idx}`} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{formatDate(split.date)}</span>
                          {split.isHalfDay && (
                            <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                              {split.halfDayType === 'first_half' ? 'First Half' : 'Second Half'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                            {split.leaveType}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${split.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'}`}>
                            {split.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Split Editor for approvers (Not for employees) */}
              {detailType === 'leave' && !['approved', 'rejected', 'cancelled'].includes(selectedItem.status) && currentUser?.role !== 'employee' && (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-md border border-slate-200 dark:border-slate-700 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Split & Approve</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Split days/half-days and assign leave types before approving.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={splitMode}
                        onChange={(e) => {
                          const enable = e.target.checked;
                          setSplitMode(enable);
                          if (enable && splitDrafts.length === 0 && detailType === 'leave' && selectedItem) {
                            setSplitDrafts(buildInitialSplits(selectedItem as LeaveApplication));
                          }
                          if (!enable) {
                            setSplitWarnings([]);
                            setSplitErrors([]);
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Enable split
                    </label>
                  </div>

                  {splitMode && (
                    <>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>Applied: {(selectedItem as LeaveApplication).numberOfDays} day(s)</span>
                        <span>|</span>
                        <span>
                          Approved in splits: {splitDrafts.filter(s => s.status === 'approved').reduce((sum, s) => sum + (s.isHalfDay ? 0.5 : 1), 0)}
                        </span>
                        <span>|</span>
                        <span>
                          Rejected in splits: {splitDrafts.filter(s => s.status === 'rejected').reduce((sum, s) => sum + (s.isHalfDay ? 0.5 : 1), 0)}
                        </span>
                      </div>

                      {splitErrors.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
                          {splitErrors.map((msg, idx) => (
                            <div key={idx}>• {msg}</div>
                          ))}
                        </div>
                      )}
                      {splitWarnings.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          {splitWarnings.map((msg, idx) => (
                            <div key={idx}>• {msg}</div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        {splitDrafts.map((split, idx) => (
                          <div key={`${split.date}-${idx}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-900/40">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(split.date)}</span>
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={split.isHalfDay || false}
                                    onChange={(e) => updateSplitDraft(idx, { isHalfDay: e.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  Half-day
                                </label>
                                {split.isHalfDay && (
                                  <select
                                    value={split.halfDayType || 'first_half'}
                                    onChange={(e) => updateSplitDraft(idx, { halfDayType: e.target.value as any })}
                                    className="text-xs rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  >
                                    <option value="first_half">First Half</option>
                                    <option value="second_half">Second Half</option>
                                  </select>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <select
                                  value={split.leaveType}
                                  onChange={(e) => updateSplitDraft(idx, { leaveType: e.target.value })}
                                  className="text-sm rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                >
                                  <option value="">Select Leave Type</option>
                                  {leaveTypes.map((lt) => (
                                    <option key={lt.code} value={lt.code}>
                                      {lt.name || lt.code}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={split.status}
                                  onChange={(e) => updateSplitDraft(idx, { status: e.target.value as 'approved' | 'rejected' })}
                                  className="text-sm rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                >
                                  <option value="approved">Approve</option>
                                  <option value="rejected">Reject</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setSplitSaving(true);
                            await validateSplitsForLeave();
                            setSplitSaving(false);
                          }}
                          className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {splitSaving ? 'Validating...' : 'Validate splits'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitDrafts(buildInitialSplits(selectedItem as LeaveApplication))}
                          className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          Reset to original
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setSplitSaving(true);
                            const saved = await saveSplits();
                            if (saved) {
                              toast.success('Splits saved');
                              const refreshed = await api.getLeave((selectedItem as LeaveApplication)._id);
                              if (refreshed?.success && refreshed.data) {
                                setSelectedItem(refreshed.data);
                                setSplitDrafts(buildInitialSplits(refreshed.data));
                              }
                            }
                            setSplitSaving(false);
                          }}
                          className="px-3 py-2 text-sm font-semibold text-white rounded-lg bg-indigo-600 hover:bg-indigo-700"
                        >
                          {splitSaving ? 'Saving...' : 'Save splits'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Change History */}
              {selectedItem.changeHistory && selectedItem.changeHistory.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    onClick={() => setIsChangeHistoryExpanded(!isChangeHistoryExpanded)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Change History ({selectedItem.changeHistory.length})
                    </span>
                    <svg
                      className={`w-5 h-5 text-slate-500 transition-transform ${isChangeHistoryExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isChangeHistoryExpanded && (
                    <div className="p-4 space-y-3">
                      {selectedItem.changeHistory.map((change: any, idx: number) => {
                        // Format date values
                        const formatValue = (value: any) => {
                          if (value === null || value === undefined) return 'N/A';
                          const str = String(value);
                          // Check if it's a date string
                          if (str.includes('T') || str.includes('-') && str.length > 10) {
                            try {
                              const date = new Date(str);
                              if (!isNaN(date.getTime())) {
                                return date.toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                });
                              }
                            } catch (e) {
                              // Not a valid date
                            }
                          }
                          return str;
                        };

                        const fieldName = change.field.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                        const oldValue = formatValue(change.originalValue);
                        const newValue = formatValue(change.newValue);

                        return (
                          <div key={idx} className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                                {fieldName}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {new Date(change.modifiedAt).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {/* Old and New Value in same line */}
                              <div className="text-sm text-slate-700 dark:text-slate-300">
                                <span className="text-slate-400 dark:text-slate-500 line-through mr-2">
                                  {oldValue}
                                </span>
                                <span className="text-green-600 dark:text-green-400 font-semibold">
                                  → {newValue}
                                </span>
                              </div>
                              {/* Modified By */}
                              {change.modifiedByName && (
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                  Modified by <span className="font-medium">{change.modifiedByName}</span>
                                  {change.modifiedByRole && (
                                    <span className="text-slate-500"> ({change.modifiedByRole})</span>
                                  )}
                                </div>
                              )}
                              {/* Reason */}
                              {change.reason && (
                                <div className="text-xs text-slate-600 dark:text-slate-400 italic pt-1 border-t border-slate-200 dark:border-slate-700">
                                  Reason: {change.reason}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Workflow History */}
              {selectedItem.workflow?.history && selectedItem.workflow.history.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-3">Approval History</p>
                  <div className="space-y-3">
                    {selectedItem.workflow.history
                      .filter((entry: any, idx: number, arr: any[]) => {
                        // Remove duplicates - check if same action, same timestamp, same person
                        return idx === arr.findIndex((e: any) =>
                          e.action === entry.action &&
                          e.actionBy?.toString() === entry.actionBy?.toString() &&
                          Math.abs(new Date(e.timestamp).getTime() - new Date(entry.timestamp).getTime()) < 1000
                        );
                      })
                      .map((entry: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 text-sm">
                          <div className={`w-2 h-2 mt-1.5 rounded-full ${entry.action === 'approved' ? 'bg-green-500' :
                            entry.action === 'rejected' ? 'bg-red-500' :
                              entry.action === 'forwarded' ? 'bg-blue-500' :
                                entry.action === 'revoked' ? 'bg-orange-500' :
                                  entry.action === 'status_changed' ? 'bg-purple-500' :
                                    'bg-slate-400'
                            }`} />
                          <div>
                            <span className="font-medium text-slate-900 dark:text-white capitalize">
                              {entry.action?.replace('_', ' ')}
                            </span>
                            <span className="text-slate-500"> by {entry.actionByName || 'Unknown'}</span>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(entry.timestamp).toLocaleString()}
                            </p>
                            {entry.comments && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                                "{entry.comments}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Action Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                {/* Revoke Button (if within 3 hours) - Not for employees */}
                {canRevoke && currentUser?.role !== 'employee' && (selectedItem.status === 'approved' || selectedItem.status === 'hod_approved' || selectedItem.status === 'hr_approved') && (
                  <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mb-2">
                      ⏰ Revoke Approval (Within 3 hours)
                    </p>
                    <textarea
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder="Reason for revocation (optional)..."
                      rows={2}
                      className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs dark:border-orange-700 dark:bg-slate-800 dark:text-white mb-2"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const response = detailType === 'leave'
                            ? await api.revokeLeaveApproval(selectedItem._id, revokeReason)
                            : await api.revokeODApproval(selectedItem._id, revokeReason);

                          if (response.success) {
                            Swal.fire({
                              icon: 'success',
                              title: 'Success!',
                              text: `${detailType === 'leave' ? 'Leave' : 'OD'} approval revoked successfully`,
                              timer: 2000,
                              showConfirmButton: false,
                            });
                            setShowDetailDialog(false);
                            setSelectedItem(null);
                            setIsChangeHistoryExpanded(false);
                            loadData();
                          } else {
                            Swal.fire({
                              icon: 'error',
                              title: 'Failed',
                              text: response.error || 'Failed to revoke approval',
                            });
                          }
                        } catch (err: any) {
                          Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: err.message || 'Failed to revoke approval',
                          });
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Revoke Approval
                    </button>
                  </div>
                )}

                {/* Edit Button (Employee ONLY) - Only active before HOD actions */}
                {['draft', 'pending'].includes(selectedItem.status) && currentUser?.role === 'employee' && (
                  <button
                    onClick={() => {
                      const odItem = selectedItem as any;
                      setEditFormData({
                        leaveType: (selectedItem as LeaveApplication).leaveType || '',
                        odType: (selectedItem as ODApplication).odType || '',
                        fromDate: formatDateForInput(selectedItem.fromDate),
                        toDate: formatDateForInput(selectedItem.toDate),
                        purpose: selectedItem.purpose,
                        contactNumber: selectedItem.contactNumber || '',
                        placeVisited: (selectedItem as ODApplication).placeVisited || '',
                        isHalfDay: selectedItem.isHalfDay || false,
                        halfDayType: selectedItem.halfDayType || null,
                        remarks: (selectedItem as any).remarks || '',
                        status: selectedItem.status, // Include status for Super Admin
                        // Hour-based OD fields
                        odType_extended: odItem.odType_extended || 'full_day',
                        odStartTime: odItem.odStartTime || odItem.od_start_time || '',
                        odEndTime: odItem.odEndTime || odItem.od_end_time || '',
                      });
                      setShowEditDialog(true);
                    }}
                    className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors"
                  >
                    Edit {detailType === 'leave' ? 'Leave' : 'OD'}
                  </button>
                )}

                {/* Approval Actions - HIDDEN for employees AND already forwarded/approved/rejected */}
                {/* Logic: Hide if final status OR (user is employee) OR (user is HOD and already forwarded) */}
                {/* Approval Actions - Dynamic based on workflow */}
                {!['approved', 'rejected', 'cancelled'].includes(selectedItem.status) &&
                  canPerformAction(selectedItem) && (
                    <>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Take Action</p>

                      {/* Comment */}
                      <textarea
                        value={actionComment}
                        onChange={(e) => setActionComment(e.target.value)}
                        placeholder="Add a comment (optional)..."
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        {/* Approve: Available to all approvers */}
                        {['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser?.role || '') && true && (
                          <button
                            onClick={() => handleDetailAction('approve')}
                            className="px-4 py-2 text-sm font-semibold text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors flex items-center gap-2"
                          >
                            <CheckIcon /> Approve
                          </button>
                        )}

                        {/* Reject: Available to all approvers */}
                        {['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser?.role || '') && true && (
                          <button
                            onClick={() => handleDetailAction('reject')}
                            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors flex items-center gap-2"
                          >
                            <XIcon /> Reject
                          </button>
                        )}

                        {/* Forward: HOD and Super Admin only */}
                        {(currentUser?.role === 'hod' || currentUser?.role === 'super_admin') && (
                          <button
                            onClick={() => handleDetailAction('forward')}
                            className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors"
                          >
                            Forward to HR
                          </button>
                        )}
                      </div>
                    </>
                  )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  setShowDetailDialog(false);
                  setSelectedItem(null);
                  setIsChangeHistoryExpanded(false);
                }}
                className="w-full px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditDialog(false)} />
          <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Edit {detailType === 'leave' ? 'Leave' : 'OD'}
            </h2>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const user = auth.getUser();

                // Clean up data before sending - convert empty strings to null for enum fields
                const cleanedData: any = {
                  ...editFormData,
                  // Fix halfDayType - must be null if not half day, or valid enum value
                  halfDayType: editFormData.isHalfDay
                    ? (editFormData.halfDayType || 'first_half')
                    : (editFormData.halfDayType === '' || editFormData.halfDayType === null ? null : editFormData.halfDayType),
                  // For hour-based OD, ensure times are properly set
                  odStartTime: (detailType === 'od' && editFormData.odType_extended === 'hours')
                    ? (editFormData.odStartTime || null)
                    : (editFormData.odStartTime === '' ? null : editFormData.odStartTime),
                  odEndTime: (detailType === 'od' && editFormData.odType_extended === 'hours')
                    ? (editFormData.odEndTime || null)
                    : (editFormData.odEndTime === '' ? null : editFormData.odEndTime),
                  changeReason: `Edited by ${user?.name || 'Admin'}`,
                };

                // If Super Admin is changing status, include statusChangeReason
                if (isSuperAdmin && editFormData.status && editFormData.status !== selectedItem.status) {
                  cleanedData.statusChangeReason = `Status changed from ${selectedItem.status} to ${editFormData.status}`;
                }

                const response = detailType === 'leave'
                  ? await api.updateLeave(selectedItem._id, cleanedData)
                  : await api.updateOD(selectedItem._id, cleanedData);

                if (response.success) {
                  Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: `${detailType === 'leave' ? 'Leave' : 'OD'} updated successfully`,
                    timer: 2000,
                    showConfirmButton: false,
                  });
                  setShowEditDialog(false);
                  setShowDetailDialog(false);
                  setSelectedItem(null);
                  setIsChangeHistoryExpanded(false);
                  loadData();
                } else {
                  Swal.fire({
                    icon: 'error',
                    title: 'Failed',
                    text: response.error || 'Failed to update',
                  });
                }
              } catch (err: any) {
                Swal.fire({
                  icon: 'error',
                  title: 'Error',
                  text: err.message || 'Failed to update',
                });
              }
            }} className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {detailType === 'leave' ? 'Leave Type' : 'OD Type'} *
                </label>
                <input
                  type="text"
                  value={detailType === 'leave' ? editFormData.leaveType : editFormData.odType}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    [detailType === 'leave' ? 'leaveType' : 'odType']: e.target.value,
                  })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">From Date *</label>
                  <input
                    type="date"
                    value={editFormData.fromDate}
                    onChange={(e) => {
                      const newFromDate = e.target.value;
                      // Auto-set end date = start date for half-day and hour-based OD
                      const newToDate = (detailType === 'od' && (editFormData.odType_extended === 'half_day' || editFormData.odType_extended === 'hours'))
                        ? newFromDate
                        : editFormData.toDate;
                      setEditFormData({ ...editFormData, fromDate: newFromDate, toDate: newToDate });
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    To Date *
                    {/* Today button for hour-based OD */}
                    {detailType === 'od' && editFormData.odType_extended === 'hours' && (
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setEditFormData({ ...editFormData, fromDate: today, toDate: today });
                        }}
                        className="ml-2 text-xs px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        Today
                      </button>
                    )}
                  </label>
                  <input
                    type="date"
                    value={editFormData.toDate}
                    onChange={(e) => {
                      // For half-day and hour-based OD, prevent changing end date separately
                      if (detailType === 'od' && (editFormData.odType_extended === 'half_day' || editFormData.odType_extended === 'hours')) {
                        // Auto-set to start date
                        setEditFormData({ ...editFormData, toDate: editFormData.fromDate });
                      } else {
                        setEditFormData({ ...editFormData, toDate: e.target.value });
                      }
                    }}
                    required
                    disabled={detailType === 'od' && (editFormData.odType_extended === 'half_day' || editFormData.odType_extended === 'hours')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed"
                  />
                  {detailType === 'od' && (editFormData.odType_extended === 'half_day' || editFormData.odType_extended === 'hours') && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      End date is automatically set to start date for {editFormData.odType_extended === 'half_day' ? 'half-day' : 'hour-based'} OD
                    </p>
                  )}
                </div>
              </div>

              {/* OD Duration Type (OD only) */}
              {detailType === 'od' && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">OD Duration Type *</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditFormData({ ...editFormData, odType_extended: 'full_day', isHalfDay: false, halfDayType: null, odStartTime: null, odEndTime: null })}
                      className={`p-3 rounded-lg border-2 transition-all ${editFormData.odType_extended === 'full_day'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Full Day</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const endDate = editFormData.fromDate || editFormData.toDate;
                        setEditFormData({
                          ...editFormData,
                          odType_extended: 'half_day',
                          isHalfDay: true,
                          halfDayType: editFormData.halfDayType || 'first_half',
                          odStartTime: null,
                          odEndTime: null,
                          toDate: endDate || editFormData.fromDate
                        });
                      }}
                      className={`p-3 rounded-lg border-2 transition-all ${editFormData.odType_extended === 'half_day'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Half Day</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const endDate = editFormData.fromDate || editFormData.toDate;
                        setEditFormData({
                          ...editFormData,
                          odType_extended: 'hours',
                          isHalfDay: false,
                          halfDayType: null,
                          toDate: endDate || editFormData.fromDate
                        });
                      }}
                      className={`p-3 rounded-lg border-2 transition-all ${editFormData.odType_extended === 'hours'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Specific Hours</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Hour Input (for hour-based OD) */}
              {detailType === 'od' && editFormData.odType_extended === 'hours' && (
                <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Time *</label>
                      <input
                        type="time"
                        value={editFormData.odStartTime || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, odStartTime: e.target.value })}
                        required={editFormData.odType_extended === 'hours'}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Time *</label>
                      <input
                        type="time"
                        value={editFormData.odEndTime || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, odEndTime: e.target.value })}
                        required={editFormData.odType_extended === 'hours'}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                  {editFormData.odStartTime && editFormData.odEndTime && (
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-300 dark:border-purple-600">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {(() => {
                          const [startHour, startMin] = editFormData.odStartTime.split(':').map(Number);
                          const [endHour, endMin] = editFormData.odEndTime.split(':').map(Number);
                          const startMinutes = startHour * 60 + startMin;
                          const endMinutes = endHour * 60 + endMin;
                          const durationMinutes = endMinutes - startMinutes;

                          if (durationMinutes <= 0) {
                            return <span className="text-red-600 dark:text-red-400">❌ End time must be after start time</span>;
                          }

                          const hours = Math.floor(durationMinutes / 60);
                          const mins = durationMinutes % 60;

                          if (durationMinutes > 480) {
                            return <span className="text-red-600 dark:text-red-400">❌ Maximum duration is 8 hours</span>;
                          }

                          return (
                            <span className="text-green-600 dark:text-green-400">
                              ✓ Duration: {hours}h {mins}m
                            </span>
                          );
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Half Day (for non-hour-based OD) */}
              {!(detailType === 'od' && editFormData.odType_extended === 'hours') && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.isHalfDay}
                      onChange={(e) => setEditFormData({ ...editFormData, isHalfDay: e.target.checked, halfDayType: e.target.checked ? (editFormData.halfDayType || 'first_half') : null })}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Half Day</span>
                  </label>
                  {editFormData.isHalfDay && (
                    <select
                      value={editFormData.halfDayType || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, halfDayType: e.target.value as 'first_half' | 'second_half' | null || null })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="first_half">First Half</option>
                      <option value="second_half">Second Half</option>
                    </select>
                  )}
                </div>
              )}

              {/* Purpose */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Purpose *</label>
                <textarea
                  value={editFormData.purpose}
                  onChange={(e) => setEditFormData({ ...editFormData, purpose: e.target.value })}
                  required
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Place Visited (OD only) */}
              {detailType === 'od' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Place Visited *</label>
                  <input
                    type="text"
                    value={editFormData.placeVisited}
                    onChange={(e) => setEditFormData({ ...editFormData, placeVisited: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              )}

              {/* Contact Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Contact Number *</label>
                <input
                  type="tel"
                  value={editFormData.contactNumber}
                  onChange={(e) => setEditFormData({ ...editFormData, contactNumber: e.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Remarks</label>
                <input
                  type="text"
                  value={editFormData.remarks}
                  onChange={(e) => setEditFormData({ ...editFormData, remarks: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Status (Super Admin only) */}
              {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Status (Super Admin)
                  </label>
                  <select
                    value={editFormData.status || selectedItem.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="hod_approved">HOD Approved</option>
                    <option value="hr_approved">HR Approved</option>
                    <option value="approved">Approved</option>
                    <option value="hod_rejected">HOD Rejected</option>
                    <option value="hr_rejected">HR Rejected</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

