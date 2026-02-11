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
import {
  Plus,
  Check,
  X,
  Calendar,
  Briefcase,
  Clock3,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Search,
  Filter,
  Eye,
  AlertCircle,
  Clock,
  ChevronRight,
  RotateCw,
  QrCode,
  FileText,
  Timer,
  Zap,
  MapPin,
  Scan,
  ImageIcon,
  Map,
  Navigation,
  ArrowRight,
  CheckCircle,
  Trash2,
  CheckSquare,
  ClipboardList,
  Activity
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getEmployeeInitials } from '@/lib/utils';

import {
  canApproveOT,
  canRejectOT,
  canApplyOT,
  canApprovePermission,
  canRejectPermission,
  canApplyPermission
} from '@/lib/permissions';

// Premium Stat Card
const StatCard = ({ title, value, icon: Icon, bgClass, iconClass, dekorClass, trend }: { title: string, value: number | string, icon: any, bgClass: string, iconClass: string, dekorClass?: string, trend?: { value: string, positive: boolean } }) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{title}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">{value}</h3>
          {trend && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${trend.positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
              {trend.value}
            </span>
          )}
        </div>
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgClass} ${iconClass}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
    {dekorClass && <div className={`absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${dekorClass}`} />}
  </div>
);

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
  status: 'pending' | 'approved' | 'rejected' | 'manager_approved' | 'manager_rejected';
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
  status: 'pending' | 'approved' | 'rejected' | 'manager_approved' | 'manager_rejected' | 'checked_out' | 'checked_in';
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

  const stats = useMemo(() => {
    const counts = {
      approvedOT: 0,
      approvedPermissions: 0,
      pendingOT: 0,
      pendingPermissions: 0,
      rejected: 0
    };

    otRequests.forEach(req => {
      if (req.status === 'approved') counts.approvedOT += req.otHours;
      else if (req.status === 'pending') counts.pendingOT++;
      else if (req.status === 'rejected') counts.rejected++;
    });

    permissions.forEach(req => {
      if (req.status === 'approved' || req.status === 'checked_in' || req.status === 'checked_out') counts.approvedPermissions++;
      else if (req.status === 'pending') counts.pendingPermissions++;
      else if (req.status === 'rejected') counts.rejected++;
    });

    return counts;
  }, [otRequests, permissions]);

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

    // Use Centralized Permissions for legacy/fallback logic
    // We determine the type of item by checking for specific fields
    const isOT = 'otHours' in item || 'otInTime' in item;
    const isPermission = 'permissionHours' in item || 'permissionStartTime' in item;

    if (isOT) {
      return canApproveOT(currentUser as any);
    }

    if (isPermission) {
      return canApprovePermission(currentUser as any);
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
      case 'manager_approved':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'checked_out':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'checked_in':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
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
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />

      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px] dark:bg-blue-500/10" />
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[120px] dark:bg-emerald-500/10" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Sticky Header */}
        <header className="sticky top-4 z-40 px-4 sm:px-8 mb-4">
          <div className="mx-auto max-w-[1920px] bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] border border-white/20 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-none px-6 sm:px-10 py-4 sm:py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-1">
                  <Briefcase className="w-3 h-3" />
                  <span>Workspace</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-blue-500">Overtime & Permissions</span>
                </div>
                <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 uppercase tracking-tight">
                  OT & Permissions
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {currentUser && canApplyOT(currentUser as any) && (
                  <button
                    onClick={() => { setActiveTab('ot'); setShowOTDialog(true); }}
                    className="h-10 px-6 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Apply OT</span>
                    <span className="sm:hidden">OT</span>
                  </button>
                )}
                {currentUser && canApplyPermission(currentUser as any) && (
                  <button
                    onClick={() => { setActiveTab('permissions'); setShowPermissionDialog(true); }}
                    className="h-10 px-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-500" />
                    <span className="hidden sm:inline">Apply Permission</span>
                    <span className="sm:hidden">Permission</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1920px] mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <StatCard
              title="Approved OT Hours"
              value={`${stats.approvedOT}h`}
              icon={Timer}
              bgClass="bg-blue-500/10"
              iconClass="text-blue-600 dark:text-blue-400"
              dekorClass="bg-blue-500/5"
            />
            <StatCard
              title="Pending Requests"
              value={stats.pendingOT + stats.pendingPermissions}
              icon={Clock3}
              bgClass="bg-amber-500/10"
              iconClass="text-amber-600 dark:text-amber-400"
              dekorClass="bg-amber-500/5"
              trend={{ value: `${stats.pendingOT} OT | ${stats.pendingPermissions} Perm`, positive: false }}
            />
            <StatCard
              title="Approved Permissions"
              value={stats.approvedPermissions}
              icon={CheckCircle2}
              bgClass="bg-emerald-500/10"
              iconClass="text-emerald-600 dark:text-emerald-400"
              dekorClass="bg-emerald-500/5"
            />
            <StatCard
              title="Rejected Requests"
              value={stats.rejected}
              icon={XCircle}
              bgClass="bg-rose-500/10"
              iconClass="text-rose-600 dark:text-rose-400"
              dekorClass="bg-rose-500/5"
            />
          </div>

          {/* Controls Section */}
          <div className="flex flex-col xl:flex-row gap-6">
            {/* Filters Card */}
            <div className="flex-1 p-5 sm:p-6 rounded-[2rem] border border-white/20 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
              <div className="flex flex-wrap items-center gap-6">
                {!isEmployee && (
                  <div className="flex-1 min-w-[200px] relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Search Employee Number..."
                      value={activeTab === 'ot' ? otFilters.employeeNumber : permissionFilters.employeeNumber}
                      onChange={(e) => {
                        if (activeTab === 'ot') setOTFilters(prev => ({ ...prev, employeeNumber: e.target.value }));
                        else setPermissionFilters(prev => ({ ...prev, employeeNumber: e.target.value }));
                      }}
                      className="w-full h-11 pl-11 pr-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all dark:text-white"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative">
                    <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={activeTab === 'ot' ? otFilters.status : permissionFilters.status}
                      onChange={(e) => {
                        if (activeTab === 'ot') setOTFilters(prev => ({ ...prev, status: e.target.value }));
                        else setPermissionFilters(prev => ({ ...prev, status: e.target.value }));
                      }}
                      className="h-10 pl-9 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="date"
                      value={activeTab === 'ot' ? otFilters.startDate : permissionFilters.startDate}
                      onChange={(e) => {
                        if (activeTab === 'ot') setOTFilters(prev => ({ ...prev, startDate: e.target.value }));
                        else setPermissionFilters(prev => ({ ...prev, startDate: e.target.value }));
                      }}
                      className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
                    />
                    <span className="text-slate-300 dark:text-slate-600 font-bold">→</span>
                    <input
                      type="date"
                      value={activeTab === 'ot' ? otFilters.endDate : permissionFilters.endDate}
                      onChange={(e) => {
                        if (activeTab === 'ot') setOTFilters(prev => ({ ...prev, endDate: e.target.value }));
                        else setPermissionFilters(prev => ({ ...prev, endDate: e.target.value }));
                      }}
                      className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Card */}
            <div className="xl:w-80 p-1.5 rounded-[2rem] border border-white/20 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-none flex items-center justify-between overflow-hidden">
              <button
                onClick={() => setActiveTab('ot')}
                className={`flex-1 h-12 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative group ${activeTab === 'ot'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg shadow-slate-900/20'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                OT
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex-1 h-12 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative group ${activeTab === 'permissions'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg shadow-slate-900/20'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                Perm
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex-1 h-12 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative group ${activeTab === 'pending'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg shadow-slate-900/20'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span className="relative z-10">Pending</span>
                {totalPending > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white border-2 border-white dark:border-slate-900 animate-bounce">
                    {totalPending}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : activeTab === 'pending' ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Pending OT Requests */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 ml-2">
                  <div className="w-2 h-8 bg-blue-500 rounded-full" />
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pending Overtime</h3>
                  <span className="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-black">
                    {pendingOTs.length}
                  </span>
                </div>

                {pendingOTs.length === 0 ? (
                  <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm">
                    <Clock className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Clear Workspace</h3>
                    <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No overtime requests requiring your approval.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {pendingOTs.map((ot) => (
                      <div key={ot._id} className="group relative flex flex-col justify-between rounded-[2.5rem] border border-white/20 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-none hover:-translate-y-1 transition-all duration-300">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 mb-6">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white font-black text-xs shadow-lg shadow-blue-500/20">
                              {getEmployeeInitials({
                                employee_name: ot.employeeId?.employee_name || '',
                                first_name: ot.employeeId?.employee_name?.split(' ')[0],
                                last_name: '',
                                emp_no: ''
                              } as any)}
                            </div>
                            <div>
                              <h4 className="font-black text-slate-900 dark:text-white text-sm line-clamp-1 group-hover:text-blue-600 transition-colors">
                                {ot.employeeId?.employee_name || ot.employeeNumber}
                              </h4>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                {ot.employeeNumber}
                              </p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">
                            PENDING
                          </span>
                        </div>

                        {/* Content Grid */}
                        <div className="grid grid-cols-2 gap-4 mb-6 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</p>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(ot.date)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                            <p className="text-xs font-black text-blue-600 dark:text-blue-400">{ot.otHours} hrs</p>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Time Window</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                              <Timer className="w-3 h-3 text-slate-400" />
                              {formatTime(ot.otInTime)} <ChevronRight className="w-3 h-3 text-slate-300" /> {formatTime(ot.otOutTime)}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleApprove('ot', ot._id)}
                            className="flex-1 h-10 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleReject('ot', ot._id)}
                            className="flex-1 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Permissions Requests */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 ml-2">
                  <div className="w-2 h-8 bg-emerald-500 rounded-full" />
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pending Permissions</h3>
                  <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                    {pendingPermissions.length}
                  </span>
                </div>

                {pendingPermissions.length === 0 ? (
                  <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm">
                    <Plus className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Clear Workspace</h3>
                    <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No permission requests requiring your approval.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {pendingPermissions.map((perm) => (
                      <div key={perm._id} className="group relative flex flex-col justify-between rounded-[2.5rem] border border-white/20 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/50 dark:shadow-none hover:-translate-y-1 transition-all duration-300">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 mb-6">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-black text-xs shadow-lg shadow-emerald-500/20">
                              {getEmployeeInitials({
                                employee_name: perm.employeeId?.employee_name || '',
                                first_name: perm.employeeId?.employee_name?.split(' ')[0],
                                last_name: '',
                                emp_no: ''
                              } as any)}
                            </div>
                            <div>
                              <h4 className="font-black text-slate-900 dark:text-white text-sm line-clamp-1 group-hover:text-emerald-600 transition-colors">
                                {perm.employeeId?.employee_name || perm.employeeNumber}
                              </h4>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                {perm.employeeNumber}
                              </p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">
                            PENDING
                          </span>
                        </div>

                        {/* Content Grid */}
                        <div className="grid grid-cols-2 gap-4 mb-6 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</p>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(perm.date)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hours</p>
                            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{perm.permissionHours} hrs</p>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Time Range</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                              <Timer className="w-3 h-3 text-slate-400" />
                              {formatTime(perm.permissionStartTime)} <ChevronRight className="w-3 h-3 text-slate-400" /> {formatTime(perm.permissionEndTime)}
                            </p>
                          </div>
                          {perm.purpose && (
                            <div className="col-span-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 italic line-clamp-2">
                                &quot;{perm.purpose}&quot;
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          {canPerformAction(perm) && (
                            <>
                              <button
                                onClick={() => handleApprove('permission', perm._id)}
                                className="flex-1 h-10 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => handleReject('permission', perm._id)}
                                className="flex-1 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          {perm.status === 'approved' && perm.qrCode && (
                            <button
                              onClick={() => {
                                setSelectedQR(perm);
                                setShowQRDialog(true);
                              }}
                              className="w-full h-10 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                            >
                              <QrCode className="h-3.5 w-3.5" /> Gate Pass
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            activeTab === 'ot' ? (
              <div className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/10 to-transparent rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-1000" />
                <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-slate-200/50 dark:shadow-none">
                  <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50">
                          {showEmployeeCol && <th scope="col" className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Employee</th>}
                          {showDivision && <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Division</th>}
                          {showDepartment && <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Department</th>}
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Date</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Shift</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">In Time</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">Out Time</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">Hours</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">Status</th>
                          <th scope="col" className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {otRequests.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-8 py-20 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                                  <Clock className="w-8 h-8 text-slate-300" />
                                </div>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No OT requests found</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          otRequests.map((ot) => (
                            <tr key={ot._id} className="group/row hover:bg-blue-50/30 dark:hover:bg-blue-500/5 transition-colors duration-300">
                              {showEmployeeCol && (
                                <td className="px-8 py-4">
                                  <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 min-w-[40px] rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-blue-500/20">
                                      {getEmployeeInitials({ employee_name: ot.employeeId?.employee_name || '', first_name: '', last_name: '', emp_no: '' } as any)}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 dark:text-white text-sm truncate max-w-[180px]">
                                        {ot.employeeId?.employee_name || ot.employeeNumber}
                                      </div>
                                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                        {ot.employeeNumber}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              )}
                              {showDivision && <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{ot.employeeId?.department?.division?.name || '-'}</td>}
                              {showDepartment && <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{ot.employeeId?.department?.name || '-'}</td>}
                              <td className="px-6 py-4 whitespace-nowrap text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">{formatDate(ot.date)}</td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {ot.shiftId?.name || '-'}
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatTime(ot.otInTime)}</td>
                              <td className="px-6 py-4 text-center text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatTime(ot.otOutTime)}</td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-black text-xs whitespace-nowrap">
                                  {ot.otHours}h
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`inline-flex items-center px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-sm whitespace-nowrap ${ot.status === 'approved' ? 'bg-emerald-500 text-white shadow-emerald-500/20' :
                                  ot.status === 'rejected' ? 'bg-rose-500 text-white shadow-rose-500/20' :
                                    'bg-amber-500 text-white shadow-amber-500/20'
                                  }`}>
                                  {ot.status}
                                </span>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                  {canPerformAction(ot) && (
                                    <>
                                      <button
                                        onClick={() => handleApprove('ot', ot._id)}
                                        className="h-9 px-4 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleReject('ot', ot._id)}
                                        className="h-9 px-4 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
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
              </div>
            ) : (
              <div className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 to-transparent rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-1000" />
                <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-slate-200/50 dark:shadow-none">
                  <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50">
                          {showEmployeeCol && <th scope="col" className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Employee</th>}
                          {showDivision && <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Division</th>}
                          {showDepartment && <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Department</th>}
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Date</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">Time Range</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">Hours</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Purpose</th>
                          <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">Status</th>
                          <th scope="col" className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {permissions.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-8 py-20 text-center">
                              <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                                  <Plus className="w-8 h-8 text-slate-300" />
                                </div>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No permission requests found</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          permissions.map((perm) => (
                            <tr key={perm._id} className="group/row hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-colors duration-300">
                              {showEmployeeCol && (
                                <td className="px-8 py-4">
                                  <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 min-w-[40px] rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-emerald-500/20">
                                      {getEmployeeInitials({ employee_name: perm.employeeId?.employee_name || '', first_name: '', last_name: '', emp_no: '' } as any)}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 dark:text-white text-sm truncate max-w-[180px]">
                                        {perm.employeeId?.employee_name || perm.employeeNumber}
                                      </div>
                                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                        {perm.employeeNumber}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              )}
                              {showDivision && <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{perm.employeeId?.department?.division?.name || '-'}</td>}
                              {showDepartment && <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{perm.employeeId?.department?.name || '-'}</td>}
                              <td className="px-6 py-4 whitespace-nowrap text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">{formatDate(perm.date)}</td>
                              <td className="px-6 py-4 text-center text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                  <Timer className="w-3 h-3" />
                                  {formatTime(perm.permissionStartTime)} - {formatTime(perm.permissionEndTime)}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-black text-xs whitespace-nowrap">
                                  {perm.permissionHours}h
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={perm.purpose}>{perm.purpose}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={`inline-flex items-center px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-sm whitespace-nowrap ${perm.status === 'approved' ? 'bg-emerald-500 text-white shadow-emerald-500/20' :
                                  perm.status === 'rejected' ? 'bg-rose-500 text-white shadow-rose-500/20' :
                                    perm.status === 'checked_out' ? 'bg-blue-500 text-white shadow-blue-500/20' :
                                      perm.status === 'checked_in' ? 'bg-emerald-500 text-white shadow-emerald-500/20' :
                                        'bg-amber-500 text-white shadow-amber-500/20'
                                  }`}>
                                  {perm.status.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                  {canPerformAction(perm) && (
                                    <>
                                      <button
                                        onClick={() => handleApprove('permission', perm._id)}
                                        className="h-9 px-4 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleReject('permission', perm._id)}
                                        className="h-9 px-4 rounded-xl bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
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
                                      className="h-9 px-4 rounded-xl bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2"
                                    >
                                      <QrCode className="w-3.5 h-3.5" />
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
              </div>
            )
          )}

          {/* OT Dialog */}
          {showOTDialog && (
            <Portal>
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowOTDialog(false)} />
                <div className="relative z-50 w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-white/20 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                        <Timer className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Apply Overtime</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Workspace Request</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowOTDialog(false); resetOTForm(); }}
                      className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                    {validationError && (
                      <div className="flex gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 animate-in slide-in-from-top-2 duration-300">
                        <XCircle className="w-5 h-5 shrink-0" />
                        <p className="text-xs font-bold leading-relaxed">{validationError}</p>
                      </div>
                    )}

                    {!isEmployee && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black underline decoration-blue-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                          Select Employee <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={otFormData.employeeId}
                          onChange={(e) => {
                            const employee = employees.find(emp => (emp._id === e.target.value) || (emp.emp_no === e.target.value));
                            if (employee && employee.emp_no) {
                              setOTFormData(prev => ({ ...prev, employeeId: employee._id || employee.emp_no, employeeNumber: employee.emp_no }));
                              handleEmployeeSelect(employee._id || employee.emp_no, employee.emp_no, otFormData.date);
                            }
                          }}
                          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all dark:text-white appearance-none cursor-pointer"
                        >
                          <option value="">Choose an employee...</option>
                          {employees.map((emp, i) => (
                            <option key={`ot-emp-${i}`} value={emp._id || emp.emp_no}>
                              {emp.emp_no} - {emp.employee_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black underline decoration-blue-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                        Select Date <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative group">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={otFormData.date}
                          onChange={(e) => {
                            setOTFormData(prev => ({ ...prev, date: e.target.value }));
                            if (otFormData.employeeId) handleEmployeeSelect(otFormData.employeeId, otFormData.employeeNumber, e.target.value);
                          }}
                          className="w-full h-12 pl-12 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all dark:text-white cursor-pointer"
                        />
                      </div>
                    </div>

                    {attendanceLoading ? (
                      <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        <p className="text-xs font-bold text-blue-600/70">Syncing attendance data...</p>
                      </div>
                    ) : (attendanceData || confusedShift) && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                          <Activity className="w-4 h-4 text-blue-500" />
                          Attendance Info
                        </div>

                        {attendanceData && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">In Time</p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">{formatTime(attendanceData.inTime)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Out Time</p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">{formatTime(attendanceData.outTime)}</p>
                            </div>
                          </div>
                        )}

                        {confusedShift && (
                          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-relaxed">
                              MULTIPLE SHIFTS DETECTED. PLEASE SELECT:
                            </p>
                            <select
                              value={otFormData.manuallySelectedShiftId}
                              onChange={(e) => {
                                const sid = e.target.value;
                                setOTFormData(prev => ({ ...prev, manuallySelectedShiftId: sid }));
                                const s = confusedShift.possibleShifts.find(ps => ps.shiftId === sid);
                                if (s) {
                                  setSelectedShift({ _id: s.shiftId, name: s.shiftName, startTime: s.startTime, endTime: s.endTime, duration: 0 });
                                  if (s.endTime) {
                                    const out = new Date(otFormData.date);
                                    const [h, m] = s.endTime.split(':').map(Number);
                                    out.setHours(h + 1, m, 0, 0);
                                    setOTFormData(prev => ({ ...prev, otOutTime: out.toISOString().slice(0, 16) }));
                                  }
                                }
                              }}
                              className="w-full h-10 px-3 rounded-lg border border-amber-500/30 bg-white dark:bg-slate-900 text-xs font-bold focus:ring-4 focus:ring-amber-500/10 outline-none transition-all dark:text-white cursor-pointer"
                            >
                              <option value="">Pick Shift...</option>
                              {confusedShift.possibleShifts.map((s, idx) => (
                                <option key={idx} value={s.shiftId}>{s.shiftName} ({s.startTime}-{s.endTime})</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(selectedShift || (confusedShift && otFormData.manuallySelectedShiftId)) && (
                          <div className="px-3 py-2 rounded-xl bg-blue-500/5 border border-blue-500/10">
                            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Proposed OT Start (Shift End)</p>
                            <p className="text-sm font-black text-blue-600 dark:text-blue-400">
                              {selectedShift?.endTime || confusedShift?.possibleShifts.find(s => s.shiftId === otFormData.manuallySelectedShiftId)?.endTime}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {!attendanceLoading && !attendanceData && otFormData.employeeId && otFormData.date && (
                      <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-3 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-[10px] font-bold leading-relaxed uppercase tracking-wider">No attendance record for this date.</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black underline decoration-blue-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                        OT End Date & Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={otFormData.otOutTime}
                        onChange={(e) => setOTFormData(prev => ({ ...prev, otOutTime: e.target.value }))}
                        className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all dark:text-white cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black underline decoration-blue-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                        Comments
                      </label>
                      <textarea
                        placeholder="Add any specific details here..."
                        value={otFormData.comments}
                        onChange={(e) => setOTFormData(prev => ({ ...prev, comments: e.target.value }))}
                        className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all dark:text-white min-h-[100px] resize-none"
                      />
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <LocationPhotoCapture
                        label="Submission Proof"
                        onCapture={(loc, photo) => {
                          setEvidenceFile(photo.file);
                          setLocationData(loc);
                          (photo.file as any).exifLocation = photo.exifLocation;
                        }}
                        onClear={() => { setEvidenceFile(null); setLocationData(null); }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="sticky bottom-0 z-10 p-6 sm:p-8 border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex items-center justify-end gap-3">
                    <button
                      onClick={() => { setShowOTDialog(false); resetOTForm(); }}
                      className="h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={handleCreateOT}
                      disabled={loading}
                      className="h-12 px-8 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 dark:shadow-white/10 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {loading ? 'Processing...' : 'Submit Request'}
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowPermissionDialog(false)} />
                <div className="relative z-50 w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-white/20 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Apply Permission</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Short Duration Break</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowPermissionDialog(false); resetPermissionForm(); }}
                      className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                    {permissionValidationError && (
                      <div className="flex gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 animate-in slide-in-from-top-2 duration-300">
                        <XCircle className="w-5 h-5 shrink-0" />
                        <p className="text-xs font-bold leading-relaxed">{permissionValidationError}</p>
                      </div>
                    )}

                    {!isEmployee && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black underline decoration-emerald-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                          Employee No <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={permissionFormData.employeeId}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (!val) {
                              setPermissionFormData(prev => ({ ...prev, employeeId: '', employeeNumber: '' }));
                              setPermissionValidationError('');
                              return;
                            }
                            const emp = employees.find(e => (e._id === val) || (e.emp_no === val));
                            if (emp && emp.emp_no) {
                              setPermissionFormData(prev => ({ ...prev, employeeId: emp._id || emp.emp_no, employeeNumber: emp.emp_no }));
                              setPermissionValidationError('');
                              if (permissionFormData.date) {
                                try {
                                  const res = await api.getAttendanceDetail(emp.emp_no, permissionFormData.date);
                                  if (!res.success || !res.data || !res.data.inTime) setPermissionValidationError('No active attendance for this date.');
                                } catch (err) { console.error(err); }
                              }
                            }
                          }}
                          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all dark:text-white appearance-none cursor-pointer"
                        >
                          <option value="">Choose employee...</option>
                          {employees.map((emp, i) => (
                            <option key={`p-emp-${i}`} value={emp._id || emp.emp_no}>{emp.emp_no} - {emp.employee_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black underline decoration-emerald-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                        Application Date <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative group">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={permissionFormData.date}
                          onChange={async (e) => {
                            const d = e.target.value;
                            setPermissionFormData(prev => ({ ...prev, date: d }));
                            if (permissionFormData.employeeNumber && d) {
                              try {
                                const res = await api.getAttendanceDetail(permissionFormData.employeeNumber, d);
                                if (!res.success || !res.data || !res.data.inTime) setPermissionValidationError('No active attendance for this date.');
                                else setPermissionValidationError('');
                              } catch (err) { console.error(err); }
                            }
                          }}
                          className="w-full h-12 pl-12 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all dark:text-white cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Start Time <span className="text-rose-500">*</span></label>
                        <input
                          type="datetime-local"
                          value={permissionFormData.permissionStartTime}
                          onChange={(e) => setPermissionFormData(prev => ({ ...prev, permissionStartTime: e.target.value }))}
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all dark:text-white cursor-pointer"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">End Time <span className="text-rose-500">*</span></label>
                        <input
                          type="datetime-local"
                          value={permissionFormData.permissionEndTime}
                          onChange={(e) => setPermissionFormData(prev => ({ ...prev, permissionEndTime: e.target.value }))}
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all dark:text-white cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black underline decoration-emerald-500/30 underline-offset-4 uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 ml-1">
                        Purpose of Break <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Personal errand, Medical..."
                        value={permissionFormData.purpose}
                        onChange={(e) => setPermissionFormData(prev => ({ ...prev, purpose: e.target.value }))}
                        className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all dark:text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Comments</label>
                      <textarea
                        value={permissionFormData.comments}
                        onChange={(e) => setPermissionFormData(prev => ({ ...prev, comments: e.target.value }))}
                        className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all dark:text-white min-h-[80px] resize-none"
                      />
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <LocationPhotoCapture
                        label="Check-in Photo (Required)"
                        onCapture={(loc, photo) => {
                          setEvidenceFile(photo.file);
                          setLocationData(loc);
                          (photo.file as any).exifLocation = photo.exifLocation;
                        }}
                        onClear={() => { setEvidenceFile(null); setLocationData(null); }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="sticky bottom-0 z-10 p-6 sm:p-8 border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex items-center justify-end gap-3">
                    <button
                      onClick={() => { setShowPermissionDialog(false); resetPermissionForm(); }}
                      className="h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreatePermission}
                      disabled={loading}
                      className="h-12 px-8 rounded-2xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {loading ? 'Processing...' : 'Request Permission'}
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300" onClick={() => { setShowQRDialog(false); setSelectedQR(null); }} />
                <div className="relative z-50 w-full max-w-sm rounded-[2.5rem] overflow-hidden bg-white dark:bg-slate-900 border border-white/20 shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="flex flex-col items-center p-8 text-center bg-gradient-to-b from-blue-500/5 to-transparent">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
                      <QrCode className="w-8 h-8 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Gate Pass</h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 mt-1">Permission Active</p>

                    <div className="w-full mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-left">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Employee Info</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{selectedQR.employeeId?.employee_name}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-2">{formatDate(selectedQR.date)}</p>
                    </div>
                  </div>

                  <div className="p-8 space-y-8 flex flex-col items-center">
                    {!selectedQR.gateOutTime ? (
                      <div className="w-full space-y-6">
                        {selectedQR.qrCode && selectedQR.qrCode.startsWith('OUT:') ? (
                          <div className="flex flex-col items-center gap-6">
                            <div className="p-4 rounded-[2rem] bg-white border-4 border-blue-500/20 shadow-2xl shadow-blue-500/10">
                              <QRCodeSVG value={selectedQR.qrCode} size={200} level="H" includeMargin={true} />
                            </div>
                            <div className="px-4 py-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                              <Scan className="w-3.5 h-3.5" />
                              Scan for Exit
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateGatePass('OUT')}
                            disabled={loading}
                            className="w-full h-14 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                          >
                            {loading ? 'Processing...' : 'Generate Exit Pass'}
                          </button>
                        )}
                      </div>
                    ) : !selectedQR.gateInTime ? (
                      <div className="w-full space-y-6">
                        <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-center">
                          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Exit Logged</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{formatTime(selectedQR.gateOutTime)}</p>
                        </div>

                        {(() => {
                          const diff = (new Date().getTime() - new Date(selectedQR.gateOutTime).getTime()) / 60000;
                          if (diff < 5) {
                            return (
                              <div className="text-center space-y-2">
                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 animate-[shimmer_2s_infinite]" style={{ width: `${(diff / 5) * 100}%` }} />
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry opens in {Math.ceil(5 - diff)}m</p>
                              </div>
                            );
                          }

                          if (selectedQR.qrCode && selectedQR.qrCode.startsWith('IN:')) {
                            return (
                              <div className="flex flex-col items-center gap-6">
                                <div className="p-4 rounded-[2rem] bg-white border-4 border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
                                  <QRCodeSVG value={selectedQR.qrCode} size={200} level="H" includeMargin={true} />
                                </div>
                                <div className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                  <Scan className="w-3.5 h-3.5" />
                                  Scan for Entry
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              onClick={() => handleGenerateGatePass('IN')}
                              disabled={loading}
                              className="w-full h-14 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              {loading ? 'Processing...' : 'Generate Entry Pass'}
                            </button>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="w-full p-8 rounded-[2.5rem] bg-emerald-500/5 border-2 border-dashed border-emerald-500/20 text-center animate-in zoom-in-95 duration-500">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                          <Check className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Access Logged</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Trip Completed Successfully</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => { setShowQRDialog(false); setSelectedQR(null); }}
                    className="w-full h-16 border-t border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all font-bold"
                  >
                    Close Pass
                  </button>
                </div>
              </div>
            </Portal>
          )}


          {/* Evidence Viewer Dialog */}
          {showEvidenceDialog && selectedEvidenceItem && (
            <Portal>
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowEvidenceDialog(false)} />
                <div className="relative z-50 w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-white/20 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">Evidence View</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 truncate">
                          {selectedEvidenceItem.employeeName} • {formatDate(selectedEvidenceItem.date)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowEvidenceDialog(false)}
                      className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Photo Section */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                          <ImageIcon className="w-3.5 h-3.5" />
                          Visual Proof
                        </div>
                        {selectedEvidenceItem.photoEvidence ? (
                          <div className="group relative rounded-[2rem] overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl shadow-slate-200 dark:shadow-none transition-transform hover:scale-[1.02]">
                            <img
                              src={selectedEvidenceItem.photoEvidence.url}
                              alt="Site Evidence"
                              className="w-full h-auto object-cover aspect-[4/5]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ) : (
                          <div className="aspect-[4/5] rounded-[2rem] bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No Photo Provided</p>
                          </div>
                        )}
                      </div>

                      {/* Map/Location Section */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                          <Map className="w-3.5 h-3.5" />
                          Geospatial Log
                        </div>
                        {selectedEvidenceItem.geoLocation ? (
                          <div className="space-y-6">
                            <div className="rounded-[2rem] overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl shadow-slate-200 dark:shadow-none h-[300px]">
                              <iframe
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                loading="lazy"
                                allowFullScreen
                                src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${selectedEvidenceItem.geoLocation.latitude},${selectedEvidenceItem.geoLocation.longitude}`}
                              />
                            </div>

                            <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 space-y-4">
                              <div className="flex items-start gap-4">
                                <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                  <Navigation className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black underline decoration-blue-500/30 underline-offset-4 uppercase tracking-widest text-slate-400 mb-1">Precise Coordinates</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                                    {selectedEvidenceItem.geoLocation.latitude.toFixed(6)}, {selectedEvidenceItem.geoLocation.longitude.toFixed(6)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-4">
                                <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                  <Clock className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black underline decoration-amber-500/30 underline-offset-4 uppercase tracking-widest text-slate-400 mb-1">Time Captured</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {new Date(selectedEvidenceItem.geoLocation.capturedAt).toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              {selectedEvidenceItem.geoLocation.address && (
                                <div className="flex items-start gap-4 pt-2 border-t border-slate-200 dark:border-slate-700">
                                  <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                    <MapPin className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Resolved Address</p>
                                    <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-relaxed italic">
                                      {selectedEvidenceItem.geoLocation.address}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="h-[400px] rounded-[2rem] bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <Navigation className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No Geo-Data Available</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex justify-end">
                    <button
                      onClick={() => setShowEvidenceDialog(false)}
                      className="h-12 px-8 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 dark:shadow-white/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Acknowledge Evidence
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </main>
      </div>
    </div>
  );
}



