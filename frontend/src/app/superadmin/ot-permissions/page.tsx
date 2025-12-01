'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
}

interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  duration: number;
}

interface ConfusedShift {
  _id: string;
  employeeNumber: string;
  date: string;
  inTime: string;
  outTime?: string;
  possibleShifts: Array<{
    shiftId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
  }>;
  requiresManualSelection: boolean;
}

interface OTRequest {
  _id: string;
  employeeId: Employee;
  employeeNumber: string;
  date: string;
  shiftId: Shift;
  otInTime: string;
  otOutTime: string;
  otHours: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: { name: string; email: string };
  approvedBy?: { name: string; email: string };
  rejectedBy?: { name: string; email: string };
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  comments?: string;
}

interface PermissionRequest {
  _id: string;
  employeeId: Employee;
  employeeNumber: string;
  date: string;
  permissionStartTime: string;
  permissionEndTime: string;
  permissionHours: number;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: { name: string; email: string };
  approvedBy?: { name: string; email: string };
  rejectedBy?: { name: string; email: string };
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  qrCode?: string;
  outpassUrl?: string;
  comments?: string;
}

export default function OTAndPermissionsPage() {
  const [activeTab, setActiveTab] = useState<'ot' | 'permissions'>('ot');
  const [loading, setLoading] = useState(false);
  const [otRequests, setOTRequests] = useState<OTRequest[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  
  // Filters
  const [otFilters, setOTFilters] = useState({ status: '', employeeNumber: '', startDate: '', endDate: '' });
  const [permissionFilters, setPermissionFilters] = useState({ status: '', employeeNumber: '', startDate: '', endDate: '' });
  
  // Dialogs
  const [showOTDialog, setShowOTDialog] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedQR, setSelectedQR] = useState<PermissionRequest | null>(null);
  
  // Form data
  const [otFormData, setOTFormData] = useState({
    employeeId: '',
    employeeNumber: '',
    date: new Date().toISOString().split('T')[0],
    otOutTime: '',
    shiftId: '',
    manuallySelectedShiftId: '',
    comments: '',
  });
  
  const [permissionFormData, setPermissionFormData] = useState({
    employeeId: '',
    employeeNumber: '',
    date: new Date().toISOString().split('T')[0],
    permissionStartTime: '',
    permissionEndTime: '',
    purpose: '',
    comments: '',
  });
  
  const [confusedShift, setConfusedShift] = useState<ConfusedShift | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [permissionValidationError, setPermissionValidationError] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [activeTab, otFilters, permissionFilters]);

  // Auto-fetch attendance when OT dialog opens with employee and date
  useEffect(() => {
    if (showOTDialog && otFormData.employeeId && otFormData.employeeNumber && otFormData.date && !attendanceData && !attendanceLoading) {
      handleEmployeeSelect(otFormData.employeeId, otFormData.employeeNumber, otFormData.date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOTDialog]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'ot') {
        const otRes = await api.getOTRequests(otFilters);
        if (otRes.success) {
          setOTRequests(otRes.data || []);
        }
      } else {
        const permRes = await api.getPermissions(permissionFilters);
        if (permRes.success) {
          setPermissions(permRes.data || []);
        }
      }
      
      // Load employees and shifts
      const [employeesRes, shiftsRes] = await Promise.all([
        api.getEmployees({ is_active: true }),
        api.getShifts(),
      ]);
      
      if (employeesRes.success) {
        setEmployees(employeesRes.data || []);
      }
      
      if (shiftsRes.success) {
        setShifts(shiftsRes.data || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSelect = async (employeeId: string, employeeNumber: string, date: string) => {
    const employee = employees.find(e => e._id === employeeId);
    setSelectedEmployee(employee || null);
    setValidationError('');
    setAttendanceData(null);
    setConfusedShift(null);
    setSelectedShift(null);
    
    if (!employeeId || !employeeNumber || !date) {
      return;
    }

    setAttendanceLoading(true);
    try {
      // Fetch attendance detail for the selected employee and date
      const attendanceRes = await api.getAttendanceDetail(employeeNumber, date);
      
      if (attendanceRes.success && attendanceRes.data) {
        const attendance = attendanceRes.data;
        setAttendanceData(attendance);
        
        // Check for ConfusedShift
        const confusedRes = await api.checkConfusedShift(employeeNumber, date);
        if (confusedRes.success && (confusedRes as any).hasConfusedShift) {
          setConfusedShift((confusedRes as any).data);
          setOTFormData(prev => ({ ...prev, employeeId, employeeNumber, date }));
        } else {
          // Get shift from attendance
          if (attendance.shiftId) {
            const shiftId = typeof attendance.shiftId === 'string' ? attendance.shiftId : attendance.shiftId._id;
            const shift = shifts.find(s => s._id === shiftId);
            if (shift) {
              setSelectedShift(shift);
              setOTFormData(prev => ({ ...prev, employeeId, employeeNumber, date, shiftId: shift._id }));
              
              // Auto-suggest OT out time (shift end time + 1 hour as default)
              const [endHour, endMin] = shift.endTime.split(':').map(Number);
              const suggestedOutTime = new Date(date);
              suggestedOutTime.setHours(endHour + 1, endMin, 0, 0);
              const suggestedOutTimeStr = suggestedOutTime.toISOString().slice(0, 16);
              setOTFormData(prev => ({ ...prev, otOutTime: suggestedOutTimeStr }));
            } else {
              // Shift not found in shifts list, try to get from attendance data
              if (attendance.shiftId && typeof attendance.shiftId === 'object') {
                const shiftData = attendance.shiftId;
                setSelectedShift({
                  _id: shiftData._id,
                  name: shiftData.name || 'Unknown',
                  startTime: shiftData.startTime || '',
                  endTime: shiftData.endTime || '',
                  duration: shiftData.duration || 0,
                });
                setOTFormData(prev => ({ ...prev, employeeId, employeeNumber, date, shiftId: shiftData._id }));
                
                // Auto-suggest OT out time
                if (shiftData.endTime) {
                  const [endHour, endMin] = shiftData.endTime.split(':').map(Number);
                  const suggestedOutTime = new Date(date);
                  suggestedOutTime.setHours(endHour + 1, endMin, 0, 0);
                  const suggestedOutTimeStr = suggestedOutTime.toISOString().slice(0, 16);
                  setOTFormData(prev => ({ ...prev, otOutTime: suggestedOutTimeStr }));
                }
              }
            }
          } else {
            setValidationError('No shift assigned to this attendance. Please assign a shift first.');
          }
        }
      } else {
        // No attendance found
        setValidationError(attendanceRes.message || 'No attendance record found for this date. OT cannot be created without attendance.');
        setAttendanceData(null);
      }
    } catch (error: any) {
      console.error('Error fetching attendance:', error);
      setValidationError('Failed to fetch attendance data');
      setAttendanceData(null);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleCreateOT = async () => {
    if (!otFormData.employeeId || !otFormData.employeeNumber || !otFormData.date || !otFormData.otOutTime) {
      setValidationError('Please fill all required fields');
      return;
    }

    if (!attendanceData || !attendanceData.inTime) {
      setValidationError('Attendance record not found or incomplete. OT cannot be created without attendance.');
      return;
    }

    if (confusedShift && !otFormData.manuallySelectedShiftId) {
      setValidationError('Please select a shift (required for ConfusedShift)');
      return;
    }

    setLoading(true);
    setValidationError('');
    try {
      const res = await api.createOT(otFormData);
      if (res.success) {
        alert('OT request created successfully');
        setShowOTDialog(false);
        resetOTForm();
        loadData();
      } else {
        setValidationError(res.message || 'Error creating OT request');
        if ((res as any).validationErrors && (res as any).validationErrors.length > 0) {
          setValidationError((res as any).validationErrors.join('. '));
        }
      }
    } catch (error: any) {
      console.error('Error creating OT:', error);
      setValidationError(error.message || 'Error creating OT request');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePermission = async () => {
    if (!permissionFormData.employeeId || !permissionFormData.employeeNumber || !permissionFormData.date || 
        !permissionFormData.permissionStartTime || !permissionFormData.permissionEndTime || !permissionFormData.purpose) {
      setPermissionValidationError('Please fill all required fields');
      return;
    }

    setLoading(true);
    setPermissionValidationError('');
    try {
      const res = await api.createPermission(permissionFormData);
      if (res.success) {
        alert('Permission request created successfully');
        setShowPermissionDialog(false);
        resetPermissionForm();
        loadData();
      } else {
        setPermissionValidationError(res.message || 'Error creating permission request');
        if ((res as any).validationErrors && (res as any).validationErrors.length > 0) {
          setPermissionValidationError((res as any).validationErrors.join('. '));
        }
      }
    } catch (error: any) {
      console.error('Error creating permission:', error);
      setPermissionValidationError(error.message || 'Error creating permission request');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (type: 'ot' | 'permission', id: string) => {
    if (!confirm(`Are you sure you want to approve this ${type === 'ot' ? 'OT' : 'permission'} request?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = type === 'ot' ? await api.approveOT(id) : await api.approvePermission(id);
      if (res.success) {
        alert(`${type === 'ot' ? 'OT' : 'Permission'} request approved successfully`);
        loadData();
        
        // If permission, show QR code
        if (type === 'permission' && res.data?.qrCode) {
          setSelectedQR(res.data);
          setShowQRDialog(true);
        }
      } else {
        alert(res.message || `Error approving ${type} request`);
      }
    } catch (error) {
      console.error(`Error approving ${type}:`, error);
      alert(`Error approving ${type} request`);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (type: 'ot' | 'permission', id: string) => {
    const reason = prompt(`Enter rejection reason for this ${type === 'ot' ? 'OT' : 'permission'} request:`);
    if (reason === null) return;

    setLoading(true);
    try {
      const res = type === 'ot' ? await api.rejectOT(id, reason) : await api.rejectPermission(id, reason);
      if (res.success) {
        alert(`${type === 'ot' ? 'OT' : 'Permission'} request rejected`);
        loadData();
      } else {
        alert(res.message || `Error rejecting ${type} request`);
      }
    } catch (error) {
      console.error(`Error rejecting ${type}:`, error);
      alert(`Error rejecting ${type} request`);
    } finally {
      setLoading(false);
    }
  };

  const resetOTForm = () => {
    setOTFormData({
      employeeId: '',
      employeeNumber: '',
      date: new Date().toISOString().split('T')[0],
      otOutTime: '',
      shiftId: '',
      manuallySelectedShiftId: '',
      comments: '',
    });
    setConfusedShift(null);
    setSelectedEmployee(null);
    setSelectedShift(null);
    setAttendanceData(null);
    setValidationError('');
  };

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    try {
      const date = new Date(time);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return time;
    }
  };

  const resetPermissionForm = () => {
    setPermissionFormData({
      employeeId: '',
      employeeNumber: '',
      date: new Date().toISOString().split('T')[0],
      permissionStartTime: '',
      permissionEndTime: '',
      purpose: '',
      comments: '',
    });
    setPermissionValidationError('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-emerald-50/40 via-teal-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">OT & Permissions Management</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage overtime requests and permission applications</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                setActiveTab('ot');
                setShowOTDialog(true);
              }}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create OT Request
            </button>
            <button
              onClick={() => {
                setActiveTab('permissions');
                setShowPermissionDialog(true);
              }}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Permission
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-1 dark:border-slate-700 dark:bg-slate-900/80">
          <button
            onClick={() => setActiveTab('ot')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'ot'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Overtime Requests ({otRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'permissions'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Permissions ({permissions.length})
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Employee Number</label>
              <input
                type="text"
                value={activeTab === 'ot' ? otFilters.employeeNumber : permissionFilters.employeeNumber}
                onChange={(e) => {
                  if (activeTab === 'ot') {
                    setOTFilters(prev => ({ ...prev, employeeNumber: e.target.value }));
                  } else {
                    setPermissionFilters(prev => ({ ...prev, employeeNumber: e.target.value }));
                  }
                }}
                placeholder="Filter by employee"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
              <select
                value={activeTab === 'ot' ? otFilters.status : permissionFilters.status}
                onChange={(e) => {
                  if (activeTab === 'ot') {
                    setOTFilters(prev => ({ ...prev, status: e.target.value }));
                  } else {
                    setPermissionFilters(prev => ({ ...prev, status: e.target.value }));
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Start Date</label>
              <input
                type="date"
                value={activeTab === 'ot' ? otFilters.startDate : permissionFilters.startDate}
                onChange={(e) => {
                  if (activeTab === 'ot') {
                    setOTFilters(prev => ({ ...prev, startDate: e.target.value }));
                  } else {
                    setPermissionFilters(prev => ({ ...prev, startDate: e.target.value }));
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">End Date</label>
              <input
                type="date"
                value={activeTab === 'ot' ? otFilters.endDate : permissionFilters.endDate}
                onChange={(e) => {
                  if (activeTab === 'ot') {
                    setOTFilters(prev => ({ ...prev, endDate: e.target.value }));
                  } else {
                    setPermissionFilters(prev => ({ ...prev, endDate: e.target.value }));
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : activeTab === 'ot' ? (
          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Shift</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">OT In</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">OT Out</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">OT Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {otRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No OT requests found
                      </td>
                    </tr>
                  ) : (
                    otRequests.map((ot) => (
                      <tr key={ot._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {ot.employeeId?.employee_name || ot.employeeNumber}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{ot.employeeNumber}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(ot.date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {ot.shiftId?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatTime(ot.otInTime)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatTime(ot.otOutTime)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{ot.otHours} hrs</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(ot.status)}`}>
                            {ot.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {ot.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove('ot', ot._id)}
                                  className="rounded-lg bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject('ot', ot._id)}
                                  className="rounded-lg bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Time Range</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Purpose</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {permissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No permission requests found
                      </td>
                    </tr>
                  ) : (
                    permissions.map((perm) => (
                      <tr key={perm._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {perm.employeeId?.employee_name || perm.employeeNumber}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{perm.employeeNumber}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(perm.date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {formatTime(perm.permissionStartTime)} - {formatTime(perm.permissionEndTime)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{perm.permissionHours} hrs</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{perm.purpose}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(perm.status)}`}>
                            {perm.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {perm.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove('permission', perm._id)}
                                  className="rounded-lg bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject('permission', perm._id)}
                                  className="rounded-lg bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {perm.status === 'approved' && perm.qrCode && (
                              <button
                                onClick={() => {
                                  setSelectedQR(perm);
                                  setShowQRDialog(true);
                                }}
                                className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
                              >
                                View QR
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* OT Dialog */}
        {showOTDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create OT Request</h2>
                <button
                  onClick={() => {
                    setShowOTDialog(false);
                    resetOTForm();
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Validation Error */}
                {validationError && (
                  <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">{validationError}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee *</label>
                  <select
                    value={otFormData.employeeId}
                    onChange={(e) => {
                      const employee = employees.find(emp => emp._id === e.target.value);
                      if (employee) {
                        handleEmployeeSelect(employee._id, employee.emp_no, otFormData.date);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">Select Employee</option>
                    {employees
                      .filter(emp => emp._id && emp.emp_no)
                      .map((emp, index) => (
                        <option key={`ot-employee-${emp._id || emp.emp_no || index}`} value={emp._id}>
                          {emp.emp_no} - {emp.employee_name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date *</label>
                  <input
                    type="date"
                    value={otFormData.date}
                    onChange={(e) => {
                      setOTFormData(prev => ({ ...prev, date: e.target.value }));
                      if (otFormData.employeeId && otFormData.employeeNumber) {
                        handleEmployeeSelect(otFormData.employeeId, otFormData.employeeNumber, e.target.value);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                {/* Attendance Information */}
                {attendanceLoading && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Loading attendance data...</p>
                    </div>
                  </div>
                )}

                {attendanceData && !attendanceLoading && (
                  <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-900 dark:text-green-200">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Attendance Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded bg-white/50 p-2 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Status</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{attendanceData.status || '-'}</p>
                      </div>
                      <div className="rounded bg-white/50 p-2 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">In Time</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatTime(attendanceData.inTime)}</p>
                      </div>
                      <div className="rounded bg-white/50 p-2 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Out Time</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatTime(attendanceData.outTime)}</p>
                      </div>
                      <div className="rounded bg-white/50 p-2 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Hours</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{attendanceData.totalHours ? `${attendanceData.totalHours.toFixed(2)}h` : '-'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show message if no attendance but employee and date are selected */}
                {!attendanceLoading && !attendanceData && otFormData.employeeId && otFormData.date && (
                  <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4 dark:border-orange-700 dark:bg-orange-900/20">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-sm font-medium text-orange-800 dark:text-orange-300">No attendance record found for this date</p>
                    </div>
                  </div>
                )}

                {confusedShift && (
                  <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-600 dark:bg-yellow-900/20">
                    <div className="mb-2 flex items-center gap-2">
                      <svg className="h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="font-semibold text-yellow-800 dark:text-yellow-300">ConfusedShift Detected</span>
                    </div>
                    <p className="mb-3 text-sm text-yellow-700 dark:text-yellow-400">
                      Multiple shifts match for this attendance. Please manually select the correct shift.
                    </p>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-yellow-800 dark:text-yellow-300">Select Shift *</label>
                      <select
                        value={otFormData.manuallySelectedShiftId}
                        onChange={(e) => {
                          const selectedShiftId = e.target.value;
                          setOTFormData(prev => ({ ...prev, manuallySelectedShiftId: selectedShiftId }));
                          
                          // Find and set the selected shift
                          const selectedShiftData = confusedShift.possibleShifts.find(s => s.shiftId === selectedShiftId);
                          if (selectedShiftData) {
                            const shiftFromList = shifts.find(s => s._id === selectedShiftId);
                            if (shiftFromList) {
                              setSelectedShift(shiftFromList);
                            } else {
                              // Create shift object from confused shift data
                              setSelectedShift({
                                _id: selectedShiftData.shiftId,
                                name: selectedShiftData.shiftName,
                                startTime: selectedShiftData.startTime,
                                endTime: selectedShiftData.endTime,
                                duration: 0,
                              });
                            }
                            
                            // Auto-suggest OT out time based on selected shift
                            if (selectedShiftData.endTime) {
                              const [endHour, endMin] = selectedShiftData.endTime.split(':').map(Number);
                              const suggestedOutTime = new Date(otFormData.date);
                              suggestedOutTime.setHours(endHour + 1, endMin, 0, 0);
                              const suggestedOutTimeStr = suggestedOutTime.toISOString().slice(0, 16);
                              setOTFormData(prev => ({ ...prev, otOutTime: suggestedOutTimeStr }));
                            }
                          }
                        }}
                        className="w-full rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 dark:border-yellow-600 dark:bg-slate-900 dark:text-white"
                        required
                      >
                        <option value="">Select Shift</option>
                        {confusedShift.possibleShifts.map((shift, index) => {
                          const shiftObj = shifts.find(s => s._id === shift.shiftId);
                          return (
                            <option key={`confused-shift-${shift.shiftId}-${index}`} value={shift.shiftId}>
                              {shift.shiftName} ({shift.startTime} - {shift.endTime})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}

                {/* Shift Information - Show for both normal and confused shift (after selection) */}
                {(selectedShift || (confusedShift && otFormData.manuallySelectedShiftId)) && attendanceData && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20">
                    <h3 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">Shift Information</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-300">Shift:</span>{' '}
                        <span className="text-blue-900 dark:text-blue-200">
                          {selectedShift?.name || confusedShift?.possibleShifts.find(s => s.shiftId === otFormData.manuallySelectedShiftId)?.shiftName || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-300">Shift Time:</span>{' '}
                        <span className="text-blue-900 dark:text-blue-200">
                          {selectedShift ? `${selectedShift.startTime} - ${selectedShift.endTime}` : 
                           confusedShift?.possibleShifts.find(s => s.shiftId === otFormData.manuallySelectedShiftId) ? 
                           `${confusedShift.possibleShifts.find(s => s.shiftId === otFormData.manuallySelectedShiftId)?.startTime} - ${confusedShift.possibleShifts.find(s => s.shiftId === otFormData.manuallySelectedShiftId)?.endTime}` : '-'}
                        </span>
                      </div>
                      <div className="mt-3 rounded bg-white/50 p-2 dark:bg-slate-800/50">
                        <span className="font-semibold text-blue-900 dark:text-blue-200">OT In Time (Shift End):</span>{' '}
                        <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                          {selectedShift?.endTime || confusedShift?.possibleShifts.find(s => s.shiftId === otFormData.manuallySelectedShiftId)?.endTime || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">OT Out Time *</label>
                  <input
                    type="datetime-local"
                    value={otFormData.otOutTime}
                    onChange={(e) => setOTFormData(prev => ({ ...prev, otOutTime: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Comments</label>
                  <textarea
                    value={otFormData.comments}
                    onChange={(e) => setOTFormData(prev => ({ ...prev, comments: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowOTDialog(false);
                      resetOTForm();
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateOT}
                    disabled={loading}
                    className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create OT Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Permission Dialog */}
        {showPermissionDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create Permission Request</h2>
                <button
                  onClick={() => {
                    setShowPermissionDialog(false);
                    resetPermissionForm();
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Validation Error */}
                {permissionValidationError && (
                  <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">{permissionValidationError}</p>
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee *</label>
                  <select
                    value={permissionFormData.employeeId}
                    onChange={(e) => {
                      const employee = employees.find(emp => emp._id === e.target.value);
                      if (employee) {
                        setPermissionFormData(prev => ({
                          ...prev,
                          employeeId: employee._id,
                          employeeNumber: employee.emp_no,
                        }));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">Select Employee</option>
                    {employees
                      .filter(emp => emp._id && emp.emp_no)
                      .map((emp, index) => (
                        <option key={`perm-employee-${emp._id || emp.emp_no || index}`} value={emp._id}>
                          {emp.emp_no} - {emp.employee_name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date *</label>
                  <input
                    type="date"
                    value={permissionFormData.date}
                    onChange={(e) => setPermissionFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Permission Start Time *</label>
                    <input
                      type="datetime-local"
                      value={permissionFormData.permissionStartTime}
                      onChange={(e) => setPermissionFormData(prev => ({ ...prev, permissionStartTime: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Permission End Time *</label>
                    <input
                      type="datetime-local"
                      value={permissionFormData.permissionEndTime}
                      onChange={(e) => setPermissionFormData(prev => ({ ...prev, permissionEndTime: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Purpose *</label>
                  <input
                    type="text"
                    value={permissionFormData.purpose}
                    onChange={(e) => setPermissionFormData(prev => ({ ...prev, purpose: e.target.value }))}
                    placeholder="Enter purpose for permission"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Comments</label>
                  <textarea
                    value={permissionFormData.comments}
                    onChange={(e) => setPermissionFormData(prev => ({ ...prev, comments: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowPermissionDialog(false);
                      resetPermissionForm();
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreatePermission}
                    disabled={loading}
                    className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Permission'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QR Code Dialog */}
        {showQRDialog && selectedQR && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Permission QR Code</h2>
                <button
                  onClick={() => {
                    setShowQRDialog(false);
                    setSelectedQR(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 text-center">
                {selectedQR.qrCode ? (
                  <>
                    <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-lg border-2 border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                      <QRCodeSVG
                        value={selectedQR.outpassUrl || (typeof window !== 'undefined' ? `${window.location.origin}/outpass/${selectedQR.qrCode}` : `/outpass/${selectedQR.qrCode}`)}
                        size={240}
                        level="H"
                        includeMargin={true}
                      />
                    </div>
                    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      <p className="font-medium text-slate-900 dark:text-white">Employee: {selectedQR.employeeId?.employee_name || selectedQR.employeeNumber}</p>
                      <p>Date: {formatDate(selectedQR.date)}</p>
                      <p>Time: {formatTime(selectedQR.permissionStartTime)} - {formatTime(selectedQR.permissionEndTime)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500">QR Code: {selectedQR.qrCode}</p>
                    </div>
                    <div className="pt-2">
                      <a
                        href={selectedQR.outpassUrl || `/outpass/${selectedQR.qrCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Outpass
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Loading QR Code...</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

