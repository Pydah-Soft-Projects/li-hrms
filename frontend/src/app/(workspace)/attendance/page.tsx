'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';

interface AttendanceRecord {
  date: string;
  inTime: string | null;
  outTime: string | null;
  totalHours: number | null;
  status: 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'LEAVE' | 'OD';
  shiftId?: { _id: string; name: string; startTime: string; endTime: string; duration: number; payableShifts?: number } | string | null;
  isLateIn?: boolean;
  isEarlyOut?: boolean;
  lateInMinutes?: number | null;
  earlyOutMinutes?: number | null;
  expectedHours?: number | null;
  hasLeave?: boolean;
  leaveInfo?: {
    leaveId: string;
    leaveType: string;
    isHalfDay: boolean;
    halfDayType?: string;
    purpose?: string;
    fromDate?: string;
    toDate?: string;
    numberOfDays?: number;
    dayInLeave?: number;
    appliedAt?: string;
    approvedBy?: { name: string; email?: string } | null;
    approvedAt?: string;
  } | null;
  hasOD?: boolean;
  odInfo?: {
    odId: string;
    odType: string;
    odType_extended?: 'full_day' | 'half_day' | 'hours' | null; // NEW: OD type
    isHalfDay: boolean;
    halfDayType?: string;
    purpose?: string;
    placeVisited?: string;
    fromDate?: string;
    toDate?: string;
    numberOfDays?: number;
    durationHours?: number; // NEW: Duration in hours for hour-based OD
    odStartTime?: string; // NEW: Start time for hour-based OD
    odEndTime?: string; // NEW: End time for hour-based OD
    dayInOD?: number;
    appliedAt?: string;
    approvedBy?: { name: string; email?: string } | null;
    approvedAt?: string;
  } | null;
  isConflict?: boolean;
  otHours?: number;
  extraHours?: number;
  permissionHours?: number;
  permissionCount?: number;
  // NEW: OD Hours fields
  odHours?: number; // Hours spent on OD (hour-based OD only)
  odDetails?: {
    odStartTime?: string; // HH:MM format
    odEndTime?: string;   // HH:MM format
    durationHours?: number;
    odType?: string;
  };
}

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id: string; name: string };
  designation?: { _id: string; name: string };
}

