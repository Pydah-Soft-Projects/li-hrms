/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';
import LocationPhotoCapture from '@/components/LocationPhotoCapture';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { CheckIcon, XIcon, CalendarIcon, BriefcaseIcon, ClockIcon, PlusIcon } from 'lucide-react';
import { getEmployeeInitials } from '@/lib/utils';

const Portal = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return mounted ? createPortal(children, document.body) : null;
};

// Toast Notification Component
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const ToastNotification = ({ toast, onClose }: { toast: Toast; onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500',
  };

  const icons = {
    success: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  return (
    <div
      className={`${bgColors[toast.type]} mb-2 flex items-center gap-3 rounded-lg px-4 py-3 text-white shadow-lg transition-all duration-300 animate-in slide-in-from-right`}
    >
      <div className="flex-shrink-0">{icons[toast.type]}</div>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 rounded p-1 hover:bg-white/20 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id: string; name: string; division?: { name: string } };
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
  workflow?: {
    currentStepRole: string;
    nextApproverRole: string;
    nextApprover: string;
    isCompleted: boolean;
    approvalChain: Array<{
      stepOrder: number;
      role: string;
      label: string;
      status: string;
      isCurrent: boolean;
    }>;
  };
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
  gateOutTime?: string;
  gateInTime?: string;
  workflow?: {
    currentStepRole: string;
    nextApproverRole: string;
    nextApprover: string;
    isCompleted: boolean;
    approvalChain: Array<{
      stepOrder: number;
      role: string;
      label: string;
      status: string;
      isCurrent: boolean;
    }>;
  };
}

export default function OTAndPermissionsPage() {

  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'ot' | 'permissions' | 'pending'>('ot');
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
  const [showEvidenceDialog, setShowEvidenceDialog] = useState(false);
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState<any | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Toast helper functions
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

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

  // Evidence State
  // Derived State
  const pendingOTs = otRequests.filter(req => req.status === 'pending');
  const pendingPermissions = permissions.filter(req => req.status === 'pending');
  const totalPending = pendingOTs.length + pendingPermissions.length;

  const isEmployee = currentUser?.role === 'employee';

  // Dynamic Column Logic
  const { showDivision, showDepartment, showEmployeeCol } = useMemo(() => {
    if (isEmployee) return { showDivision: false, showDepartment: false, showEmployeeCol: false };

    const isHOD = currentUser?.role === 'hod';
    if (isHOD) return { showDivision: false, showDepartment: false, showEmployeeCol: true };

    let dataToCheck: any[] = [];
    if (activeTab === 'ot') dataToCheck = otRequests;
    else if (activeTab === 'permissions') dataToCheck = permissions;
    else dataToCheck = [...otRequests, ...permissions];

    const uniqueDivisions = new Set(dataToCheck.map(item => item.employeeId?.department?.division?.name).filter(Boolean));

    return {
      showDivision: uniqueDivisions.size > 1,
      showDepartment: true,
      showEmployeeCol: true
    };
  }, [otRequests, permissions, activeTab, currentUser, isEmployee]);

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [locationData, setLocationData] = useState<any | null>(null);

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [activeTab, otFilters, permissionFilters, isEmployee, currentUser]);

  const canPerformAction = (item: any) => {
    if (!item || !currentUser) return false;
    if (item.status === 'approved' || item.status === 'rejected' || (item.workflow && item.workflow.isCompleted)) return false;

    // Super Admin can always act (emergency override)
    if (currentUser.role === 'super_admin') return true;

    // Check dynamic workflow
    if (item.workflow && item.workflow.approvalChain) {
      const currentStep = item.workflow.approvalChain.find((step: any) => step.isCurrent);
      if (currentStep) {
        return currentStep.role === currentUser.role;
      }
    }

    // Fallback for legacy records (if any)
    if (item.status === 'pending') {
      return currentUser.role === 'hod';
    }
    if (item.status === 'manager_approved') {
      return currentUser.role === 'hr' || currentUser.role === 'admin';
    }

    return false;
  };

  // Auto-fetch attendance when OT dialog opens with employee and date
  useEffect(() => {
    if (showOTDialog && otFormData.employeeId && otFormData.employeeNumber && otFormData.date && !attendanceData && !attendanceLoading) {
      handleEmployeeSelect(otFormData.employeeId, otFormData.employeeNumber, otFormData.date);
    }
  }, [showOTDialog]);

  // Auto-fill for Employee Role
  useEffect(() => {
    if (isEmployee && currentUser) {
      // Robustly get ID and Emp No
      const empId = (currentUser as any)._id || currentUser.id;
      const empNo = currentUser.emp_no || currentUser.employeeId;

      if (empId && empNo) {
        if (showOTDialog) {
          setOTFormData(prev => ({ ...prev, employeeId: empId, employeeNumber: empNo }));
          // Only fetch if date is set (it is default initialized)
          if (otFormData.date) {
            handleEmployeeSelect(empId, empNo, otFormData.date);
          }
        }

        if (showPermissionDialog) {
          setPermissionFormData(prev => ({ ...prev, employeeId: empId, employeeNumber: empNo }));
          // Check attendance for permission
          if (permissionFormData.date) {
            api.getAttendanceDetail(empNo, permissionFormData.date).then(attendanceRes => {
              if (!attendanceRes.success || !attendanceRes.data || !attendanceRes.data.inTime) {
                setPermissionValidationError('No attendance record found or employee has no in-time for this date. Permission cannot be created without attendance.');
              } else {
                setPermissionValidationError('');
              }
            }).catch(console.error);
          }
        }
      } else {
        console.warn('Current user missing employee details:', currentUser);
      }
    }
  }, [showOTDialog, showPermissionDialog, isEmployee, currentUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'ot') {
        const otRes = await api.getOTRequests(otFilters);
        if (otRes.success) {
          setOTRequests(otRes.data || []);
        }
      } else if (activeTab === 'permissions') {
        const permRes = await api.getPermissions(permissionFilters);
        if (permRes.success) {
          setPermissions(permRes.data || []);
        }
      } else if (activeTab === 'pending') {
        // Load both for pending dashboard
        const [otRes, permRes] = await Promise.all([
          api.getOTRequests({ ...otFilters, status: 'pending' }), // Optimize filters if backend supports?
          // Actually, we probably want ALL pending, ignoring date filters?
          // Or respect filters? The user might filter pending by date.
          // Let's use the current filters but maybe force status 'pending' if the user hasn't selected it?
          // But 'otFilters' has 'status'. If user switches to Pending tab, we might want to ignore the 'status' filter in the state 
          // and fetch ALL pending?
          // In Leaves page, 'pending' tab uses 'pendingLeaves' variable which comes from 'leaves' array.
          // 'leaves' array is loaded with NO status filter (all leaves).
          // Here, 'otRequests' only loads with 'otFilters'.
          // If I act like Leaves page, I should load ALL OT and ALL Perms (or at least pending ones).
          // Let's load ALL Pending for now.
          api.getPermissions({ ...permissionFilters, status: 'pending' })
        ]);

        // Wait, if I load specific 'pending' here, I overwrite 'otRequests' with ONLY pending items.
        // If I switch back to 'OT' tab later, it reloads 'ot' data. This is fine.
        if (otRes.success) setOTRequests(otRes.data || []);
        if (permRes.success) setPermissions(permRes.data || []);
      }

      // Load employees and shifts
      const [employeesRes, shiftsRes] = await Promise.all([
        !isEmployee ? api.getEmployees({ is_active: true }) : Promise.resolve({ success: true, data: [] }),
        api.getShifts(),
      ]);

      if (!isEmployee && employeesRes && employeesRes.success) {
        if (Array.isArray(employeesRes.data)) {
          const employeesList = employeesRes.data;
          console.log('Loaded employees:', employeesList.length);
          setEmployees(employeesList);
        } else {
          console.error('Expected array for employees but got:', typeof employeesRes.data);
          setEmployees([]);
        }
      } else if (!isEmployee) {
        console.error('Failed to load employees. Response:', JSON.stringify(employeesRes));
        // Only show toast if there's a meaningful message
        if (employeesRes && (employeesRes as any).message) {
          showToast((employeesRes as any).message, 'error');
        }
      }

      if (shiftsRes.success) {
        setShifts(shiftsRes.data || []);
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
      // Try to print full error if object
      try {
        if (typeof error === 'object') console.error(JSON.stringify(error));
      } catch (e) { /* ignore */ }
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSelect = async (employeeId: string, employeeNumber: string, date: string) => {
    // Find employee by _id or emp_no
    const employee = employees.find(e => (e._id === employeeId) || (e.emp_no === employeeId) || (e.emp_no === employeeNumber));
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
    const missingFields = [];
    if (!otFormData.employeeId) missingFields.push('Employee');
    if (!otFormData.employeeNumber) missingFields.push('Employee Number');
    if (!otFormData.date) missingFields.push('Date');
    if (!otFormData.otOutTime) missingFields.push('OT Out Time');

    if (missingFields.length > 0) {
      const msg = `Please fill all required fields: ${missingFields.join(', ')}`;
      setValidationError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!attendanceData || !attendanceData.inTime) {
      const errorMsg = 'Attendance record not found or incomplete. OT cannot be created without attendance.';
      setValidationError(errorMsg);
      showToast(errorMsg, 'error');
      return;
    }

    if (confusedShift && !otFormData.manuallySelectedShiftId) {
      const errorMsg = 'Please select a shift (required for ConfusedShift)';
      setValidationError(errorMsg);
      showToast(errorMsg, 'error');
      return;
    }

    // 3. Create Request
    setLoading(true);
    setValidationError('');

    let payload: any = { ...otFormData };

    // Handle Evidence Upload (Lazy Upload)
    if (evidenceFile) {
      try {
        showToast('Uploading evidence...', 'info');
        const uploadRes = await api.uploadEvidence(evidenceFile);
        if (uploadRes.success && uploadRes.data) {
          payload.photoEvidence = {
            url: uploadRes.data.url,
            key: uploadRes.data.key,
            exifLocation: (evidenceFile as any).exifLocation
          };
        }
      } catch (uploadErr) {
        console.error("Upload failed", uploadErr);
        showToast('Failed to upload evidence photo', 'error');
        setLoading(false);
        return;
      }
    }

    // Add Location Data
    if (locationData) {
      payload.geoLocation = locationData;
    }

    try {
      const res = await api.createOT(payload);
      if (res.success) {
        showToast('OT request created successfully', 'success');
        setShowOTDialog(false);
        resetOTForm();
        loadData();
      } else {
        const errorMsg = res.message || 'Error creating OT request';
        setValidationError(errorMsg);
        if ((res as any).validationErrors && (res as any).validationErrors.length > 0) {
          const validationMsg = (res as any).validationErrors.join('. ');
          setValidationError(validationMsg);
          showToast(validationMsg, 'error');
        } else {
          showToast(errorMsg, 'error');
        }
      }
    } catch (error: any) {
      console.error('Error creating OT:', error);
      const errorMsg = error.message || 'Error creating OT request';
      setValidationError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePermission = async () => {
    const missingFields = [];
    if (!permissionFormData.employeeId) missingFields.push('Employee');
    if (!permissionFormData.employeeNumber) missingFields.push('Employee Number');
    if (!permissionFormData.date) missingFields.push('Date');
    if (!permissionFormData.permissionStartTime) missingFields.push('Start Time');
    if (!permissionFormData.permissionEndTime) missingFields.push('End Time');
    if (!permissionFormData.purpose) missingFields.push('Purpose');

    if (missingFields.length > 0) {
      const msg = `Please fill all required fields: ${missingFields.join(', ')}`;
      setPermissionValidationError(msg);
      showToast(msg, 'error');
      return;
    }

    // Additional check: verify attendance exists
    if (permissionFormData.employeeNumber && permissionFormData.date) {
      try {
        const attendanceRes = await api.getAttendanceDetail(permissionFormData.employeeNumber, permissionFormData.date);
        if (!attendanceRes.success || !attendanceRes.data || !attendanceRes.data.inTime) {
          const errorMsg = 'No attendance record found or employee has no in-time for this date. Permission cannot be created without attendance.';
          setPermissionValidationError(errorMsg);
          showToast(errorMsg, 'error');
          return;
        }
      } catch (error) {
        console.error('Error checking attendance:', error);
        const errorMsg = 'Failed to verify attendance. Please try again.';
        setPermissionValidationError(errorMsg);
        showToast(errorMsg, 'error');
        return;
      }
    }

    // 3. Create Request
    setLoading(true);
    setPermissionValidationError('');

    let payload: any = { ...permissionFormData };

    // Handle Evidence Upload (Lazy Upload)
    if (evidenceFile) {
      try {
        showToast('Uploading evidence...', 'info');
        const uploadRes = await api.uploadEvidence(evidenceFile);
        if (uploadRes.success && uploadRes.data) {
          payload.photoEvidence = {
            url: uploadRes.data.url,
            key: uploadRes.data.key,
            exifLocation: (evidenceFile as any).exifLocation
          };
        }
      } catch (uploadErr) {
        console.error("Upload failed", uploadErr);
        showToast('Failed to upload evidence photo', 'error');
        setLoading(false);
        return;
      }
    }

    // Add Location Data
    if (locationData) {
      payload.geoLocation = locationData;
    }

    try {
      const res = await api.createPermission(payload);
      if (res.success) {
        showToast('Permission request created successfully', 'success');
        setShowPermissionDialog(false);
        resetPermissionForm();
        loadData();
      } else {
        const errorMsg = res.message || 'Error creating permission request';
        setPermissionValidationError(errorMsg);
        if ((res as any).validationErrors && (res as any).validationErrors.length > 0) {
          const validationMsg = (res as any).validationErrors.join('. ');
          setPermissionValidationError(validationMsg);
          showToast(validationMsg, 'error');
        } else {
          showToast(errorMsg, 'error');
        }
      }
    } catch (error: any) {
      console.error('Error creating permission:', error);
      const errorMsg = error.message || 'Error creating permission request';
      setPermissionValidationError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (type: 'ot' | 'permission', id: string) => {
    if (!window.confirm(`Are you sure you want to approve this ${type === 'ot' ? 'OT' : 'permission'} request?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = type === 'ot' ? await api.approveOT(id) : await api.approvePermission(id);
      if (res.success) {
        showToast(`${type === 'ot' ? 'OT' : 'Permission'} request approved successfully`, 'success');
        loadData();

        // If permission, show QR code
        if (type === 'permission' && res.data?.qrCode) {
          setSelectedQR(res.data);
          setShowQRDialog(true);
        }
      } else {
        showToast(res.message || `Error approving ${type} request`, 'error');
      }
    } catch (error) {
      console.error(`Error approving ${type}:`, error);
      showToast(`Error approving ${type} request`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (type: 'ot' | 'permission', id: string) => {
    const reason = window.prompt(`Enter rejection reason for this ${type === 'ot' ? 'OT' : 'permission'} request:`);
    if (reason === null) return;

    setLoading(true);
    try {
      const res = type === 'ot' ? await api.rejectOT(id, reason) : await api.rejectPermission(id, reason);
      if (res.success) {
        showToast(`${type === 'ot' ? 'OT' : 'Permission'} request rejected`, 'info');
        loadData();
      } else {
        showToast(res.message || `Error rejecting ${type} request`, 'error');
      }
    } catch (error) {
      console.error(`Error rejecting ${type}:`, error);
      showToast(`Error rejecting ${type} request`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateGatePass = async (type: 'OUT' | 'IN') => {
    if (!selectedQR) return;

    try {
      setLoading(true);
      const res = type === 'OUT'
        ? await api.generateGateOutQR(selectedQR._id)
        : await api.generateGateInQR(selectedQR._id);

      if (res.success) {
        showToast(`Gate ${type} Pass generated successfully`, 'success');
        // Update local state to show QR
        const secret = res.qrSecret;
        // Re-fetch data to get updated permission object (timings etc)
        // Or manually update selectedQR for immediate feedback
        setSelectedQR(prev => prev ? { ...prev, qrCode: secret } : null);
        loadData(); // To refresh grid status
      } else {
        showToast(res.message || `Failed to generate Gate ${type} Pass`, 'error');
        if (res.waitTime) {
          // Could show specific timer
        }
      }
    } catch (error: any) {
      console.error('Error generating gate pass:', error);
      showToast(error.message || 'Failed to generate gate pass', 'error');
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
    setAttendanceData(null);
    setValidationError('');
    setEvidenceFile(null);
    setLocationData(null);
  };

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    try {
      const date = new Date(time);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
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
    setEvidenceFile(null);
    setLocationData(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative min-h-screen">
      {/* Toast Notifications Container */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastNotification key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">OT & Permissions Management</h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Manage overtime requests and permission applications</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs - Compact & Clean */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
              <button
                onClick={() => setActiveTab('ot')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'ot'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
              >
                <ClockIcon className="w-3.5 h-3.5" />
                Overtime ({otRequests.length})
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'permissions'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
              >
                <CheckIcon className="w-3.5 h-3.5" />
                Permissions ({permissions.length})
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'pending'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Pending ({totalPending})
              </button>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

            <button
              onClick={() => {
                setActiveTab('ot');
                setShowOTDialog(true);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Create OT
            </button>
            <button
              onClick={() => {
                setActiveTab('permissions');
                setShowPermissionDialog(true);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Create Permission
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white/80 backdrop-blur-sm p-3 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {!isEmployee && (
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">Employee Number</label>
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
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">Status</label>
              <select
                value={activeTab === 'ot' ? otFilters.status : permissionFilters.status}
                onChange={(e) => {
                  if (activeTab === 'ot') {
                    setOTFilters(prev => ({ ...prev, status: e.target.value }));
                  } else {
                    setPermissionFilters(prev => ({ ...prev, status: e.target.value }));
                  }
                }}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">Start Date</label>
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
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">End Date</label>
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
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : activeTab === 'pending' ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Pending OT Requests */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Pending Overtime Requests</h3>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  {pendingOTs.length}
                </span>
              </div>

              {pendingOTs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <ClockIcon className="mx-auto h-12 w-12 text-slate-400" />
                  <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">No pending OT requests</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All caught up! There are no overtime requests requiring your approval.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pendingOTs.map((ot) => (
                    <div key={ot._id} className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold dark:bg-blue-900/30 dark:text-blue-400">
                            {getEmployeeInitials({
                              employee_name: ot.employeeId?.employee_name || '',
                              // OT object structure might differ slightly, defaulting fields
                              first_name: ot.employeeId?.employee_name?.split(' ')[0],
                              last_name: '',
                              emp_no: ''
                            } as any)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                              {ot.employeeId?.employee_name || ot.employeeNumber}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <span>{ot.employeeNumber}</span>
                              {ot.employeeId?.department?.name && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[100px]">{ot.employeeId.department.name}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(ot.status)}`}>
                          {ot.status}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mb-4 space-y-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Date</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(ot.date)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Time</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatTime(ot.otInTime)} - {formatTime(ot.otOutTime)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Total Hours</span>
                          <span className="font-bold text-blue-600 dark:text-blue-400">{ot.otHours} hrs</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Shift</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{ot.shiftId?.name || '-'}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-auto">
                        <button
                          onClick={() => handleApprove('ot', ot._id)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                          title="Approve OT"
                        >
                          <CheckIcon className="h-4 w-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleReject('ot', ot._id)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                          title="Reject OT"
                        >
                          <XIcon className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Permissions Requests */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Pending Permission Requests</h3>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  {pendingPermissions.length}
                </span>
              </div>

              {pendingPermissions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <BriefcaseIcon className="mx-auto h-12 w-12 text-slate-400" />
                  <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">No pending permissions</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All caught up! There are no permission requests requiring your approval.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pendingPermissions.map((perm) => (
                    <div key={perm._id} className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 font-bold dark:bg-purple-900/30 dark:text-purple-400">
                            {getEmployeeInitials({
                              employee_name: perm.employeeId?.employee_name || '',
                              first_name: perm.employeeId?.employee_name?.split(' ')[0],
                              last_name: '',
                              emp_no: ''
                            } as any)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                              {perm.employeeId?.employee_name || perm.employeeNumber}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <span>{perm.employeeNumber}</span>
                              {perm.employeeId?.department?.name && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[100px]">{perm.employeeId.department.name}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(perm.status)}`}>
                          {perm.status}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mb-4 space-y-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Date</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(perm.date)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Time Range</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatTime(perm.permissionStartTime)} - {formatTime(perm.permissionEndTime)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Hours</span>
                          <span className="font-bold text-purple-600 dark:text-purple-400">{perm.permissionHours} hrs</span>
                        </div>
                        {perm.purpose && (
                          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 italic">
                              &quot;{perm.purpose}&quot;
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-auto">
                        {canPerformAction(perm) && (
                          <>
                            <button
                              onClick={() => handleApprove('permission', perm._id)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                              title="Approve Permission"
                            >
                              <CheckIcon className="h-4 w-4" /> Approve
                            </button>
                            <button
                              onClick={() => handleReject('permission', perm._id)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                              title="Reject Permission"
                            >
                              <XIcon className="h-4 w-4" /> Reject
                            </button>
                          </>
                        )}
                        {perm.status === 'approved' && perm.qrCode && (
                          <button
                            onClick={() => {
                              setSelectedQR(perm);
                              setShowQRDialog(true);
                            }}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500/10 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-500 hover:text-white dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500 dark:hover:text-white"
                          >
                            <ClockIcon className="h-4 w-4" /> Gate Pass
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'ot' ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100/75 border-b border-slate-200 dark:bg-slate-700/50 dark:border-slate-700">
                  <tr>
                    {showEmployeeCol && <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Employee</th>}
                    {showDivision && <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Division</th>}
                    {showDepartment && <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Department</th>}
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Date</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Shift</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">In Time</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">Out Time</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">Hours</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {otRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8 + (showDivision ? 1 : 0) + (showDepartment ? 1 : 0)} className="px-6 py-10 text-center text-slate-500 text-sm">
                        No OT requests found
                      </td>
                    </tr>
                  ) : (
                    otRequests.map((ot) => (
                      <tr key={ot._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        {showEmployeeCol && (
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs shrink-0">
                                {getEmployeeInitials({ employee_name: ot.employeeId?.employee_name || '', first_name: '', last_name: '', emp_no: '' } as any)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-white text-sm truncate max-w-[150px]">
                                  {ot.employeeId?.employee_name || ot.employeeNumber}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {ot.employeeNumber}
                                </div>
                              </div>
                            </div>
                          </td>
                        )}
                        {showDivision && <td className="px-6 py-3.5 text-sm text-slate-700 dark:text-slate-300">{ot.employeeId?.department?.division?.name || '-'}</td>}
                        {showDepartment && <td className="px-6 py-3.5 text-sm text-slate-700 dark:text-slate-300">{ot.employeeId?.department?.name || '-'}</td>}
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">{formatDate(ot.date)}</td>
                        <td className="px-6 py-3.5 text-sm text-slate-700 dark:text-slate-300">
                          {ot.shiftId?.name || '-'}
                        </td>
                        <td className="px-6 py-3.5 text-center text-sm text-slate-700 dark:text-slate-300">{formatTime(ot.otInTime)}</td>
                        <td className="px-6 py-3.5 text-center text-sm text-slate-700 dark:text-slate-300">{formatTime(ot.otOutTime)}</td>
                        <td className="px-6 py-3.5 text-center">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{ot.otHours}h</span>
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${getStatusColor(ot.status) === 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' ? 'border-green-200' : 'border-transparent'} ${getStatusColor(ot.status)}`}>
                            {ot.status}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canPerformAction(ot) && (
                              <>
                                <button
                                  onClick={() => handleApprove('ot', ot._id)}
                                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                                  title="Approve"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject('ot', ot._id)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                  title="Reject"
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
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100/75 border-b border-slate-200 dark:bg-slate-700/50 dark:border-slate-700">
                  <tr>
                    {showEmployeeCol && <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Employee</th>}
                    {showDivision && <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Division</th>}
                    {showDepartment && <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Department</th>}
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Date</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">Time Range</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">Hours</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Purpose</th>
                    <th scope="col" className="px-6 py-3.5 text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300 text-center">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {permissions.length === 0 ? (
                    <tr>
                      <td colSpan={7 + (showDivision ? 1 : 0) + (showDepartment ? 1 : 0)} className="px-6 py-10 text-center text-slate-500 text-sm">
                        No permission requests found
                      </td>
                    </tr>
                  ) : (
                    permissions.map((perm) => (
                      <tr key={perm._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        {showEmployeeCol && (
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs shrink-0">
                                {getEmployeeInitials({ employee_name: perm.employeeId?.employee_name || '', first_name: '', last_name: '', emp_no: '' } as any)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-white text-sm truncate max-w-[150px]">
                                  {perm.employeeId?.employee_name || perm.employeeNumber}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {perm.employeeNumber}
                                </div>
                              </div>
                            </div>
                          </td>
                        )}
                        {showDivision && <td className="px-6 py-3.5 text-sm text-slate-700 dark:text-slate-300">{perm.employeeId?.department?.division?.name || '-'}</td>}
                        {showDepartment && <td className="px-6 py-3.5 text-sm text-slate-700 dark:text-slate-300">{perm.employeeId?.department?.name || '-'}</td>}
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">{formatDate(perm.date)}</td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-center text-slate-700 dark:text-slate-300">
                          {formatTime(perm.permissionStartTime)} - {formatTime(perm.permissionEndTime)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{perm.permissionHours}h</span>
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-700 max-w-[150px] truncate" title={perm.purpose}>{perm.purpose}</td>
                        <td className="px-6 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${getStatusColor(perm.status) === 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' ? 'border-green-200' : 'border-transparent'} ${getStatusColor(perm.status)}`}>
                            {perm.status}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canPerformAction(perm) && (
                              <>
                                <button
                                  onClick={() => handleApprove('permission', perm._id)}
                                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                                  title="Approve"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject('permission', perm._id)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                  title="Reject"
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
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                              >
                                Gate Pass
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
          <Portal>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOTDialog(false)} />
              <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
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

                  {!isEmployee && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee *</label>
                      <select
                        value={otFormData.employeeId}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) return;

                          // Find employee by _id or emp_no
                          const employee = employees.find(emp => (emp._id === value) || (emp.emp_no === value));
                          if (employee && employee.emp_no) {
                            const employeeId = employee._id || employee.emp_no;
                            // Update form data immediately
                            setOTFormData(prev => ({
                              ...prev,
                              employeeId,
                              employeeNumber: employee.emp_no
                            }));
                            handleEmployeeSelect(employeeId, employee.emp_no, otFormData.date);
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Select Employee</option>
                        {employees && employees.length > 0 ? (
                          employees
                            .filter(emp => emp.emp_no) // Only require emp_no, not _id
                            .map((emp, index) => {
                              const identifier = emp._id || emp.emp_no;
                              return (
                                <option key={`ot-employee-${identifier}-${index}`} value={identifier}>
                                  {emp.emp_no} - {emp.employee_name || 'Unknown'}
                                </option>
                              );
                            })
                        ) : (
                          <option value="" disabled>No employees available</option>
                        )}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date *</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Comments (Optional)</label>
                    <textarea
                      value={otFormData.comments}
                      onChange={(e) => setOTFormData(prev => ({ ...prev, comments: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  {/* Photo Evidence */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
                    <LocationPhotoCapture
                      label="Live Photo Evidence"
                      onCapture={(loc, photo) => {
                        setEvidenceFile(photo.file);
                        setLocationData(loc);
                        (photo.file as any).exifLocation = photo.exifLocation;
                      }}
                      onClear={() => {
                        setEvidenceFile(null);
                        setLocationData(null);
                      }}
                    />
                  </div>

                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50">
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
          </Portal>
        )}

        {/* Permission Dialog */}
        {showPermissionDialog && (
          <Portal>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPermissionDialog(false)} />
              <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
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
                  {!isEmployee && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee *</label>
                      <select
                        value={permissionFormData.employeeId}
                        onChange={async (e) => {
                          const value = e.target.value;
                          if (!value) {
                            setPermissionFormData(prev => ({
                              ...prev,
                              employeeId: '',
                              employeeNumber: '',
                            }));
                            setPermissionValidationError('');
                            return;
                          }

                          // Find employee by _id or emp_no
                          const employee = employees.find(emp => (emp._id === value) || (emp.emp_no === value));
                          if (employee && employee.emp_no) {
                            const employeeId = employee._id || employee.emp_no;
                            setPermissionFormData(prev => ({
                              ...prev,
                              employeeId: employeeId,
                              employeeNumber: employee.emp_no,
                            }));
                            setPermissionValidationError('');

                            // Check attendance when employee is selected
                            if (permissionFormData.date) {
                              try {
                                const attendanceRes = await api.getAttendanceDetail(employee.emp_no, permissionFormData.date);
                                if (!attendanceRes.success || !attendanceRes.data || !attendanceRes.data.inTime) {
                                  setPermissionValidationError('No attendance record found or employee has no in-time for this date. Permission cannot be created without attendance.');
                                } else {
                                  setPermissionValidationError('');
                                }
                              } catch (error) {
                                console.error('Error checking attendance:', error);
                              }
                            }
                          } else {
                            setPermissionFormData(prev => ({
                              ...prev,
                              employeeId: '',
                              employeeNumber: '',
                            }));
                            setPermissionValidationError('');
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Select Employee</option>
                        {employees && employees.length > 0 ? (
                          employees
                            .filter(emp => emp.emp_no) // Only require emp_no, not _id
                            .map((emp, index) => {
                              const identifier = emp._id || emp.emp_no;
                              return (
                                <option key={`perm-employee-${identifier}-${index}`} value={identifier}>
                                  {emp.emp_no} - {emp.employee_name || 'Unknown'}
                                </option>
                              );
                            })
                        ) : (
                          <option value="" disabled>No employees available</option>
                        )}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date *</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={permissionFormData.date}
                      onChange={async (e) => {
                        setPermissionFormData(prev => ({ ...prev, date: e.target.value }));
                        // Check attendance when date changes
                        if (permissionFormData.employeeNumber && e.target.value) {
                          try {
                            const attendanceRes = await api.getAttendanceDetail(permissionFormData.employeeNumber, e.target.value);
                            if (!attendanceRes.success || !attendanceRes.data || !attendanceRes.data.inTime) {
                              setPermissionValidationError('No attendance record found or employee has no in-time for this date. Permission cannot be created without attendance.');
                            } else {
                              setPermissionValidationError('');
                            }
                          } catch (error) {
                            console.error('Error checking attendance:', error);
                          }
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Attendance Validation Message for Permission */}
                  {permissionFormData.employeeNumber && permissionFormData.date && (
                    <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4 dark:border-orange-700 dark:bg-orange-900/20">
                      <div className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                          Note: Permission requires attendance with in-time for the selected date. Please ensure the employee has marked attendance.
                        </p>
                      </div>
                    </div>
                  )}

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
                    <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Comments (Optional)</label>
                    <textarea
                      value={permissionFormData.comments}
                      onChange={(e) => setPermissionFormData(prev => ({ ...prev, comments: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  {/* Photo Evidence */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
                    <LocationPhotoCapture
                      label="Live Photo Evidence"
                      onCapture={(loc, photo) => {
                        setEvidenceFile(photo.file);
                        setLocationData(loc);
                        (photo.file as any).exifLocation = photo.exifLocation;
                      }}
                      onClear={() => {
                        setEvidenceFile(null);
                        setLocationData(null);
                      }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50">
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
                    className="rounded-lg bg-gradient-to-r from-green-500 to-green-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-green-500/30 hover:from-green-600 hover:to-green-600 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Permission'}
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* QR Code Dialog */}
        {showQRDialog && selectedQR && (
          <Portal>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => {
                setShowQRDialog(false);
                setSelectedQR(null);
              }} />
              <div className="relative z-50 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
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
                  <div className="space-y-4 text-center">
                    <div className="space-y-2 mb-6">
                      <p className="font-semibold text-lg text-slate-900 dark:text-white">
                        {selectedQR.employeeId?.employee_name || selectedQR.employeeNumber}
                      </p>
                      <p className="text-sm text-slate-500">{formatDate(selectedQR.date)} • {formatTime(selectedQR.permissionStartTime)} - {formatTime(selectedQR.permissionEndTime)}</p>
                    </div>

                    {!selectedQR.gateOutTime ? (
                      <div className="space-y-4">
                        {selectedQR.qrCode && selectedQR.qrCode.startsWith('OUT:') ? (
                          <div className="space-y-4">
                            <p className="font-medium text-blue-600 dark:text-blue-400">Gate Out Pass Active</p>
                            <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-lg border-2 border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                              <QRCodeSVG
                                value={selectedQR.qrCode}
                                size={240}
                                level="H"
                                includeMargin={true}
                              />
                            </div>
                            <p className="text-xs text-slate-500">Show this QR to Security at Gate</p>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateGatePass('OUT')}
                            disabled={loading}
                            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50"
                          >
                            {loading ? 'Generating...' : 'Generate Gate Out Pass'}
                          </button>
                        )}
                      </div>
                    ) : !selectedQR.gateInTime ? (
                      <div className="space-y-4">
                        <div className="rounded-lg bg-yellow-50 p-3 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                          <p className="text-sm font-medium">Out Time: {formatTime(selectedQR.gateOutTime)}</p>
                        </div>

                        {/* Check 5 min buffer logic roughly for UI */}
                        {(() => {
                          const outTime = new Date(selectedQR.gateOutTime).getTime();
                          const now = new Date().getTime();
                          const diffMins = (now - outTime) / (1000 * 60);

                          if (diffMins < 5) {
                            return (
                              <div className="p-4 text-center">
                                <p className="text-sm text-slate-500 mb-2">Please wait before generating Gate In Pass</p>
                                <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                                  {Math.ceil(5 - diffMins)}m remaining
                                </p>
                              </div>
                            );
                          }

                          if (selectedQR.qrCode && selectedQR.qrCode.startsWith('IN:')) {
                            return (
                              <div className="space-y-4">
                                <p className="font-medium text-green-600 dark:text-green-400">Gate In Pass Active</p>
                                <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-lg border-2 border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                                  <QRCodeSVG
                                    value={selectedQR.qrCode}
                                    size={240}
                                    level="H"
                                    includeMargin={true}
                                  />
                                </div>
                                <p className="text-xs text-slate-500">Show this QR to Security at Gate</p>
                              </div>
                            );
                          }

                          return (
                            <button
                              onClick={() => handleGenerateGatePass('IN')}
                              disabled={loading}
                              className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 hover:bg-green-700 disabled:opacity-50"
                            >
                              {loading ? 'Generating...' : 'Generate Gate In Pass'}
                            </button>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-4 p-6 bg-green-50 rounded-xl dark:bg-green-900/20">
                        <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto dark:bg-green-800 dark:text-green-300">
                          <CheckIcon className="h-8 w-8" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-green-800 dark:text-green-300">Trip Completed</h3>
                          <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                            Out: {formatTime(selectedQR.gateOutTime)} • In: {formatTime(selectedQR.gateInTime)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Portal>
        )}


        {/* Evidence Viewer Dialog */}
        {showEvidenceDialog && selectedEvidenceItem && (
          <Portal>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEvidenceDialog(false)} />
              <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Evidence & Location</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedEvidenceItem.employeeName} • {formatDate(selectedEvidenceItem.date)}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowEvidenceDialog(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Photo Evidence */}
                  {selectedEvidenceItem.photoEvidence && (
                    <div>
                      <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-white">Photo Evidence</h3>
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                        <img
                          src={selectedEvidenceItem.photoEvidence.url}
                          alt="Evidence"
                          className="h-auto w-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Location Map */}
                  {selectedEvidenceItem.geoLocation && (
                    <div>
                      <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-white">Captured Location</h3>
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                        <iframe
                          width="100%"
                          height="300"
                          style={{ border: 0 }}
                          loading="lazy"
                          allowFullScreen
                          referrerPolicy="no-referrer-when-downgrade"
                          src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${selectedEvidenceItem.geoLocation.latitude},${selectedEvidenceItem.geoLocation.longitude}`}
                        />
                        <div className="bg-slate-50 p-3 dark:bg-slate-800">
                          <div className="flex items-start gap-2">
                            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Captured at</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">
                                {new Date(selectedEvidenceItem.geoLocation.capturedAt).toLocaleString()}
                              </p>
                              {selectedEvidenceItem.geoLocation.address && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {selectedEvidenceItem.geoLocation.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Portal>
        )}

      </div>
    </div>
  );
}

