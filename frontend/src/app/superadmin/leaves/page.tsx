'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

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
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  appliedBy?: { _id: string; name: string; email: string };
  workflow?: {
    nextApprover?: string;
    history?: any[];
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

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function LeavesPage() {
  const [activeTab, setActiveTab] = useState<'leaves' | 'od' | 'pending'>('leaves');
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [ods, setODs] = useState<ODApplication[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveApplication[]>([]);
  const [pendingODs, setPendingODs] = useState<ODApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dialog states
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyType, setApplyType] = useState<'leave' | 'od'>('leave');
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LeaveApplication | ODApplication | null>(null);
  const [detailType, setDetailType] = useState<'leave' | 'od'>('leave');
  const [actionComment, setActionComment] = useState('');

  // Leave types and OD types
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [odTypes, setODTypes] = useState<any[]>([]);

  // Employees for "Apply For" selection
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

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
  });

  useEffect(() => {
    loadData();
    loadTypes();
    loadEmployees();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
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
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
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

  const loadEmployees = async () => {
    try {
      const response = await api.getEmployees({ is_active: true });
      if (response.success) {
        setEmployees(response.data || []);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  // Filter employees based on search
  const filteredEmployees = employees.filter((emp) => {
    const searchLower = employeeSearch.toLowerCase();
    const fullName = getEmployeeName(emp).toLowerCase();
    return (
      fullName.includes(searchLower) ||
      emp.emp_no?.toLowerCase().includes(searchLower) ||
      emp.department?.name?.toLowerCase().includes(searchLower)
    );
  });

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate employee selection
    if (!selectedEmployee) {
      setError('Please select an employee');
      return;
    }

    try {
      let response;
      const contactNum = formData.contactNumber || selectedEmployee.phone_number || '';
      
      if (applyType === 'leave') {
        response = await api.applyLeave({
          empNo: selectedEmployee.emp_no, // Use emp_no as primary identifier
          leaveType: formData.leaveType,
          fromDate: formData.fromDate,
          toDate: formData.toDate,
          purpose: formData.purpose,
          contactNumber: contactNum,
          isHalfDay: formData.isHalfDay,
          halfDayType: formData.isHalfDay ? formData.halfDayType : null,
          remarks: formData.remarks,
        });
      } else {
        response = await api.applyOD({
          empNo: selectedEmployee.emp_no, // Use emp_no as primary identifier
          odType: formData.odType,
          fromDate: formData.fromDate,
          toDate: formData.toDate,
          purpose: formData.purpose,
          placeVisited: formData.placeVisited,
          contactNumber: contactNum,
          isHalfDay: formData.isHalfDay,
          halfDayType: formData.isHalfDay ? formData.halfDayType : null,
          remarks: formData.remarks,
          isAssigned: true, // Mark as assigned by admin
        });
      }

      if (response.success) {
        const empName = getEmployeeName(selectedEmployee);
        setSuccess(`${applyType === 'leave' ? 'Leave' : 'OD'} applied successfully for ${empName}`);
        setShowApplyDialog(false);
        resetForm();
        loadData();
      } else {
        setError(response.error || 'Failed to apply');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply');
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
        setSuccess(`${type === 'leave' ? 'Leave' : 'OD'} ${action}ed successfully`);
        loadData();
      } else {
        setError(response.error || 'Action failed');
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  };

  const resetForm = () => {
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
    });
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
  };

  const handleSelectEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
    // Pre-fill contact number if available
    const phone = employee.phone_number || employee.phone_number;
    if (phone) {
      setFormData(prev => ({ ...prev, contactNumber: phone }));
    }
  };

  const openApplyDialog = (type: 'leave' | 'od') => {
    setApplyType(type);
    
    // Reset form first
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
    });
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

  const openDetailDialog = (item: LeaveApplication | ODApplication, type: 'leave' | 'od') => {
    setSelectedItem(item);
    setDetailType(type);
    setActionComment('');
    setShowDetailDialog(true);
  };

  const handleDetailAction = async (action: 'approve' | 'reject' | 'forward' | 'cancel') => {
    if (!selectedItem) return;
    
    try {
      setError('');
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
        setSuccess(`${detailType === 'leave' ? 'Leave' : 'OD'} ${action}${action === 'cancel' ? 'led' : 'ed'} successfully`);
        setShowDetailDialog(false);
        setSelectedItem(null);
        loadData();
      } else {
        setError(response.error || `Failed to ${action}`);
      }
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    }
  };

  const totalPending = pendingLeaves.length + pendingODs.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Leave & OD Management</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage leave applications and on-duty requests
            </p>
          </div>
          <button
            onClick={() => openApplyDialog('leave')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
          >
            <PlusIcon />
            Apply Leave / OD
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          {success}
          <button onClick={() => setSuccess('')} className="float-right">×</button>
        </div>
      )}

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
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
              <ClockIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{totalPending}</div>
              <div className="text-sm text-slate-500">Pending Approvals</div>
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
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'leaves'
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
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'od'
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
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'pending'
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Employee</th>
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
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {leave.employeeId?.employee_name || `${leave.employeeId?.first_name || ''} ${leave.employeeId?.last_name || ''}`.trim() || leave.emp_no}
                      </div>
                      <div className="text-xs text-slate-500">{leave.employeeId?.emp_no || leave.emp_no}</div>
                    </td>
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
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {leave.appliedBy?.name || 'Self'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(leave.appliedAt)}
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Place</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Applied By</th>
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
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {od.employeeId?.employee_name || `${od.employeeId?.first_name || ''} ${od.employeeId?.last_name || ''}`.trim() || od.emp_no}
                      </div>
                      <div className="text-xs text-slate-500">{od.employeeId?.emp_no || od.emp_no}</div>
                    </td>
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
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {od.assignedBy?.name || od.appliedBy?.name || 'Self'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(od.appliedAt)}
                    </td>
                  </tr>
                ))}
                {ods.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
                <div className="space-y-3">
                  {pendingLeaves.map((leave) => (
                    <div key={leave._id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {leave.employeeId?.first_name} {leave.employeeId?.last_name}
                            </span>
                            <span className="text-xs text-slate-500">({leave.employeeId?.emp_no})</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(leave.status)}`}>
                              {leave.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                            <div><strong>Type:</strong> {leave.leaveType} | <strong>Days:</strong> {leave.numberOfDays}</div>
                            <div><strong>From:</strong> {formatDate(leave.fromDate)} <strong>To:</strong> {formatDate(leave.toDate)}</div>
                            <div><strong>Reason:</strong> {leave.purpose}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'approve')}
                            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 flex items-center gap-1"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'reject')}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 flex items-center gap-1"
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
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <BriefcaseIcon />
                  Pending ODs ({pendingODs.length})
                </h3>
                <div className="space-y-3">
                  {pendingODs.map((od) => (
                    <div key={od._id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {od.employeeId?.first_name} {od.employeeId?.last_name}
                            </span>
                            <span className="text-xs text-slate-500">({od.employeeId?.emp_no})</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(od.status)}`}>
                              {od.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                            <div><strong>Type:</strong> {od.odType} | <strong>Days:</strong> {od.numberOfDays}</div>
                            <div><strong>Place:</strong> {od.placeVisited}</div>
                            <div><strong>From:</strong> {formatDate(od.fromDate)} <strong>To:</strong> {formatDate(od.toDate)}</div>
                            <div><strong>Purpose:</strong> {od.purpose}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(od._id, 'od', 'approve')}
                            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 flex items-center gap-1"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(od._id, 'od', 'reject')}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 flex items-center gap-1"
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
                onClick={() => setApplyType('od')}
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

            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Apply for {applyType === 'leave' ? 'Leave' : 'On Duty'}
            </h2>

            <form onSubmit={handleApply} className="space-y-4">
              {/* Apply For - Employee Selection */}
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
                    value={formData.halfDayType}
                    onChange={(e) => setFormData({ ...formData, halfDayType: e.target.value })}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="first_half">First Half</option>
                    <option value="second_half">Second Half</option>
                  </select>
                )}
              </div>

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
                <div className="flex gap-4 text-sm text-slate-500">
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
                    {(selectedItem.employeeId?.employee_name?.[0] || selectedItem.emp_no?.[0] || 'E').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-lg text-slate-900 dark:text-white">
                      {selectedItem.employeeId?.employee_name || `${selectedItem.employeeId?.first_name || ''} ${selectedItem.employeeId?.last_name || ''}`.trim() || selectedItem.emp_no}
                    </p>
                    <p className="text-sm text-slate-500">{selectedItem.employeeId?.emp_no || selectedItem.emp_no}</p>
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
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
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
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Duration</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedItem.numberOfDays} day{selectedItem.numberOfDays !== 1 ? 's' : ''}
                    {selectedItem.isHalfDay && ` (${selectedItem.halfDayType?.replace('_', ' ')})`}
                  </p>
                </div>

                {/* From Date */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">From</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedItem.fromDate)}
                  </p>
                </div>

                {/* To Date */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">To</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedItem.toDate)}
                  </p>
                </div>
              </div>

              {/* Purpose */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Purpose / Reason</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedItem.purpose || 'Not specified'}
                </p>
              </div>

              {/* OD Specific Fields */}
              {detailType === 'od' && (selectedItem as ODApplication).placeVisited && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Place Visited</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {(selectedItem as ODApplication).placeVisited}
                  </p>
                </div>
              )}

              {/* Contact Number */}
              {selectedItem.contactNumber && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Contact Number</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {selectedItem.contactNumber}
                  </p>
                </div>
              )}

              {/* Workflow History */}
              {selectedItem.workflow?.history && selectedItem.workflow.history.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-3">Approval History</p>
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
              {!['approved', 'rejected', 'cancelled'].includes(selectedItem.status) && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
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

