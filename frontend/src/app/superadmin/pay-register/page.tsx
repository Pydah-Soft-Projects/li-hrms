'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department_id?: string | { _id: string; name: string };
  designation_id?: string | { _id: string; name: string };
}

interface DailyRecord {
  date: string;
  firstHalf: {
    status: 'present' | 'absent' | 'leave' | 'od' | 'holiday' | 'week_off';
    leaveType: string | null;
    leaveNature: 'paid' | 'lop' | 'without_pay' | null;
    isOD: boolean;
    otHours: number;
    shiftId: string | null;
    remarks: string | null;
  };
  secondHalf: {
    status: 'present' | 'absent' | 'leave' | 'od' | 'holiday' | 'week_off';
    leaveType: string | null;
    leaveNature: 'paid' | 'lop' | 'without_pay' | null;
    isOD: boolean;
    otHours: number;
    shiftId: string | null;
    remarks: string | null;
  };
  status: 'present' | 'absent' | 'leave' | 'od' | 'holiday' | 'week_off' | 'partial' | null;
  leaveType: string | null;
  leaveNature: 'paid' | 'lop' | 'without_pay' | null;
  isOD: boolean;
  isSplit: boolean;
  shiftId: string | null;
  shiftName: string | null;
  otHours: number;
  remarks: string | null;
  isManuallyEdited?: boolean;
}

interface PayRegisterSummary {
  _id: string;
  employeeId: Employee | string;
  emp_no: string;
  month: string;
  monthName: string;
  year: number;
  monthNumber: number;
  totalDaysInMonth: number;
  dailyRecords: DailyRecord[];
  totals: {
    presentDays: number;
    presentHalfDays: number;
    totalPresentDays: number;
    absentDays: number;
    absentHalfDays: number;
    totalAbsentDays: number;
    paidLeaveDays: number;
    paidLeaveHalfDays: number;
    totalPaidLeaveDays: number;
    unpaidLeaveDays: number;
    unpaidLeaveHalfDays: number;
    totalUnpaidLeaveDays: number;
    lopDays: number;
    lopHalfDays: number;
    totalLopDays: number;
    totalLeaveDays: number;
    odDays: number;
    odHalfDays: number;
    totalODDays: number;
    totalOTHours: number;
    totalPayableShifts: number;
  };
  status: 'draft' | 'in_review' | 'finalized';
  lastAutoSyncedAt: string | null;
  lastEditedAt: string | null;
}

interface Shift {
  _id: string;
  name: string;
  payableShifts: number;
}

type TableType = 'present' | 'absent' | 'leaves' | 'od' | 'ot' | 'extraHours';

