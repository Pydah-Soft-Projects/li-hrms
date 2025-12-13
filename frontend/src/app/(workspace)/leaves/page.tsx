'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';

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
  contactNumber: string;
  status: string;
  originalLeaveType?: string;
  splitStatus?: 'pending_split' | 'split_approved' | 'split_rejected' | null;
  splits?: LeaveSplit[];
  splitSummary?: LeaveSplitSummary | null;
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  createdAt?: string;
  appliedBy?: { _id: string; name: string; email: string };
  workflow?: {
    nextApprover: string;
    history: any[];
  };
}

interface ODApplication {
  _id: string;
  employeeId?: { 
    _id: string; 
    employee_name?: string; 
    first_name?: string; 
    last_name?: string; 
    emp_no: string;
  };
  emp_no?: string;
  odType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  isHalfDay?: boolean;
  halfDayType?: string;
  // NEW: Hour-based OD fields
  odType_extended?: string;
  odStartTime?: string;
  odEndTime?: string;
  durationHours?: number;
  purpose: string;
  placeVisited: string;
  contactNumber: string;
  status: string;
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  createdAt?: string;
  appliedBy?: { _id: string; name: string; email: string };
  assignedBy?: { name: string };
  workflow?: {
    nextApprover: string;
    history: any[];
  };
}

// Helper to get display name
const getEmployeeName = (emp: LeaveApplication['employeeId'] | ODApplication['employeeId']) => {
  if (!emp) return 'Unknown';
  if (emp.employee_name) return emp.employee_name;
  if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
  if (emp.first_name) return emp.first_name;
  return emp.emp_no || 'Unknown';
};

// Helper to get initials
const getEmployeeInitials = (emp: LeaveApplication['employeeId'] | ODApplication['employeeId']) => {
  const name = getEmployeeName(emp);
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (name[0] || 'E').toUpperCase();
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300';
    case 'hod_approved':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
    case 'rejected':
    case 'hod_rejected':
    case 'hr_rejected':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
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
  // If ISO with time, take only the date portion to avoid TZ shifts
  const datePart = str.includes('T') ? str.split('T')[0] : str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return new Date(`${datePart}T00:00:00`);
  }
  // Fallback
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
    if (Number.isNaN(t) || t < start || t > end) return; // skip outside range
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

  let current = new Date(start);
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

interface Employee {
  _id: string;
  employee_name: string;
  emp_no: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
  phone_number?: string;
  first_name?: string;
  last_name?: string;
}

// Helper to get display name for Employee interface
const getEmployeeDisplayName = (emp: Employee) => {
  if (emp.employee_name) return emp.employee_name;
  if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
  if (emp.first_name) return emp.first_name;
  return emp.emp_no;
};

// Helper to get initials for Employee interface
const getEmployeeDisplayInitials = (emp: Employee) => {
  const name = getEmployeeDisplayName(emp);
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (name[0] || 'E').toUpperCase();
};

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