interface MonthlyAttendanceData {
  employee: Employee;
  dailyAttendance: Record<string, AttendanceRecord | null>;
  presentDays?: number;
  payableShifts?: number;
  summary?: {
    _id: string;
    employeeId: string;
    emp_no: string;
    month: string;
    year: number;
    totalLeaves: number;
    totalODs: number;
    totalPresentDays: number;
    totalDaysInMonth: number;
    totalPayableShifts: number;
    lastCalculatedAt: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface Department {
  _id: string;
  name: string;
  code?: string;
}

interface Designation {
  _id: string;
  name: string;
  department: string;
}

// Table types borrowed from Pay Register for the 'basic' attendance table
type TableType = 'present' | 'absent' | 'leaves' | 'od' | 'ot' | 'extraHours' | 'shifts';

export default function AttendancePage() {
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'complete'>('list'); // Default to list view
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [selectedEmployeeForPayslip, setSelectedEmployeeForPayslip] = useState<Employee | null>(null);
  const [payslipData, setPayslipData] = useState<any>(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [calculatingPayroll, setCalculatingPayroll] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyAttendanceData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [attendanceDetail, setAttendanceDetail] = useState<any>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, AttendanceRecord | null>>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [syncingShifts, setSyncingShifts] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedEmployeeForSummary, setSelectedEmployeeForSummary] = useState<Employee | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  // Filter states
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('');
  const [filteredMonthlyData, setFilteredMonthlyData] = useState<MonthlyAttendanceData[]>([]);
  // New: attendance table display mode and active basic tab (inspired from pay-register)
  const [attendanceTableMode, setAttendanceTableMode] = useState<'complete' | 'basic' | TableType>('complete');
  
  
  // OutTime dialog state
  const [showOutTimeDialog, setShowOutTimeDialog] = useState(false);
  const [selectedRecordForOutTime, setSelectedRecordForOutTime] = useState<{ employee: Employee; date: string } | null>(null);
  const [outTimeValue, setOutTimeValue] = useState('');
  const [updatingOutTime, setUpdatingOutTime] = useState(false);

  // OT conversion state
  const [convertingToOT, setConvertingToOT] = useState(false);
  const [hasExistingOT, setHasExistingOT] = useState(false);

  // Shift selection and out-time state
  const [availableShifts, setAvailableShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [editingShift, setEditingShift] = useState(false);
  const [outTimeInput, setOutTimeInput] = useState('');
  const [editingOutTime, setEditingOutTime] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [savingOutTime, setSavingOutTime] = useState(false);

  // Leave conflict state
  const [leaveConflicts, setLeaveConflicts] = useState<any[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [revokingLeave, setRevokingLeave] = useState(false);
  const [updatingLeave, setUpdatingLeave] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      loadDesignations(selectedDepartment);
    } else {
      setDesignations([]);
      setSelectedDesignation('');
    }
  }, [selectedDepartment]);

  useEffect(() => {
    if (viewMode === 'list' || viewMode === 'complete') {
      loadMonthlyAttendance();
    } else if (viewMode === 'calendar') {
      loadAllEmployeesAttendance();
    }
  }, [viewMode, year, month, selectedDepartment, selectedDesignation]);

  useEffect(() => {
    // Apply filters to monthly data
    let filtered = [...monthlyData];
    
    if (selectedDepartment) {
      filtered = filtered.filter(item => 
        item.employee.department?._id === selectedDepartment
      );
    }
    
    if (selectedDesignation) {
      filtered = filtered.filter(item => 
        item.employee.designation?._id === selectedDesignation
      );
    }
    
    setFilteredMonthlyData(filtered);
  }, [monthlyData, selectedDepartment, selectedDesignation]);

  const loadDepartments = async () => {
    try {
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        setDepartments(response.data);
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadDesignations = async (departmentId: string) => {
    try {
      const response = await api.getDesignations(departmentId);
      if (response.success && response.data) {
        setDesignations(response.data);
      }
    } catch (err) {
      console.error('Error loading designations:', err);
    }
  };

  const loadMonthlyAttendance = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.getMonthlyAttendance(year, month);
      if (response.success) {
        setMonthlyData(response.data || []);
      } else {
        setError(response.message || 'Failed to load monthly attendance');
      }
    } catch (err: any) {
      console.error('Error loading monthly attendance:', err);
      setError(err.message || 'Failed to load monthly attendance');
    } finally {
      setLoading(false);
    }
  };

  const loadAllEmployeesAttendance = async () => {
    try {
      setLoadingAttendance(true);
      setError('');
      const response = await api.getMonthlyAttendance(year, month);
      if (response.success) {
        // Convert monthly data to calendar format for all employees
        const calendarData: Record<string, Record<string, AttendanceRecord | null>> = {};
        (response.data || []).forEach((item: MonthlyAttendanceData) => {
          // Apply filters
          if (selectedDepartment && item.employee.department?._id !== selectedDepartment) return;
          if (selectedDesignation && item.employee.designation?._id !== selectedDesignation) return;
          
          // Store dailyAttendance for this employee
          calendarData[item.employee._id] = item.dailyAttendance;
        });
        setAttendanceData(calendarData);
        setMonthlyData(response.data || []);
      } else {
        setError(response.message || 'Failed to load attendance');
      }
    } catch (err: any) {
      console.error('Error loading attendance:', err);
      setError(err.message || 'Failed to load attendance');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const loadAttendance = async () => {
    if (!selectedEmployee) return;
    
    try {
      setLoadingAttendance(true);
      const response = await api.getAttendanceCalendar(selectedEmployee.emp_no, year, month);
      if (response.success) {
        setAttendanceData(response.data || {});
      }
    } catch (err) {
      console.error('Error loading attendance:', err);
      setError('Failed to load attendance data');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const loadAvailableShifts = async (employeeNumber: string, date: string) => {
    try {
      setLoadingShifts(true);
      const response = await api.getAvailableShifts(employeeNumber, date);
      if (response.success && response.data) {
        setAvailableShifts(response.data);
      }
    } catch (err) {
      console.error('Error loading available shifts:', err);
    } finally {
      setLoadingShifts(false);
    }
  };

  const handleAssignShift = async () => {
    if (!selectedEmployee || !selectedDate || !selectedShiftId) {
      setError('Please select a shift');
      return;
    }

    try {
      setSavingShift(true);
      setError('');
      setSuccess('');

      const response = await api.assignShiftToAttendance(
        selectedEmployee.emp_no,
        selectedDate,
        selectedShiftId
      );

      if (response.success) {
        setSuccess('Shift assigned successfully!');
        setEditingShift(false);
        setSelectedShiftId('');
        
        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();
        
        // Refresh the detail view
        const updatedResponse = await api.getAttendanceDetail(selectedEmployee.emp_no, selectedDate);
        if (updatedResponse.success) {
          setAttendanceDetail(updatedResponse.data);
        }
        
        setTimeout(() => {
          setSuccess('');
        }, 2000);
      } else {
        setError(response.message || 'Failed to assign shift');
      }
    } catch (err: any) {
      console.error('Error assigning shift:', err);
      setError(err.message || 'An error occurred while assigning shift');
    } finally {
      setSavingShift(false);
    }
  };

  const handleSaveOutTime = async () => {
    if (!selectedEmployee || !selectedDate || !outTimeInput) {
      setError('Please enter out-time');
      return;
    }

    try {
      setSavingOutTime(true);
      setError('');
      setSuccess('');

      // Combine date with time to create proper datetime string
      const outTimeDateTime = `${selectedDate}T${outTimeInput}:00`;

      const response = await api.updateAttendanceOutTime(
        selectedEmployee.emp_no,
        selectedDate,
        outTimeDateTime
      );

      if (response.success) {
        setSuccess('Out-time updated successfully!');
        setEditingOutTime(false);
        setOutTimeInput('');
        
        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();
        
        // Refresh the detail view
        const updatedResponse = await api.getAttendanceDetail(selectedEmployee.emp_no, selectedDate);
        if (updatedResponse.success) {
          setAttendanceDetail(updatedResponse.data);
        }
        
        setTimeout(() => {
          setSuccess('');
        }, 2000);
      } else {
        setError(response.message || 'Failed to update out-time');
      }
    } catch (err: any) {
      console.error('Error updating out-time:', err);
      setError(err.message || 'An error occurred while updating out-time');
    } finally {
      setSavingOutTime(false);
    }
  };

  const loadLeaveConflicts = async (employeeNumber: string, date: string) => {
    try {
      setLoadingConflicts(true);
      const response = await api.getLeaveConflicts(employeeNumber, date);
      if (response.success && response.data) {
        setLeaveConflicts(response.data);
      } else {
        setLeaveConflicts([]);
      }
    } catch (err) {
      console.error('Error loading leave conflicts:', err);
      setLeaveConflicts([]);
    } finally {
      setLoadingConflicts(false);
    }
  };

  const handleRevokeLeave = async (leaveId: string) => {
    if (!selectedEmployee || !selectedDate) return;

    try {
      setRevokingLeave(true);
      setError('');
      setSuccess('');

      const response = await api.revokeLeaveForAttendance(leaveId);

      if (response.success) {
        setSuccess('Leave revoked successfully!');
        setLeaveConflicts([]);

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedResponse = await api.getAttendanceDetail(selectedEmployee.emp_no, selectedDate);
        if (updatedResponse.success) {
          setAttendanceDetail(updatedResponse.data);
        }

        // Reload conflicts
        await loadLeaveConflicts(selectedEmployee.emp_no, selectedDate);

        setTimeout(() => {
          setSuccess('');
        }, 3000);
      } else {
        setError(response.message || 'Failed to revoke leave');
      }
    } catch (err: any) {
      console.error('Error revoking leave:', err);
      setError(err.message || 'An error occurred while revoking leave');
    } finally {
      setRevokingLeave(false);
    }
  };

  const handleUpdateLeave = async (leaveId: string) => {
    if (!selectedEmployee || !selectedDate) return;

    try {
      setUpdatingLeave(true);
      setError('');
      setSuccess('');

      const response = await api.updateLeaveForAttendance(leaveId, selectedEmployee.emp_no, selectedDate);

      if (response.success) {
        setSuccess(response.message || 'Leave updated successfully!');
        setLeaveConflicts([]);

        // Reload attendance detail and monthly data
        await loadMonthlyAttendance();

        // Refresh the detail view
        const updatedResponse = await api.getAttendanceDetail(selectedEmployee.emp_no, selectedDate);
        if (updatedResponse.success) {
          setAttendanceDetail(updatedResponse.data);
        }

        // Reload conflicts
        await loadLeaveConflicts(selectedEmployee.emp_no, selectedDate);

        setTimeout(() => {
          setSuccess('');
        }, 3000);
      } else {
        setError(response.message || 'Failed to update leave');
      }
    } catch (err: any) {
      console.error('Error updating leave:', err);
      setError(err.message || 'An error occurred while updating leave');
    } finally {
      setUpdatingLeave(false);
    }
  };

  const handleDateClick = async (employee: Employee, date: string) => {
    setSelectedDate(date);
    setSelectedEmployee(employee);
    setHasExistingOT(false);
    setEditingShift(false);
    setEditingOutTime(false);
    setSelectedShiftId('');
    setOutTimeInput('');
    setLeaveConflicts([]);
    
    try {
      // Load available shifts for this employee/date
      await loadAvailableShifts(employee.emp_no, date);
      
      // Load leave conflicts
      await loadLeaveConflicts(employee.emp_no, date);
      
      // Get the daily attendance record from monthly data if available
      const employeeData = monthlyData.find(item => item.employee._id === employee._id);
      const dayRecord = employeeData?.dailyAttendance[date];
      
      // Check if OT already exists for this date
      try {
        const otResponse = await api.getOTRequests({
          employeeId: employee._id,
          employeeNumber: employee.emp_no,
          date: date,
          status: 'approved',
        });
        if (otResponse.success && otResponse.data && otResponse.data.length > 0) {
          setHasExistingOT(true);
        }
      } catch (otErr) {
        console.error('Error checking existing OT:', otErr);
      }
      
      // If we have the record with leave/OD info, use it directly
      if (dayRecord) {
        console.log('Day record from monthly data:', dayRecord);
        console.log('Leave info:', dayRecord.leaveInfo);
        setAttendanceDetail(dayRecord);
        setShowDetailDialog(true);
      } else {
        // Otherwise fetch from API
        const response = await api.getAttendanceDetail(employee.emp_no, date);
        if (response.success) {
          console.log('Day record from API:', response.data);
          setAttendanceDetail(response.data);
          setShowDetailDialog(true);
        }
      }
    } catch (err) {
      console.error('Error loading attendance detail:', err);
      setError('Failed to load attendance detail');
    }
  };

  const handleConvertExtraHoursToOT = async () => {
    if (!selectedEmployee || !selectedDate || !attendanceDetail) {
      setError('Missing employee or date information');
      return;
    }

    if (!attendanceDetail.extraHours || attendanceDetail.extraHours <= 0) {
      setError('No extra hours to convert');
      return;
    }

    if (hasExistingOT) {
      setError('OT record already exists for this date');
      return;
    }

    if (!attendanceDetail.shiftId) {
      setError('Shift not assigned. Please assign shift first.');
      return;
    }

    if (!confirm(`Convert ${attendanceDetail.extraHours.toFixed(2)} extra hours to OT for ${selectedDate}?`)) {
      return;
    }

    try {
      setConvertingToOT(true);
      setError('');
      setSuccess('');

      const response = await api.convertExtraHoursToOT({
        employeeId: selectedEmployee._id,
        employeeNumber: selectedEmployee.emp_no,
        date: selectedDate,
      });

      if (response.success) {
        setSuccess(response.message || 'Extra hours converted to OT successfully!');
        setHasExistingOT(true);
        
        // Update attendance detail - clear extra hours, add OT hours
        setAttendanceDetail({
          ...attendanceDetail,
          extraHours: 0,
          otHours: (attendanceDetail.otHours || 0) + attendanceDetail.extraHours,
        });

        // Reload monthly attendance to refresh the view
        await loadMonthlyAttendance();
        
        // Close dialog after a short delay
        setTimeout(() => {
          setShowDetailDialog(false);
          setSuccess('');
        }, 2000);
      } else {
        setError(response.message || 'Failed to convert extra hours to OT');
      }
    } catch (err: any) {
      console.error('Error converting extra hours to OT:', err);
      setError(err.message || 'An error occurred while converting');
    } finally {
      setConvertingToOT(false);
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleExcelUpload = async () => {
    if (!uploadFile) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setSuccess('');
      const response = await api.uploadAttendanceExcel(uploadFile);
      if (response.success) {
        setSuccess(response.message || 'File uploaded successfully');
        setUploadFile(null);
        setShowUploadDialog(false);
        const fileInput = document.getElementById('excel-upload-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        loadMonthlyAttendance();
      } else {
        setError(response.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await api.downloadAttendanceTemplate();
      setSuccess('Template downloaded successfully');
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const handleViewPayslip = async (employee: Employee) => {
    setSelectedEmployeeForPayslip(employee);
    setShowPayslipModal(true);
    setLoadingPayslip(true);
    setPayslipData(null);
    setError('');

    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const response = await api.getPayslip(employee._id, monthStr);

      if (response.success && response.data) {
        setPayslipData(response.data);
      } else {
        // If payslip doesn't exist, offer to calculate
        setError('Payslip not found. Would you like to calculate payroll?');
      }
    } catch (err: any) {
      console.error('Error loading payslip:', err);
      if (err.message?.includes('not found') || err.message?.includes('404')) {
        setError('Payslip not found. Would you like to calculate payroll?');
      } else {
        setError('Failed to load payslip');
      }
    } finally {
      setLoadingPayslip(false);
    }
  };

  const handleCalculatePayroll = async () => {
    if (!selectedEmployeeForPayslip) return;

    try {
      setCalculatingPayroll(true);
      setError('');
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const response = await api.calculatePayroll(selectedEmployeeForPayslip._id, monthStr);

      if (response.success) {
        toast.success('Payroll calculated successfully!');
        // Reload payslip
        const payslipResponse = await api.getPayslip(selectedEmployeeForPayslip._id, monthStr);
        if (payslipResponse.success && payslipResponse.data) {
          setPayslipData(payslipResponse.data);
          setError('');
        }
      } else {
        const errorMsg = response.message || 'Failed to calculate payroll';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err: any) {
      console.error('Error calculating payroll:', err);
      setError(err.message || 'Failed to calculate payroll');
    } finally {
      setCalculatingPayroll(false);
    }
  };

  const handleEmployeeClick = async (employee: Employee) => {
    setSelectedEmployeeForSummary(employee);
    setShowSummaryModal(true);
    setLoadingSummary(true);
    try {
      // First try to get summary from the monthly data if available
      const employeeData = monthlyData.find(item => item.employee._id === employee._id);
      if (employeeData && employeeData.summary) {
        setMonthlySummary(employeeData.summary);
        setLoadingSummary(false);
        return;
      }
      
      // If not in monthly data, fetch from API
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const response = await api.getMonthlySummary(employee._id, monthStr);
      if (response.success) {
        setMonthlySummary(response.data);
      } else {
        setError('Failed to load monthly summary');
      }
    } catch (err: any) {
      console.error('Error loading monthly summary:', err);
      setError('Failed to load monthly summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleSyncShifts = async () => {
    if (!confirm('This will sync shifts for all attendance records that don\'t have shifts assigned. This may take a few minutes. Continue?')) {
      return;
    }

    try {
      setSyncingShifts(true);
      setError('');
      setSuccess('');
      const response = await api.syncShifts();
      if (response.success) {
        setSuccess(response.message || `Processed ${response.data?.processed || 0} records: ${response.data?.assigned || 0} assigned, ${response.data?.confused || 0} flagged for review`);
        loadMonthlyAttendance();
      } else {
        setError(response.message || 'Failed to sync shifts');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during shift sync');
    } finally {
      setSyncingShifts(false);
    }
  };

  const handleUpdateOutTime = async () => {
    if (!selectedRecordForOutTime || !outTimeValue) {
      alert('Please enter out time');
      return;
    }

    try {
      setUpdatingOutTime(true);
      setError('');
      setSuccess('');
      
      // Format datetime for API
      const outTimeDate = new Date(outTimeValue);
      const isoString = outTimeDate.toISOString();
      
      const response = await api.updateAttendanceOutTime(
        selectedRecordForOutTime.employee.emp_no,
        selectedRecordForOutTime.date,
        isoString
      );
      
      if (response.success) {
        setSuccess('Out time updated successfully. Shift will be automatically assigned.');
        setShowOutTimeDialog(false);
        setSelectedRecordForOutTime(null);
        setOutTimeValue('');
        loadMonthlyAttendance();
      } else {
        setError(response.message || 'Failed to update out time');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating out time');
    } finally {
      setUpdatingOutTime(false);
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = () => {
    const lastDay = new Date(year, month, 0);
    return lastDay.getDate();
  };

  const getCalendarDays = () => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        day,
        date: dateStr,
      });
    }
    
    return days;
  };

  const getStatusColor = (record: AttendanceRecord | null) => {
    if (!record) return '';
    if (record.status === 'PRESENT') return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/10 dark:border-green-800 dark:text-green-400';
    if (record.status === 'PARTIAL') return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/10 dark:border-yellow-800 dark:text-yellow-400';
    return '';
  };

  const getCellBackgroundColor = (record: AttendanceRecord | null) => {
    if (!record) {
      return 'bg-slate-100 dark:bg-slate-800';
    }
    
    // Priority: Conflict (purple) > Leave (orange) > OD (blue) > Absent (gray) > Present (default)
    if (record.isConflict) {
      return 'bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700';
    }
    if (record.hasLeave && !record.hasOD) {
      return 'bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700';
    }
    if (record.hasOD && !record.hasLeave) {
      return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700';
    }
    if (record.hasLeave && record.hasOD) {
      // Both leave and OD - show as conflict
      return 'bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700';
    }
    if (record.status === 'ABSENT' || record.status === 'LEAVE' || record.status === 'OD') {
      return 'bg-slate-100 dark:bg-slate-800';
    }
    return '';
  };

    // Helpers for 'basic' table mode (inspired from pay-register)
    const shouldShowInTable = (record: AttendanceRecord | null, tableType: TableType): boolean => {
      if (!record) return false;
      switch (tableType) {
        case 'present':
          return record.status === 'PRESENT' || record.status === 'PARTIAL';
        case 'absent':
          return record.status === 'ABSENT';
        case 'leaves':
          return record.status === 'LEAVE' || !!record.hasLeave;
        case 'od':
          return record.status === 'OD' || !!record.hasOD;
        case 'ot':
          return (record.otHours || 0) > 0;
        case 'extraHours':
          return (record.extraHours || 0) > 0;
        case 'shifts':
          return !!record.shiftId;
        default:
          return false;
      }
    };

    const getCellBackgroundColorForTable = (record: AttendanceRecord | null, tableType: TableType): string => {
      if (!record) return '';
      switch (tableType) {
        case 'present':
          return (record.status === 'PRESENT' || record.status === 'PARTIAL') ? 'bg-green-100 dark:bg-green-900/30' : '';
        case 'absent':
          return record.status === 'ABSENT' ? 'bg-red-100 dark:bg-red-900/30' : '';
        case 'leaves':
          return (record.status === 'LEAVE' || record.hasLeave) ? 'bg-orange-100 dark:bg-orange-900/30' : '';
        case 'od':
          return (record.status === 'OD' || record.hasOD) ? 'bg-blue-100 dark:bg-blue-900/30' : '';
        case 'ot':
        case 'extraHours':
          return ((record.otHours || 0) > 0 || (record.extraHours || 0) > 0) ? 'bg-orange-100 dark:bg-orange-900/30' : '';
        case 'shifts':
          return (record.shiftId) ? 'bg-indigo-100 dark:bg-indigo-900/30' : '';
        default:
          return '';
      }
    };

    const countEmployeesForTable = (tableType: TableType) =>
      filteredMonthlyData.filter((item) => {
        return Object.keys(item.dailyAttendance).some((date) => shouldShowInTable(item.dailyAttendance[date] || null, tableType));
      }).length;

  const formatTime = (time: string | null, showDateIfDifferent?: boolean, recordDate?: string) => {
    if (!time) return '-';
    try {
      const date = new Date(time);
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      // If showDateIfDifferent is true and recordDate is provided, check if dates differ
      if (showDateIfDifferent && recordDate) {
        const timeDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (timeDateStr !== recordDate) {
          // Dates are different - show date with time
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return `${dateStr}, ${timeStr}`;
        }
      }
      
      return timeStr;
    } catch {
      return time;
    }
  };

  const formatHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return '-';
    return `${hours.toFixed(2)}h`;
  };

  const daysInMonth = getDaysInMonth();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px]">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Attendance Management</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">View and manage employee attendance records</p>
        </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Department Filter */}
            <select
              value={selectedDepartment}
              onChange={(e) => {
                setSelectedDepartment(e.target.value);
                setSelectedDesignation('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
          
            {/* Designation Filter */}
          {selectedDepartment && (
              <select
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All Designations</option>
                {designations.map((desig) => (
                  <option key={desig._id} value={desig._id}>
                    {desig.name}
                  </option>
                ))}
              </select>
          )}

          {/* View Toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setViewMode('list')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="mr-1.5 inline h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                List View
              </button>
              <button
                onClick={() => {
                  setViewMode('calendar');
                  if (!selectedEmployee && monthlyData.length > 0) {
                    setSelectedEmployee(monthlyData[0].employee);
                  }
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="mr-1.5 inline h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Calendar View
              </button>
              <button
                onClick={() => setViewMode('complete')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'complete'
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="mr-1.5 inline h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Complete
              </button>
            </div>

            {/* Month Selection */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => navigateMonth('prev')}
                className="rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <select
                value={month}
                onChange={(e) => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(parseInt(e.target.value) - 1);
                  setCurrentDate(newDate);
                }}
                className="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-0 dark:text-white"
              >
                {monthNames.map((name, idx) => (
                  <option key={idx} value={idx + 1}>{name}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => {
                  const newDate = new Date(currentDate);
                  newDate.setFullYear(parseInt(e.target.value));
                  setCurrentDate(newDate);
                }}
                className="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-0 dark:text-white"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => navigateMonth('next')}
                className="rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Sync Shifts Button */}
            <button
              onClick={handleSyncShifts}
              disabled={syncingShifts}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {syncingShifts ? (
                <>
                  <div className="mr-2 inline h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-transparent"></div>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Shifts
                </>
              )}
            </button>

            {/* Upload Excel Button */}
            <button
              onClick={() => setShowUploadDialog(true)}
              className="rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Excel
            </button>

            {/* Table Mode Selector (Complete / Basic / Types) */}
            <div className="ml-2">
              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">Table Mode</label>
              <select
                value={attendanceTableMode}
                onChange={(e) => setAttendanceTableMode(e.target.value as any)}
                className="rounded-md border border-slate-200 px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              >
                <option value="complete">Complete</option>
                <option value="basic">Basic (Present + Absent)</option>
                <option value="present">Present {`(${countEmployeesForTable('present')})`}</option>
                <option value="absent">Absent {`(${countEmployeesForTable('absent')})`}</option>
                <option value="leaves">Leaves {`(${countEmployeesForTable('leaves')})`}</option>
                <option value="od">OD {`(${countEmployeesForTable('od')})`}</option>
                <option value="ot">OT {`(${countEmployeesForTable('ot')})`}</option>
                <option value="extraHours">Extra Hours {`(${countEmployeesForTable('extraHours')})`}</option>
                <option value="shifts">Shifts {`(${countEmployeesForTable('shifts')})`}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}


        {/* List View */}
        {viewMode === 'list' && (
          <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-xl dark:border-slate-700 dark:bg-slate-900/80">

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <th className="sticky left-0 z-10 w-[180px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        Employee
                      </th>
                      {daysArray.map((day) => (
                        <th
                          key={day}
                          className="w-[calc((100%-180px-80px)/31)] border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300"
                        >
                          {day}
                        </th>
                      ))}
                      <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/20">
                        Days Present
                      </th>
                    <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-orange-50 dark:bg-orange-900/20">
                      OT Hours
                    </th>
                    <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-purple-50 dark:bg-purple-900/20">
                      Extra Hours
                    </th>
                    {/* NEW: OD Hours Column */}
                    <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-fuchsia-50 dark:bg-fuchsia-900/20">
                      OD Hours
                    </th>
                    <th className="w-[80px] border-r border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-cyan-50 dark:bg-cyan-900/20">
                      Permissions
                    </th>
                      <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20">
                        Payable Shifts
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {loading ? (
                    <>
                      {/* Skeleton Loading - only tbody cells */}
                      {[1, 2, 3, 4, 5].map((i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                            <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                          {daysArray.map((day) => (
                            <td
                              key={day}
                              className="border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700"
                            >
                              <div className="h-8 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                            </td>
                          ))}
                          <td className="border-r border-slate-200 bg-blue-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-blue-900/20">
                            <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                          <td className="border-r border-slate-200 bg-orange-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-orange-900/20">
                            <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                          <td className="border-r border-slate-200 bg-purple-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-purple-900/20">
                            <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                          <td className="border-r border-slate-200 bg-cyan-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-cyan-900/20">
                            <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                          <td className="border-r-0 border-slate-200 bg-green-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-green-900/20">
                            <div className="h-4 w-8 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : (
                    <>
                    {filteredMonthlyData.length === 0 ? (
                      <tr>
                          <td colSpan={daysArray.length + 5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                          No employees found matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredMonthlyData.map((item) => {
                        // Use presentDays from API if available, otherwise calculate
                        const daysPresent = item.presentDays !== undefined 
                          ? item.presentDays 
                          : Object.values(item.dailyAttendance).filter(
                              (record) => record && (record.status === 'PRESENT' || record.status === 'PARTIAL')
                            ).length;
                        const payableShifts = item.payableShifts !== undefined ? item.payableShifts : 0;
                        
                        return (
                          <tr key={item.employee._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                              <div>
                                <div className="flex items-center gap-2">
                                <div 
                                    className="font-semibold truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-1"
                                  onClick={() => handleEmployeeClick(item.employee)}
                                  title="Click to view monthly summary"
                                >
                                  {item.employee.employee_name}
                                </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewPayslip(item.employee);
                                    }}
                                    className="rounded-md bg-gradient-to-r from-green-500 to-green-600 px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:from-green-600 hover:to-green-700 hover:shadow-md"
                                    title="View Payslip"
                                  >
                                    Payslip
                                  </button>
                                </div>
                                <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-1">
                                  {item.employee.emp_no}
                                  {item.employee.department && ` • ${(item.employee.department as any)?.name || ''}`}
                                </div>
                              </div>
                            </td>
                            {daysArray.map((day) => {
                              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const record = item.dailyAttendance[dateStr] || null;
                              const shiftName = record?.shiftId && typeof record.shiftId === 'object' ? record.shiftId.name : '-';

                              // Determine display status - check for leave/OD even if no attendance record
                              let displayStatus = 'A';
                              if (record) {
                                if (record.status === 'PRESENT') displayStatus = 'P';
                                else if (record.status === 'PARTIAL') displayStatus = 'PT';
                                else if (record.status === 'LEAVE' || record.hasLeave) displayStatus = 'L';
                                else if (record.status === 'OD' || record.hasOD) displayStatus = 'OD';
                                else displayStatus = 'A';
                              }

                              // Determine whether this cell matches the current table mode selection
                              const matchesMode = (() => {
                                if (attendanceTableMode === 'complete') return true;
                                if (attendanceTableMode === 'basic') {
                                  return shouldShowInTable(record, 'present') || shouldShowInTable(record, 'absent');
                                }
                                // attendanceTableMode may be a TableType string
                                return shouldShowInTable(record, attendanceTableMode as TableType);
                              })();

                              // Check if there's any data to display (attendance, leave, or OD)
                              const hasData = record && (record.status || record.hasLeave || record.hasOD);

                              return (
                                <td
                                  key={day}
                                  onClick={() => matchesMode && hasData && handleDateClick(item.employee, dateStr)}
                                  className={`border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700 ${
                                    matchesMode && hasData ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                                  } ${getStatusColor(record)} ${attendanceTableMode !== 'complete' && attendanceTableMode !== 'basic' ? getCellBackgroundColorForTable(record, attendanceTableMode as TableType) : getCellBackgroundColor(record)}`}
                                >
                                  {matchesMode && hasData ? (
                                    <div className="space-y-0.5">
                                      <div className="font-semibold text-[9px]">{displayStatus}</div>
                                      {shiftName !== '-' && record?.shiftId && (
                                        <div className="text-[8px] opacity-75 truncate" title={shiftName}>{shiftName.substring(0, 3)}</div>
                                      )}
                                      {record && record.totalHours !== null && (
                                        <div className="text-[8px] font-semibold">{formatHours(record.totalHours)}</div>
                                      )}
                                      {/* NEW: Show OD hours if available */}
                                      {record && record.odHours && record.odHours > 0 && (
                                        <div className="text-[8px] font-semibold text-purple-600 dark:text-purple-300">{record.odHours}h OD</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-[9px]">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="border-r border-slate-200 bg-blue-50 px-2 py-2 text-center text-[11px] font-bold text-blue-700 dark:border-slate-700 dark:bg-blue-900/20 dark:text-blue-300">
                              {daysPresent}
                            </td>
                            <td className="border-r border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300">
                              {Object.values(item.dailyAttendance).reduce((sum, record) => sum + (record?.otHours || 0), 0).toFixed(1)}
                            </td>
                            <td className="border-r border-slate-200 bg-purple-50 px-2 py-2 text-center text-[11px] font-bold text-purple-700 dark:border-slate-700 dark:bg-purple-900/20 dark:text-purple-300">
                              {Object.values(item.dailyAttendance).reduce((sum, record) => sum + (record?.extraHours || 0), 0).toFixed(1)}
                            </td>
                            {/* NEW: OD Hours in table */}
                            <td className="border-r border-slate-200 bg-fuchsia-50 px-2 py-2 text-center text-[11px] font-bold text-fuchsia-700 dark:border-slate-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-300">
                              {Object.values(item.dailyAttendance).reduce((sum, record) => sum + (record?.odHours || 0), 0).toFixed(1)}
                            </td>
                            <td className="border-r border-slate-200 bg-cyan-50 px-2 py-2 text-center text-[11px] font-bold text-cyan-700 dark:border-slate-700 dark:bg-cyan-900/20 dark:text-cyan-300">
                              {Object.values(item.dailyAttendance).reduce((sum, record) => sum + (record?.permissionCount || 0), 0)}
                            </td>
                            <td className="border-r-0 border-slate-200 bg-green-50 px-2 py-2 text-center text-[11px] font-bold text-green-700 dark:border-slate-700 dark:bg-green-900/20 dark:text-green-300">
                              {payableShifts.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                      )}
                    </>
                    )}
                  </tbody>
                </table>
              </div>
          </div>
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div className="space-y-6">
            {loadingAttendance ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 35 }).map((_, j) => (
                          <div key={j} className="h-12 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              filteredMonthlyData.map((item) => (
                <div key={item.employee._id} className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                  <div className="mb-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.employee.employee_name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {item.employee.emp_no}
                      {item.employee.department && ` • ${(item.employee.department as any)?.name || ''}`}
                    </p>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {dayNames.map((day) => (
                      <div key={day} className="p-1 text-center text-[9px] font-semibold text-slate-600 dark:text-slate-400">
                        {day}
                      </div>
                    ))}
                    {getCalendarDays().map((dayInfo) => {
                      if (!dayInfo) {
                        return <div key={`empty-${Math.random()}`} className="aspect-square"></div>;
                      }
                      const record = item.dailyAttendance[dayInfo.date] || null;
                      return (
                        <div
                          key={dayInfo.date}
                          onClick={() => record && handleDateClick(item.employee, dayInfo.date)}
                          className={`aspect-square cursor-pointer rounded border p-0.5 transition-all hover:scale-105 ${
                            record ? 'cursor-pointer' : ''
                          } ${getStatusColor(record)} ${getCellBackgroundColor(record)}`}
                        >
                          <div className="flex h-full flex-col items-center justify-center text-center">
                            <div className="text-[10px] font-bold">{dayInfo.day}</div>
                            {record && (
                              <>
                                {record.hasLeave && (
                                  <div className="mt-0.5 text-[7px] font-semibold text-orange-700 dark:text-orange-300">
                                    L
                                  </div>
                                )}
                                {record.hasOD && (
                                  <div className="mt-0.5 text-[7px] font-semibold text-blue-700 dark:text-blue-300">
                                    OD
                                  </div>
                                )}
                                {/* NEW: Show OD hours if available */}
                                {record.odHours && record.odHours > 0 && (
                                  <div className="mt-0.5 text-[7px] font-semibold text-purple-700 dark:text-purple-300">
                                    {record.odHours}h OD
                                  </div>
                                )}
                                {record.shiftId && typeof record.shiftId === 'object' && (
                                  <div className="mt-0.5 text-[7px] font-medium opacity-75 truncate w-full" title={record.shiftId.name}>
                                    {record.shiftId.name.substring(0, 3)}
                                  </div>
                                )}
                                {record.totalHours !== null && (
                                  <div className="mt-0.5 text-[7px] font-semibold">
                                    {formatHours(record.totalHours)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            {!loadingAttendance && filteredMonthlyData.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-12 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <p className="text-slate-500 dark:text-slate-400">No employees found matching the selected filters.</p>
              </div>
            )}
          </div>
        )}

        {/* Complete View - Detailed Summary Table */}
        {viewMode === 'complete' && (
          <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-green-50 dark:border-slate-700 dark:from-slate-800 dark:to-green-900/20">
                    <th className="sticky left-0 z-10 w-[200px] border-r border-slate-200 bg-gradient-to-r from-slate-50 to-green-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:from-slate-800 dark:to-green-900/20 dark:text-slate-300">
                      Employee Details
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/20">
                      Present Days
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50 dark:bg-red-900/20">
                      Leaves
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-purple-50 dark:bg-purple-900/20">
                      ODs
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-orange-50 dark:bg-orange-900/20">
                      OT Hours
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-red-50 dark:bg-red-900/20">
                      Extra Hours
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-fuchsia-50 dark:bg-fuchsia-900/20">
                      OD Hours
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-cyan-50 dark:bg-cyan-900/20">
                      Permissions
                    </th>
                    <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-900/20">
                      Absent Days
                    </th>
                    <th className="w-[100px] border-r-0 border-slate-200 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20">
                      Payable Shifts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {loading ? (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                            <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                            <div className="mt-1 h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                          </td>
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                              <div className="h-4 w-12 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ) : (
                    <>
                      {filteredMonthlyData.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No employees found matching the selected filters.
                          </td>
                        </tr>
                      ) : (
                        filteredMonthlyData.map((item) => {
                          // Calculate summary statistics
                          const daysPresent = item.presentDays !== undefined 
                            ? item.presentDays 
                            : Object.values(item.dailyAttendance).filter(
                                (record) => record && (record.status === 'PRESENT' || record.status === 'PARTIAL')
                              ).length;
                          
                          const totalLeaves = item.summary?.totalLeaves || 
                            Object.values(item.dailyAttendance).filter(
                              (record) => record && (record.status === 'LEAVE' || record.hasLeave)
                            ).length;
                          
                          const totalODs = item.summary?.totalODs || 
                            Object.values(item.dailyAttendance).filter(
                              (record) => record && (record.status === 'OD' || record.hasOD)
                            ).length;
                          
                          const totalOTHours = Object.values(item.dailyAttendance).reduce(
                            (sum, record) => sum + (record?.otHours || 0), 0
                          );
                          
                          const totalExtraHours = Object.values(item.dailyAttendance).reduce(
                            (sum, record) => sum + (record?.extraHours || 0), 0
                          );
                          
                          const totalODHours = Object.values(item.dailyAttendance).reduce(
                            (sum, record) => sum + (record?.odHours || 0), 0
                          );
                          
                          const totalPermissions = Object.values(item.dailyAttendance).reduce(
                            (sum, record) => sum + (record?.permissionCount || 0), 0
                          );
                          
                          const totalAbsent = Object.values(item.dailyAttendance).filter(
                            (record) => record && record.status === 'ABSENT' && !record.hasLeave && !record.hasOD
                          ).length;
                          
                          const payableShifts = item.payableShifts !== undefined ? item.payableShifts : 0;
                          const totalDaysInMonth = item.summary?.totalDaysInMonth || daysInMonth;
                          
                          return (
                            <tr 
                              key={item.employee._id} 
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                              onClick={() => handleEmployeeClick(item.employee)}
                            >
                              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1">
                                    <div className="font-semibold text-slate-900 dark:text-white text-sm">
                                      {item.employee.employee_name}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                      {item.employee.emp_no}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {item.employee.department && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded">
                                          {(item.employee.department as any)?.name || ''}
                                        </span>
                                      )}
                                      {item.employee.designation && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded">
                                          {(item.employee.designation as any)?.name || ''}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewPayslip(item.employee);
                                    }}
                                    className="rounded-md bg-gradient-to-r from-green-500 to-green-600 px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:from-green-600 hover:to-green-700 hover:shadow-md"
                                    title="View Payslip"
                                  >
                                    Payslip
                                  </button>
                                </div>
                              </td>
                              <td className="border-r border-slate-200 bg-blue-50 px-3 py-3 text-center text-sm font-bold text-blue-700 dark:border-slate-700 dark:bg-blue-900/20 dark:text-blue-300">
                                {daysPresent}
                              </td>
                              <td className="border-r border-slate-200 bg-red-50 px-3 py-3 text-center text-sm font-bold text-red-700 dark:border-slate-700 dark:bg-red-900/20 dark:text-red-300">
                                {totalLeaves.toFixed(1)}
                              </td>
                              <td className="border-r border-slate-200 bg-purple-50 px-3 py-3 text-center text-sm font-bold text-purple-700 dark:border-slate-700 dark:bg-purple-900/20 dark:text-purple-300">
                                {totalODs.toFixed(1)}
                              </td>
                              <td className="border-r border-slate-200 bg-orange-50 px-3 py-3 text-center text-sm font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300">
                                {totalOTHours.toFixed(1)}h
                              </td>
                              <td className="border-r border-slate-200 bg-red-50 px-3 py-3 text-center text-sm font-bold text-red-700 dark:border-slate-700 dark:bg-red-900/20 dark:text-red-300">
                                {totalExtraHours.toFixed(1)}h
                              </td>
                              <td className="border-r border-slate-200 bg-fuchsia-50 px-3 py-3 text-center text-sm font-bold text-fuchsia-700 dark:border-slate-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-300">
                                {totalODHours.toFixed(1)}h
                              </td>
                              <td className="border-r border-slate-200 bg-cyan-50 px-3 py-3 text-center text-sm font-bold text-cyan-700 dark:border-slate-700 dark:bg-cyan-900/20 dark:text-cyan-300">
                                {totalPermissions}
                              </td>
                              <td className="border-r border-slate-200 bg-indigo-50 px-3 py-3 text-center text-sm font-bold text-indigo-700 dark:border-slate-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                                {totalAbsent}
                              </td>
                              <td className="border-r-0 border-slate-200 bg-green-50 px-3 py-3 text-center text-sm font-bold text-green-700 dark:border-slate-700 dark:bg-green-900/20 dark:text-green-300">
                                {payableShifts.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {showUploadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Upload Attendance Excel</h3>
              <button
                onClick={() => {
                  setShowUploadDialog(false);
                  setUploadFile(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Select Excel File
                </label>
                <input
                  id="excel-upload-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <button
                  onClick={handleDownloadTemplate}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Download Template
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleExcelUpload}
                  disabled={!uploadFile || uploading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  onClick={() => {
                    setShowUploadDialog(false);
                    setUploadFile(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OutTime Dialog for PARTIAL Attendance */}
      {showOutTimeDialog && selectedRecordForOutTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Enter Out Time</h3>
              <button
                onClick={() => {
                  setShowOutTimeDialog(false);
                  setSelectedRecordForOutTime(null);
                  setOutTimeValue('');
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  {selectedRecordForOutTime.employee.employee_name}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {selectedRecordForOutTime.employee.emp_no} • {selectedRecordForOutTime.date}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Out Time *
                </label>
                <input
                  type="datetime-local"
                  value={outTimeValue}
                  onChange={(e) => setOutTimeValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  required
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Enter the logout time. Shift will be automatically assigned based on in-time and out-time.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleUpdateOutTime}
                  disabled={!outTimeValue || updatingOutTime}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingOutTime ? 'Updating...' : 'Update Out Time'}
                </button>
                <button
                  onClick={() => {
                    setShowOutTimeDialog(false);
                    setSelectedRecordForOutTime(null);
                    setOutTimeValue('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {showDetailDialog && attendanceDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Attendance Details - {selectedDate}
                {selectedEmployee && (
                  <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                    ({selectedEmployee.employee_name})
                  </span>
                )}
              </h3>
              <button
                onClick={() => {
                  setShowDetailDialog(false);
                  setError('');
                  setSuccess('');
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Success/Error Messages */}
            {success && (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                {success}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {attendanceDetail.status || 'ABSENT'}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Shift</label>
                  <div className="mt-1 flex items-center gap-2">
                    {!editingShift ? (
                      <>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {attendanceDetail.shiftId && typeof attendanceDetail.shiftId === 'object'
                      ? attendanceDetail.shiftId.name
                      : '-'}
                        </div>
                        <button
                          onClick={() => {
                            setEditingShift(true);
                            if (attendanceDetail.shiftId && typeof attendanceDetail.shiftId === 'object') {
                              setSelectedShiftId(attendanceDetail.shiftId._id);
                            }
                          }}
                          className="rounded-lg bg-blue-500 px-2 py-1 text-xs font-medium text-white transition-all hover:bg-blue-600"
                        >
                          {attendanceDetail.shiftId ? 'Change' : 'Assign'}
                        </button>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center gap-2">
                        <select
                          value={selectedShiftId}
                          onChange={(e) => setSelectedShiftId(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">Select Shift</option>
                          {availableShifts.map((shift) => (
                            <option key={shift._id} value={shift._id}>
                              {shift.name} ({shift.startTime} - {shift.endTime})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleAssignShift}
                          disabled={savingShift || !selectedShiftId}
                          className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingShift ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingShift(false);
                            setSelectedShiftId('');
                          }}
                          className="rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">In Time</label>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatTime(attendanceDetail.inTime)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Out Time</label>
                  <div className="mt-1 flex items-center gap-2">
                    {!editingOutTime ? (
                      <>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {attendanceDetail.outTime ? formatTime(attendanceDetail.outTime, true, selectedDate || '') : '-'}
                        </div>
                        {!attendanceDetail.outTime && (
                          <button
                            onClick={() => {
                              setEditingOutTime(true);
                              if (attendanceDetail.outTime) {
                                const date = new Date(attendanceDetail.outTime);
                                setOutTimeInput(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
                              }
                            }}
                            className="rounded-lg bg-blue-500 px-2 py-1 text-xs font-medium text-white transition-all hover:bg-blue-600"
                          >
                            Add
                          </button>
                        )}
                        {attendanceDetail.outTime && (
                          <button
                            onClick={() => {
                              setEditingOutTime(true);
                              const date = new Date(attendanceDetail.outTime);
                              setOutTimeInput(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
                            }}
                            className="rounded-lg bg-blue-500 px-2 py-1 text-xs font-medium text-white transition-all hover:bg-blue-600"
                          >
                            Edit
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="time"
                          value={outTimeInput}
                          onChange={(e) => setOutTimeInput(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          onClick={handleSaveOutTime}
                          disabled={savingOutTime || !outTimeInput}
                          className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingOutTime ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingOutTime(false);
                            setOutTimeInput('');
                          }}
                          className="rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Total Hours</label>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatHours(attendanceDetail.totalHours)}
                  </div>
                </div>
                {attendanceDetail.isLateIn && attendanceDetail.lateInMinutes && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Late In</label>
                    <div className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">
                      +{attendanceDetail.lateInMinutes} minutes
                    </div>
                  </div>
                )}
                {attendanceDetail.isEarlyOut && attendanceDetail.earlyOutMinutes && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Early Out</label>
                    <div className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">
                      -{attendanceDetail.earlyOutMinutes} minutes
                    </div>
                    {attendanceDetail.earlyOutDeduction?.deductionApplied && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Deduction: {attendanceDetail.earlyOutDeduction.deductionType?.replace('_', ' ')}
                        {attendanceDetail.earlyOutDeduction.deductionDays ? ` (${attendanceDetail.earlyOutDeduction.deductionDays} day(s))` : ''}
                        {attendanceDetail.earlyOutDeduction.deductionAmount ? ` (₹${attendanceDetail.earlyOutDeduction.deductionAmount})` : ''}
                      </p>
                    )}
                  </div>
                )}
                {attendanceDetail.otHours && attendanceDetail.otHours > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">OT Hours</label>
                    <div className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">
                      {attendanceDetail.otHours.toFixed(2)} hrs
                    </div>
                  </div>
                )}
                {attendanceDetail.extraHours && attendanceDetail.extraHours > 0 && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Extra Hours</label>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                      {attendanceDetail.extraHours.toFixed(2)} hrs
                      </div>
                      {!hasExistingOT && attendanceDetail.shiftId && (
                        <button
                          onClick={handleConvertExtraHoursToOT}
                          disabled={convertingToOT}
                          className="ml-3 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-indigo-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {convertingToOT ? 'Converting...' : 'Convert to OT'}
                        </button>
                      )}
                      {hasExistingOT && (
                        <span className="ml-3 rounded-full bg-green-100 px-2 py-1 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Already Converted
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {attendanceDetail.permissionHours && attendanceDetail.permissionHours > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Permission Hours</label>
                    <div className="mt-1 text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                      {attendanceDetail.permissionHours.toFixed(2)} hrs ({attendanceDetail.permissionCount || 0} permissions)
                    </div>
                  </div>
                )}
                {/* NEW: OD Hours Section */}
                {attendanceDetail.odHours && attendanceDetail.odHours > 0 && (
                  <div className="col-span-2 rounded-lg border border-fuchsia-300 bg-fuchsia-50 p-4 dark:border-fuchsia-700 dark:bg-fuchsia-900/20">
                    <label className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-400">OD Hours</label>
                    <div className="mt-2 space-y-2">
                      <div className="text-lg font-bold text-fuchsia-600 dark:text-fuchsia-400">
                        {attendanceDetail.odHours.toFixed(2)} hrs
                      </div>
                      {attendanceDetail.odDetails && (
                        <>
                          <div className="text-xs text-fuchsia-700 dark:text-fuchsia-300">
                            <strong>Time:</strong> {attendanceDetail.odDetails.odStartTime} - {attendanceDetail.odDetails.odEndTime}
                          </div>
                          <div className="text-xs text-fuchsia-700 dark:text-fuchsia-300">
                            <strong>Type:</strong> {attendanceDetail.odDetails.odType?.replace('_', ' ') || '-'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Leave Conflicts - Show if attendance is present and leave conflicts exist */}
              {attendanceDetail.status === 'PRESENT' && leaveConflicts.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <div className="mb-3 flex items-center gap-2">
                    <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h4 className="text-base font-semibold text-red-900 dark:text-red-200">Leave Conflict Detected</h4>
                  </div>
                  <p className="mb-3 text-sm text-red-800 dark:text-red-300">
                    Employee has approved leave but attendance is logged for this date.
                  </p>
                  {leaveConflicts.map((conflict) => (
                    <div key={conflict.leaveId} className="mb-3 rounded-lg border border-red-200 bg-white p-3 dark:border-red-700 dark:bg-slate-800">
                      <div className="mb-2 text-sm font-medium text-red-900 dark:text-red-200">
                        {conflict.leaveType} - {conflict.numberOfDays} day(s)
                      </div>
                      <div className="mb-2 text-xs text-red-700 dark:text-red-300">
                        {new Date(conflict.fromDate).toLocaleDateString()} 
                        {conflict.fromDate !== conflict.toDate && ` - ${new Date(conflict.toDate).toLocaleDateString()}`}
                        {conflict.isHalfDay && ` (${conflict.halfDayType === 'first_half' ? 'First Half' : 'Second Half'})`}
                      </div>
                      <div className="flex gap-2">
                        {conflict.conflictType === 'full_day' ? (
                          <button
                            onClick={() => handleRevokeLeave(conflict.leaveId)}
                            disabled={revokingLeave}
                            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {revokingLeave ? 'Revoking...' : 'Revoke Leave'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateLeave(conflict.leaveId)}
                            disabled={updatingLeave}
                            className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {updatingLeave ? 'Updating...' : 'Update Leave'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Leave Information */}
              {attendanceDetail.hasLeave && attendanceDetail.leaveInfo && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                  <h4 className="mb-3 text-base font-semibold text-orange-900 dark:text-orange-200">Leave Information</h4>
                  
                  {/* Purpose/Reason */}
                  {attendanceDetail.leaveInfo.purpose ? (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Purpose/Reason</label>
                      <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.purpose}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Leave Type</label>
                      <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.leaveType || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Half Day</label>
                      <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.isHalfDay ? 'Yes' : 'No'}
                        {attendanceDetail.leaveInfo.isHalfDay && attendanceDetail.leaveInfo.halfDayType && (
                          <span className="ml-1 text-xs">({attendanceDetail.leaveInfo.halfDayType === 'first_half' ? 'First Half' : 'Second Half'})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Date Range */}
                  {attendanceDetail.leaveInfo.fromDate && attendanceDetail.leaveInfo.toDate && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Date Range</label>
                      <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">
                        {new Date(attendanceDetail.leaveInfo.fromDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} - {new Date(attendanceDetail.leaveInfo.toDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  )}

                  {/* Number of Days and Day in Leave */}
                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Total Days</label>
                      <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                        {attendanceDetail.leaveInfo.numberOfDays !== undefined && attendanceDetail.leaveInfo.numberOfDays !== null 
                          ? `${attendanceDetail.leaveInfo.numberOfDays} ${attendanceDetail.leaveInfo.numberOfDays === 1 ? 'day' : 'days'}` 
                          : 'N/A'}
                      </div>
                    </div>
                    {attendanceDetail.leaveInfo.dayInLeave !== undefined && attendanceDetail.leaveInfo.dayInLeave !== null && (
                      <div>
                        <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Day in Leave</label>
                        <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
                          {attendanceDetail.leaveInfo.dayInLeave === 1 ? '1st day' : attendanceDetail.leaveInfo.dayInLeave === 2 ? '2nd day' : attendanceDetail.leaveInfo.dayInLeave === 3 ? '3rd day' : `${attendanceDetail.leaveInfo.dayInLeave}th day`}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Applied Date */}
                  {attendanceDetail.leaveInfo.appliedAt && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Applied On</label>
                      <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                        {new Date(attendanceDetail.leaveInfo.appliedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}

                  {/* Approved By and When */}
                  {attendanceDetail.leaveInfo.approvedBy && (
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Approved By</label>
                        <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">
                          {attendanceDetail.leaveInfo.approvedBy.name || attendanceDetail.leaveInfo.approvedBy.email || 'N/A'}
                        </div>
                      </div>
                      {attendanceDetail.leaveInfo.approvedAt && (
                        <div>
                          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Approved On</label>
                          <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                            {new Date(attendanceDetail.leaveInfo.approvedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {attendanceDetail.isConflict && (
                    <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                      ⚠️ Conflict: Leave approved but attendance logged for this date
                    </div>
                  )}
                </div>
              )}

              {/* OD Information */}
              {attendanceDetail.hasOD && attendanceDetail.odInfo && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <h4 className="mb-3 text-base font-semibold text-blue-900 dark:text-blue-200">On Duty (OD) Information</h4>
                  
                  {/* Early-Out Info */}
                  {attendanceDetail.earlyOutMinutes !== undefined && attendanceDetail.earlyOutMinutes !== null && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Early-Out Minutes</p>
                          <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                            {attendanceDetail.earlyOutMinutes} min
                          </p>
                        </div>
                        {attendanceDetail.earlyOutDeduction?.deductionApplied && (
                          <div className="text-right">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Deduction Applied</p>
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 capitalize">
                              {attendanceDetail.earlyOutDeduction.deductionType?.replace('_', ' ') || 'N/A'}
                            </p>
                            {attendanceDetail.earlyOutDeduction.deductionDays && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                {attendanceDetail.earlyOutDeduction.deductionDays} day(s)
                              </p>
                            )}
                            {attendanceDetail.earlyOutDeduction.deductionAmount && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                ₹{attendanceDetail.earlyOutDeduction.deductionAmount}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {attendanceDetail.earlyOutDeduction?.reason && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          {attendanceDetail.earlyOutDeduction.reason}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Purpose/Reason */}
                  {attendanceDetail.odInfo.purpose && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Purpose/Reason</label>
                      <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.purpose}
                      </div>
                    </div>
                  )}

                  {/* Place Visited */}
                  {attendanceDetail.odInfo.placeVisited && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Place Visited</label>
                      <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.placeVisited}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">OD Type</label>
                      <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.odType || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        {attendanceDetail.odInfo.odType_extended === 'hours' ? 'Duration Type' : 'Half Day'}
                      </label>
                      <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                        {attendanceDetail.odInfo.odType_extended === 'hours' ? (
                          'Hour-Based OD'
                        ) : attendanceDetail.odInfo.isHalfDay ? (
                          <>
                            Yes
                            {attendanceDetail.odInfo.halfDayType && (
                              <span className="ml-1 text-xs">({attendanceDetail.odInfo.halfDayType === 'first_half' ? 'First Half' : 'Second Half'})</span>
                            )}
                          </>
                        ) : (
                          'No'
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Date Range */}
                  {attendanceDetail.odInfo.fromDate && attendanceDetail.odInfo.toDate && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Date Range</label>
                      <div className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
                        {new Date(attendanceDetail.odInfo.fromDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} - {new Date(attendanceDetail.odInfo.toDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  )}

                  {/* Hour-Based OD: Show Hours */}
                  {attendanceDetail.odInfo.odType_extended === 'hours' && attendanceDetail.odInfo.durationHours && (
                    <div className="mb-3 p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300 block mb-2">OD Hours</label>
                      <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        {(() => {
                          const hours = Math.floor(attendanceDetail.odInfo.durationHours || 0);
                          const mins = Math.round((attendanceDetail.odInfo.durationHours || 0) % 1 * 60);
                          return `${hours}h ${mins}m`;
                        })()}
                      </div>
                      {attendanceDetail.odInfo.odStartTime && attendanceDetail.odInfo.odEndTime && (
                        <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Time: {attendanceDetail.odInfo.odStartTime} - {attendanceDetail.odInfo.odEndTime}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Full Day / Half Day: Show Days */}
                  {attendanceDetail.odInfo.odType_extended !== 'hours' && (
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Total Days</label>
                        <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                          {attendanceDetail.odInfo.numberOfDays || 'N/A'} {attendanceDetail.odInfo.numberOfDays === 1 ? 'day' : 'days'}
                        </div>
                      </div>
                      {attendanceDetail.odInfo.dayInOD && (
                        <div>
                          <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Day in OD</label>
                          <div className="mt-1 font-semibold text-blue-900 dark:text-blue-100">
                            {attendanceDetail.odInfo.dayInOD === 1 ? '1st day' : attendanceDetail.odInfo.dayInOD === 2 ? '2nd day' : attendanceDetail.odInfo.dayInOD === 3 ? '3rd day' : `${attendanceDetail.odInfo.dayInOD}th day`}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Applied Date */}
                  {attendanceDetail.odInfo.appliedAt && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Applied On</label>
                      <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                        {new Date(attendanceDetail.odInfo.appliedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )}

                  {/* Approved By and When */}
                  {attendanceDetail.odInfo.approvedBy && (
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Approved By</label>
                        <div className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
                          {attendanceDetail.odInfo.approvedBy.name || attendanceDetail.odInfo.approvedBy.email || 'N/A'}
                        </div>
                      </div>
                      {attendanceDetail.odInfo.approvedAt && (
                        <div>
                          <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Approved On</label>
                          <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">
                            {new Date(attendanceDetail.odInfo.approvedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Only show conflict for full-day OD (not for half-day or hour-based OD) */}
                  {attendanceDetail.isConflict && 
                   attendanceDetail.odInfo && 
                   attendanceDetail.odInfo.odType_extended !== 'half_day' && 
                   attendanceDetail.odInfo.odType_extended !== 'hours' && (
                    <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                      ⚠️ Conflict: OD approved but attendance logged for this date
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Summary Modal */}
      {showSummaryModal && selectedEmployeeForSummary !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 print:shadow-none">
            <div className="mb-4 flex items-center justify-between print:hidden">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Monthly Attendance Summary</h3>
              <button
                onClick={() => {
                  setShowSummaryModal(false);
                  setSelectedEmployeeForSummary(null);
                  setMonthlySummary(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingSummary ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              </div>
            ) : monthlySummary ? (
              <div className="space-y-6">
                {/* Employee Details */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="mb-3 text-base font-bold text-slate-900 dark:text-white">Employee Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-slate-600 dark:text-slate-400">Name:</span>
                      <span className="ml-2 text-slate-900 dark:text-white">{selectedEmployeeForSummary?.employee_name || '-'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-slate-600 dark:text-slate-400">Employee Number:</span>
                      <span className="ml-2 text-slate-900 dark:text-white">{selectedEmployeeForSummary?.emp_no || '-'}</span>
                    </div>
                    {selectedEmployeeForSummary && selectedEmployeeForSummary.department && (
                      <div>
                        <span className="font-medium text-slate-600 dark:text-slate-400">Department:</span>
                        <span className="ml-2 text-slate-900 dark:text-white">{(selectedEmployeeForSummary.department as any)?.name || '-'}</span>
                      </div>
                    )}
                    {selectedEmployeeForSummary && selectedEmployeeForSummary.designation && (
                      <div>
                        <span className="font-medium text-slate-600 dark:text-slate-400">Designation:</span>
                        <span className="ml-2 text-slate-900 dark:text-white">{(selectedEmployeeForSummary.designation as any)?.name || '-'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Monthly Summary Table */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800">
                      <tr>
                        <th className="border border-slate-300 px-4 py-2 text-left font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Month</th>
                        <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Total Leaves</th>
                        <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Total ODs</th>
                        <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Present Days</th>
                        <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Total Days</th>
                        <th className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">Payable Shifts</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 px-4 py-2 text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.monthName || `${monthNames[month - 1]} ${year}`}</td>
                        <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalLeaves || 0}</td>
                        <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalODs || 0}</td>
                        <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalPresentDays || 0}</td>
                        <td className="border border-slate-300 px-4 py-2 text-right text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalDaysInMonth || 0}</td>
                        <td className="border border-slate-300 px-4 py-2 text-right font-semibold text-slate-900 dark:border-slate-600 dark:text-white">{monthlySummary.totalPayableShifts?.toFixed(2) || '0.00'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Footer with Signature and Timestamp */}
                <div className="mt-8 flex items-end justify-between border-t border-slate-200 pt-4 dark:border-slate-700 print:mt-12">
                  <div>
                    <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Authorized Signature</div>
                    <div className="h-12 w-48 border-b border-slate-300 dark:border-slate-600"></div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Printed: {new Date().toLocaleString()}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 print:hidden">
                  <button
                    onClick={handleExportPDF}
                    className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600"
                  >
                    Export as PDF
                  </button>
                  <button
                    onClick={() => {
                      setShowSummaryModal(false);
                      setSelectedEmployeeForSummary(null);
                      setMonthlySummary(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                No summary data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {showPayslipModal && selectedEmployeeForPayslip !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 print:shadow-none print:max-w-full print:rounded-none">
            <div className="mb-4 flex items-center justify-between print:hidden">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payslip</h3>
              <div className="flex items-center gap-2">
                {error && error.includes('not found') && (
                  <button
                    onClick={handleCalculatePayroll}
                    disabled={calculatingPayroll}
                    className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50"
                  >
                    {calculatingPayroll ? 'Calculating...' : 'Calculate Payroll'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowPayslipModal(false);
                    setSelectedEmployeeForPayslip(null);
                    setPayslipData(null);
                    setError('');
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {loadingPayslip ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              </div>
            ) : error && !error.includes('not found') ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            ) : payslipData ? (
              <div className="space-y-4 print:space-y-3">
                {/* Payslip Header */}
                <div className="border-b-2 border-slate-300 pb-3 dark:border-slate-600">
                  <h2 className="text-center text-xl font-bold text-slate-900 dark:text-white">
                    PAYSLIP FOR THE MONTH OF: {(() => {
                      const monthStr = payslipData.month || `${monthNames[month - 1]} ${year}`;
                      // Format as "DEC 19" style
                      const monthMatch = monthStr.match(/(\w+)\s+(\d{4})/);
                      if (monthMatch) {
                        const monthName = monthMatch[1].substring(0, 3).toUpperCase();
                        const yearShort = monthMatch[2].substring(2);
                        return `${monthName} ${yearShort}`;
                      }
                      return monthStr.toUpperCase();
                    })()}
                  </h2>
                </div>

                {/* Employee Details - Matching exact format from image */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">Emp Code:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.emp_no || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">Emp Name:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.name || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">Department:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.department || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">Designation:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.designation || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">Location:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.location || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">Bank A/c No.:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.bank_account_no || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">PAID LEAVES:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.paidLeaves || 0}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">PAID DAYS:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{payslipData.paidDays || payslipData.totalPayableShifts || 0}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">PF Code No.:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.pf_number || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-32">PF UAN:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.pf_number || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 w-24">ESI No.:</span>
                    <span className="text-slate-900 dark:text-white">{payslipData.employee?.esi_number || '-'}</span>
                  </div>
                </div>

                {/* Earnings and Deductions Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Earnings Section - Left Side */}
                  <div className="border border-slate-300 dark:border-slate-600">
                    <h3 className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-left font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                      EARNINGS
                    </h3>
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      <div className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">Basic:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{payslipData.earnings?.basicPay?.toFixed(2) || '0.00'}</span>
                      </div>
                      {/* Map allowances - VDA, HRA, WA, etc. */}
                      {payslipData.earnings?.allowances && payslipData.earnings.allowances.length > 0 && payslipData.earnings.allowances.map((allowance: any, idx: number) => (
                        <div key={idx} className="flex justify-between px-4 py-2">
                          <span className="text-slate-700 dark:text-slate-300">{allowance.name?.toUpperCase() || 'ALLOWANCE'}:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{allowance.amount?.toFixed(2) || '0.00'}</span>
                        </div>
                      ))}
                      {payslipData.earnings?.incentive !== 0 && (
                        <div className="flex justify-between px-4 py-2">
                          <span className="text-slate-700 dark:text-slate-300">INCENTIVE:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{payslipData.earnings?.incentive?.toFixed(2) || '0.00'}</span>
                        </div>
                      )}
                      {payslipData.earnings?.otPay > 0 && (
                        <div className="flex justify-between px-4 py-2">
                          <span className="text-slate-700 dark:text-slate-300">OT PAY:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{payslipData.earnings?.otPay?.toFixed(2) || '0.00'}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t-2 border-slate-300 bg-slate-100 px-4 py-2 font-bold dark:border-slate-600 dark:bg-slate-800">
                        <span className="text-slate-900 dark:text-white">Gross Salary Rs.:</span>
                        <span className="text-slate-900 dark:text-white">{payslipData.earnings?.grossSalary?.toFixed(2) || '0.00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions Section - Right Side */}
                  <div className="border border-slate-300 dark:border-slate-600">
                  <h3 className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-left font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                    DEDUCTIONS
                  </h3>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {/* Other deductions first (PF, ESIC, TDS, etc.) */}
                    {payslipData.deductions?.otherDeductions && payslipData.deductions.otherDeductions.length > 0 && payslipData.deductions.otherDeductions.map((deduction: any, idx: number) => (
                      <div key={idx} className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">{deduction.name || 'Deduction'}:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{deduction.amount?.toFixed(2) || '0.00'}</span>
                      </div>
                    ))}
                    {/* TDS - if exists in other deductions, otherwise show if configured */}
                    {payslipData.deductions?.attendanceDeduction > 0 && (
                      <div className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">Attendance Deduction:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.deductions.attendanceDeduction.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipData.deductions?.permissionDeduction > 0 && (
                      <div className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">Permission Deduction:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.deductions.permissionDeduction.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipData.deductions?.leaveDeduction > 0 && (
                      <div className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">Leave Deduction:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.deductions.leaveDeduction.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipData.loanAdvance?.advanceDeduction > 0 && (
                      <div className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">AdV:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.loanAdvance.advanceDeduction.toFixed(2)}</span>
                      </div>
                    )}
                    {payslipData.loanAdvance?.totalEMI > 0 && (
                      <div className="flex justify-between px-4 py-2">
                        <span className="text-slate-700 dark:text-slate-300">Loan EMI:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{payslipData.loanAdvance.totalEMI.toFixed(2)}</span>
                      </div>
                    )}
                    {/* BANK PAY and CASH PAY - these would be calculated from net salary */}
                    <div className="flex justify-between border-t-2 border-slate-300 bg-slate-100 px-4 py-2 font-bold dark:border-slate-600 dark:bg-slate-800">
                      <span className="text-slate-900 dark:text-white">Total Deductions:</span>
                      <span className="text-red-600 dark:text-red-400">
                        {((payslipData.deductions?.totalDeductions || 0) + (payslipData.loanAdvance?.totalEMI || 0) + (payslipData.loanAdvance?.advanceDeduction || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                </div>

                {/* Net Salary and Payment Details */}
                <div className="space-y-3">
                  {/* Net Salary */}
                  <div className="border-2 border-green-500 bg-green-50 p-3 dark:border-green-600 dark:bg-green-900/20">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-green-900 dark:text-green-200">Net Salary:</span>
                      <span className="text-2xl font-bold text-green-900 dark:text-green-200">{payslipData.netSalary?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                  
                  {/* Rupees In Words */}
                  <div className="border border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-600 dark:bg-slate-800">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rupees In Words:</span>
                    <span className="ml-2 text-sm text-slate-900 dark:text-white">{numberToWords(payslipData.netSalary || 0)}</span>
                  </div>
                </div>

                {/* Print Button */}
                <div className="flex justify-end gap-3 print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-700"
                  >
                    Print Payslip
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                {error || 'Payslip not found. Please calculate payroll first.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero Rupees Only';

  // Separate integer and decimal parts
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  const convertHundreds = (n: number): string => {
    if (n === 0) return '';
    let result = '';
    if (n >= 100) {
      const hundreds = Math.floor(n / 100);
      if (hundreds > 0 && ones[hundreds]) {
        result += ones[hundreds] + ' Hundred ';
      }
      n %= 100;
    }
    if (n >= 20) {
      const tensPlace = Math.floor(n / 10);
      if (tensPlace > 0 && tens[tensPlace]) {
        result += tens[tensPlace] + ' ';
      }
      n %= 10;
    }
    if (n > 0 && ones[n]) {
      result += ones[n] + ' ';
    }
    return result.trim();
  };

  let words = '';
  let remaining = integerPart;

  // Crores
  const crores = Math.floor(remaining / 10000000);
  if (crores > 0) {
    const croreWords = convertHundreds(crores);
    if (croreWords) {
      words += croreWords + ' Crore ';
    }
    remaining %= 10000000;
  }

  // Lakhs
  const lakhs = Math.floor(remaining / 100000);
  if (lakhs > 0) {
    const lakhWords = convertHundreds(lakhs);
    if (lakhWords) {
      words += lakhWords + ' Lakh ';
    }
    remaining %= 100000;
  }

  // Thousands
  const thousands = Math.floor(remaining / 1000);
  if (thousands > 0) {
    const thousandWords = convertHundreds(thousands);
    if (thousandWords) {
      words += thousandWords + ' Thousand ';
    }
    remaining %= 1000;
  }

  // Hundreds, Tens, Ones
  if (remaining > 0) {
    const remainingWords = convertHundreds(remaining);
    if (remainingWords) {
      words += remainingWords;
    }
  }

  // Add paise if exists
  if (decimalPart > 0) {
    if (words.trim()) {
      words += ` and ${decimalPart}/100`;
    } else {
      words += `${decimalPart}/100`;
    }
  }

  // Clean up and format
  words = words.trim();
  if (!words) {
    return 'Zero Rupees Only';
  }

  return words + ' Rupees Only';
}