export default function PayRegisterPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [payRegisters, setPayRegisters] = useState<PayRegisterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeTable, setActiveTable] = useState<TableType>('present');
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{ employeeId: string; month: string; date: string; record: DailyRecord; employee: Employee } | null>(null);
  const [editData, setEditData] = useState<Partial<DailyRecord>>({});
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    loadShifts();
    loadDepartments();
    loadLeaveTypes();
  }, []);

  const loadLeaveTypes = async () => {
    try {
      const response = await api.getLeaveSettings('leave');
      if (response.success && response.data && response.data.types) {
        setLeaveTypes(response.data.types);
      }
    } catch (err) {
      console.error('Error loading leave types:', err);
    }
  };

  useEffect(() => {
    loadPayRegisters();
  }, [year, month, selectedDepartment]);

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

  const loadShifts = async () => {
    try {
      const response = await api.getShifts();
      if (response.success && response.data) {
        setShifts(response.data.map((s: any) => ({ ...s, payableShifts: s.payableShifts || 0 })));
      }
    } catch (err) {
      console.error('Error loading shifts:', err);
    }
  };

  const loadPayRegisters = async () => {
    try {
      setLoading(true);
      console.log('[Pay Register] Loading pay registers:', { monthStr, selectedDepartment });
      
      // Ensure we pass undefined instead of empty string
      const deptId = selectedDepartment && selectedDepartment.trim() !== '' ? selectedDepartment : undefined;
      console.log('[Pay Register] Calling API with departmentId:', deptId);
      
      const response = await api.getEmployeesWithPayRegister(monthStr, deptId);
      
      console.log('[Pay Register] API Response:', {
        success: response.success,
        count: response.count,
        dataLength: response.data?.length || 0,
        data: response.data,
      });
      
      if (response.success) {
        const payRegisterList = response.data || [];
        
        console.log('[Pay Register] Processing pay register list:', {
          listLength: payRegisterList.length,
          firstItem: payRegisterList[0],
        });
        
        if (payRegisterList.length === 0) {
          console.log('[Pay Register] No pay registers found, setting empty array');
          setPayRegisters([]);
          return;
        }

        // Load full pay register details for each employee
        console.log('[Pay Register] Loading full details for', payRegisterList.length, 'employees');
        const fullPayRegisters = await Promise.all(
          payRegisterList.map(async (pr: any, index: number) => {
            try {
              const employeeId = typeof pr.employeeId === 'object' ? pr.employeeId._id : pr.employeeId;
              console.log(`[Pay Register] Loading full details for employee ${index + 1}/${payRegisterList.length}:`, employeeId);
              
              let fullResponse = await api.getPayRegister(employeeId, monthStr);
              
              // If pay register doesn't exist, create it
              if (!fullResponse.success || !fullResponse.data) {
                console.log(`[Pay Register] Pay register not found, creating for employee ${index + 1}`);
                const createResponse = await api.createPayRegister(employeeId, monthStr);
                if (createResponse.success && createResponse.data) {
                  fullResponse = createResponse;
                } else {
                  console.warn(`[Pay Register] Failed to create pay register for employee ${index + 1}:`, createResponse);
                  return null;
                }
              }
              
              if (fullResponse.success && fullResponse.data) {
                console.log(`[Pay Register] Successfully loaded pay register for employee ${index + 1}`);
                return fullResponse.data;
              }
              console.warn(`[Pay Register] Failed to load pay register for employee ${index + 1}:`, fullResponse);
              return null;
            } catch (err) {
              console.error(`[Pay Register] Error loading pay register for employee ${index + 1}:`, err);
              // Try to create if get failed
              try {
                const employeeId = typeof pr.employeeId === 'object' ? pr.employeeId._id : pr.employeeId;
                console.log(`[Pay Register] Attempting to create pay register for employee ${index + 1} after error`);
                const createResponse = await api.createPayRegister(employeeId, monthStr);
                if (createResponse.success && createResponse.data) {
                  return createResponse.data;
                }
              } catch (createErr) {
                console.error(`[Pay Register] Failed to create pay register for employee ${index + 1}:`, createErr);
              }
              return null;
            }
          })
        );
        
        const validPayRegisters = fullPayRegisters.filter(Boolean);
        console.log('[Pay Register] Final valid pay registers:', validPayRegisters.length);
        setPayRegisters(validPayRegisters);
        
        if (validPayRegisters.length === 0 && payRegisterList.length > 0) {
          console.warn('[Pay Register] No valid pay registers loaded despite API returning data');
        }
      } else {
        console.error('[Pay Register] API call failed:', response);
        setPayRegisters([]);
        if (response.message) {
          toast.error(response.message);
        }
      }
    } catch (err: any) {
      console.error('[Pay Register] Error loading pay registers:', err);
      setPayRegisters([]);
      toast.error(err.message || 'Failed to load pay registers');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      const syncPromises = payRegisters.map((pr) => {
        const employeeId = typeof pr.employeeId === 'object' ? pr.employeeId._id : pr.employeeId;
        return api.syncPayRegister(employeeId, monthStr);
      });
      await Promise.all(syncPromises);
      await loadPayRegisters();
      toast.success('All pay registers synced successfully');
    } catch (err: any) {
      console.error('Error syncing pay registers:', err);
      toast.error(err.message || 'Failed to sync pay registers');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveDate = async () => {
    if (!editingRecord) return;

    try {
      setSaving({ ...saving, [editingRecord.employeeId]: true });
      
      // First, ensure pay register exists - create if it doesn't
      try {
        await api.getPayRegister(editingRecord.employeeId, monthStr);
      } catch (err: any) {
        // If pay register doesn't exist, create it
        console.log('[Pay Register] Creating pay register for employee:', editingRecord.employeeId);
        await api.createPayRegister(editingRecord.employeeId, monthStr);
      }
      
      // Now update the daily record
      const response = await api.updateDailyRecord(
        editingRecord.employeeId,
        monthStr,
        editingRecord.date,
        editData
      );
      if (response.success && response.data) {
        await loadPayRegisters();
        setShowEditModal(false);
        setEditingRecord(null);
        toast.success('Date updated successfully');
      } else {
        toast.error(response.message || 'Failed to update date');
      }
    } catch (err: any) {
      console.error('Error updating date:', err);
      toast.error(err.message || 'Failed to update date');
    } finally {
      setSaving({ ...saving, [editingRecord.employeeId]: false });
    }
  };

  const handleDateClick = (employee: Employee, date: string, record: DailyRecord) => {
    setEditingRecord({ employeeId: typeof employee === 'object' ? employee._id : employee, month: monthStr, date, record, employee });
    setEditData({
      firstHalf: { 
        ...record.firstHalf,
        leaveType: record.firstHalf.leaveType || null,
        leaveNature: record.firstHalf.leaveNature || null,
      },
      secondHalf: { 
        ...record.secondHalf,
        leaveType: record.secondHalf.leaveType || null,
        leaveNature: record.secondHalf.leaveNature || null,
      },
      status: record.status,
      leaveType: record.leaveType || null,
      leaveNature: record.leaveNature || null,
      isOD: record.isOD,
      isSplit: record.isSplit,
      shiftId: record.shiftId || null,
      shiftName: record.shiftName || null,
      otHours: record.otHours,
      remarks: record.remarks || null,
    });
    setShowEditModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'absent':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'leave':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'od':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'holiday':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
      case 'week_off':
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
      default:
        return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const getStatusDisplay = (record: DailyRecord | null): string => {
    if (!record) return '-';
    if (record.isSplit) {
      // Show both halves
      const first = record.firstHalf.status.charAt(0).toUpperCase();
      const second = record.secondHalf.status.charAt(0).toUpperCase();
      return `${first}/${second}`;
    }
    if (record.status === 'leave') return 'L';
    if (record.status === 'od') return 'OD';
    if (record.status === 'present') return 'P';
    if (record.status === 'absent') return 'A';
    if (record.status === 'holiday') return 'H';
    if (record.status === 'week_off') return 'WO';
    return '-';
  };

  const getCellBackgroundColor = (record: DailyRecord | null, tableType: TableType): string => {
    if (!record) return '';
    
    if (tableType === 'present') {
      if (record.status === 'present' || record.firstHalf.status === 'present' || record.secondHalf.status === 'present') {
        return 'bg-green-100 dark:bg-green-900/30';
      }
    }
    if (tableType === 'absent') {
      if (record.status === 'absent' || record.firstHalf.status === 'absent' || record.secondHalf.status === 'absent') {
        return 'bg-red-100 dark:bg-red-900/30';
      }
    }
    if (tableType === 'leaves') {
      if (record.status === 'leave' || record.firstHalf.status === 'leave' || record.secondHalf.status === 'leave') {
        return 'bg-yellow-100 dark:bg-yellow-900/30';
      }
    }
    if (tableType === 'od') {
      if (record.status === 'od' || record.isOD || record.firstHalf.status === 'od' || record.secondHalf.status === 'od' || record.firstHalf.isOD || record.secondHalf.isOD) {
        return 'bg-blue-100 dark:bg-blue-900/30';
      }
    }
    if (tableType === 'ot' || tableType === 'extraHours') {
      if (record.otHours > 0 || record.firstHalf.otHours > 0 || record.secondHalf.otHours > 0) {
        return 'bg-orange-100 dark:bg-orange-900/30';
      }
    }
    return '';
  };

  const shouldShowInTable = (record: DailyRecord | null, tableType: TableType): boolean => {
    if (!record) return false;
    
    switch (tableType) {
      case 'present':
        return record.status === 'present' || record.firstHalf.status === 'present' || record.secondHalf.status === 'present';
      case 'absent':
        return record.status === 'absent' || record.firstHalf.status === 'absent' || record.secondHalf.status === 'absent';
      case 'leaves':
        return record.status === 'leave' || record.firstHalf.status === 'leave' || record.secondHalf.status === 'leave';
      case 'od':
        return record.status === 'od' || record.isOD || record.firstHalf.status === 'od' || record.secondHalf.status === 'od' || record.firstHalf.isOD || record.secondHalf.isOD;
      case 'ot':
      case 'extraHours':
        return record.otHours > 0 || record.firstHalf.otHours > 0 || record.secondHalf.otHours > 0;
      default:
        return false;
    }
  };

  // Show ALL employees in ALL tables - no filtering
  const getFilteredPayRegisters = (): PayRegisterSummary[] => {
    // Return all pay registers - don't filter by table type
    return payRegisters;
  };

  const handleViewPayslip = (employee: Employee) => {
    // Navigate to payslip or open payslip modal
    window.location.href = `/superadmin/payroll-transactions?employeeId=${employee._id}&month=${monthStr}`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pay Register</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage monthly pay register for all employees
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Month Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Month
            </label>
            <input
              type="month"
              value={monthStr}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-');
                setCurrentDate(new Date(parseInt(y), parseInt(m) - 1));
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
            />
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2">
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? 'Syncing All...' : 'Sync All'}
            </button>
          </div>
        </div>
      </div>

      {/* Table Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <div className="border-b border-slate-200 dark:border-slate-700">
          <nav className="flex -mb-px">
            {[
              { id: 'present' as TableType, label: 'Present', color: 'green' },
              { id: 'absent' as TableType, label: 'Absent', color: 'red' },
              { id: 'leaves' as TableType, label: 'Leaves', color: 'yellow' },
              { id: 'od' as TableType, label: 'OD', color: 'blue' },
              { id: 'ot' as TableType, label: 'OT', color: 'orange' },
              { id: 'extraHours' as TableType, label: 'Extra Hours', color: 'purple' },
            ].map((tab) => {
              // Count employees with data in this table type
              const count = payRegisters.filter(pr => {
                if (!pr.dailyRecords || pr.dailyRecords.length === 0) return false;
                switch (tab.id) {
                  case 'present':
                    return pr.dailyRecords.some(r => r.status === 'present' || r.firstHalf.status === 'present' || r.secondHalf.status === 'present');
                  case 'absent':
                    return pr.dailyRecords.some(r => r.status === 'absent' || r.firstHalf.status === 'absent' || r.secondHalf.status === 'absent');
                  case 'leaves':
                    return pr.dailyRecords.some(r => r.status === 'leave' || r.firstHalf.status === 'leave' || r.secondHalf.status === 'leave');
                  case 'od':
                    return pr.dailyRecords.some(r => r.status === 'od' || r.isOD || r.firstHalf.status === 'od' || r.secondHalf.status === 'od' || r.firstHalf.isOD || r.secondHalf.isOD);
                  case 'ot':
                  case 'extraHours':
                    return pr.dailyRecords.some(r => r.otHours > 0 || r.firstHalf.otHours > 0 || r.secondHalf.otHours > 0);
                  default:
                    return true;
                }
              }).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTable(tab.id)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTable === tab.id
                      ? `border-${tab.color}-500 text-${tab.color}-600 dark:text-${tab.color}-400`
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                  <span className="ml-2 px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 rounded-full">
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Grid Table View - Similar to Attendance Page */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
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
                        className={`w-[calc((100%-180px-240px)/${daysInMonth})] border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300`}
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
                    <th className="w-[80px] border-r-0 border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-green-50 dark:bg-green-900/20">
                      Payable Shifts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {getFilteredPayRegisters().length === 0 ? (
                    <tr>
                      <td colSpan={daysArray.length + 4} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No records found for {activeTable} table
                      </td>
                    </tr>
                  ) : (
                    getFilteredPayRegisters().map((pr) => {
                      const employee = typeof pr.employeeId === 'object' ? pr.employeeId : null;
                      const employeeId = typeof pr.employeeId === 'object' ? pr.employeeId._id : pr.employeeId;
                      const emp_no = typeof pr.employeeId === 'object' ? pr.employeeId.emp_no : pr.emp_no;
                      const employee_name = typeof pr.employeeId === 'object' ? pr.employeeId.employee_name : '';
                      const department = typeof pr.employeeId === 'object' && pr.employeeId.department_id 
                        ? (typeof pr.employeeId.department_id === 'object' ? pr.employeeId.department_id.name : '')
                        : '';

                      // Create a map of daily records for quick lookup
                      const dailyRecordsMap = new Map(pr.dailyRecords.map(r => [r.date, r]));

                      return (
                        <tr key={pr._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-semibold truncate flex-1">
                                  {employee_name}
                                </div>
                                <button
                                  onClick={() => employee && handleViewPayslip(employee)}
                                  className="rounded-md bg-gradient-to-r from-green-500 to-emerald-600 px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:from-green-600 hover:to-emerald-700 hover:shadow-md"
                                  title="View Payslip"
                                >
                                  Payslip
                                </button>
                              </div>
                              <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-1">
                                {emp_no}
                                {department && ` • ${department}`}
                              </div>
                            </div>
                          </td>
                          {daysArray.map((day) => {
                            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const record = dailyRecordsMap.get(dateStr) || null;
                            const shouldShow = shouldShowInTable(record, activeTable);
                            const displayStatus = getStatusDisplay(record);
                            const bgColor = getCellBackgroundColor(record, activeTable);

                            return (
                              <td
                                key={day}
                                onClick={() => {
                                  if (employee) {
                                    if (record) {
                                      handleDateClick(employee, dateStr, record);
                                    } else {
                                      // Create empty record for editing if no record exists
                                      const emptyRecord: DailyRecord = {
                                        date: dateStr,
                                        firstHalf: {
                                          status: 'absent',
                                          leaveType: null,
                                          leaveNature: null,
                                          isOD: false,
                                          otHours: 0,
                                          shiftId: null,
                                          remarks: null,
                                        },
                                        secondHalf: {
                                          status: 'absent',
                                          leaveType: null,
                                          leaveNature: null,
                                          isOD: false,
                                          otHours: 0,
                                          shiftId: null,
                                          remarks: null,
                                        },
                                        status: 'absent',
                                        leaveType: null,
                                        leaveNature: null,
                                        isOD: false,
                                        isSplit: false,
                                        shiftId: null,
                                        shiftName: null,
                                        otHours: 0,
                                        remarks: null,
                                      };
                                      handleDateClick(employee, dateStr, emptyRecord);
                                    }
                                  }
                                }}
                                className={`border-r border-slate-200 px-1 py-1.5 text-center dark:border-slate-700 ${
                                  employee ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                                } ${bgColor}`}
                              >
                                {shouldShow && record ? (
                                  <div className="space-y-0.5">
                                    <div className="font-semibold text-[9px]">{displayStatus}</div>
                                    {record.isSplit && (
                                      <div className="text-[8px] opacity-75">
                                        {record.firstHalf.status.charAt(0).toUpperCase()}/{record.secondHalf.status.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    {record.otHours > 0 && (activeTable === 'ot' || activeTable === 'extraHours') && (
                                      <div className="text-[8px] font-semibold text-blue-600 dark:text-blue-300">{record.otHours}h</div>
                                    )}
                                    {record.shiftName && (
                                      <div className="text-[8px] opacity-75 truncate" title={record.shiftName}>{record.shiftName.substring(0, 3)}</div>
                                    )}
                                    {record.isManuallyEdited && (
                                      <div className="text-[7px] text-indigo-600 dark:text-indigo-400" title="Manually Edited">✎</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[9px]">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="border-r border-slate-200 bg-blue-50 px-2 py-2 text-center text-[11px] font-bold text-blue-700 dark:border-slate-700 dark:bg-blue-900/20 dark:text-blue-300">
                            {pr.totals.totalPresentDays.toFixed(1)}
                          </td>
                          <td className="border-r border-slate-200 bg-orange-50 px-2 py-2 text-center text-[11px] font-bold text-orange-700 dark:border-slate-700 dark:bg-orange-900/20 dark:text-orange-300">
                            {pr.totals.totalOTHours.toFixed(1)}
                          </td>
                          <td className="border-r-0 border-slate-200 bg-green-50 px-2 py-2 text-center text-[11px] font-bold text-green-700 dark:border-slate-700 dark:bg-green-900/20 dark:text-green-300">
                            {pr.totals.totalPayableShifts.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Edit: {editingRecord.date} - {editingRecord.employee.employee_name}
                </h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* First Half */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-white">First Half</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Status
                      </label>
                      <select
                        value={editData.firstHalf?.status || 'absent'}
                        onChange={(e) => setEditData({
                          ...editData,
                          firstHalf: {
                            ...editData.firstHalf!,
                            status: e.target.value as any,
                            leaveType: e.target.value === 'leave' ? (editData.firstHalf?.leaveType || null) : null,
                            leaveNature: e.target.value === 'leave' ? (editData.firstHalf?.leaveNature || null) : null,
                            isOD: e.target.value === 'od',
                          },
                        })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="leave">Leave</option>
                        <option value="od">OD</option>
                        <option value="holiday">Holiday</option>
                        <option value="week_off">Week Off</option>
                      </select>
                    </div>
                    {editData.firstHalf?.status === 'leave' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Leave Type
                          </label>
                          <select
                            value={editData.firstHalf?.leaveType || ''}
                            onChange={(e) => setEditData({
                              ...editData,
                              firstHalf: {
                                ...editData.firstHalf!,
                                leaveType: e.target.value,
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          >
                            <option value="">Select Leave Type</option>
                            {leaveTypes.map((lt) => (
                              <option key={lt.code} value={lt.code}>
                                {lt.name} ({lt.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Leave Nature
                          </label>
                          <select
                            value={editData.firstHalf?.leaveNature || 'paid'}
                            onChange={(e) => setEditData({
                              ...editData,
                              firstHalf: {
                                ...editData.firstHalf!,
                                leaveNature: e.target.value as any,
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          >
                            <option value="paid">Paid</option>
                            <option value="lop">LOP (Loss of Pay)</option>
                            <option value="without_pay">Without Pay</option>
                          </select>
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        OT Hours
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editData.firstHalf?.otHours || 0}
                        onChange={(e) => setEditData({
                          ...editData,
                          firstHalf: {
                            ...editData.firstHalf!,
                            otHours: parseFloat(e.target.value) || 0,
                          },
                        })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Shift
                      </label>
                      <select
                        value={editData.shiftId || ''}
                        onChange={(e) => {
                          const shift = shifts.find((s) => s._id === e.target.value);
                          setEditData({
                            ...editData,
                            shiftId: e.target.value || null,
                            shiftName: shift?.name || null,
                            firstHalf: {
                              ...editData.firstHalf!,
                              shiftId: e.target.value || null,
                            },
                            secondHalf: {
                              ...editData.secondHalf!,
                              shiftId: e.target.value || null,
                            },
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                      >
                        <option value="">Select Shift</option>
                        {shifts.map((shift) => (
                          <option key={shift._id} value={shift._id}>
                            {shift.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Second Half */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-white">Second Half</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Status
                      </label>
                      <select
                        value={editData.secondHalf?.status || 'absent'}
                        onChange={(e) => setEditData({
                          ...editData,
                          secondHalf: {
                            ...editData.secondHalf!,
                            status: e.target.value as any,
                            leaveType: e.target.value === 'leave' ? (editData.secondHalf?.leaveType || null) : null,
                            leaveNature: e.target.value === 'leave' ? (editData.secondHalf?.leaveNature || null) : null,
                            isOD: e.target.value === 'od',
                          },
                        })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="leave">Leave</option>
                        <option value="od">OD</option>
                        <option value="holiday">Holiday</option>
                        <option value="week_off">Week Off</option>
                      </select>
                    </div>
                    {editData.secondHalf?.status === 'leave' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Leave Type
                          </label>
                          <select
                            value={editData.secondHalf?.leaveType || ''}
                            onChange={(e) => setEditData({
                              ...editData,
                              secondHalf: {
                                ...editData.secondHalf!,
                                leaveType: e.target.value,
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          >
                            <option value="">Select Leave Type</option>
                            {leaveTypes.map((lt) => (
                              <option key={lt.code} value={lt.code}>
                                {lt.name} ({lt.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Leave Nature
                          </label>
                          <select
                            value={editData.secondHalf?.leaveNature || 'paid'}
                            onChange={(e) => setEditData({
                              ...editData,
                              secondHalf: {
                                ...editData.secondHalf!,
                                leaveNature: e.target.value as any,
                              },
                            })}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                          >
                            <option value="paid">Paid</option>
                            <option value="lop">LOP (Loss of Pay)</option>
                            <option value="without_pay">Without Pay</option>
                          </select>
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        OT Hours
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editData.secondHalf?.otHours || 0}
                        onChange={(e) => setEditData({
                          ...editData,
                          secondHalf: {
                            ...editData.secondHalf!,
                            otHours: parseFloat(e.target.value) || 0,
                          },
                        })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Full Day OT Hours */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Total OT Hours (Full Day)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editData.otHours || 0}
                    onChange={(e) => setEditData({
                      ...editData,
                      otHours: parseFloat(e.target.value) || 0,
                    })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                  />
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Remarks
                  </label>
                  <textarea
                    value={editData.remarks || ''}
                    onChange={(e) => setEditData({
                      ...editData,
                      remarks: e.target.value,
                    })}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDate}
                  disabled={saving[editingRecord.employeeId]}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving[editingRecord.employeeId] ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