export default function LeavesPage() {
  const { activeWorkspace, hasPermission, getModuleConfig } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'leaves' | 'od' | 'pending'>('leaves');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [ods, setODs] = useState<ODApplication[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveApplication[]>([]);
  const [pendingODs, setPendingODs] = useState<ODApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<LeaveSplit[]>([]);
  const [splitWarnings, setSplitWarnings] = useState<string[]>([]);
  const [splitErrors, setSplitErrors] = useState<string[]>([]);
  const [splitSaving, setSplitSaving] = useState(false);

  // Dialog states
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyType, setApplyType] = useState<'leave' | 'od'>('leave');
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LeaveApplication | ODApplication | null>(null);
  const [detailType, setDetailType] = useState<'leave' | 'od'>('leave');
  const [actionComment, setActionComment] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    leaveType: '',
    odType: '',
    fromDate: '',
    toDate: '',
    purpose: '',
    contactNumber: '',
    placeVisited: '',
    isHalfDay: false,
    halfDayType: '',
    remarks: '',
    // NEW: Hour-based OD fields
    odType_extended: 'full_day', // 'full_day' | 'half_day' | 'hours'
    odStartTime: '',
    odEndTime: '',
  });

  // Types from settings
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [odTypes, setODTypes] = useState<any[]>([]);

  // Employee selection state (for applying leave for others)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  // Separate permissions for Leave and OD
  const [canApplyLeaveForSelf, setCanApplyLeaveForSelf] = useState(false);
  const [canApplyLeaveForOthers, setCanApplyLeaveForOthers] = useState(false);
  const [canApplyODForSelf, setCanApplyODForSelf] = useState(false);
  const [canApplyODForOthers, setCanApplyODForOthers] = useState(false);
  // Legacy support - combined permissions (for backward compatibility)
  const [canApplyForSelf, setCanApplyForSelf] = useState(false);
  const [canApplyForOthers, setCanApplyForOthers] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const leaveModuleConfig = getModuleConfig('LEAVE');
  const odModuleConfig = getModuleConfig('OD');
  const canCreateLeave = hasPermission('LEAVE', 'canCreate');
  const canCreateOD = hasPermission('OD', 'canCreate');
  const canApprove = hasPermission('LEAVE', 'canApprove') || hasPermission('OD', 'canApprove');
  const dataScope = leaveModuleConfig?.dataScope || odModuleConfig?.dataScope || 'own';
  
  // Debug: Log module configuration
  console.log('[Workspace Leaves] Module configs - LEAVE:', leaveModuleConfig, 'OD:', odModuleConfig);
  console.log('[Workspace Leaves] Module permissions - canCreateLeave:', canCreateLeave, 'canCreateOD:', canCreateOD);

  useEffect(() => {
    loadData();
    loadTypes();
    loadCurrentUser();
    checkWorkspacePermission();
  }, [activeWorkspace]);

  // Debug: Log permission changes
  useEffect(() => {
    console.log('[Workspace Leaves] Permissions updated - Leave:', { self: canApplyLeaveForSelf, others: canApplyLeaveForOthers }, 'OD:', { self: canApplyODForSelf, others: canApplyODForOthers });
    console.log('[Workspace Leaves] Module permissions - canCreateLeave:', canCreateLeave, 'canCreateOD:', canCreateOD);
    
    // Check button display conditions
    const showLeaveOnly = (canApplyLeaveForSelf || canApplyLeaveForOthers) && canCreateLeave && !canCreateOD;
    const showODOnly = (canApplyODForSelf || canApplyODForOthers) && !canCreateLeave && canCreateOD;
    const showCombined = ((canApplyLeaveForSelf || canApplyLeaveForOthers) || (canApplyODForSelf || canApplyODForOthers)) && canCreateLeave && canCreateOD;
    
    console.log('[Workspace Leaves] Button display conditions:');
    console.log('  - Show Leave Only:', showLeaveOnly, '| Condition:', `(${canApplyLeaveForSelf || canApplyLeaveForOthers}) && ${canCreateLeave} && !${canCreateOD}`);
    console.log('  - Show OD Only:', showODOnly, '| Condition:', `(${canApplyODForSelf || canApplyODForOthers}) && !${canCreateLeave} && ${canCreateOD}`);
    console.log('  - Show Combined:', showCombined, '| Condition:', `(${(canApplyLeaveForSelf || canApplyLeaveForOthers) || (canApplyODForSelf || canApplyODForOthers)}) && ${canCreateLeave} && ${canCreateOD}`);
    console.log('[Workspace Leaves] Dialog type toggle will show:', canCreateLeave && canCreateOD);
  }, [canApplyLeaveForSelf, canApplyLeaveForOthers, canApplyODForSelf, canApplyODForOthers, canCreateLeave, canCreateOD]);

  // Close employee dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showEmployeeDropdown && !target.closest('.employee-dropdown-container')) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmployeeDropdown]);

  // Load employees when permission is enabled and user is loaded
  useEffect(() => {
    if (canApplyForOthers && currentUser) {
      loadEmployees();
    }
  }, [canApplyForOthers, currentUser, activeWorkspace]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      // Load based on data scope
      if (dataScope === 'own') {
        // Load user's own leaves/ODs
        const [leavesRes, odsRes] = await Promise.all([
          api.getMyLeaves(),
          api.getMyODs().catch(() => ({ success: false, data: [] })),
        ]);

        if (leavesRes.success) setLeaves(leavesRes.data || []);
        if (odsRes.success) setODs(odsRes.data || []);
      } else {
        // Load all leaves/ODs (for HR/HOD)
        const [leavesRes, odsRes, pendingLeavesRes, pendingODsRes] = await Promise.all([
          api.getLeaves({ limit: 50 }).catch(() => ({ success: false, data: [] })),
          api.getODs({ limit: 50 }).catch(() => ({ success: false, data: [] })),
          api.getPendingLeaveApprovals().catch(() => ({ success: false, data: [] })),
          api.getPendingODApprovals().catch(() => ({ success: false, data: [] })),
        ]);

        if (leavesRes.success) setLeaves(leavesRes.data || []);
        if (odsRes.success) setODs(odsRes.data || []);
        if (pendingLeavesRes.success) setPendingLeaves(pendingLeavesRes.data || []);
        if (pendingODsRes.success) setPendingODs(pendingODsRes.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
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
      console.log('[Workspace Leaves] Checking permissions for workspace:', workspaceId, activeWorkspace?.name);
      
      if (!workspaceId) {
        console.log('[Workspace Leaves] No workspace ID found');
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

      // Get department IDs from user
      const departmentIds: string[] = [];
      
      // HR can have multiple departments
      if (currentUser.role === 'hr' && currentUser.departments) {
        // If departments array exists, use it
        if (Array.isArray(currentUser.departments)) {
          departmentIds.push(...currentUser.departments.map((d: any) => typeof d === 'string' ? d : d._id));
        }
      } 
      // HOD has single department
      else if (currentUser.role === 'hod' && currentUser.department) {
        departmentIds.push(typeof currentUser.department === 'string' ? currentUser.department : currentUser.department._id);
      }
      // Sub-admin or Super-admin can see all
      else if (currentUser.role === 'sub_admin' || currentUser.role === 'super_admin') {
        // Load all employees
        const response = await api.getEmployees({ is_active: true });
        if (response.success) {
          setEmployees(response.data || []);
        }
        return;
      }

      // Load employees filtered by departments
      if (departmentIds.length > 0) {
        const allEmployees: Employee[] = [];
        for (const deptId of departmentIds) {
          const response = await api.getEmployees({ is_active: true, department_id: deptId });
          if (response.success && response.data) {
            allEmployees.push(...response.data);
          }
        }
        // Remove duplicates
        const uniqueEmployees = allEmployees.filter((emp, index, self) => 
          index === self.findIndex((e) => e._id === emp._id)
        );
        setEmployees(uniqueEmployees);
      } else {
        setEmployees([]);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
      setEmployees([]);
    }
  };

  const loadTypes = async () => {
    try {
      const [leaveSettingsRes, odSettingsRes] = await Promise.all([
        api.getLeaveSettings('leave'),
        api.getLeaveSettings('od'),
      ]);

      let fetchedLeaveTypes: any[] = [];
      if (leaveSettingsRes.success && leaveSettingsRes.data?.types) {
        fetchedLeaveTypes = leaveSettingsRes.data.types.filter((t: any) => t.isActive !== false);
      }

      let fetchedODTypes: any[] = [];
      if (odSettingsRes.success && odSettingsRes.data?.types) {
        fetchedODTypes = odSettingsRes.data.types.filter((t: any) => t.isActive !== false);
      }

      if (fetchedLeaveTypes.length > 0) {
        setLeaveTypes(fetchedLeaveTypes);
      } else {
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
        setODTypes([
          { code: 'OFFICIAL', name: 'Official Work' },
          { code: 'TRAINING', name: 'Training' },
          { code: 'MEETING', name: 'Meeting' },
          { code: 'CLIENT', name: 'Client Visit' },
        ]);
      }
    } catch (err) {
      console.error('Failed to load types:', err);
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
  const filteredEmployees = employees.filter((emp) => {
    const searchLower = employeeSearch.toLowerCase();
    const fullName = getEmployeeDisplayName(emp).toLowerCase();
    return (
      fullName.includes(searchLower) ||
      emp.emp_no?.toLowerCase().includes(searchLower) ||
      emp.department?.name?.toLowerCase().includes(searchLower)
    );
  });

  const openApplyDialog = (type: 'leave' | 'od') => {
    setApplyType(type);
    setFormData({
      leaveType: '',
      odType: '',
      fromDate: '',
      toDate: '',
      purpose: '',
      contactNumber: '',
      placeVisited: '',
      isHalfDay: false,
      halfDayType: '',
      remarks: '',
      // NEW: Hour-based OD fields
      odType_extended: 'full_day',
      odStartTime: '',
      odEndTime: '',
    });
    
    // Reset employee selection
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);

    // Auto-select if only one type available
    if (type === 'leave' && leaveTypes.length === 1) {
      setFormData(prev => ({ ...prev, leaveType: leaveTypes[0].code }));
    } else if (type === 'od' && odTypes.length === 1) {
      setFormData(prev => ({ ...prev, odType: odTypes[0].code }));
    }

    setShowApplyDialog(true);
  };

  const handleSelectEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
    // Pre-fill contact number if available
    if (employee.phone_number) {
      setFormData(prev => ({ ...prev, contactNumber: employee.phone_number || '' }));
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check permissions based on apply type
    const canApplySelf = applyType === 'leave' ? canApplyLeaveForSelf : canApplyODForSelf;
    const canApplyOthers = applyType === 'leave' ? canApplyLeaveForOthers : canApplyODForOthers;
    
    // If canApplyForOthers is enabled, require employee selection
    // If only canApplyForSelf is enabled, don't require employee selection (applies for self)
    if (canApplyOthers && !canApplySelf && !selectedEmployee) {
      setError('Please select an employee');
      return;
    }
    // If both are enabled, employee selection is optional (can apply for self or others)

    try {
      let response;
      // Send empNo only if:
      // 1. canApplyForOthers is enabled AND
      // 2. An employee is selected
      // Otherwise, backend will use the logged-in user's employee
      const empNo = (canApplyOthers && selectedEmployee) ? selectedEmployee.emp_no : undefined;

      if (applyType === 'leave') {
        if (!formData.leaveType || !formData.fromDate || !formData.toDate || !formData.purpose) {
          setError('Please fill all required fields');
          return;
        }
        response = await api.applyLeave({
          ...(empNo && { empNo }), // Only send empNo if applying for others
          leaveType: formData.leaveType,
          fromDate: formData.fromDate,
          toDate: formData.toDate,
          purpose: formData.purpose,
          contactNumber: formData.contactNumber,
          isHalfDay: formData.isHalfDay,
          halfDayType: formData.isHalfDay ? formData.halfDayType : null,
          remarks: formData.remarks,
        });
      } else {
        if (!formData.odType || !formData.fromDate || !formData.toDate || !formData.purpose || !formData.placeVisited) {
          setError('Please fill all required fields');
          return;
        }

        // Validate hours input if selected
        if (formData.odType_extended === 'hours') {
          if (!formData.odStartTime || !formData.odEndTime) {
            setError('Please select start and end times for OD');
            return;
          }
        }

        response = await api.applyOD({
          ...(empNo && { empNo }), // Only send empNo if applying for others
          odType: formData.odType,
          fromDate: formData.fromDate,
          toDate: formData.toDate,
          purpose: formData.purpose,
          placeVisited: formData.placeVisited,
          contactNumber: formData.contactNumber,
          isHalfDay: formData.isHalfDay,
          halfDayType: formData.isHalfDay ? formData.halfDayType : null,
          remarks: formData.remarks,
          // NEW: Hour-based OD fields
          odType_extended: formData.odType_extended,
          odStartTime: formData.odType_extended === 'hours' ? formData.odStartTime : null,
          odEndTime: formData.odType_extended === 'hours' ? formData.odEndTime : null,
        });
      }

      if (response.success) {
        const empName = (canApplyOthers && selectedEmployee) ? getEmployeeDisplayName(selectedEmployee) : 'yourself';
        const appliedFor = (canApplyOthers && selectedEmployee) ? `for ${empName}` : 'for yourself';
        setSuccess(`${applyType === 'leave' ? 'Leave' : 'OD'} applied successfully ${appliedFor}`);
        setShowApplyDialog(false);
        setFormData({
          leaveType: '',
          odType: '',
          fromDate: '',
          toDate: '',
          purpose: '',
          contactNumber: '',
          placeVisited: '',
          isHalfDay: false,
          halfDayType: '',
          remarks: '',
          // NEW
          odType_extended: 'full_day',
          odStartTime: '',
          odEndTime: '',
        });
        setSelectedEmployee(null);
        setEmployeeSearch('');
        setShowEmployeeDropdown(false);
        loadData();
      } else {
        setError(response.error || 'Failed to apply');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply');
    }
  };

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

      let enrichedItem = item;
      if (type === 'leave') {
        const response = await api.getLeave(item._id);
        if (response?.success && response.data) {
          enrichedItem = response.data;
        }
        const initialSplits = buildInitialSplits(enrichedItem as LeaveApplication);
        setSplitDrafts(initialSplits);
        setSplitMode(Boolean((enrichedItem as LeaveApplication)?.splits?.length));
      }

      setSelectedItem(enrichedItem);
      setDetailType(type);
      setShowDetailDialog(true);
    } catch (err: any) {
      console.error('Failed to load leave details', err);
      setError(err.message || 'Failed to load leave details');
    }
  };

  const updateSplitDraft = (index: number, updates: Partial<LeaveSplit>) => {
    setSplitDrafts((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const next = { ...row, ...updates };
        // Normalize numberOfDays based on half-day selection
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

      const resp: any = await api.validateLeaveSplits(selectedItem._id, payload);
      const isValid = resp?.isValid ?? resp?.success;
      const errors = resp?.errors || [];
      const warnings = resp?.warnings || [];
      if (!resp?.success && isValid === false) {
        setSplitErrors(errors.length ? errors : ['Validation failed']);
      } else {
        setSplitErrors(errors);
      }
      setSplitWarnings(warnings);
      return resp;
    } catch (err: any) {
      setSplitErrors([err.message || 'Failed to validate splits']);
      return null;
    }
  };

  const saveSplits = async () => {
    if (detailType !== 'leave' || !selectedItem) return false;
    const validation: any = await validateSplitsForLeave();
    if (!validation || (validation.isValid !== undefined && validation.isValid === false)) {
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

      const resp: any = await api.createLeaveSplits(selectedItem._id, payload);
      const errors = resp?.errors || [];
      const warnings = resp?.warnings || [];
      if (!resp?.success) {
        setSplitErrors(errors.length ? errors : ['Failed to save splits']);
        setSplitWarnings(warnings);
        return false;
      }

      setSplitWarnings(warnings);
      return true;
    } catch (err: any) {
      setSplitErrors([err.message || 'Failed to save splits']);
      return false;
    }
  };

  const handleDetailAction = async (action: 'approve' | 'reject' | 'forward') => {
    if (!selectedItem) return;

    try {
      setError('');
      if (detailType === 'leave' && action === 'approve' && splitMode) {
        setSplitSaving(true);
        const saved = await saveSplits();
        if (!saved) {
          setSplitSaving(false);
          return;
        }
      }
      let response;

      if (detailType === 'leave') {
        response = await api.processLeaveAction(selectedItem._id, action, actionComment);
      } else {
        response = await api.processODAction(selectedItem._id, action, actionComment);
      }

      if (response.success) {
        setSuccess(`${detailType === 'leave' ? 'Leave' : 'OD'} ${action}ed successfully`);
        setShowDetailDialog(false);
        setSelectedItem(null);
        loadData();
      } else {
        setError(response.error || `Failed to ${action}`);
      }
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setSplitSaving(false);
    }
  };

  const handleAction = async (id: string, type: 'leave' | 'od', action: 'approve' | 'reject', comments: string = '') => {
    if (!canApprove) {
      setError('You do not have permission to perform this action');
      return;
    }

    try {
      let response;
      if (type === 'leave') {
        response = await api.processLeaveAction(id, action, comments);
      } else {
        response = await api.processODAction(id, action, comments);
      }

      if (response.success) {
        setSuccess(`${type === 'leave' ? 'Leave' : 'OD'} ${action}ed successfully`);
        loadData();
      } else {
        setError(response.error || 'Action failed');
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  };

  const totalPending = pendingLeaves.length + pendingODs.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leave & OD Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {dataScope === 'own' && 'View and manage your leave and OD requests'}
            {dataScope === 'department' && 'Manage leave and OD requests in your department'}
            {dataScope === 'all' && 'Manage all leave and OD requests'}
          </p>
        </div>
        {/* Smart Button Display Logic - Use workspace permissions instead of module-level permissions */}
        {/* Determine if user has permissions for Leave and/or OD based on workspace permissions */}
        {(() => {
          const hasLeavePermission = (canApplyLeaveForSelf || canApplyLeaveForOthers);
          const hasODPermission = (canApplyODForSelf || canApplyODForOthers);
          const hasBothPermissions = hasLeavePermission && hasODPermission;
          const hasOnlyLeave = hasLeavePermission && !hasODPermission;
          const hasOnlyOD = !hasLeavePermission && hasODPermission;
          
          console.log('[Workspace Leaves] Button display check:', { hasLeavePermission, hasODPermission, hasBothPermissions, hasOnlyLeave, hasOnlyOD });
          
          // Show combined button if user has permissions for both Leave and OD
          if (hasBothPermissions) {
            return (
              <button
                onClick={() => openApplyDialog('leave')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
              >
                <PlusIcon />
                Apply Leave / OD
              </button>
            );
          }
          
          // Show Leave-only button if user only has Leave permission
          if (hasOnlyLeave) {
            return (
              <button
                onClick={() => openApplyDialog('leave')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
              >
                <PlusIcon />
                Apply Leave
              </button>
            );
          }
          
          // Show OD-only button if user only has OD permission
          if (hasOnlyOD) {
            return (
              <button
                onClick={() => openApplyDialog('od')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
              >
                <PlusIcon />
                Apply OD
              </button>
            );
          }
          
          return null;
        })()}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-700 hover:text-green-900">×</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300">
              <CalendarIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{leaves.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Leaves</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-300">
              <BriefcaseIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{ods.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total ODs</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center text-yellow-600 dark:text-yellow-300">
              <ClockIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totalPending}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Pending Approvals</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-300">
              <CheckIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {leaves.filter(l => l.status === 'approved').length + ods.filter(o => o.status === 'approved').length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'leaves'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <CalendarIcon />
              Leaves ({leaves.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('od')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'od'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <BriefcaseIcon />
              On Duty ({ods.length})
            </span>
          </button>
          {canApprove && (
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
                activeTab === 'pending'
                  ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <ClockIcon />
                Pending Approvals ({totalPending})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* View Toggle for Leaves Tab */}
      {activeTab === 'leaves' && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                List View
              </span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                viewMode === 'calendar'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <CalendarIcon />
                Calendar View
              </span>
            </button>
          </div>
          
          {/* Month/Year Selector for Calendar */}
          {viewMode === 'calendar' && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2">
              <button
                onClick={() => {
                  const newDate = new Date(calendarDate);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setCalendarDate(newDate);
                }}
                className="rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <select
                value={calendarDate.getMonth() + 1}
                onChange={(e) => {
                  const newDate = new Date(calendarDate);
                  newDate.setMonth(parseInt(e.target.value) - 1);
                  setCalendarDate(newDate);
                }}
                className="rounded-md border-0 bg-transparent px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0 dark:text-white"
              >
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((name, idx) => (
                  <option key={idx} value={idx + 1}>{name}</option>
                ))}
              </select>
              <select
                value={calendarDate.getFullYear()}
                onChange={(e) => {
                  const newDate = new Date(calendarDate);
                  newDate.setFullYear(parseInt(e.target.value));
                  setCalendarDate(newDate);
                }}
                className="rounded-md border-0 bg-transparent px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0 dark:text-white"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const newDate = new Date(calendarDate);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setCalendarDate(newDate);
                }}
                className="rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {activeTab === 'leaves' && viewMode === 'list' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  {dataScope !== 'own' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Employee
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Applied Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {leaves.map((leave) => (
                  <tr 
                    key={leave._id} 
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => openDetailDialog(leave, 'leave')}
                  >
                    {dataScope !== 'own' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300 font-medium text-sm">
                            {getEmployeeInitials(leave.employeeId)}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {getEmployeeName(leave.employeeId)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{leave.employeeId?.emp_no || leave.emp_no}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 capitalize">
                      {leave.leaveType?.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(leave.fromDate)} - {formatDate(leave.toDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {leave.numberOfDays}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(leave.status)}`}>
                        {leave.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(leave.appliedAt)}
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={dataScope !== 'own' ? 6 : 5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No leave applications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'leaves' && viewMode === 'calendar' && (
          <div className="p-6">
            {(() => {
              const year = calendarDate.getFullYear();
              const month = calendarDate.getMonth();
              const firstDay = new Date(year, month, 1);
              const lastDay = new Date(year, month + 1, 0);
              const daysInMonth = lastDay.getDate();
              const startingDayOfWeek = firstDay.getDay();
              
              // Get leaves for this month
              const monthLeaves = leaves.filter((leave) => {
                const fromDate = new Date(leave.fromDate);
                const toDate = new Date(leave.toDate);
                return (
                  (fromDate.getFullYear() === year && fromDate.getMonth() === month) ||
                  (toDate.getFullYear() === year && toDate.getMonth() === month) ||
                  (fromDate <= firstDay && toDate >= lastDay)
                );
              });

              // Helper to get leave for a specific date
              const getLeaveForDate = (day: number) => {
                const date = new Date(year, month, day);
                return monthLeaves.find((leave) => {
                  const fromDate = new Date(leave.fromDate);
                  const toDate = new Date(leave.toDate);
                  fromDate.setHours(0, 0, 0, 0);
                  toDate.setHours(23, 59, 59, 999);
                  date.setHours(0, 0, 0, 0);
                  return date >= fromDate && date <= toDate;
                });
              };

              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              
              return (
                <div>
                  <div className="grid grid-cols-7 gap-2 mb-4">
                    {dayNames.map((day) => (
                      <div key={day} className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: startingDayOfWeek }).map((_, idx) => (
                      <div key={`empty-${idx}`} className="aspect-square"></div>
                    ))}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const leave = getLeaveForDate(day);
                      const isToday = 
                        day === new Date().getDate() &&
                        month === new Date().getMonth() &&
                        year === new Date().getFullYear();
                      
                      return (
                        <div
                          key={day}
                          onClick={() => leave && openDetailDialog(leave, 'leave')}
                          className={`aspect-square rounded-lg border-2 p-2 transition-all ${
                            leave
                              ? 'cursor-pointer hover:scale-105 border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                              : 'border-gray-200 dark:border-slate-700'
                          } ${
                            isToday ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
                          }`}
                        >
                          <div className="flex flex-col h-full">
                            <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                              {day}
                            </div>
                            {leave && (
                              <div className="flex-1 flex flex-col justify-center">
                                <div className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
                                  {leave.leaveType}
                                </div>
                                <div className={`text-[10px] px-1.5 py-0.5 rounded mt-1 ${getStatusColor(leave.status)}`}>
                                  {leave.status?.replace('_', ' ')}
                                </div>
                                {dataScope !== 'own' && leave.employeeId && (
                                  <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 truncate">
                                    {getEmployeeName(leave.employeeId)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Legend */}
                  <div className="mt-6 flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded border-2 border-blue-400 bg-blue-50 dark:bg-blue-900/30"></div>
                      <span className="text-gray-600 dark:text-gray-400">Leave Day</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded border-2 border-emerald-500 ring-2 ring-emerald-500 ring-offset-2"></div>
                      <span className="text-gray-600 dark:text-gray-400">Today</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'od' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  {dataScope !== 'own' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Employee
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Place
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Applied Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {ods.map((od) => (
                  <tr 
                    key={od._id} 
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => openDetailDialog(od, 'od')}
                  >
                    {dataScope !== 'own' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-300 font-medium text-sm">
                            {getEmployeeInitials(od.employeeId)}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {getEmployeeName(od.employeeId)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{od.employeeId?.emp_no || od.emp_no}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 capitalize">
                      {od.odType?.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                      {od.placeVisited}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(od.fromDate)} - {formatDate(od.toDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(od.status)}`}>
                        {od.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(od.appliedAt)}
                    </td>
                  </tr>
                ))}
                {ods.length === 0 && (
                  <tr>
                    <td colSpan={dataScope !== 'own' ? 6 : 5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No OD applications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'pending' && canApprove && (
          <div className="p-6 space-y-4">
            {/* Pending Leaves */}
            {pendingLeaves.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <CalendarIcon />
                  Pending Leaves ({pendingLeaves.length})
                </h3>
                <div className="space-y-3">
                  {pendingLeaves.map((leave) => (
                    <div 
                      key={leave._id} 
                      className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      onClick={() => openDetailDialog(leave, 'leave')}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {getEmployeeName(leave.employeeId)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">({leave.employeeId?.emp_no || leave.emp_no})</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(leave.status)}`}>
                              {leave.status?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            <div><strong>Type:</strong> {leave.leaveType} | <strong>Days:</strong> {leave.numberOfDays}</div>
                            <div><strong>From:</strong> {formatDate(leave.fromDate)} <strong>To:</strong> {formatDate(leave.toDate)}</div>
                            <div><strong>Reason:</strong> {leave.purpose}</div>
                          </div>
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'approve')}
                            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 dark:bg-green-900/50 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/70 flex items-center gap-1"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'reject')}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 dark:bg-red-900/50 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/70 flex items-center gap-1"
                          >
                            <XIcon /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending ODs */}
            {pendingODs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <BriefcaseIcon />
                  Pending ODs ({pendingODs.length})
                </h3>
                <div className="space-y-3">
                  {pendingODs.map((od) => (
                    <div 
                      key={od._id} 
                      className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      onClick={() => openDetailDialog(od, 'od')}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {getEmployeeName(od.employeeId)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">({od.employeeId?.emp_no || od.emp_no})</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(od.status)}`}>
                              {od.status?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            <div><strong>Type:</strong> {od.odType} | <strong>Days:</strong> {od.numberOfDays}</div>
                            <div><strong>Place:</strong> {od.placeVisited}</div>
                            <div><strong>From:</strong> {formatDate(od.fromDate)} <strong>To:</strong> {formatDate(od.toDate)}</div>
                            <div><strong>Purpose:</strong> {od.purpose}</div>
                          </div>
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAction(od._id, 'od', 'approve')}
                            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 dark:bg-green-900/50 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/70 flex items-center gap-1"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(od._id, 'od', 'reject')}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 dark:bg-red-900/50 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/70 flex items-center gap-1"
                          >
                            <XIcon /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalPending === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
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
            {/* Type Toggle - Show if user has permissions for both Leave and OD (workspace-level) */}
            {((canApplyLeaveForSelf || canApplyLeaveForOthers) && (canApplyODForSelf || canApplyODForOthers)) && (
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setApplyType('leave');
                    setFormData(prev => ({
                      ...prev,
                      leaveType: leaveTypes.length === 1 ? leaveTypes[0].code : '',
                      odType: '',
                    }));
                  }}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                    applyType === 'leave'
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
                  type="button"
                  onClick={() => {
                    setApplyType('od');
                    setFormData(prev => ({
                      ...prev,
                      odType: odTypes.length === 1 ? odTypes[0].code : '',
                      leaveType: '',
                    }));
                  }}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                    applyType === 'od'
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
            )}

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Apply for {applyType === 'leave' ? 'Leave' : 'On Duty'}
            </h2>

            <form onSubmit={handleApply} className="space-y-4">

              {/* Apply For - Employee Selection */}
              {((applyType === 'leave' && canApplyLeaveForOthers) || (applyType === 'od' && canApplyODForOthers)) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Apply For Employee *
                  </label>
                  <div className="relative">
                    {selectedEmployee ? (
                      <div className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                            {getEmployeeDisplayInitials(selectedEmployee)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">
                              {getEmployeeDisplayName(selectedEmployee)}
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
                                    {getEmployeeDisplayInitials(emp)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 dark:text-white truncate">
                                      {getEmployeeDisplayName(emp)}
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
                {/* Show as non-editable text if only one type exists */}
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

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">From Date *</label>
                  <input
                    type="date"
                    value={formData.fromDate}
                    onChange={(e) => {
                      const newFromDate = e.target.value;
                      // Auto-set end date = start date for half-day and hour-based OD
                      const newToDate = (applyType === 'od' && (formData.odType_extended === 'half_day' || formData.odType_extended === 'hours'))
                        ? newFromDate
                        : formData.toDate;
                      setFormData({ ...formData, fromDate: newFromDate, toDate: newToDate });
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    To Date *
                    {/* Today button for hour-based OD */}
                    {applyType === 'od' && formData.odType_extended === 'hours' && (
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setFormData({ ...formData, fromDate: today, toDate: today });
                        }}
                        className="ml-2 text-xs px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        Today
                      </button>
                    )}
                  </label>
                  <input
                    type="date"
                    value={formData.toDate}
                    onChange={(e) => {
                      // For half-day and hour-based OD, prevent changing end date separately
                      if (applyType === 'od' && (formData.odType_extended === 'half_day' || formData.odType_extended === 'hours')) {
                        // Auto-set to start date
                        setFormData({ ...formData, toDate: formData.fromDate });
                      } else {
                        setFormData({ ...formData, toDate: e.target.value });
                      }
                    }}
                    required
                    disabled={applyType === 'od' && (formData.odType_extended === 'half_day' || formData.odType_extended === 'hours')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed"
                  />
                  {applyType === 'od' && (formData.odType_extended === 'half_day' || formData.odType_extended === 'hours') && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      End date is automatically set to start date for {formData.odType_extended === 'half_day' ? 'half-day' : 'hour-based'} OD
                    </p>
                  )}
                </div>
              </div>

              {/* Half Day */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isHalfDay}
                    onChange={(e) => setFormData({ ...formData, isHalfDay: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Half Day</span>
                </label>
                {formData.isHalfDay && (
                  <select
                    value={formData.halfDayType || 'first_half'}
                    onChange={(e) => setFormData({ ...formData, halfDayType: e.target.value })}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="first_half">First Half</option>
                    <option value="second_half">Second Half</option>
                  </select>
                )}
              </div>

              {/* OD Type Selection (Full Day / Half Day / Hours) - NEW */}
              {applyType === 'od' && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">OD Duration Type *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Full Day */}
                    <button
                      type="button"
                  onClick={() => setFormData({ ...formData, odType_extended: 'full_day', isHalfDay: false, halfDayType: '', odStartTime: '', odEndTime: '' })}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        formData.odType_extended === 'full_day'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Full Day</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Complete day</div>
                    </button>

                    {/* Half Day */}
                    <button
                      type="button"
                      onClick={() => {
                        // Auto-set end date = start date for half-day OD
                        const endDate = formData.fromDate || formData.toDate;
                        setFormData({ 
                          ...formData, 
                          odType_extended: 'half_day', 
                          isHalfDay: true, 
                          halfDayType: formData.halfDayType || 'first_half',
                          odStartTime: '', 
                          odEndTime: '',
                          toDate: endDate || formData.fromDate // Set end date = start date
                        });
                      }}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        formData.odType_extended === 'half_day'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Half Day</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">4 hours</div>
                    </button>

                    {/* Hours */}
                    <button
                      type="button"
                      onClick={() => {
                        // Auto-set end date = start date for hour-based OD
                        const endDate = formData.fromDate || formData.toDate;
                        setFormData({ 
                          ...formData, 
                          odType_extended: 'hours', 
                          isHalfDay: false,
                          halfDayType: '',
                          toDate: endDate || formData.fromDate, // Set end date = start date
                          odStartTime: '',
                          odEndTime: '',
                        });
                      }}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        formData.odType_extended === 'hours'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Specific Hours</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Custom duration</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Hours Input (NEW) */}
              {applyType === 'od' && formData.odType_extended === 'hours' && (
                <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Start Time */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Time *</label>
                      <input
                        type="time"
                        value={formData.odStartTime}
                        onChange={(e) => setFormData({ ...formData, odStartTime: e.target.value })}
                        required={formData.odType_extended === 'hours'}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    {/* End Time */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Time *</label>
                      <input
                        type="time"
                        value={formData.odEndTime}
                        onChange={(e) => setFormData({ ...formData, odEndTime: e.target.value })}
                        required={formData.odType_extended === 'hours'}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Duration Display */}
                  {formData.odStartTime && formData.odEndTime && (
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-300 dark:border-purple-600">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {(() => {
                          const [startHour, startMin] = formData.odStartTime.split(':').map(Number);
                          const [endHour, endMin] = formData.odEndTime.split(':').map(Number);
                          const startMinutes = startHour * 60 + startMin;
                          const endMinutes = endHour * 60 + endMin;
                          const durationMinutes = endMinutes - startMinutes;
                          
                          if (durationMinutes <= 0) {
                            return <span className="text-red-600 dark:text-red-400">❌ End time must be after start time</span>;
                          }
                          
                          const hours = Math.floor(durationMinutes / 60);
                          const minutes = durationMinutes % 60;
                          
                          if (durationMinutes > 480) {
                            return <span className="text-red-600 dark:text-red-400">❌ Maximum duration is 8 hours</span>;
                          }
                          
                          return (
                            <span className="text-green-600 dark:text-green-400">
                              ✓ Duration: {hours}h {minutes}m
                            </span>
                          );
                        })()}
                      </p>
                    </div>
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
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder={`Reason for ${applyType === 'leave' ? 'leave' : 'OD'}...`}
                />
              </div>

              {/* Place Visited (OD only) */}
              {applyType === 'od' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Place to Visit *</label>
                  <input
                    type="text"
                    value={formData.placeVisited}
                    onChange={(e) => setFormData({ ...formData, placeVisited: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="Location/Place name"
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
                  placeholder="Contact number during leave/OD"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Remarks (Optional)</label>
                <input
                  type="text"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Any additional remarks"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowApplyDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl ${
                    applyType === 'leave'
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600'
                      : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                  }`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            {/* Header */}
            <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
              detailType === 'leave' 
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500' 
                : 'bg-gradient-to-r from-purple-500 to-pink-500'
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
                  }}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Status Badge & Dates */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`px-4 py-2 text-sm font-semibold rounded-xl capitalize ${getStatusColor(selectedItem.status)}`}>
                  {selectedItem.status?.replace('_', ' ') || 'Unknown'}
                </span>
                <div className="flex gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <span>Created: {formatDate((selectedItem as any).createdAt || selectedItem.appliedAt)}</span>
                  <span>Applied: {formatDate(selectedItem.appliedAt)}</span>
                </div>
              </div>

              {/* Employee Info */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Employee Details</h3>
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${
                    detailType === 'leave' ? 'bg-blue-500' : 'bg-purple-500'
                  }`}>
                    {getEmployeeInitials(selectedItem.employeeId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-lg text-slate-900 dark:text-white">
                      {getEmployeeName(selectedItem.employeeId)}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{selectedItem.employeeId?.emp_no || selectedItem.emp_no}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedItem.department?.name && (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-lg inline-flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {selectedItem.department.name}
                        </span>
                      )}
                      {selectedItem.designation?.name && (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded-lg inline-flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {selectedItem.designation.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">
                    {detailType === 'leave' ? 'Leave Type' : 'OD Type'}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">
                    {(detailType === 'leave' 
                      ? (selectedItem as LeaveApplication).leaveType 
                      : (selectedItem as ODApplication).odType
                    )?.replace('_', ' ') || '-'}
                  </p>
                </div>

                {/* Duration */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Duration</p>
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
                            return <p className="text-sm font-medium text-slate-900 dark:text-white">Invalid times</p>;
                          }
                          const durationMin = eMin - sMin;
                          const hours = Math.floor(durationMin / 60);
                          const mins = durationMin % 60;
                          return (
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{hours}h {mins}m</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{start} - {end}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Hour-based OD</p>
                            </div>
                          );
                        } catch (e) {
                          return <p className="text-sm font-medium text-slate-900 dark:text-white">Invalid times</p>;
                        }
                      }
                      return <p className="text-sm font-medium text-slate-900 dark:text-white">{selectedItem.numberOfDays} day{selectedItem.numberOfDays !== 1 ? 's' : ''}</p>;
                    })()
                  ) : (
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedItem.numberOfDays} day{selectedItem.numberOfDays !== 1 ? 's' : ''}
                    {selectedItem.isHalfDay && ` (${selectedItem.halfDayType?.replace('_', ' ')})`}
                  </p>
                  )}
                </div>

                {/* From Date */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">From</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedItem.fromDate)}
                  </p>
                </div>

                {/* To Date */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">To</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedItem.toDate)}
                  </p>
                </div>
              </div>

              {/* Purpose */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Purpose / Reason</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedItem.purpose || 'Not specified'}
                </p>
              </div>

              {/* OD Specific Fields */}
              {detailType === 'od' && (
                <>
                  {(selectedItem as ODApplication).placeVisited && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Place Visited</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {(selectedItem as ODApplication).placeVisited}
                      </p>
                    </div>
                  )}
                  
                  {/* Assigned By - OD specific */}
                  {(selectedItem as ODApplication).assignedBy && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Assigned By</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {(selectedItem as ODApplication).assignedBy?.name || 'Not specified'}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Applied By - Show for both Leave and OD */}
              {(selectedItem as LeaveApplication).appliedBy && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Applied By</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {(selectedItem as LeaveApplication).appliedBy?.name || (selectedItem as LeaveApplication).appliedBy?.email || 'Unknown'}
                  </p>
                </div>
              )}

              {/* Contact Number */}
              {selectedItem.contactNumber && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Contact Number</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {selectedItem.contactNumber}
                  </p>
                </div>
              )}

              {/* Split Breakdown (read-only for employees) */}
              {detailType === 'leave' && (selectedItem as LeaveApplication)?.splits && (selectedItem as LeaveApplication).splits!.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Approved Breakdown</p>
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

              {/* Split Editor for approvers */}
              {detailType === 'leave' && canApprove && !['approved', 'rejected', 'cancelled'].includes(selectedItem.status) && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Split & Approve</p>
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

                      {/* Validation messages */}
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
                              setSuccess('Splits saved');
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

              {/* Workflow History */}
              {selectedItem.workflow?.history && selectedItem.workflow.history.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-3">Approval History</p>
                  <div className="space-y-3">
                    {selectedItem.workflow.history.map((entry: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 text-sm">
                        <div className={`w-2 h-2 mt-1.5 rounded-full ${
                          entry.action === 'approved' ? 'bg-green-500' :
                          entry.action === 'rejected' ? 'bg-red-500' :
                          entry.action === 'forwarded' ? 'bg-blue-500' : 'bg-slate-400'
                        }`} />
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white capitalize">
                            {entry.action}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400"> by {entry.actionByName || 'Unknown'}</span>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
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
              {canApprove && !['approved', 'rejected', 'cancelled'].includes(selectedItem.status) && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Take Action</p>
                  
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
                    <button
                      onClick={() => handleDetailAction('approve')}
                      className="px-4 py-2 text-sm font-semibold text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors flex items-center gap-2"
                    >
                      <CheckIcon /> Approve
                    </button>
                    <button
                      onClick={() => handleDetailAction('reject')}
                      className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors flex items-center gap-2"
                    >
                      <XIcon /> Reject
                    </button>
                    <button
                      onClick={() => handleDetailAction('forward')}
                      className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors"
                    >
                      Forward to HR
                    </button>
                  </div>
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={() => {
                  setShowDetailDialog(false);
                  setSelectedItem(null);
                }}
                className="w-full px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
