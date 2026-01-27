'use client';

import { useState, useEffect } from 'react';
import { api, apiRequest } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';

type TabType = 'shift' | 'employee' | 'leaves' | 'loan' | 'salary_advance' | 'attendance' | 'payroll' | 'overtime' | 'permissions' | 'attendance_deductions' | 'communications' | 'feature_control' | 'general';

interface ShiftDuration {
  _id: string;
  duration: number;
  label?: string;
  isActive: boolean;
}

interface LeaveType {
  code: string;
  name: string;
  description?: string;
  maxDaysPerYear?: number;
  carryForward?: boolean;
  maxCarryForward?: number;
  isPaid?: boolean;
  isActive: boolean;
  color?: string;
}

interface LeaveStatus {
  code: string;
  name: string;
  description?: string;
  color?: string;
  isFinal: boolean;
  isApproved: boolean;
  canEmployeeEdit: boolean;
  canEmployeeCancel: boolean;
}

interface WorkflowStep {
  stepOrder: number;
  stepName: string;
  approverRole: string;
  availableActions: string[];
  approvedStatus: string;
  rejectedStatus: string;
  nextStepOnApprove: number | null;
  isActive: boolean;
}

interface LeaveSettingsData {
  _id?: string;
  type: 'leave' | 'od';
  types: LeaveType[];
  statuses: LeaveStatus[];
  workflow: {
    isEnabled: boolean;
    steps: WorkflowStep[];
    finalAuthority?: {
      role: string;
      anyHRCanApprove: boolean;
    };
  };
  settings?: {
    allowBackdated: boolean;
    maxBackdatedDays: number;
    allowFutureDated: boolean;
    maxAdvanceDays: number;
    workspacePermissions?: Record<string, {
      leave?: {
        canApplyForSelf: boolean;
        canApplyForOthers: boolean;
      };
      od?: {
        canApplyForSelf: boolean;
        canApplyForOthers: boolean;
      };
      // Legacy support: if leave/od not specified, use these
      canApplyForSelf?: boolean;
      canApplyForOthers?: boolean;
    }>; // workspaceId -> { leave: {...}, od: {...} }
  };
}

// Icon Components
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
  </svg>
);

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
  </svg>
);

/**
 * Render the settings UI with grouped tabs for configuring shifts, employees, leaves, loans/salary advances, attendance, overtime, permission & attendance deduction rules, payroll, communications, feature control, and general system settings.
 *
 * The component manages loading, editing, and saving of many domain-specific settings, handles workspace and workflow management, file upload for attendance, bulk payroll release, and displays contextual messages and loading states across different sub-sections.
 *
 * @returns A React element containing the complete settings page UI with tabbed navigation and associated controls.
 */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('shift');
  const [shiftDurations, setShiftDurations] = useState<ShiftDuration[]>([]);
  const [newDuration, setNewDuration] = useState<number | ''>('');
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit modal state
  const [editingDuration, setEditingDuration] = useState<ShiftDuration | null>(null);
  const [editDuration, setEditDuration] = useState<number | ''>('');
  const [editLabel, setEditLabel] = useState('');

  // Employee settings state
  const [employeeDataSource, setEmployeeDataSource] = useState<string>('mongodb');
  const [employeeDeleteTarget, setEmployeeDeleteTarget] = useState<string>('both');
  const [mssqlConnected, setMssqlConnected] = useState(false);
  const [employeeSettingsLoading, setEmployeeSettingsLoading] = useState(false);

  // Payroll include-missing toggle (global)
  const [includeMissingLoading, setIncludeMissingLoading] = useState(false);
  const [includeMissingSaving, setIncludeMissingSaving] = useState(false);
  const [includeMissing, setIncludeMissing] = useState<boolean>(true);

  const loadIncludeMissingSetting = async () => {
    try {
      setIncludeMissingLoading(true);
      const res = await api.getIncludeMissingSetting();
      if (res?.data?.value !== undefined && res?.data?.value !== null) {
        setIncludeMissing(!!res.data.value);
      } else {
        setIncludeMissing(true);
      }
    } catch (err) {
      console.error('Failed to load includeMissing setting', err);
      setIncludeMissing(true);
    } finally {
      setIncludeMissingLoading(false);
    }
  };

  // Leave settings state
  const [leaveSettings, setLeaveSettings] = useState<LeaveSettingsData | null>(null);
  const [odSettings, setODSettings] = useState<LeaveSettingsData | null>(null);
  const [leaveSettingsLoading, setLeaveSettingsLoading] = useState(false);
  const [leaveSubTab, setLeaveSubTab] = useState<'types' | 'statuses' | 'odTypes' | 'odStatuses' | 'workflow' | 'odWorkflow' | 'workspacePermissions' | 'general'>('types');

  // Workspace permissions state
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacePermissions, setWorkspacePermissions] = useState<Record<string, {
    leave?: {
      canApplyForSelf: boolean;
      canApplyForOthers: boolean;
    };
    od?: {
      canApplyForSelf: boolean;
      canApplyForOthers: boolean;
    };
    // Legacy support
    canApplyForSelf?: boolean;
    canApplyForOthers?: boolean;
  }>>({});

  // Attendance settings state
  const [attendanceSettings, setAttendanceSettings] = useState<any>(null);
  const [attendanceSettingsLoading, setAttendanceSettingsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // New leave type form
  const [newLeaveType, setNewLeaveType] = useState({ code: '', name: '', description: '', maxDaysPerYear: 12, leaveNature: 'paid' as 'paid' | 'lop' | 'without_pay', carryForward: false, maxCarryForward: 0 });
  const [newODType, setNewODType] = useState({ code: '', name: '', description: '' });
  const [newStatus, setNewStatus] = useState({ code: '', name: '', description: '', color: '#6b7280' });

  // Editing state
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [editingStatus, setEditingStatus] = useState<LeaveStatus | null>(null);

  // Loan settings state
  const [loanSettings, setLoanSettings] = useState<any>(null);
  const [loanSettingsLoading, setLoanSettingsLoading] = useState(false);
  const [loanSubTab, setLoanSubTab] = useState<'general' | 'workflow' | 'workspacePermissions'>('general');
  const [loanWorkspacePermissions, setLoanWorkspacePermissions] = useState<Record<string, {
    canApplyForSelf: boolean;
    canApplyForOthers: boolean;
  }>>({});
  const [workflowUsers, setWorkflowUsers] = useState<any[]>([]);
  const [workflowUsersByRole, setWorkflowUsersByRole] = useState<Record<string, any[]>>({});

  // Loan general settings form state
  const [loanGeneralSettings, setLoanGeneralSettings] = useState({
    minAmount: 1000,
    maxAmount: null as number | null,
    minDuration: 1,
    maxDuration: 60,
    interestRate: 0,
    isInterestApplicable: false,
    maxActivePerEmployee: 1,
    minServicePeriod: 0,
    advancePercentage: 50,
    considerAttendance: true,
  });

  // Overtime (OT) settings state
  const [otSettings, setOTSettings] = useState({
    otPayPerHour: 0,
    minOTHours: 0,
    workflow: {
      isEnabled: false,
      steps: [] as WorkflowStep[],
      finalAuthority: { role: 'manager', anyHRCanApprove: false }
    }
  });
  const [otSettingsLoading, setOTSettingsLoading] = useState(false);

  // Permission deduction rules state
  const [permissionDeductionRules, setPermissionDeductionRules] = useState({
    countThreshold: null as number | null,
    deductionType: null as 'half_day' | 'full_day' | 'custom_amount' | null,
    deductionAmount: null as number | null,
    minimumDuration: null as number | null,
    calculationMode: null as 'proportional' | 'floor' | null,
  });
  const [permissionWorkflow, setPermissionWorkflow] = useState({
    isEnabled: false,
    steps: [] as WorkflowStep[],
    finalAuthority: { role: 'manager', anyHRCanApprove: false }
  });
  const [permissionRulesLoading, setPermissionRulesLoading] = useState(false);

  // Attendance deduction rules state
  const [attendanceDeductionRules, setAttendanceDeductionRules] = useState({
    combinedCountThreshold: null as number | null,
    deductionType: null as 'half_day' | 'full_day' | 'custom_amount' | null,
    deductionAmount: null as number | null,
    minimumDuration: null as number | null,
    calculationMode: null as 'proportional' | 'floor' | null,
  });
  const [attendanceRulesLoading, setAttendanceRulesLoading] = useState(false);

  // Early-out settings state
  const [earlyOutSettings, setEarlyOutSettings] = useState({
    isEnabled: false,
    allowedDurationMinutes: 0,
    minimumDuration: 0,
    deductionRanges: [] as {
      _id?: string;
      minMinutes: number;
      maxMinutes: number;
      deductionType: 'quarter_day' | 'half_day' | 'full_day' | 'custom_amount';
      deductionAmount?: number | null;
      description?: string;
    }[],
  });
  const [earlyOutLoading, setEarlyOutLoading] = useState(false);
  const [earlyOutSaving, setEarlyOutSaving] = useState(false);
  const [newRange, setNewRange] = useState({
    minMinutes: '',
    maxMinutes: '',
    deductionType: 'quarter_day' as 'quarter_day' | 'half_day' | 'full_day' | 'custom_amount',
    deductionAmount: '',
    description: '',
  });

  const [passwordGenerationMode, setPasswordGenerationMode] = useState<'random' | 'phone_empno'>('random');
  const [credentialDeliveryStrategy, setCredentialDeliveryStrategy] = useState<'email_only' | 'sms_only' | 'both' | 'intelligent'>('both');
  const [communicationsLoading, setCommunicationsLoading] = useState(false);

  // Feature Control state
  const [featureControlEmployee, setFeatureControlEmployee] = useState<string[]>([]);
  const [featureControlHOD, setFeatureControlHOD] = useState<string[]>([]);
  const [featureControlHR, setFeatureControlHR] = useState<string[]>([]);
  const [featureControlLoading, setFeatureControlLoading] = useState(false);

  // Payslip Settings state
  const [payslipReleaseRequired, setPayslipReleaseRequired] = useState<boolean>(true);
  const [payslipHistoryMonths, setPayslipHistoryMonths] = useState<number>(6);
  const [payslipDownloadLimit, setPayslipDownloadLimit] = useState<number>(5);
  const [payrollCycleStartDay, setPayrollCycleStartDay] = useState<number>(1);
  const [payrollCycleEndDay, setPayrollCycleEndDay] = useState<number>(31);
  const [payrollLoading, setPayrollLoading] = useState(false);

  // General settings state
  const [lateInGrace, setLateInGrace] = useState<number>(15);
  const [earlyOutGrace, setEarlyOutGrace] = useState<number>(15);
  const [generalSettingsLoading, setGeneralSettingsLoading] = useState(false);

  const loadGeneralSettings = async () => {
    try {
      setGeneralSettingsLoading(true);
      const resLate = await api.getSetting('late_in_grace_time');
      const resEarly = await api.getSetting('early_out_grace_time');

      if (resLate.success && resLate.data) setLateInGrace(Number(resLate.data.value));
      if (resEarly.success && resEarly.data) setEarlyOutGrace(Number(resEarly.data.value));
    } catch (err) {
      console.error('Failed to load general settings', err);
    } finally {
      setGeneralSettingsLoading(false);
    }
  };

  const saveGeneralSettings = async () => {
    try {
      setSaving(true);
      const resLate = await api.upsertSetting({
        key: 'late_in_grace_time',
        value: lateInGrace,
        category: 'general',
        description: 'Global Late In Grace Period (Minutes)'
      });
      const resEarly = await api.upsertSetting({
        key: 'early_out_grace_time',
        value: earlyOutGrace,
        category: 'general',
        description: 'Global Early Out Grace Period (Minutes)'
      });

      if (resLate.success && resEarly.success) {
        setMessage({ type: 'success', text: 'General settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save general settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };

  const [releaseMonth, setReleaseMonth] = useState<string>(new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));
  const [releasing, setReleasing] = useState(false);

  const loadFeatureControlSettings = async () => {
    try {
      setFeatureControlLoading(true);
      const resEmp = await api.getSetting('feature_control_employee');
      const resHOD = await api.getSetting('feature_control_hod');
      const resHR = await api.getSetting('feature_control_hr');

      if (resEmp.success && resEmp.data?.value?.activeModules) setFeatureControlEmployee(resEmp.data.value.activeModules);
      if (resHOD.success && resHOD.data?.value?.activeModules) setFeatureControlHOD(resHOD.data.value.activeModules);
      if (resHR.success && resHR.data?.value?.activeModules) setFeatureControlHR(resHR.data.value.activeModules);
    } catch (err) {
      console.error('Failed to load feature control settings', err);
    } finally {
      setFeatureControlLoading(false);
    }
  };

  const saveFeatureControlSettings = async () => {
    try {
      setSaving(true);
      const resEmp = await api.upsertSetting({
        key: 'feature_control_employee',
        value: { activeModules: featureControlEmployee },
        category: 'feature_control',
        description: 'Active modules for Employee role'
      });
      const resHOD = await api.upsertSetting({
        key: 'feature_control_hod',
        value: { activeModules: featureControlHOD },
        category: 'feature_control',
        description: 'Active modules for HOD role'
      });
      const resHR = await api.upsertSetting({
        key: 'feature_control_hr',
        value: { activeModules: featureControlHR },
        category: 'feature_control',
        description: 'Active modules for HR role'
      });

      if (resEmp.success && resHOD.success && resHR.success) {
        setMessage({ type: 'success', text: 'Feature control settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save feature control settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };

  const loadPayrollSettings = async () => {
    try {
      setPayrollLoading(true);
      const resRelease = await api.getSetting('payslip_release_required');
      const resHistory = await api.getSetting('payslip_history_months');
      const resLimit = await api.getSetting('payslip_download_limit');
      const resStartDay = await api.getSetting('payroll_cycle_start_day');
      const resEndDay = await api.getSetting('payroll_cycle_end_day');

      if (resRelease.success && resRelease.data) setPayslipReleaseRequired(!!resRelease.data.value);
      if (resHistory.success && resHistory.data) setPayslipHistoryMonths(Number(resHistory.data.value));
      if (resLimit.success && resLimit.data) setPayslipDownloadLimit(Number(resLimit.data.value));
      if (resStartDay.success && resStartDay.data) setPayrollCycleStartDay(Number(resStartDay.data.value));
      if (resEndDay.success && resEndDay.data) setPayrollCycleEndDay(Number(resEndDay.data.value));
    } catch (err) {
      console.error('Failed to load payroll settings', err);
    } finally {
      setPayrollLoading(false);
    }
  };

  const savePayrollSettings = async () => {
    try {
      setSaving(true);
      const resRelease = await api.upsertSetting({
        key: 'payslip_release_required',
        value: payslipReleaseRequired,
        category: 'payroll',
        description: 'Whether payslips must be explicitly released before employees can view them'
      });
      const resHistory = await api.upsertSetting({
        key: 'payslip_history_months',
        value: payslipHistoryMonths,
        category: 'payroll',
        description: 'Number of previous months of payslips visible to employees'
      });
      const resLimit = await api.upsertSetting({
        key: 'payslip_download_limit',
        value: payslipDownloadLimit,
        category: 'payroll',
        description: 'Maximum number of times an employee can download a single payslip'
      });
      const resStartDay = await api.upsertSetting({
        key: 'payroll_cycle_start_day',
        value: payrollCycleStartDay,
        category: 'payroll',
        description: 'The day of the month when the payroll cycle starts. Default is 1 (calendar month).'
      });
      const resEndDay = await api.upsertSetting({
        key: 'payroll_cycle_end_day',
        value: payrollCycleEndDay,
        category: 'payroll',
        description: 'The day of the month when the payroll cycle ends. Default is 31 (end of month).'
      });

      if (resRelease.success && resHistory.success && resLimit.success && resStartDay.success && resEndDay.success) {
        setMessage({ type: 'success', text: 'Payroll settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save payroll settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkRelease = async () => {
    if (!releaseMonth) {
      toast.error('Please select a month for release');
      return;
    }

    try {
      setReleasing(true);
      const response = await apiRequest<any>('/payroll/release', {
        method: 'PUT',
        body: JSON.stringify({ month: releaseMonth })
      });

      if (response.success) {
        toast.success(`Successfully released ${response.count} payslips for ${releaseMonth}`);
      } else {
        toast.error(response.message || 'Failed to release payslips');
      }
    } catch (err: any) {
      console.error('Error releasing payslips:', err);
      toast.error(err.message || 'Error releasing payslips');
    } finally {
      setReleasing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'shift') {
      loadShiftDurations();
    } else if (activeTab === 'employee') {
      loadEmployeeSettings();
    } else if (activeTab === 'leaves') {
      loadLeaveSettings();
    } else if (activeTab === 'loan' || activeTab === 'salary_advance') {
      loadLoanSettings(activeTab);
    } else if (activeTab === 'attendance') {
      loadAttendanceSettings();
    } else if (activeTab === 'overtime') {
      loadOTSettings();
    } else if (activeTab === 'permissions') {
      loadPermissionDeductionRules();
    } else if (activeTab === 'attendance_deductions') {
      loadAttendanceDeductionRules();
      loadEarlyOutSettings();
    } else if (activeTab === 'payroll') {
      loadIncludeMissingSetting();
      loadPayrollSettings();
    } else if (activeTab === 'communications') {
      loadCommunicationSettings();
    } else if (activeTab === 'feature_control') {
      loadFeatureControlSettings();
    } else if (activeTab === 'general') {
      loadGeneralSettings();
    }
  }, [activeTab]);

  // Load workspaces when workspace permissions tab is selected
  useEffect(() => {
    if (activeTab === 'leaves' && leaveSubTab === 'workspacePermissions') {
      loadWorkspaces();
    }
  }, [activeTab, leaveSubTab]);

  useEffect(() => {
    if ((activeTab === 'loan' || activeTab === 'salary_advance') && loanSubTab === 'workflow') {
      loadWorkflowUsers();
    }
    if ((activeTab === 'loan' || activeTab === 'salary_advance') && loanSubTab === 'workspacePermissions') {
      loadWorkspaces();
    }
  }, [activeTab, loanSubTab]);

  const loadShiftDurations = async () => {
    try {
      setLoading(true);
      const response = await api.getShiftDurations();

      if (response.success) {
        const durations = response.durations || [];
        setShiftDurations(Array.isArray(durations) ? durations : []);
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to load shift durations' });
        setShiftDurations([]);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while loading durations' });
      setShiftDurations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeSettings = async () => {
    try {
      setEmployeeSettingsLoading(true);

      // Get current employee settings
      const empSettingsRes = await api.getEmployeeSettings();
      if (empSettingsRes.success && empSettingsRes.data) {
        setEmployeeDataSource(empSettingsRes.data.dataSource || 'mongodb');
        setEmployeeDeleteTarget(empSettingsRes.data.deleteTarget || 'both');
        setMssqlConnected(empSettingsRes.data.mssqlConnected || false);
      }
    } catch (err) {
      console.error('Error loading employee settings:', err);
    } finally {
      setEmployeeSettingsLoading(false);
    }
  };

  const loadAttendanceSettings = async () => {
    try {
      setAttendanceSettingsLoading(true);
      const response = await api.getAttendanceSettings();
      if (response.success && response.data) {
        setAttendanceSettings(response.data);
      }
    } catch (err) {
      console.error('Error loading attendance settings:', err);
      setMessage({ type: 'error', text: 'Failed to load attendance settings' });
    } finally {
      setAttendanceSettingsLoading(false);
    }
  };

  const saveAttendanceSettings = async () => {
    if (!attendanceSettings) return;

    try {
      setSaving(true);
      const response = await api.updateAttendanceSettings(attendanceSettings);
      if (response.success) {
        setMessage({ type: 'success', text: 'Attendance settings saved successfully' });
        await loadAttendanceSettings();
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to save settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      const response = await api.manualSyncAttendance();
      if (response.success) {
        setMessage({ type: 'success', text: response.message || 'Sync completed successfully' });
        await loadAttendanceSettings();
      } else {
        setMessage({ type: 'error', text: response.message || 'Sync failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred during sync' });
    } finally {
      setSyncing(false);
    }
  };

  const loadOTSettings = async () => {
    try {
      setOTSettingsLoading(true);

      const response = await api.getOvertimeSettings();

      if (response.success && response.data) {
        setOTSettings({
          otPayPerHour: response.data.payPerHour || 0,
          minOTHours: response.data.minOTHours || 0,
          workflow: response.data.workflow || { isEnabled: false, steps: [] },
        });
      }
    } catch (err) {
      console.error('Error loading OT settings:', err);
      setMessage({ type: 'error', text: 'Failed to load OT settings' });
    } finally {
      setOTSettingsLoading(false);
    }
  };

  const saveOTSettings = async () => {
    try {
      setSaving(true);

      const response = await api.saveOvertimeSettings({
        otPayPerHour: otSettings.otPayPerHour,
        minOTHours: otSettings.minOTHours,
      });

      if (response.success) {
        setMessage({ type: 'success', text: 'OT settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to save OT settings' });
      }
    } catch (err) {
      console.error('Error saving OT settings:', err);
      setMessage({ type: 'error', text: 'An error occurred while saving OT settings' });
    } finally {
      setSaving(false);
    }
  };

  const saveOTWorkflow = async () => {
    try {
      setSaving(true);
      const response = await api.saveOvertimeSettings({
        workflow: otSettings.workflow,
      });

      if (response.success) {
        setMessage({ type: 'success', text: 'OT workflow saved successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to save OT workflow' });
      }
    } catch (err) {
      console.error('Error saving OT workflow:', err);
      setMessage({ type: 'error', text: 'An error occurred while saving OT workflow' });
    } finally {
      setSaving(false);
    }
  };

  const loadPermissionDeductionRules = async () => {
    try {
      setPermissionRulesLoading(true);

      const response = await api.getPermissionDeductionSettings();

      if (response.success && response.data) {
        const rules = response.data.deductionRules || {};
        const workflow = response.data.workflow || { isEnabled: false, steps: [], finalAuthority: { role: 'manager', anyHRCanApprove: false } };

        setPermissionDeductionRules({
          countThreshold: rules.countThreshold ?? null,
          deductionType: rules.deductionType ?? null,
          deductionAmount: rules.deductionAmount ?? null,
          minimumDuration: rules.minimumDuration ?? null,
          calculationMode: rules.calculationMode ?? null,
        });
        setPermissionWorkflow(workflow);
      }
    } catch (err) {
      console.error('Error loading permission deduction rules:', err);
      setMessage({ type: 'error', text: 'Failed to load permission deduction rules' });
    } finally {
      setPermissionRulesLoading(false);
    }
  };

  // Load Permission Rules
  const loadPermissionRules = async () => {
    try {
      setPermissionRulesLoading(true);
      const res = await api.getPermissionDeductionSettings();
      if (res.success && res.data) {
        setPermissionDeductionRules(res.data);
      }
    } catch (error) {
      console.error('Error loading permission rules:', error);
    } finally {
      setPermissionRulesLoading(false);
    }
  };

  // Save Permission Rules
  const savePermissionDeductionRules = async () => {
    try {
      setSaving(true);
      const res = await api.savePermissionDeductionSettings(permissionDeductionRules);
      if (res.success) {
        setMessage({ type: 'success', text: 'Permission deduction rules saved successfully' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: res.message || 'Failed to save rules' });
      }
    } catch (error) {
      console.error('Error saving permission rules:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving rules' });
    } finally {
      setSaving(false);
    }
  };

  const savePermissionWorkflow = async () => {
    try {
      setSaving(true);

      const response = await api.savePermissionDeductionSettings({
        workflow: permissionWorkflow,
      });

      if (response.success) {
        setMessage({ type: 'success', text: 'Permission workflow saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save permission workflow' });
      }
    } catch (err) {
      console.error('Error saving permission workflow:', err);
      setMessage({ type: 'error', text: 'Failed to save permission workflow' });
    } finally {
      setSaving(false);
    }
  };

  const loadAttendanceDeductionRules = async () => {
    try {
      setAttendanceRulesLoading(true);

      const response = await api.getAttendanceDeductionSettings();

      if (response.success && response.data) {
        const rules = response.data.deductionRules || {};
        setAttendanceDeductionRules({
          combinedCountThreshold: rules.combinedCountThreshold ?? null,
          deductionType: rules.deductionType ?? null,
          deductionAmount: rules.deductionAmount ?? null,
          minimumDuration: rules.minimumDuration ?? null,
          calculationMode: rules.calculationMode ?? null,
        });
      }
    } catch (err) {
      console.error('Error loading attendance deduction rules:', err);
      setMessage({ type: 'error', text: 'Failed to load attendance deduction rules' });
    } finally {
      setAttendanceRulesLoading(false);
    }
  };

  const loadEarlyOutSettings = async () => {
    try {
      setEarlyOutLoading(true);
      const response = await api.getEarlyOutSettings();
      if (response.success) {
        const data = response.data || {};
        setEarlyOutSettings({
          isEnabled: data.isEnabled ?? false,
          allowedDurationMinutes: data.allowedDurationMinutes ?? 0,
          minimumDuration: data.minimumDuration ?? 0,
          deductionRanges: Array.isArray(data.deductionRanges) ? data.deductionRanges : [],
        });
      } else {
        setMessage({ type: 'error', text: 'Failed to load early-out settings' });
      }
    } catch (err) {
      console.error('Error loading early-out settings:', err);
      setMessage({ type: 'error', text: 'Failed to load early-out settings' });
    } finally {
      setEarlyOutLoading(false);
    }
  };

  const saveAttendanceDeductionRules = async () => {
    try {
      setSaving(true);

      const response = await api.saveAttendanceDeductionSettings({
        deductionRules: attendanceDeductionRules,
      });

      if (response.success) {
        setMessage({ type: 'success', text: 'Attendance deduction rules saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save attendance deduction rules' });
      }
    } catch (err) {
      console.error('Error saving attendance deduction rules:', err);
      setMessage({ type: 'error', text: 'Failed to save attendance deduction rules' });
    } finally {
      setSaving(false);
    }
  };

  const saveEarlyOutSettings = async () => {
    try {
      setEarlyOutSaving(true);
      const payload = {
        isEnabled: earlyOutSettings.isEnabled,
        allowedDurationMinutes: earlyOutSettings.allowedDurationMinutes,
        minimumDuration: earlyOutSettings.minimumDuration,
        deductionRanges: earlyOutSettings.deductionRanges,
      };
      const response = await api.saveEarlyOutSettings(payload);
      if (response.success) {
        setMessage({ type: 'success', text: 'Early-out settings saved successfully' });
        await loadEarlyOutSettings();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to save early-out settings' });
      }
    } catch (err) {
      console.error('Error saving early-out settings:', err);
      setMessage({ type: 'error', text: 'Failed to save early-out settings' });
    } finally {
      setEarlyOutSaving(false);
    }
  };

  const addEarlyOutRange = async () => {
    try {
      if (!newRange.minMinutes || !newRange.maxMinutes || Number(newRange.maxMinutes) <= Number(newRange.minMinutes)) {
        setMessage({ type: 'error', text: 'Please enter valid min and max minutes' });
        return;
      }
      if (newRange.deductionType === 'custom_amount' && (!newRange.deductionAmount || Number(newRange.deductionAmount) <= 0)) {
        setMessage({ type: 'error', text: 'Custom amount must be greater than 0' });
        return;
      }
      const response = await api.addEarlyOutRange({
        minMinutes: Number(newRange.minMinutes),
        maxMinutes: Number(newRange.maxMinutes),
        deductionType: newRange.deductionType,
        deductionAmount: newRange.deductionType === 'custom_amount' ? Number(newRange.deductionAmount) : undefined,
        description: newRange.description || undefined,
      });
      if (response.success) {
        setMessage({ type: 'success', text: 'Early-out range added' });
        setNewRange({ minMinutes: '', maxMinutes: '', deductionType: 'quarter_day', deductionAmount: '', description: '' });
        await loadEarlyOutSettings();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to add range' });
      }
    } catch (err) {
      console.error('Error adding early-out range:', err);
      setMessage({ type: 'error', text: 'Failed to add range' });
    }
  };

  const updateEarlyOutRange = async (id: string, data: any) => {
    try {
      const response = await api.updateEarlyOutRange(id, data);
      if (response.success) {
        setMessage({ type: 'success', text: 'Range updated' });
        await loadEarlyOutSettings();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to update range' });
      }
    } catch (err) {
      console.error('Error updating early-out range:', err);
      setMessage({ type: 'error', text: 'Failed to update range' });
    }
  };

  const deleteEarlyOutRange = async (id: string) => {
    try {
      const response = await api.deleteEarlyOutRange(id);
      if (response.success) {
        setMessage({ type: 'success', text: 'Range deleted' });
        await loadEarlyOutSettings();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to delete range' });
      }
    } catch (err) {
      console.error('Error deleting early-out range:', err);
      setMessage({ type: 'error', text: 'Failed to delete range' });
    }
  };

  const loadCommunicationSettings = async () => {
    try {
      setCommunicationsLoading(true);
      const resMode = await api.getSetting('password_generation_mode');
      const resStrategy = await api.getSetting('credential_delivery_strategy');

      if (resMode.success && resMode.data) {
        setPasswordGenerationMode(resMode.data.value || 'random');
      }
      if (resStrategy.success && resStrategy.data) {
        setCredentialDeliveryStrategy(resStrategy.data.value || 'both');
      }
    } catch (err) {
      console.error('Failed to load communication settings', err);
    } finally {
      setCommunicationsLoading(false);
    }
  };

  const saveCommunicationSettings = async () => {
    try {
      setSaving(true);
      const resMode = await api.upsertSetting({
        key: 'password_generation_mode',
        value: passwordGenerationMode,
        category: 'communications',
        description: 'Method for generating temporary passwords (random or phone+emp_no)'
      });
      const resStrategy = await api.upsertSetting({
        key: 'credential_delivery_strategy',
        value: credentialDeliveryStrategy,
        category: 'communications',
        description: 'Strategy for delivering credentials (email, sms, both, or intelligent)'
      });

      if (resMode.success && resStrategy.success) {
        setMessage({ type: 'success', text: 'Communication settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save communication settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };


  const handleExcelUpload = async () => {
    if (!uploadFile) {
      setMessage({ type: 'error', text: 'Please select a file to upload' });
      return;
    }

    try {
      setUploading(true);
      const response = await api.uploadAttendanceExcel(uploadFile);
      if (response.success) {
        setMessage({ type: 'success', text: response.message || 'File uploaded successfully' });
        setUploadFile(null);
        // Reset file input
        const fileInput = document.getElementById('excel-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setMessage({ type: 'error', text: response.message || 'Upload failed' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred during upload' });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await api.downloadAttendanceTemplate();
      setMessage({ type: 'success', text: 'Template downloaded successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to download template' });
    }
  };

  const loadLeaveSettings = async () => {
    try {
      setLeaveSettingsLoading(true);

      // Load leave settings
      const leaveRes = await api.getLeaveSettings('leave');
      console.log('[Frontend] Loaded leave settings:', leaveRes);
      if (leaveRes.success && leaveRes.data) {
        setLeaveSettings(leaveRes.data);
      } else {
        setLeaveSettings(null);
      }

      // Load OD settings
      const odRes = await api.getLeaveSettings('od');
      console.log('[Frontend] Loaded OD settings:', odRes);
      if (odRes.success && odRes.data) {
        setODSettings(odRes.data);
      } else {
        setODSettings(null);
      }

      // Merge workspace permissions from both Leave and OD settings
      const leavePerms = leaveRes.success && leaveRes.data?.settings?.workspacePermissions ? leaveRes.data.settings.workspacePermissions : {};
      const odPerms = odRes.success && odRes.data?.settings?.workspacePermissions ? odRes.data.settings.workspacePermissions : {};

      console.log('[Frontend] Leave workspace permissions:', leavePerms);
      console.log('[Frontend] OD workspace permissions:', odPerms);

      // Get all unique workspace IDs from both
      const allWorkspaceIds = new Set([
        ...Object.keys(leavePerms),
        ...Object.keys(odPerms),
      ]);

      const mergedPerms: Record<string, {
        leave?: { canApplyForSelf: boolean; canApplyForOthers: boolean };
        od?: { canApplyForSelf: boolean; canApplyForOthers: boolean };
        canApplyForSelf?: boolean;
        canApplyForOthers?: boolean;
      }> = {};

      allWorkspaceIds.forEach(workspaceId => {
        const leavePerm = leavePerms[workspaceId];
        const odPerm = odPerms[workspaceId];

        mergedPerms[workspaceId] = {};

        // Process Leave permissions
        if (leavePerm) {
          if (typeof leavePerm === 'boolean') {
            // Old format: apply to both leave and od
            mergedPerms[workspaceId].leave = {
              canApplyForSelf: false,
              canApplyForOthers: leavePerm,
            };
            mergedPerms[workspaceId].od = {
              canApplyForSelf: false,
              canApplyForOthers: leavePerm,
            };
          } else if (leavePerm.leave) {
            // New format with separate leave/od
            mergedPerms[workspaceId].leave = leavePerm.leave;
          } else {
            // Legacy object format
            mergedPerms[workspaceId].leave = {
              canApplyForSelf: leavePerm.canApplyForSelf || false,
              canApplyForOthers: leavePerm.canApplyForOthers || false,
            };
          }
        }

        // Process OD permissions
        if (odPerm) {
          if (typeof odPerm === 'boolean') {
            // Old format: apply to od
            mergedPerms[workspaceId].od = {
              canApplyForSelf: false,
              canApplyForOthers: odPerm,
            };
          } else if (odPerm.od) {
            // New format with separate leave/od
            mergedPerms[workspaceId].od = odPerm.od;
          } else {
            // Legacy object format
            mergedPerms[workspaceId].od = {
              canApplyForSelf: odPerm.canApplyForSelf || false,
              canApplyForOthers: odPerm.canApplyForOthers || false,
            };
          }
        } else if (leavePerm && typeof leavePerm !== 'boolean' && !leavePerm.leave) {
          // If no OD permissions but leave has legacy format, use leave as fallback
          mergedPerms[workspaceId].od = {
            canApplyForSelf: leavePerm.canApplyForSelf || false,
            canApplyForOthers: leavePerm.canApplyForOthers || false,
          };
        }
      });

      console.log('[Frontend] Merged workspace permissions:', mergedPerms);
      setWorkspacePermissions(mergedPerms);

      // Load workspaces if on workspace permissions tab
      if (leaveSubTab === 'workspacePermissions') {
        await loadWorkspaces();
      }
    } catch (err) {
      console.error('Error loading leave settings:', err);
      setMessage({ type: 'error', text: 'Failed to load leave settings. Please initialize settings first.' });
    } finally {
      setLeaveSettingsLoading(false);
    }
  };

  const loadWorkspaces = async () => {
    try {
      setWorkspacesLoading(true);
      const response = await api.getWorkspaces();
      if (response.success && response.data) {
        setWorkspaces(response.data);

        // Workspace permissions are already loaded in loadLeaveSettings
        // No need to reload here
      }
    } catch (err) {
      console.error('Error loading workspaces:', err);
      setMessage({ type: 'error', text: 'Failed to load workspaces' });
    } finally {
      setWorkspacesLoading(false);
    }
  };

  const loadWorkflowUsers = async () => {
    try {
      const response = await api.getUsers({ limit: 1000 });
      if (response.success && response.data?.users) {
        const users = response.data.users;
        setWorkflowUsers(users);

        const byRole: Record<string, any[]> = {};
        users.forEach((user: any) => {
          if (!byRole[user.role]) byRole[user.role] = [];
          byRole[user.role].push(user);
        });
        setWorkflowUsersByRole(byRole);
      }
    } catch (err) {
      console.error('Error loading workflow users:', err);
    }
  };

  const loadLoanSettings = async (type: 'loan' | 'salary_advance') => {
    try {
      setLoanSettingsLoading(true);
      const response = await api.getLoanSettings(type);
      if (response.success && response.data) {
        setLoanSettings(response.data);

        // Initialize form state with loaded settings
        const settings = response.data?.settings || {};
        setLoanGeneralSettings({
          minAmount: settings.minAmount || 1000,
          maxAmount: settings.maxAmount || null,
          minDuration: settings.minDuration || 1,
          maxDuration: settings.maxDuration || 60,
          interestRate: settings.interestRate || 0,
          isInterestApplicable: settings.isInterestApplicable || false,
          maxActivePerEmployee: settings.maxActivePerEmployee || 1,
          minServicePeriod: settings.minServicePeriod || 0,
          advancePercentage: settings.salaryBasedLimits?.advancePercentage || 50,
          considerAttendance: settings.salaryBasedLimits?.considerAttendance ?? true,
        });

        // Load workspace permissions
        const perms = settings.workspacePermissions || {};
        setLoanWorkspacePermissions(perms);

        // Load workspaces if on workspace permissions tab
        if (loanSubTab === 'workspacePermissions') {
          await loadWorkspaces();
        }

        // Load users for workflow if on workflow tab
        if (loanSubTab === 'workflow') {
          await loadWorkflowUsers();
        }
      } else {
        setLoanSettings(null);
      }
    } catch (err) {
      console.error('Error loading loan settings:', err);
      setMessage({ type: 'error', text: 'Failed to load loan settings' });
    } finally {
      setLoanSettingsLoading(false);
    }
  };


  const initializeLeaveSettings = async () => {
    try {
      setSaving(true);
      const response = await api.initializeLeaveSettings();
      if (response.success) {
        setMessage({ type: 'success', text: 'Settings initialized successfully' });
        loadLeaveSettings();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to initialize settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to initialize settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleWorkspacePermissionToggle = (workspaceId: string, module: 'leave' | 'od', permissionType: 'self' | 'others', enabled: boolean) => {
    setWorkspacePermissions(prev => {
      const current = prev[workspaceId] || {};
      return {
        ...prev,
        [workspaceId]: {
          ...current,
          [module]: {
            ...(current[module] || { canApplyForSelf: false, canApplyForOthers: false }),
            [permissionType === 'self' ? 'canApplyForSelf' : 'canApplyForOthers']: enabled,
          },
        },
      };
    });
  };

  const handleSaveWorkspacePermissions = async () => {
    try {
      setSaving(true);
      if (!leaveSettings) {
        setMessage({ type: 'error', text: 'Please initialize leave settings first' });
        return;
      }

      // Validate workspacePermissions is not empty
      if (!workspacePermissions || Object.keys(workspacePermissions).length === 0) {
        setMessage({ type: 'error', text: 'No workspace permissions to save' });
        setSaving(false);
        return;
      }

      // Save to both Leave and OD settings
      // Prepare permissions for Leave settings
      const leavePermissionsToSave: Record<string, any> = {};
      // Prepare permissions for OD settings
      const odPermissionsToSave: Record<string, any> = {};

      Object.keys(workspacePermissions).forEach(workspaceId => {
        const perm = workspacePermissions[workspaceId];
        // Save leave permissions
        if (perm.leave) {
          leavePermissionsToSave[workspaceId] = {
            leave: perm.leave,
          };
        } else if (perm.canApplyForSelf !== undefined || perm.canApplyForOthers !== undefined) {
          // Legacy format - apply to both
          leavePermissionsToSave[workspaceId] = {
            leave: {
              canApplyForSelf: perm.canApplyForSelf || false,
              canApplyForOthers: perm.canApplyForOthers || false,
            },
          };
        }

        // Save od permissions
        if (perm.od) {
          odPermissionsToSave[workspaceId] = {
            od: perm.od,
          };
        } else if (perm.canApplyForSelf !== undefined || perm.canApplyForOthers !== undefined) {
          // Legacy format - apply to both
          odPermissionsToSave[workspaceId] = {
            od: {
              canApplyForSelf: perm.canApplyForSelf || false,
              canApplyForOthers: perm.canApplyForOthers || false,
            },
          };
        }
      });

      // Save to Leave settings
      const leaveSettingsToSave = {
        ...(leaveSettings.settings || {}),
        workspacePermissions: leavePermissionsToSave,
      };

      const leavePayload = {
        types: leaveSettings.types || [],
        statuses: leaveSettings.statuses || [],
        workflow: leaveSettings.workflow || { isEnabled: false, steps: [] },
        settings: leaveSettingsToSave,
      };

      // Save to OD settings (need to load odSettings first)
      let odSettingsToSave = {};
      if (odSettings) {
        odSettingsToSave = {
          ...(odSettings.settings || {}),
          workspacePermissions: odPermissionsToSave,
        };
      }

      console.log('[Frontend] Saving workspace permissions:', {
        workspacePermissions,
        leavePermissionsToSave,
        odPermissionsToSave,
      });

      // Save both Leave and OD settings
      const [leaveResponse, odResponse] = await Promise.all([
        api.updateLeaveSettings('leave', leavePayload),
        odSettings ? api.updateLeaveSettings('od', {
          ...odSettings,
          settings: odSettingsToSave,
        }) : Promise.resolve({ success: true }),
      ]);

      console.log('[Frontend] Save responses - Leave:', leaveResponse, 'OD:', odResponse);

      if (leaveResponse.success && odResponse.success) {
        // Reload settings to get the updated data from backend (ensures sync)
        await loadLeaveSettings();
        setMessage({ type: 'success', text: 'Workspace permissions saved successfully' });
      } else {
        const errorMsg = (leaveResponse as any).error || (odResponse as any).error || (leaveResponse as any).message || (odResponse as any).message || 'Failed to save permissions';
        console.error('[Frontend] Save failed:', errorMsg);
        setMessage({ type: 'error', text: errorMsg });
      }
    } catch (err) {
      console.error('[Frontend] Error saving workspace permissions:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save workspace permissions' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddLeaveType = async () => {
    if (!newLeaveType.code || !newLeaveType.name) {
      setMessage({ type: 'error', text: 'Code and Name are required' });
      return;
    }

    const updatedTypes = [...(leaveSettings?.types || []), {
      ...newLeaveType,
      isActive: true,
      color: '#3b82f6',
      sortOrder: (leaveSettings?.types?.length || 0) + 1
    }];

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('leave', {
        ...leaveSettings,
        types: updatedTypes
      });

      if (response.success) {
        setLeaveSettings(prev => prev ? { ...prev, types: updatedTypes } : null);
        setNewLeaveType({ code: '', name: '', description: '', maxDaysPerYear: 12, leaveNature: 'paid', carryForward: false, maxCarryForward: 0 });
        setMessage({ type: 'success', text: 'Leave type added successfully' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to add leave type' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add leave type' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLeaveType = async (code: string) => {
    if (!confirm('Are you sure you want to delete this leave type?')) return;

    const updatedTypes = leaveSettings?.types?.filter(t => t.code !== code) || [];

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('leave', {
        ...leaveSettings,
        types: updatedTypes
      });

      if (response.success) {
        setLeaveSettings(prev => prev ? { ...prev, types: updatedTypes } : null);
        setMessage({ type: 'success', text: 'Leave type deleted' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to delete leave type' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete leave type' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddODType = async () => {
    if (!newODType.code || !newODType.name) {
      setMessage({ type: 'error', text: 'Code and Name are required' });
      return;
    }

    const updatedTypes = [...(odSettings?.types || []), {
      ...newODType,
      isActive: true,
      color: '#8b5cf6',
      sortOrder: (odSettings?.types?.length || 0) + 1
    }];

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('od', {
        ...odSettings,
        types: updatedTypes
      });

      if (response.success) {
        setODSettings(prev => prev ? { ...prev, types: updatedTypes } : null);
        setNewODType({ code: '', name: '', description: '' });
        setMessage({ type: 'success', text: 'OD type added successfully' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to add OD type' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add OD type' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteODType = async (code: string) => {
    if (!confirm('Are you sure you want to delete this OD type?')) return;

    const updatedTypes = odSettings?.types?.filter(t => t.code !== code) || [];

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('od', {
        ...odSettings,
        types: updatedTypes
      });

      if (response.success) {
        setODSettings(prev => prev ? { ...prev, types: updatedTypes } : null);
        setMessage({ type: 'success', text: 'OD type deleted' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to delete OD type' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete OD type' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddStatus = async (settingsType: 'leave' | 'od') => {
    if (!newStatus.code || !newStatus.name) {
      setMessage({ type: 'error', text: 'Code and Name are required' });
      return;
    }

    const settings = settingsType === 'leave' ? leaveSettings : odSettings;
    const updatedStatuses = [...(settings?.statuses || []), {
      ...newStatus,
      isFinal: false,
      isApproved: false,
      canEmployeeEdit: false,
      canEmployeeCancel: false,
      sortOrder: (settings?.statuses?.length || 0) + 1
    }];

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings(settingsType, {
        ...settings,
        statuses: updatedStatuses
      });

      if (response.success) {
        if (settingsType === 'leave') {
          setLeaveSettings(prev => prev ? { ...prev, statuses: updatedStatuses } : null);
        } else {
          setODSettings(prev => prev ? { ...prev, statuses: updatedStatuses } : null);
        }
        setNewStatus({ code: '', name: '', description: '', color: '#6b7280' });
        setMessage({ type: 'success', text: 'Status added successfully' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to add status' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add status' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStatus = async (settingsType: 'leave' | 'od', code: string) => {
    if (!confirm('Are you sure you want to delete this status?')) return;

    const settings = settingsType === 'leave' ? leaveSettings : odSettings;
    const updatedStatuses = settings?.statuses?.filter(s => s.code !== code) || [];

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings(settingsType, {
        ...settings,
        statuses: updatedStatuses
      });

      if (response.success) {
        if (settingsType === 'leave') {
          setLeaveSettings(prev => prev ? { ...prev, statuses: updatedStatuses } : null);
        } else {
          setODSettings(prev => prev ? { ...prev, statuses: updatedStatuses } : null);
        }
        setMessage({ type: 'success', text: 'Status deleted' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to delete status' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete status' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLeaveWorkflow = async () => {
    if (!leaveSettings) return;

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('leave', leaveSettings);

      if (response.success) {
        setMessage({ type: 'success', text: 'Leave workflow saved successfully' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save workflow' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveODWorkflow = async () => {
    if (!odSettings) return;

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('od', odSettings);

      if (response.success) {
        setMessage({ type: 'success', text: 'OD workflow saved successfully' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save workflow' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLeaveGeneralSettings = async () => {
    if (!leaveSettings) return;

    try {
      setSaving(true);
      const response = await api.updateLeaveSettings('leave', leaveSettings);

      if (response.success) {
        setMessage({ type: 'success', text: 'Leave settings saved successfully' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmployeeSettings = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Save data source setting
      await api.upsertSetting({
        key: 'employee_data_source',
        value: employeeDataSource,
        description: 'Source database for fetching employee data',
        category: 'employee',
      });

      // Save delete target setting
      await api.upsertSetting({
        key: 'employee_delete_target',
        value: employeeDeleteTarget,
        description: 'Target database(s) for employee deletion',
        category: 'employee',
      });

      setMessage({ type: 'success', text: 'Employee settings saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save employee settings' });
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDuration = async () => {
    if (newDuration && Number(newDuration) > 0) {
      try {
        setSaving(true);
        setMessage(null);

        const response = await api.createShiftDuration({
          duration: Number(newDuration),
          label: newLabel || `${newDuration} hours`,
        });

        if (response.success) {
          setNewDuration('');
          setNewLabel('');
          setMessage({ type: 'success', text: 'Duration added successfully!' });
          loadShiftDurations();
        } else {
          setMessage({ type: 'error', text: response.message || 'Failed to add duration' });
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'An error occurred' });
      } finally {
        setSaving(false);
      }
    }
  };

  const handleEditClick = (duration: ShiftDuration) => {
    setEditingDuration(duration);
    setEditDuration(duration.duration);
    setEditLabel(duration.label || '');
  };

  const handleEditSave = async () => {
    if (!editingDuration || !editDuration) return;

    try {
      setSaving(true);
      const response = await api.updateShiftDuration(editingDuration._id, {
        duration: Number(editDuration),
        label: editLabel || `${editDuration} hours`,
      });

      if (response.success) {
        setMessage({ type: 'success', text: 'Duration updated successfully!' });
        setEditingDuration(null);
        loadShiftDurations();
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to update duration' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDuration = async (id: string) => {
    if (!confirm('Are you sure you want to delete this duration?')) return;

    try {
      const response = await api.deleteShiftDuration(id);
      if (response.success) {
        setMessage({ type: 'success', text: 'Duration deleted successfully!' });
        loadShiftDurations();
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to delete duration' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'shift', label: 'Shift' },
    { id: 'employee', label: 'Employee' },
    { id: 'leaves', label: 'Leaves' },
    { id: 'loan', label: 'Loan' },
    { id: 'salary_advance', label: 'Salary Advance' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'overtime', label: 'Overtime' },
    { id: 'permissions', label: 'Permission Deductions' },
    { id: 'attendance_deductions', label: 'Attendance Deductions' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'communications', label: 'Communications & Notifications' },
    { id: 'feature_control', label: 'Feature Control' },
    { id: 'general', label: 'General' },
  ];

  const leaveSubTabs = [
    { id: 'types', label: 'Leave Types' },
    { id: 'statuses', label: 'Leave Statuses' },
    { id: 'odTypes', label: 'OD Types' },
    { id: 'odStatuses', label: 'OD Statuses' },
    { id: 'workflow', label: 'Leave Workflow' },
    { id: 'odWorkflow', label: 'OD Workflow' },
    { id: 'workspacePermissions', label: 'Workspace Permissions' },
    { id: 'general', label: 'General' },
  ];

  return (
    <div className="relative min-h-screen">
      {/* Background Pattern */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-50/40 via-indigo-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        {/* Header Section */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-5 shadow-[0_8px_26px_rgba(30,64,175,0.08)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90 sm:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl">
              Settings
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Configure system settings and preferences
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
          <nav className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMessage(null);
                }}
                className={`flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition-all ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'shift' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Shift Durations</h2>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Configure allowed shift durations. These durations will be available when creating shifts.
            </p>

            {message && (
              <div
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                  }`}
              >
                {message.text}
              </div>
            )}

            <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
              <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Add New Duration
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={newDuration}
                  onChange={(e) => setNewDuration(Number(e.target.value))}
                  className="w-32 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Hours"
                />
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Label (e.g., Full Day)"
                />
                <button
                  onClick={handleAddDuration}
                  disabled={saving || !newDuration}
                  className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 py-12 dark:border-slate-700 dark:bg-slate-900/50">
                <Spinner />
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading durations...</p>
              </div>
            ) : shiftDurations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-slate-500 dark:text-slate-400">No durations configured</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {shiftDurations.map((duration) => (
                  <div
                    key={duration._id}
                    className="group relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {duration.duration}h
                      </span>
                      {duration.label && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{duration.label}</span>
                      )}
                    </div>

                    {!duration.isActive && (
                      <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Off
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditClick(duration)}
                        className="relative rounded-lg p-1.5 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => handleDeleteDuration(duration._id)}
                        className="relative rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        title="Delete"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'employee' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Employee Settings</h2>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Configure how employee data is stored and retrieved between MongoDB and MSSQL databases.
            </p>

            {message && (
              <div
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                  }`}
              >
                {message.text}
              </div>
            )}

            {/* MSSQL Connection Status */}
            <div className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 ${mssqlConnected
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
              : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
              }`}>
              <div className={`h-3 w-3 rounded-full ${mssqlConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
              <span className={`text-sm font-medium ${mssqlConnected
                ? 'text-green-700 dark:text-green-400'
                : 'text-amber-700 dark:text-amber-400'
                }`}>
                MSSQL (HRMS Database): {mssqlConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            {employeeSettingsLoading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 py-12 dark:border-slate-700 dark:bg-slate-900/50">
                <Spinner />
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading settings...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Data Source Setting */}
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                  <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Data Source (for fetching employees)
                  </label>
                  <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                    Choose which database to fetch employee data from when viewing the employee list.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { value: 'mongodb', label: 'MongoDB', desc: 'Fetch from MongoDB database' },
                      { value: 'mssql', label: 'MSSQL', desc: 'Fetch from SQL Server (HRMS)' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all ${employeeDataSource === option.value
                          ? 'border-blue-400 bg-blue-50 shadow-md dark:border-blue-600 dark:bg-blue-900/30'
                          : 'border-slate-200 bg-white hover:border-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                          }`}
                      >
                        <input
                          type="radio"
                          name="dataSource"
                          value={option.value}
                          checked={employeeDataSource === option.value}
                          onChange={(e) => setEmployeeDataSource(e.target.value)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{option.label}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{option.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Delete Target Setting */}
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-red-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-red-900/10">
                  <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Delete From (when deleting employees)
                  </label>
                  <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                    Choose which database(s) to delete employee data from when removing an employee.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { value: 'mongodb', label: 'MongoDB Only', desc: 'Delete from MongoDB only' },
                      { value: 'mssql', label: 'MSSQL Only', desc: 'Delete from SQL Server only' },
                      { value: 'both', label: 'Both Databases', desc: 'Delete from both databases' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all ${employeeDeleteTarget === option.value
                          ? 'border-red-400 bg-red-50 shadow-md dark:border-red-600 dark:bg-red-900/30'
                          : 'border-slate-200 bg-white hover:border-red-200 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                          }`}
                      >
                        <input
                          type="radio"
                          name="deleteTarget"
                          value={option.value}
                          checked={employeeDeleteTarget === option.value}
                          onChange={(e) => setEmployeeDeleteTarget(e.target.value)}
                          className="h-4 w-4 text-red-600 focus:ring-red-500"
                        />
                        <div>
                          <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{option.label}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{option.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Info Box */}
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <h4 className="mb-2 text-sm font-semibold text-blue-800 dark:text-blue-300">ℹ️ How it works</h4>
                  <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-400">
                    <li>• <strong>Create/Update:</strong> Always saves to BOTH databases for data consistency</li>
                    <li>• <strong>Read:</strong> Fetches from your selected data source</li>
                    <li>• <strong>Delete:</strong> Removes from your selected target database(s)</li>
                  </ul>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveEmployeeSettings}
                  disabled={saving}
                  className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Employee Settings'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'leaves' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Leave & OD Settings</h2>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Configure leave types, OD types, and approval workflows.
            </p>

            {message && (
              <div
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                  }`}
              >
                {message.text}
              </div>
            )}

            {/* Sub Tabs */}
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
              <nav className="flex flex-wrap gap-1">
                {leaveSubTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setLeaveSubTab(tab.id as typeof leaveSubTab);
                      setMessage(null);
                    }}
                    className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${leaveSubTab === tab.id
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {leaveSettingsLoading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 py-12 dark:border-slate-700 dark:bg-slate-900/50">
                <Spinner />
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading settings...</p>
              </div>
            ) : (
              <>
                {/* Leave Types */}
                {leaveSubTab === 'types' && (
                  <div className="space-y-6">
                    {/* Add New Leave Type */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-green-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-green-900/10">
                      <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Add New Leave Type
                      </label>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <input
                            type="text"
                            value={newLeaveType.code}
                            onChange={(e) => setNewLeaveType(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            placeholder="Code (e.g., CL)"
                          />
                          <input
                            type="text"
                            value={newLeaveType.name}
                            onChange={(e) => setNewLeaveType(prev => ({ ...prev, name: e.target.value }))}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                            placeholder="Name (e.g., Casual Leave)"
                          />
                          <input
                            type="number"
                            value={newLeaveType.maxDaysPerYear}
                            onChange={(e) => setNewLeaveType(prev => ({ ...prev, maxDaysPerYear: Number(e.target.value) }))}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            placeholder="Max Days/Year"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <select
                            value={newLeaveType.leaveNature}
                            onChange={(e) => setNewLeaveType(prev => ({ ...prev, leaveNature: e.target.value as 'paid' | 'lop' | 'without_pay' }))}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="paid">Paid Leave</option>
                            <option value="lop">Loss of Pay (LOP)</option>
                            <option value="without_pay">Without Pay</option>
                          </select>
                          <div className="flex items-center gap-2 sm:col-span-2">
                            <input
                              type="checkbox"
                              checked={newLeaveType.carryForward}
                              onChange={(e) => setNewLeaveType(prev => ({ ...prev, carryForward: e.target.checked }))}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label className="text-sm text-slate-700 dark:text-slate-300">Allow Carry Forward</label>
                          </div>
                          {newLeaveType.carryForward && (
                            <input
                              type="number"
                              value={newLeaveType.maxCarryForward}
                              onChange={(e) => setNewLeaveType(prev => ({ ...prev, maxCarryForward: Number(e.target.value) }))}
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              placeholder="Max Carry Forward Days"
                              min="0"
                            />
                          )}
                        </div>
                        <button
                          onClick={handleAddLeaveType}
                          disabled={saving || !newLeaveType.code || !newLeaveType.name}
                          className="w-full rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add Leave Type
                        </button>
                      </div>
                    </div>

                    {/* Leave Types List */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configured Leave Types ({leaveSettings?.types?.length || 0})</h3>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {leaveSettings?.types && leaveSettings.types.length > 0 ? (
                          leaveSettings.types.map((type) => (
                            <div key={type.code} className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-4">
                                <span
                                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                                  style={{ backgroundColor: type.color || '#3b82f6' }}
                                >
                                  {type.code}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-slate-900 dark:text-slate-100">{type.name}</span>
                                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${(type as any).leaveNature === 'paid'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                      : (type as any).leaveNature === 'lop'
                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                      }`}>
                                      {(type as any).leaveNature === 'paid' ? 'Paid' : (type as any).leaveNature === 'lop' ? 'LOP' : 'Without Pay'}
                                    </span>
                                    {type.maxDaysPerYear && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400">
                                        (Max: {type.maxDaysPerYear} days/year)
                                      </span>
                                    )}
                                    {type.carryForward && (
                                      <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        Carry Forward {type.maxCarryForward ? `(${type.maxCarryForward} days)` : ''}
                                      </span>
                                    )}
                                  </div>
                                  {type.description && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{type.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteLeaveType(type.code)}
                                  className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                  title="Delete"
                                >
                                  <DeleteIcon />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No leave types configured. {!leaveSettings && (
                              <button onClick={initializeLeaveSettings} className="text-blue-500 underline hover:text-blue-600">
                                Initialize settings
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* OD Types */}
                {leaveSubTab === 'odTypes' && (
                  <div className="space-y-6">
                    {/* Add New OD Type */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-purple-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-purple-900/10">
                      <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Add New OD Type
                      </label>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <input
                          type="text"
                          value={newODType.code}
                          onChange={(e) => setNewODType(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          placeholder="Code (e.g., TRAINING)"
                        />
                        <input
                          type="text"
                          value={newODType.name}
                          onChange={(e) => setNewODType(prev => ({ ...prev, name: e.target.value }))}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                          placeholder="Name (e.g., Training Program)"
                        />
                        <button
                          onClick={handleAddODType}
                          disabled={saving || !newODType.code || !newODType.name}
                          className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* OD Types List */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configured OD Types ({odSettings?.types?.length || 0})</h3>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {odSettings?.types && odSettings.types.length > 0 ? (
                          odSettings.types.map((type) => (
                            <div key={type.code} className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-4">
                                <span
                                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                                  style={{ backgroundColor: type.color || '#8b5cf6' }}
                                >
                                  {type.code}
                                </span>
                                <div>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{type.name}</span>
                                  {type.description && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500">{type.description}</p>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteODType(type.code)}
                                className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                title="Delete"
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No OD types configured. {!odSettings && (
                              <button onClick={initializeLeaveSettings} className="text-blue-500 underline hover:text-blue-600">
                                Initialize settings
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Leave Statuses */}
                {leaveSubTab === 'statuses' && (
                  <div className="space-y-6">
                    {/* Add New Status */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-amber-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-amber-900/10">
                      <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Add New Leave Status
                      </label>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                        <input
                          type="text"
                          value={newStatus.code}
                          onChange={(e) => setNewStatus(prev => ({ ...prev, code: e.target.value.toLowerCase() }))}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          placeholder="Code (e.g., pending)"
                        />
                        <input
                          type="text"
                          value={newStatus.name}
                          onChange={(e) => setNewStatus(prev => ({ ...prev, name: e.target.value }))}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                          placeholder="Name (e.g., Pending Approval)"
                        />
                        <input
                          type="color"
                          value={newStatus.color}
                          onChange={(e) => setNewStatus(prev => ({ ...prev, color: e.target.value }))}
                          className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                          title="Status Color"
                        />
                        <button
                          onClick={() => handleAddStatus('leave')}
                          disabled={saving || !newStatus.code || !newStatus.name}
                          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Leave Statuses List */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configured Leave Statuses ({leaveSettings?.statuses?.length || 0})</h3>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {leaveSettings?.statuses && leaveSettings.statuses.length > 0 ? (
                          leaveSettings.statuses.map((status) => (
                            <div key={status.code} className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-4">
                                <span
                                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                                  style={{ backgroundColor: status.color || '#6b7280' }}
                                >
                                  {status.code}
                                </span>
                                <div>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{status.name}</span>
                                  <div className="flex gap-2 mt-0.5">
                                    {status.isFinal && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">Final</span>}
                                    {status.isApproved && <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 px-1.5 py-0.5 rounded">Approved</span>}
                                    {status.canEmployeeEdit && <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-1.5 py-0.5 rounded">Editable</span>}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteStatus('leave', status.code)}
                                className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                title="Delete"
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No statuses configured.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* OD Statuses */}
                {leaveSubTab === 'odStatuses' && (
                  <div className="space-y-6">
                    {/* Add New OD Status */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-red-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-red-900/10">
                      <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Add New OD Status
                      </label>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                        <input
                          type="text"
                          value={newStatus.code}
                          onChange={(e) => setNewStatus(prev => ({ ...prev, code: e.target.value.toLowerCase() }))}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          placeholder="Code"
                        />
                        <input
                          type="text"
                          value={newStatus.name}
                          onChange={(e) => setNewStatus(prev => ({ ...prev, name: e.target.value }))}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:col-span-2"
                          placeholder="Name"
                        />
                        <input
                          type="color"
                          value={newStatus.color}
                          onChange={(e) => setNewStatus(prev => ({ ...prev, color: e.target.value }))}
                          className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
                        />
                        <button
                          onClick={() => handleAddStatus('od')}
                          disabled={saving || !newStatus.code || !newStatus.name}
                          className="rounded-xl bg-gradient-to-r from-red-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* OD Statuses List */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configured OD Statuses ({odSettings?.statuses?.length || 0})</h3>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {odSettings?.statuses && odSettings.statuses.length > 0 ? (
                          odSettings.statuses.map((status) => (
                            <div key={status.code} className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-4">
                                <span
                                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                                  style={{ backgroundColor: status.color || '#6b7280' }}
                                >
                                  {status.code}
                                </span>
                                <div>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{status.name}</span>
                                  <div className="flex gap-2 mt-0.5">
                                    {status.isFinal && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">Final</span>}
                                    {status.isApproved && <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 px-1.5 py-0.5 rounded">Approved</span>}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteStatus('od', status.code)}
                                className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                title="Delete"
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No OD statuses configured.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Leave Workflow */}
                {leaveSubTab === 'workflow' && (
                  <div className="space-y-6">
                    {/* Workflow Enable Toggle */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Enable Workflow</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Multi-step approval process for leave requests</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={leaveSettings?.workflow?.isEnabled || false}
                            onChange={(e) => setLeaveSettings(prev => prev ? {
                              ...prev,
                              workflow: { ...prev.workflow, isEnabled: e.target.checked }
                            } : null)}
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                        </label>
                      </div>
                    </div>

                    {/* Manager Approval Configuration */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Include Manager Approval</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Require division manager approval</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={leaveSettings?.workflow?.steps?.some(s => s.approverRole === 'manager') || false}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setLeaveSettings(prev => {
                                if (!prev) return null;
                                let steps = [...(prev.workflow?.steps || [])];
                                if (enabled) {
                                  // Add manager if not present - insert after HOD by default
                                  if (!steps.some(s => s.approverRole === 'manager')) {
                                    const hodIndex = steps.findIndex(s => s.approverRole === 'hod');
                                    const insertIndex = hodIndex !== -1 ? hodIndex + 1 : 1;
                                    steps.splice(insertIndex, 0, {
                                      stepOrder: 0,
                                      stepName: 'Manager Approval',
                                      approverRole: 'manager',
                                      availableActions: ['approve', 'reject'],
                                      approvedStatus: 'pending',
                                      rejectedStatus: 'rejected',
                                      nextStepOnApprove: null,
                                      isActive: true
                                    });
                                  }
                                } else {
                                  steps = steps.filter(s => s.approverRole !== 'manager');
                                }
                                // Re-index
                                steps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
                                return { ...prev, workflow: { ...prev.workflow, steps } };
                              });
                            }}
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                        </label>
                      </div>

                      {/* Manager Position Sector - HIDDEN IF MANAGER IS FINAL AUTHORITY */}
                      {leaveSettings?.workflow?.steps?.some(s => s.approverRole === 'manager') && leaveSettings?.workflow?.finalAuthority?.role !== 'manager' && (
                        <div className="mt-4 space-y-3 border-t border-slate-200/50 pt-4 dark:border-slate-700/50">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Manager Approval Position</p>
                          <div className="flex flex-col gap-2">
                            <label className="flex cursor-pointer items-center gap-3">
                              <input
                                type="radio"
                                name="managerPosition"
                                checked={(() => {
                                  const steps = leaveSettings?.workflow?.steps || [];
                                  const mgrIdx = steps.findIndex(s => s.approverRole === 'manager');
                                  const hrIdx = steps.findIndex(s => s.approverRole === 'hr');
                                  return mgrIdx !== -1 && hrIdx !== -1 && mgrIdx < hrIdx;
                                })()}
                                onChange={() => {
                                  setLeaveSettings(prev => {
                                    if (!prev) return null;
                                    let steps = prev.workflow.steps.filter(s => s.approverRole !== 'manager');
                                    const managerStep: WorkflowStep = {
                                      stepName: 'Manager Approval',
                                      approverRole: 'manager',
                                      stepOrder: 0,
                                      availableActions: ['approve', 'reject'],
                                      approvedStatus: 'pending',
                                      rejectedStatus: 'rejected',
                                      nextStepOnApprove: null,
                                      isActive: true
                                    };

                                    const hrIndex = steps.findIndex(s => s.approverRole === 'hr');
                                    // Insert before HR
                                    if (hrIndex !== -1) steps.splice(hrIndex, 0, managerStep);
                                    else steps.push(managerStep);

                                    steps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
                                    return { ...prev, workflow: { ...prev.workflow, steps } };
                                  });
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-slate-600 dark:text-slate-400">After HOD, Before HR</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-3">
                              <input
                                type="radio"
                                name="managerPosition"
                                checked={(() => {
                                  const steps = leaveSettings?.workflow?.steps || [];
                                  const mgrIdx = steps.findIndex(s => s.approverRole === 'manager');
                                  const hrIdx = steps.findIndex(s => s.approverRole === 'hr');
                                  return mgrIdx !== -1 && hrIdx !== -1 && mgrIdx > hrIdx;
                                })()}
                                onChange={() => {
                                  setLeaveSettings(prev => {
                                    if (!prev) return null;
                                    let steps = prev.workflow.steps.filter(s => s.approverRole !== 'manager');
                                    const managerStep: WorkflowStep = {
                                      stepName: 'Manager Approval',
                                      approverRole: 'manager',
                                      stepOrder: 0,
                                      availableActions: ['approve', 'reject'],
                                      approvedStatus: 'pending',
                                      rejectedStatus: 'rejected',
                                      nextStepOnApprove: null,
                                      isActive: true
                                    };

                                    const hrIndex = steps.findIndex(s => s.approverRole === 'hr');
                                    // Insert after HR
                                    if (hrIndex !== -1) steps.splice(hrIndex + 1, 0, managerStep);
                                    else steps.push(managerStep);

                                    steps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
                                    return { ...prev, workflow: { ...prev.workflow, steps } };
                                  });
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-slate-600 dark:text-slate-400">After HR (Final Review)</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Workflow Steps */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Approval Flow</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Define the approval hierarchy</p>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-4">
                          {leaveSettings?.workflow?.steps && leaveSettings.workflow.steps.map((step, index) => (
                            <div key={step.stepOrder} className="flex items-center gap-4">
                              <div className="flex flex-col items-center">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${step.approverRole === 'hod'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                  }`}>
                                  <span className="text-lg font-bold">{step.stepOrder}</span>
                                </div>
                                <span className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">{step.stepName}</span>
                                <span className="text-[10px] uppercase text-slate-400">{step.approverRole}</span>
                              </div>
                              {index < (leaveSettings?.workflow?.steps?.length || 0) - 1 && (
                                <div className="flex items-center">
                                  <div className="h-0.5 w-8 bg-slate-300 dark:bg-slate-600"></div>
                                  <span className="text-slate-400">→</span>
                                  <div className="h-0.5 w-8 bg-slate-300 dark:bg-slate-600"></div>
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="flex flex-col items-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              ✓
                            </div>
                            <span className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">Approved</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Final Authority */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Final Approval Authority</h3>
                      <div className="flex flex-col gap-3">
                        {/* Manager Option */}
                        {leaveSettings?.workflow?.steps?.some(s => s.approverRole === 'manager') && (
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                            <input
                              type="radio"
                              name="finalAuthority"
                              checked={leaveSettings?.workflow?.finalAuthority?.role === 'manager'}
                              onChange={() => setLeaveSettings(prev => {
                                if (!prev) return null;
                                let steps = [...prev.workflow.steps];
                                // Remove HR if present, as Manager is final
                                steps = steps.filter(s => s.approverRole !== 'hr');
                                // Ensure Manager is last (logic handles this by removing subsequent)

                                return {
                                  ...prev,
                                  workflow: {
                                    ...prev.workflow,
                                    steps,
                                    finalAuthority: {
                                      anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false,
                                      role: 'manager'
                                    }
                                  }
                                };
                              })}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Manager (Division Head)</span>
                          </label>
                        )}

                        {/* HR Option */}
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            type="radio"
                            name="finalAuthority"
                            checked={leaveSettings?.workflow?.finalAuthority?.role === 'hr'}
                            onChange={() => setLeaveSettings(prev => {
                              if (!prev) return null;
                              let steps = [...prev.workflow.steps];
                              // Add HR if missing
                              if (!steps.some(s => s.approverRole === 'hr')) {
                                steps.push({
                                  stepOrder: steps.length + 1,
                                  stepName: 'HR Approval',
                                  approverRole: 'hr',
                                  availableActions: ['approve', 'reject'],
                                  approvedStatus: 'approved',
                                  rejectedStatus: 'rejected',
                                  nextStepOnApprove: null,
                                  isActive: true
                                });
                              }
                              return {
                                ...prev,
                                workflow: {
                                  ...prev.workflow,
                                  steps,
                                  finalAuthority: {
                                    anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false,
                                    role: 'hr'
                                  }
                                }
                              };
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">HR</span>
                        </label>

                        {/* Super Admin Option */}
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            type="radio"
                            name="finalAuthority"
                            checked={leaveSettings?.workflow?.finalAuthority?.role === 'super_admin'}
                            onChange={() => setLeaveSettings(prev => {
                              if (!prev) return null;
                              let steps = [...prev.workflow.steps];
                              // Add HR if missing (Super Admin usually includes HR flow)
                              if (!steps.some(s => s.approverRole === 'hr')) {
                                steps.push({
                                  stepOrder: steps.length + 1,
                                  stepName: 'HR Approval',
                                  approverRole: 'hr',
                                  availableActions: ['approve', 'reject'],
                                  approvedStatus: 'approved',
                                  rejectedStatus: 'rejected',
                                  nextStepOnApprove: null,
                                  isActive: true
                                });
                              }
                              return {
                                ...prev,
                                workflow: {
                                  ...prev.workflow,
                                  steps,
                                  finalAuthority: {
                                    anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false,
                                    role: 'super_admin'
                                  }
                                }
                              };
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Super Admin</span>
                        </label>
                      </div>
                    </div>

                    {/* Any HR Can Approve Toggle */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="flex cursor-pointer items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Any HR Can Give Final Approval</span>
                        <input
                          type="checkbox"
                          checked={leaveSettings?.workflow?.finalAuthority?.anyHRCanApprove || false}
                          onChange={(e) => setLeaveSettings(prev => ({
                            ...prev!,
                            workflow: { ...prev!.workflow, finalAuthority: { ...(prev!.workflow?.finalAuthority || {}), role: prev!.workflow?.finalAuthority?.role || 'hr', anyHRCanApprove: e.target.checked } }
                          }))}
                          className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500"
                        />
                      </label>
                    </div>

                    <button
                      onClick={handleSaveLeaveWorkflow}
                      disabled={saving}
                      className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Leave Workflow'}
                    </button>
                  </div>
                )}

                {/* OD Workflow */}
                {leaveSubTab === 'odWorkflow' && (
                  <div className="space-y-6">
                    {/* Workflow Enable Toggle */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-purple-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-purple-900/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Enable OD Workflow</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Multi-step approval process for OD requests</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={odSettings?.workflow?.isEnabled || false}
                            onChange={(e) => setODSettings(prev => prev ? {
                              ...prev,
                              workflow: { ...prev.workflow, isEnabled: e.target.checked }
                            } : null)}
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800"></div>
                        </label>
                      </div>

                      {/* Manager Approval Configuration */}
                      {odSettings?.workflow?.isEnabled && (
                        <div className="mt-6 border-t border-slate-200/50 pt-6 dark:border-slate-700/50">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Include Manager Approval</h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Require division manager approval</p>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center">
                              <input
                                type="checkbox"
                                checked={odSettings?.workflow?.steps?.some(s => s.approverRole === 'manager') || false}
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  setODSettings(prev => {
                                    if (!prev) return null;
                                    let steps = [...(prev.workflow?.steps || [])];
                                    if (enabled) {
                                      // Add manager if not present - insert after HOD by default
                                      if (!steps.some(s => s.approverRole === 'manager')) {
                                        const hodIndex = steps.findIndex(s => s.approverRole === 'hod');
                                        const insertIndex = hodIndex !== -1 ? hodIndex + 1 : 1;
                                        steps.splice(insertIndex, 0, {
                                          stepOrder: 0,
                                          stepName: 'Manager Approval',
                                          approverRole: 'manager',
                                          availableActions: ['approve', 'reject'],
                                          approvedStatus: 'pending',
                                          rejectedStatus: 'rejected',
                                          nextStepOnApprove: null,
                                          isActive: true
                                        });
                                      }
                                    } else {
                                      steps = steps.filter(s => s.approverRole !== 'manager');
                                    }
                                    // Re-index
                                    steps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
                                    return { ...prev, workflow: { ...prev.workflow, steps } };
                                  });
                                }}
                                className="peer sr-only"
                              />
                              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800"></div>
                            </label>
                          </div>

                          {/* Manager Position Sector */}
                          {odSettings?.workflow?.steps?.some(s => s.approverRole === 'manager') && odSettings?.workflow?.finalAuthority?.role !== 'manager' && (
                            <div className="mt-4 space-y-3 rounded-xl bg-white/50 p-4 dark:bg-slate-800/50">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Manager Approval Position</p>
                              <div className="flex flex-col gap-2">
                                <label className="flex cursor-pointer items-center gap-3">
                                  <input
                                    type="radio"
                                    name="odManagerPosition"
                                    checked={(() => {
                                      const steps = odSettings?.workflow?.steps || [];
                                      const mgrIdx = steps.findIndex(s => s.approverRole === 'manager');
                                      const hrIdx = steps.findIndex(s => s.approverRole === 'hr');
                                      return mgrIdx !== -1 && hrIdx !== -1 && mgrIdx < hrIdx;
                                    })()}
                                    onChange={() => {
                                      setODSettings(prev => {
                                        if (!prev) return null;
                                        let steps = prev.workflow.steps.filter(s => s.approverRole !== 'manager');
                                        const managerStep: WorkflowStep = {
                                          stepName: 'Manager Approval',
                                          approverRole: 'manager',
                                          stepOrder: 0,
                                          availableActions: ['approve', 'reject'],
                                          approvedStatus: 'pending',
                                          rejectedStatus: 'rejected',
                                          nextStepOnApprove: null,
                                          isActive: true
                                        };

                                        const hrIndex = steps.findIndex(s => s.approverRole === 'hr');
                                        // Insert before HR
                                        if (hrIndex !== -1) steps.splice(hrIndex, 0, managerStep);
                                        else steps.push(managerStep);

                                        steps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
                                        return { ...prev, workflow: { ...prev.workflow, steps } };
                                      });
                                    }}
                                    className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                                  />
                                  <span className="text-sm text-slate-600 dark:text-slate-400">After HOD, Before HR</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-3">
                                  <input
                                    type="radio"
                                    name="odManagerPosition"
                                    checked={(() => {
                                      const steps = odSettings?.workflow?.steps || [];
                                      const mgrIdx = steps.findIndex(s => s.approverRole === 'manager');
                                      const hrIdx = steps.findIndex(s => s.approverRole === 'hr');
                                      return mgrIdx !== -1 && hrIdx !== -1 && mgrIdx > hrIdx;
                                    })()}
                                    onChange={() => {
                                      setODSettings(prev => {
                                        if (!prev) return null;
                                        let steps = prev.workflow.steps.filter(s => s.approverRole !== 'manager');
                                        const managerStep: WorkflowStep = {
                                          stepName: 'Manager Approval',
                                          approverRole: 'manager',
                                          stepOrder: 0,
                                          availableActions: ['approve', 'reject'],
                                          approvedStatus: 'pending',
                                          rejectedStatus: 'rejected',
                                          nextStepOnApprove: null,
                                          isActive: true
                                        };

                                        const hrIndex = steps.findIndex(s => s.approverRole === 'hr');
                                        // Insert after HR
                                        if (hrIndex !== -1) steps.splice(hrIndex + 1, 0, managerStep);
                                        else steps.push(managerStep);

                                        steps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
                                        return { ...prev, workflow: { ...prev.workflow, steps } };
                                      });
                                    }}
                                    className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                                  />
                                  <span className="text-sm text-slate-600 dark:text-slate-400">After HR (Final Review)</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* OD Approval Visualization */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">OD Approval Flow</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Visual representation of the approval hierarchy</p>
                      </div>
                      <div className="p-4 overflow-x-auto">
                        <div className="flex items-center gap-4 min-w-max">
                          {odSettings?.workflow?.steps && odSettings.workflow.steps.map((step, index) => (
                            <div key={step.stepOrder} className="flex items-center gap-4">
                              <div className="flex flex-col items-center">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${step.approverRole === 'hod'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                  : step.approverRole === 'manager'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                  }`}>
                                  <span className="text-lg font-bold">{step.stepOrder}</span>
                                </div>
                                <span className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">{step.stepName}</span>
                                <span className="text-[10px] uppercase text-slate-400">{step.approverRole}</span>
                              </div>
                              {index < (odSettings?.workflow?.steps?.length || 0) - 1 && (
                                <div className="flex items-center">
                                  <div className="h-0.5 w-8 bg-slate-300 dark:bg-slate-600"></div>
                                  <span className="text-slate-400">→</span>
                                  <div className="h-0.5 w-8 bg-slate-300 dark:bg-slate-600"></div>
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="flex flex-col items-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              ✓
                            </div>
                            <span className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">Approved</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Final Authority */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-purple-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-purple-900/10">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Final Approval Authority</h3>
                      <div className="flex flex-col gap-3">
                        {/* Manager Option */}
                        {odSettings?.workflow?.steps?.some(s => s.approverRole === 'manager') && (
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-purple-300 dark:border-slate-700 dark:bg-slate-800">
                            <input
                              type="radio"
                              name="odFinalAuthority"
                              checked={odSettings?.workflow?.finalAuthority?.role === 'manager'}
                              onChange={() => setODSettings(prev => {
                                if (!prev) return null;
                                let steps = [...prev.workflow.steps];
                                steps = steps.filter(s => s.approverRole !== 'hr');
                                return {
                                  ...prev,
                                  workflow: {
                                    ...prev.workflow,
                                    steps,
                                    finalAuthority: {
                                      anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false,
                                      role: 'manager'
                                    }
                                  }
                                };
                              })}
                              className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Manager (Division Head)</span>
                          </label>
                        )}

                        {/* HR Option */}
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-purple-300 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            type="radio"
                            name="odFinalAuthority"
                            checked={odSettings?.workflow?.finalAuthority?.role === 'hr'}
                            onChange={() => setODSettings(prev => {
                              if (!prev) return null;
                              let steps = [...prev.workflow.steps];
                              if (!steps.some(s => s.approverRole === 'hr')) {
                                steps.push({
                                  stepOrder: steps.length + 1,
                                  stepName: 'HR Approval',
                                  approverRole: 'hr',
                                  availableActions: ['approve', 'reject'],
                                  approvedStatus: 'approved',
                                  rejectedStatus: 'rejected',
                                  nextStepOnApprove: null,
                                  isActive: true
                                });
                              }
                              return {
                                ...prev,
                                workflow: {
                                  ...prev.workflow,
                                  steps,
                                  finalAuthority: {
                                    anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false,
                                    role: 'hr'
                                  }
                                }
                              };
                            })}
                            className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">HR</span>
                        </label>

                        {/* Super Admin Option */}
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-purple-300 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            type="radio"
                            name="odFinalAuthority"
                            checked={odSettings?.workflow?.finalAuthority?.role === 'super_admin'}
                            onChange={() => setODSettings(prev => {
                              if (!prev) return null;
                              let steps = [...prev.workflow.steps];
                              if (!steps.some(s => s.approverRole === 'hr')) {
                                steps.push({
                                  stepOrder: steps.length + 1,
                                  stepName: 'HR Approval',
                                  approverRole: 'hr',
                                  availableActions: ['approve', 'reject'],
                                  approvedStatus: 'approved',
                                  rejectedStatus: 'rejected',
                                  nextStepOnApprove: null,
                                  isActive: true
                                });
                              }
                              return {
                                ...prev,
                                workflow: {
                                  ...prev.workflow,
                                  steps,
                                  finalAuthority: {
                                    anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false,
                                    role: 'super_admin'
                                  }
                                }
                              };
                            })}
                            className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Super Admin</span>
                        </label>
                      </div>
                    </div>

                    {/* Any HR Can Approve Toggle */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-purple-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-purple-900/10">
                      <label className="flex cursor-pointer items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Any HR Can Give Final Approval</span>
                        <input
                          type="checkbox"
                          checked={odSettings?.workflow?.finalAuthority?.anyHRCanApprove || false}
                          onChange={(e) => setODSettings(prev => ({
                            ...prev!,
                            workflow: { ...prev!.workflow, finalAuthority: { ...(prev!.workflow?.finalAuthority || {}), role: prev!.workflow?.finalAuthority?.role || 'hr', anyHRCanApprove: e.target.checked } }
                          }))}
                          className="h-5 w-5 rounded text-purple-600 focus:ring-purple-500"
                        />
                      </label>
                    </div>

                    <button
                      onClick={handleSaveODWorkflow}
                      disabled={saving}
                      className="w-full rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save OD Workflow'}
                    </button>
                  </div>
                )}

                {/* Workspace Permissions */}
                {leaveSubTab === 'workspacePermissions' && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-indigo-900/10">
                      <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Workspace Permissions</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Configure leave/OD application permissions for each workspace.
                        <strong>Apply for Self:</strong> Users can apply leave/OD for themselves.
                        <strong>Apply for Others:</strong> Users can apply leave/OD for employees in their department(s).
                        Employee workspace users can only apply for themselves (self-only).
                      </p>
                    </div>

                    {workspacesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Spinner />
                      </div>
                    ) : workspaces.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">No workspaces found. Create workspaces first.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {workspaces.map((workspace) => {
                          const isEmployeeWorkspace = workspace.type === 'employee';
                          const permissions = workspacePermissions[workspace._id] || {};

                          // Get Leave permissions
                          const leavePerms = permissions.leave || { canApplyForSelf: false, canApplyForOthers: false };
                          // Fallback to legacy format if leave not specified
                          const leaveCanApplyForSelf = leavePerms.canApplyForSelf || permissions.canApplyForSelf || false;
                          const leaveCanApplyForOthers = leavePerms.canApplyForOthers || permissions.canApplyForOthers || false;

                          // Get OD permissions
                          const odPerms = permissions.od || { canApplyForSelf: false, canApplyForOthers: false };
                          // Fallback to legacy format if od not specified
                          const odCanApplyForSelf = odPerms.canApplyForSelf || permissions.canApplyForSelf || false;
                          const odCanApplyForOthers = odPerms.canApplyForOthers || permissions.canApplyForOthers || false;

                          return (
                            <div
                              key={workspace._id}
                              className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 ${isEmployeeWorkspace ? 'opacity-60' : ''
                                }`}
                            >
                              <div className="mb-4">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {workspace.name}
                                  </h4>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    {workspace.type}
                                  </span>
                                  {isEmployeeWorkspace && (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                      Self-only
                                    </span>
                                  )}
                                </div>
                                {workspace.description && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {workspace.description}
                                  </p>
                                )}
                              </div>

                              {/* Leave Permissions Section */}
                              <div className="mb-4">
                                <h5 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wide flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  Leave Permissions
                                </h5>
                                <div className="space-y-3">
                                  {/* Leave - Can Apply For Self */}
                                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        Apply for Self
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Allow users to apply leave for themselves
                                      </p>
                                    </div>
                                    <label className="relative ml-4 inline-flex cursor-pointer items-center">
                                      <input
                                        type="checkbox"
                                        checked={leaveCanApplyForSelf && !isEmployeeWorkspace}
                                        disabled={isEmployeeWorkspace}
                                        onChange={(e) => handleWorkspacePermissionToggle(workspace._id, 'leave', 'self', e.target.checked)}
                                        className="peer sr-only"
                                      />
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800 ${isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}></div>
                                    </label>
                                  </div>

                                  {/* Leave - Can Apply For Others */}
                                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        Apply for Others
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Allow users to apply leave for employees in their department(s)
                                      </p>
                                    </div>
                                    <label className="relative ml-4 inline-flex cursor-pointer items-center">
                                      <input
                                        type="checkbox"
                                        checked={leaveCanApplyForOthers && !isEmployeeWorkspace}
                                        disabled={isEmployeeWorkspace}
                                        onChange={(e) => handleWorkspacePermissionToggle(workspace._id, 'leave', 'others', e.target.checked)}
                                        className="peer sr-only"
                                      />
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800 ${isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}></div>
                                    </label>
                                  </div>
                                </div>
                              </div>

                              {/* OD Permissions Section */}
                              <div>
                                <h5 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-3 uppercase tracking-wide flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  On Duty (OD) Permissions
                                </h5>
                                <div className="space-y-3">
                                  {/* OD - Can Apply For Self */}
                                  <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        Apply for Self
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Allow users to apply OD for themselves
                                      </p>
                                    </div>
                                    <label className="relative ml-4 inline-flex cursor-pointer items-center">
                                      <input
                                        type="checkbox"
                                        checked={odCanApplyForSelf && !isEmployeeWorkspace}
                                        disabled={isEmployeeWorkspace}
                                        onChange={(e) => handleWorkspacePermissionToggle(workspace._id, 'od', 'self', e.target.checked)}
                                        className="peer sr-only"
                                      />
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800 ${isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}></div>
                                    </label>
                                  </div>

                                  {/* OD - Can Apply For Others */}
                                  <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        Apply for Others
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Allow users to apply OD for employees in their department(s)
                                      </p>
                                    </div>
                                    <label className="relative ml-4 inline-flex cursor-pointer items-center">
                                      <input
                                        type="checkbox"
                                        checked={odCanApplyForOthers && !isEmployeeWorkspace}
                                        disabled={isEmployeeWorkspace}
                                        onChange={(e) => handleWorkspacePermissionToggle(workspace._id, 'od', 'others', e.target.checked)}
                                        className="peer sr-only"
                                      />
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800 ${isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}></div>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      onClick={handleSaveWorkspacePermissions}
                      disabled={saving || workspacesLoading}
                      className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:from-indigo-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Workspace Permissions'}
                    </button>
                  </div>
                )}

                {/* General Leave Settings */}
                {leaveSubTab === 'general' && (
                  <div className="space-y-6">
                    {/* Backdated Leave */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-amber-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-amber-900/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Allow Backdated Leave</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Allow employees to apply leave for past dates</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={leaveSettings?.settings?.allowBackdated || false}
                            onChange={(e) => setLeaveSettings(prev => prev ? {
                              ...prev,
                              settings: { ...(prev.settings || {}), allowBackdated: e.target.checked, maxBackdatedDays: prev.settings?.maxBackdatedDays ?? 7, allowFutureDated: prev.settings?.allowFutureDated ?? true, maxAdvanceDays: prev.settings?.maxAdvanceDays ?? 90 }
                            } : null)}
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-amber-800"></div>
                        </label>
                      </div>
                      {leaveSettings?.settings?.allowBackdated && (
                        <div className="mt-4">
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Maximum backdated days
                          </label>
                          <input
                            type="number"
                            value={leaveSettings?.settings?.maxBackdatedDays || 7}
                            onChange={(e) => setLeaveSettings(prev => prev ? {
                              ...prev,
                              settings: { ...(prev.settings || {}), maxBackdatedDays: Number(e.target.value), allowBackdated: prev.settings?.allowBackdated ?? false, allowFutureDated: prev.settings?.allowFutureDated ?? true, maxAdvanceDays: prev.settings?.maxAdvanceDays ?? 90 }
                            } : null)}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      )}
                    </div>

                    {/* Future Dated Leave */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Allow Future Dated Leave</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Allow employees to apply leave in advance</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={leaveSettings?.settings?.allowFutureDated !== false}
                            onChange={(e) => setLeaveSettings(prev => prev ? {
                              ...prev,
                              settings: { ...(prev.settings || {}), allowFutureDated: e.target.checked, allowBackdated: prev.settings?.allowBackdated ?? false, maxBackdatedDays: prev.settings?.maxBackdatedDays ?? 7, maxAdvanceDays: prev.settings?.maxAdvanceDays ?? 90 }
                            } : null)}
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                        </label>
                      </div>
                      {leaveSettings?.settings?.allowFutureDated !== false && (
                        <div className="mt-4">
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Maximum advance days
                          </label>
                          <input
                            type="number"
                            value={leaveSettings?.settings?.maxAdvanceDays || 90}
                            onChange={(e) => setLeaveSettings(prev => prev ? {
                              ...prev,
                              settings: { ...(prev.settings || {}), maxAdvanceDays: Number(e.target.value), allowBackdated: prev.settings?.allowBackdated ?? false, maxBackdatedDays: prev.settings?.maxBackdatedDays ?? 7, allowFutureDated: prev.settings?.allowFutureDated ?? true }
                            } : null)}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleSaveLeaveGeneralSettings}
                      disabled={saving}
                      className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save General Settings'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(activeTab === 'loan' || activeTab === 'salary_advance') && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {activeTab === 'loan' ? 'Loan' : 'Salary Advance'} Settings
            </h2>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Configure {activeTab === 'loan' ? 'loan' : 'salary advance'} settings, workflow, and workspace permissions.
            </p>

            {loanSettingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-slate-500">Loading settings...</div>
              </div>
            ) : (
              <>
                {/* Sub-tabs */}
                <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex space-x-1">
                    {[
                      { id: 'general', label: 'General Settings' },
                      { id: 'workflow', label: 'Workflow' },
                      { id: 'workspacePermissions', label: 'Workspace Permissions' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setLoanSubTab(tab.id as any);
                          if (tab.id === 'workspacePermissions') {
                            loadWorkspaces();
                          } else if (tab.id === 'workflow') {

                          }
                        }}
                        className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${loanSubTab === tab.id
                          ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                          : 'text-slate-600 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* General Settings Sub-tab */}
                {loanSubTab === 'general' && loanSettings && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Amount & Duration Limits</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Minimum Amount
                          </label>
                          <input
                            type="number"
                            value={loanGeneralSettings.minAmount}
                            onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, minAmount: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Maximum Amount (leave empty for unlimited)
                          </label>
                          <input
                            type="number"
                            value={loanGeneralSettings.maxAmount || ''}
                            onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, maxAmount: e.target.value ? Number(e.target.value) : null })}
                            placeholder="Unlimited"
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Minimum Duration (months/cycles)
                          </label>
                          <input
                            type="number"
                            value={loanGeneralSettings.minDuration}
                            onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, minDuration: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Maximum Duration (months/cycles)
                          </label>
                          <input
                            type="number"
                            value={loanGeneralSettings.maxDuration}
                            onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, maxDuration: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </div>

                    {activeTab === 'loan' && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Interest Configuration</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                              Interest Rate (%)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={loanGeneralSettings.interestRate}
                              onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, interestRate: Number(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            />
                          </div>
                          <div className="flex items-center pt-6">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={loanGeneralSettings.isInterestApplicable}
                                onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, isInterestApplicable: e.target.checked })}
                                className="rounded border-slate-300"
                              />
                              Interest Applicable
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Employee Limits</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Maximum Active {activeTab === 'loan' ? 'Loans' : 'Advances'} per Employee
                          </label>
                          <input
                            type="number"
                            value={loanGeneralSettings.maxActivePerEmployee}
                            onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, maxActivePerEmployee: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Minimum Service Period (months)
                          </label>
                          <input
                            type="number"
                            value={loanGeneralSettings.minServicePeriod}
                            onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, minServicePeriod: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </div>

                    {activeTab === 'salary_advance' && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Salary Advance Limits</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                              Max Advance Percentage (%)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={loanGeneralSettings.advancePercentage}
                              onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, advancePercentage: Number(e.target.value) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            />
                            <p className="mt-1 text-xs text-slate-500">Percentage of basic salary allowed for advance</p>
                          </div>
                          <div className="flex items-center pt-6">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={loanGeneralSettings.considerAttendance}
                                onChange={(e) => setLoanGeneralSettings({ ...loanGeneralSettings, considerAttendance: e.target.checked })}
                                className="rounded border-slate-300"
                              />
                              Consider Attendance for Prorating
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const currentType = activeTab === 'loan' ? 'loan' : 'salary_advance';
                          const response = await api.saveLoanSettings(currentType, {
                            ...loanSettings,
                            settings: {
                              ...loanSettings.settings,
                              minAmount: loanGeneralSettings.minAmount,
                              maxAmount: loanGeneralSettings.maxAmount,
                              minDuration: loanGeneralSettings.minDuration,
                              maxDuration: loanGeneralSettings.maxDuration,
                              interestRate: activeTab === 'loan' ? loanGeneralSettings.interestRate : (loanSettings.settings?.interestRate || 0),
                              isInterestApplicable: activeTab === 'loan' ? loanGeneralSettings.isInterestApplicable : (loanSettings.settings?.isInterestApplicable || false),
                              maxActivePerEmployee: loanGeneralSettings.maxActivePerEmployee,
                              minServicePeriod: loanGeneralSettings.minServicePeriod,
                              salaryBasedLimits: {
                                enabled: true,
                                advancePercentage: loanGeneralSettings.advancePercentage,
                                considerAttendance: loanGeneralSettings.considerAttendance,
                              },
                              workspacePermissions: loanSettings.settings?.workspacePermissions || {},
                            },
                          });
                          if (response.success) {
                            setMessage({ type: 'success', text: 'Settings saved successfully' });
                            loadLoanSettings(currentType);
                          } else {
                            setMessage({ type: 'error', text: response.error || 'Failed to save settings' });
                          }
                        } catch (err) {
                          setMessage({ type: 'error', text: 'Failed to save settings' });
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                )}

                {loanSubTab === 'workflow' && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Workflow Configuration</h3>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={loanSettings?.workflow?.useDynamicWorkflow || false}
                            onChange={(e) => setLoanSettings({
                              ...loanSettings,
                              workflow: {
                                ...(loanSettings.workflow || {}),
                                useDynamicWorkflow: e.target.checked
                              }
                            })}
                            className="rounded border-slate-300"
                          />
                          Enable Dynamic Workflow
                        </label>
                      </div>
                      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                        Configure the approval workflow steps and final authority.
                      </p>

                      <div className="space-y-6">
                        {/* Final Authority Section */}
                        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Final Authority Configuration</h4>
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Final Approver Role</label>
                              <select
                                value={loanSettings?.workflow?.finalAuthority?.role || 'hr'}
                                onChange={(e) => {
                                  const newRole = e.target.value;
                                  setLoanSettings((prev: any) => ({
                                    ...prev,
                                    workflow: {
                                      ...(prev.workflow || {}),
                                      finalAuthority: {
                                        ...(prev.workflow?.finalAuthority || {}),
                                        role: newRole,
                                        userId: undefined,
                                      }
                                    }
                                  }));
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                              >
                                <option value="hr">HR</option>
                                <option value="admin">Admin</option>
                                <option value="specific_user">Specific User</option>
                              </select>
                              <p className="mt-1 text-xs text-slate-500">Who gives the absolute final approval</p>
                            </div>

                            {loanSettings?.workflow?.finalAuthority?.role === 'hr' && (
                              <div className="flex items-center pt-2 md:pt-6">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={loanSettings?.workflow?.finalAuthority?.anyHRCanApprove || false}
                                    onChange={(e) => {
                                      setLoanSettings((prev: any) => ({
                                        ...prev,
                                        workflow: {
                                          ...(prev.workflow || {}),
                                          finalAuthority: {
                                            ...(prev.workflow?.finalAuthority || {}),
                                            anyHRCanApprove: e.target.checked
                                          }
                                        }
                                      }));
                                    }}
                                    className="rounded border-slate-300"
                                  />
                                  Any HR user can approve
                                </label>
                              </div>
                            )}
                          </div>

                          {/* Specific User Selection */}
                          {loanSettings?.workflow?.finalAuthority?.role === 'specific_user' && (
                            <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-700">
                              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Select Specific User</label>
                              <select
                                value={loanSettings?.workflow?.finalAuthority?.userId || ''}
                                onChange={(e) => {
                                  setLoanSettings((prev: any) => ({
                                    ...prev,
                                    workflow: {
                                      ...(prev.workflow || {}),
                                      finalAuthority: {
                                        ...(prev.workflow?.finalAuthority || {}),
                                        userId: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                              >
                                <option value="">Select a user...</option>
                                {workflowUsers.map((user: any) => (
                                  <option key={user._id} value={user._id}>{user.name} ({user.role})</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Authorized HR Users */}
                          {loanSettings?.workflow?.finalAuthority?.role === 'hr' && !loanSettings?.workflow?.finalAuthority?.anyHRCanApprove && (
                            <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-700">
                              <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">Authorized HR Users</label>
                              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                                {workflowUsersByRole['hr']?.length > 0 ? (
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {workflowUsersByRole['hr'].map((user: any) => (
                                      <label key={user._id} className="flex items-center gap-2 rounded-lg bg-white p-2.5 text-sm shadow-sm transition-all hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={(loanSettings?.workflow?.finalAuthority?.authorizedHRUsers || []).includes(user._id)}
                                          onChange={(e) => {
                                            const currentUsers = loanSettings?.workflow?.finalAuthority?.authorizedHRUsers || [];
                                            const newUsers = e.target.checked
                                              ? [...currentUsers, user._id]
                                              : currentUsers.filter((id: string) => id !== user._id);

                                            setLoanSettings((prev: any) => ({
                                              ...prev,
                                              workflow: {
                                                ...(prev.workflow || {}),
                                                finalAuthority: {
                                                  ...(prev.workflow?.finalAuthority || {}),
                                                  authorizedHRUsers: newUsers
                                                }
                                              }
                                            }));
                                          }}
                                          className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="truncate">{user.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="py-4 text-center text-sm text-slate-500 italic">No HR users found</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Save Button */}
                        <button
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const currentType = activeTab === 'loan' ? 'loan' : 'salary_advance';
                              const response = await api.saveLoanSettings(currentType, loanSettings);
                              if (response.success) {
                                setMessage({ type: 'success', text: 'Workflow settings saved successfully' });
                                loadLoanSettings(currentType);
                              } else {
                                setMessage({ type: 'error', text: response.error || 'Failed to save workflow settings' });
                              }
                            } catch (err) {
                              setMessage({ type: 'error', text: 'Failed to save workflow settings' });
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save Workflow Configuration'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Workspace Permissions Sub-tab */}
                {loanSubTab === 'workspacePermissions' && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Workspace Permissions</h3>
                      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                        Configure which workspaces can apply for {activeTab === 'loan' ? 'loans' : 'salary advances'} (for self or others).
                      </p>
                      {workspacesLoading ? (
                        <div className="py-4 text-center text-sm text-slate-500">Loading workspaces...</div>
                      ) : (
                        <div className="space-y-4">
                          {workspaces.map((workspace) => (
                            <div
                              key={workspace._id}
                              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                            >
                              <div className="mb-3 font-medium text-slate-900 dark:text-slate-100">{workspace.name}</div>
                              <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={loanWorkspacePermissions[workspace._id]?.canApplyForSelf || false}
                                    onChange={(e) => {
                                      setLoanWorkspacePermissions((prev) => ({
                                        ...prev,
                                        [workspace._id]: {
                                          ...prev[workspace._id],
                                          canApplyForSelf: e.target.checked,
                                        },
                                      }));
                                    }}
                                    className="rounded border-slate-300"
                                  />
                                  Apply for Self
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={loanWorkspacePermissions[workspace._id]?.canApplyForOthers || false}
                                    onChange={(e) => {
                                      setLoanWorkspacePermissions((prev) => ({
                                        ...prev,
                                        [workspace._id]: {
                                          ...prev[workspace._id],
                                          canApplyForOthers: e.target.checked,
                                        },
                                      }));
                                    }}
                                    className="rounded border-slate-300"
                                  />
                                  Apply for Others
                                </label>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={async () => {
                              setSaving(true);
                              try {
                                const currentType = activeTab === 'loan' ? 'loan' : 'salary_advance';
                                const response = await api.saveLoanSettings(currentType, {
                                  ...loanSettings,
                                  settings: {
                                    ...loanSettings.settings,
                                    workspacePermissions: loanWorkspacePermissions,
                                  },
                                });
                                if (response.success) {
                                  setMessage({ type: 'success', text: 'Workspace permissions saved successfully' });
                                  loadLoanSettings(currentType);
                                }
                              } catch (err) {
                                setMessage({ type: 'error', text: 'Failed to save workspace permissions' });
                              } finally {
                                setSaving(false);
                              }
                            }}
                            disabled={saving}
                            className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
                          >
                            {saving ? 'Saving...' : 'Save Workspace Permissions'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="space-y-6">
            {attendanceSettingsLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : attendanceSettings ? (
              <>
                {/* Data Source Selection */}
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Data Source</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Retrieve attendance from
                      </label>
                      <select
                        value={attendanceSettings.dataSource || 'mongodb'}
                        onChange={(e) => setAttendanceSettings({ ...attendanceSettings, dataSource: e.target.value })}
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="mongodb">MongoDB</option>
                        <option value="mssql">MSSQL</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* MSSQL Configuration */}
                {attendanceSettings.dataSource === 'mssql' && (
                  <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                    <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">MSSQL Configuration</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Database Name *
                        </label>
                        <input
                          type="text"
                          value={attendanceSettings.mssqlConfig?.databaseName || ''}
                          onChange={(e) => setAttendanceSettings({
                            ...attendanceSettings,
                            mssqlConfig: {
                              ...attendanceSettings.mssqlConfig,
                              databaseName: e.target.value,
                            },
                          })}
                          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder="e.g., HRMS"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Table Name *
                        </label>
                        <input
                          type="text"
                          value={attendanceSettings.mssqlConfig?.tableName || ''}
                          onChange={(e) => setAttendanceSettings({
                            ...attendanceSettings,
                            mssqlConfig: {
                              ...attendanceSettings.mssqlConfig,
                              tableName: e.target.value,
                            },
                          })}
                          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder="e.g., AttendanceLogs"
                        />
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Column Mapping</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              Employee Number Column *
                            </label>
                            <input
                              type="text"
                              value={attendanceSettings.mssqlConfig?.columnMapping?.employeeNumberColumn || ''}
                              onChange={(e) => setAttendanceSettings({
                                ...attendanceSettings,
                                mssqlConfig: {
                                  ...attendanceSettings.mssqlConfig,
                                  columnMapping: {
                                    ...attendanceSettings.mssqlConfig?.columnMapping,
                                    employeeNumberColumn: e.target.value,
                                  },
                                },
                              })}
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              placeholder="e.g., EmployeeNumber"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                              Timestamp Column *
                            </label>
                            <input
                              type="text"
                              value={attendanceSettings.mssqlConfig?.columnMapping?.timestampColumn || ''}
                              onChange={(e) => setAttendanceSettings({
                                ...attendanceSettings,
                                mssqlConfig: {
                                  ...attendanceSettings.mssqlConfig,
                                  columnMapping: {
                                    ...attendanceSettings.mssqlConfig?.columnMapping,
                                    timestampColumn: e.target.value,
                                  },
                                },
                              })}
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              placeholder="e.g., Timestamp"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="hasTypeColumn"
                              checked={attendanceSettings.mssqlConfig?.columnMapping?.hasTypeColumn || false}
                              onChange={(e) => setAttendanceSettings({
                                ...attendanceSettings,
                                mssqlConfig: {
                                  ...attendanceSettings.mssqlConfig,
                                  columnMapping: {
                                    ...attendanceSettings.mssqlConfig?.columnMapping,
                                    hasTypeColumn: e.target.checked,
                                  },
                                },
                              })}
                              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="hasTypeColumn" className="text-sm text-slate-700 dark:text-slate-300">
                              Table has separate IN/OUT type column
                            </label>
                          </div>
                          {attendanceSettings.mssqlConfig?.columnMapping?.hasTypeColumn && (
                            <div>
                              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                                Type Column (IN/OUT)
                              </label>
                              <input
                                type="text"
                                value={attendanceSettings.mssqlConfig?.columnMapping?.typeColumn || ''}
                                onChange={(e) => setAttendanceSettings({
                                  ...attendanceSettings,
                                  mssqlConfig: {
                                    ...attendanceSettings.mssqlConfig,
                                    columnMapping: {
                                      ...attendanceSettings.mssqlConfig?.columnMapping,
                                      typeColumn: e.target.value,
                                    },
                                  },
                                })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                placeholder="e.g., Type"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {attendanceSettings.mssqlAvailable !== undefined && (
                        <div className={`rounded-xl px-4 py-2 text-sm ${attendanceSettings.mssqlAvailable
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                          {attendanceSettings.mssqlAvailable ? '✓ MSSQL connection available' : '✗ MSSQL connection unavailable'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sync Settings */}
                {attendanceSettings.dataSource === 'mssql' && (
                  <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                    <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Sync Settings</h2>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="autoSyncEnabled"
                          checked={attendanceSettings.syncSettings?.autoSyncEnabled || false}
                          onChange={(e) => setAttendanceSettings({
                            ...attendanceSettings,
                            syncSettings: {
                              ...attendanceSettings.syncSettings,
                              autoSyncEnabled: e.target.checked,
                            },
                          })}
                          className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="autoSyncEnabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Enable automatic syncing
                        </label>
                      </div>
                      {attendanceSettings.syncSettings?.autoSyncEnabled && (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Sync Interval (hours)
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            max="24"
                            step="0.5"
                            value={attendanceSettings.syncSettings?.syncIntervalHours || 1}
                            onChange={(e) => setAttendanceSettings({
                              ...attendanceSettings,
                              syncSettings: {
                                ...attendanceSettings.syncSettings,
                                syncIntervalHours: parseFloat(e.target.value),
                              },
                            })}
                            className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={handleManualSync}
                          disabled={syncing}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          {syncing ? 'Syncing...' : 'Manual Sync Now'}
                        </button>
                        {attendanceSettings.syncSettings?.lastSyncAt && (
                          <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                            Last sync: {new Date(attendanceSettings.syncSettings.lastSyncAt).toLocaleString()}
                            {attendanceSettings.syncSettings.lastSyncStatus && (
                              <span className={`ml-2 ${attendanceSettings.syncSettings.lastSyncStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                ({attendanceSettings.syncSettings.lastSyncStatus})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Previous Day Linking */}
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Previous Day Linking</h2>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="previousDayLinkingEnabled"
                        checked={attendanceSettings.previousDayLinking?.enabled || false}
                        onChange={(e) => setAttendanceSettings({
                          ...attendanceSettings,
                          previousDayLinking: {
                            ...attendanceSettings.previousDayLinking,
                            enabled: e.target.checked,
                          },
                        })}
                        className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="previousDayLinkingEnabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Enable previous day linking
                      </label>
                    </div>
                    {attendanceSettings.previousDayLinking?.enabled && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="requireConfirmation"
                          checked={attendanceSettings.previousDayLinking?.requireConfirmation !== false}
                          onChange={(e) => setAttendanceSettings({
                            ...attendanceSettings,
                            previousDayLinking: {
                              ...attendanceSettings.previousDayLinking,
                              requireConfirmation: e.target.checked,
                            },
                          })}
                          className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="requireConfirmation" className="text-sm text-slate-700 dark:text-slate-300">
                          Require admin confirmation for linked records
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Excel Upload */}
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Excel Upload</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Upload Attendance Excel File
                      </label>
                      <div className="flex gap-3">
                        <input
                          id="excel-upload"
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <button
                          onClick={handleExcelUpload}
                          disabled={!uploadFile || uploading}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                        <button
                          onClick={handleDownloadTemplate}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Download Template
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Upload Excel file with columns: Employee Number, In-Time, Out-Time (optional)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    onClick={saveAttendanceSettings}
                    disabled={saving}
                    className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                <p className="text-sm text-slate-600 dark:text-slate-400">Failed to load attendance settings</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Payroll Settings</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Control global payroll behaviors. Department settings can override these.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Include Missing Allowances &amp; Deductions for Employees
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      When enabled, if an employee has partial overrides, missing items will be auto-filled from Department then Global.
                      When disabled, only the employee’s own overrides are used.
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={includeMissing}
                      disabled={includeMissingSaving || includeMissingLoading}
                      onChange={(e) => setIncludeMissing(e.target.checked)}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                  </label>
                </div>
              </div>


              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-emerald-900/10">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payslip Access Control</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Configure how and when employees can access their payslips</p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Release Required</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Employees can only view payslips after they are explicitly released by HR</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={payslipReleaseRequired}
                        onChange={(e) => setPayslipReleaseRequired(e.target.checked)}
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-emerald-800"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        History Visibility (Months)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={payslipHistoryMonths}
                        onChange={(e) => setPayslipHistoryMonths(parseInt(e.target.value) || 6)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Number of previous months available in portal</p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Download Limit Per Payslip
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={payslipDownloadLimit}
                        onChange={(e) => setPayslipDownloadLimit(parseInt(e.target.value) || 5)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Maximum times an employee can download a single payslip</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-indigo-900/10">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payroll Cycle Definition</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Configure the start and end dates of your monthly payroll cycle</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cycle Start Day
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={payrollCycleStartDay}
                        onChange={(e) => setPayrollCycleStartDay(parseInt(e.target.value) || 1)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Day of month when cycle starts (e.g., 26)</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cycle End Day
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={payrollCycleEndDay}
                        onChange={(e) => setPayrollCycleEndDay(parseInt(e.target.value) || 31)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Day of month when cycle ends (e.g., 25)</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-white/50 p-3 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Approximate Cycle Duration:</span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {(() => {
                          if (payrollCycleStartDay < payrollCycleEndDay) {
                            return `${payrollCycleEndDay - payrollCycleStartDay + 1} Days`;
                          } else {
                            // Spans months - calculate based on a 30-day month average for visualization
                            const duration = (31 - payrollCycleStartDay) + payrollCycleEndDay;
                            return `~${duration} Days (Spans Months)`;
                          }
                        })()}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] italic text-slate-500">
                      {payrollCycleStartDay >= payrollCycleEndDay
                        ? `Note: Cycle starts on day ${payrollCycleStartDay} of the previous month and ends on day ${payrollCycleEndDay} of the current month.`
                        : `Note: Cycle starts on day ${payrollCycleStartDay} and ends on day ${payrollCycleEndDay} within the same month.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={savePayrollSettings}
                  disabled={saving || payrollLoading}
                  className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Payroll Settings'}
                </button>
              </div>

              <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50/30 p-5 dark:border-blue-700 dark:bg-blue-900/10">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Bulk Payslip Release</h3>
                  <p className="text-xs text-blue-500 dark:text-blue-400">Trigger manual release of payslips for a specific month</p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Target Month</label>
                    <input
                      type="text"
                      placeholder="e.g., January 2024"
                      value={releaseMonth}
                      onChange={(e) => setReleaseMonth(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <button
                    onClick={handleBulkRelease}
                    disabled={releasing}
                    className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {releasing ? 'Releasing...' : 'Release Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'feature_control' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Feature Control</h2>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Manage module visibility for different user roles. Modules are organized by category.
            </p>

            {featureControlLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <div className="space-y-8">
                {[
                  { id: 'employee', label: 'Employee Role', state: featureControlEmployee, setState: setFeatureControlEmployee },
                  { id: 'hod', label: 'HOD Role', state: featureControlHOD, setState: setFeatureControlHOD },
                  { id: 'hr', label: 'HR Role', state: featureControlHR, setState: setFeatureControlHR },
                ].map((role) => (
                  <div key={role.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-900/50">
                    <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">{role.label}</h3>

                    {/* Categorized Modules */}
                    <div className="space-y-6">
                      {/* Dashboard */}
                      <div>
                        <h4 className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">📊 Dashboard</h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                            <input
                              type="checkbox"
                              checked={role.state.includes('DASHBOARD')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  role.setState([...role.state, 'DASHBOARD']);
                                } else {
                                  role.setState(role.state.filter(m => m !== 'DASHBOARD'));
                                }
                              }}
                              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Dashboard</span>
                          </label>
                        </div>
                      </div>

                      {/* Employee Management */}
                      <div>
                        <h4 className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">👥 Employee Management</h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {['EMPLOYEES', 'PROFILE'].map((module) => (
                            <label key={module} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={role.state.includes(module)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    role.setState([...role.state, module]);
                                  } else {
                                    role.setState(role.state.filter(m => m !== module));
                                  }
                                }}
                                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{module === 'EMPLOYEES' ? 'Employees' : 'Profile'}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Time & Attendance */}
                      <div>
                        <h4 className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">⏰ Time & Attendance</h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {['LEAVE_OD', 'ATTENDANCE', 'OT_PERMISSIONS', 'SHIFTS'].map((module) => (
                            <label key={module} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={role.state.includes(module)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    role.setState([...role.state, module]);
                                  } else {
                                    role.setState(role.state.filter(m => m !== module));
                                  }
                                }}
                                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                {module === 'LEAVE_OD' ? 'Leave & OD' : module === 'OT_PERMISSIONS' ? 'OT & Permissions' : module === 'SHIFTS' ? 'Shifts' : 'Attendance'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Organization */}
                      <div>
                        <h4 className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">🏢 Organization</h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                            <input
                              type="checkbox"
                              checked={role.state.includes('DEPARTMENTS')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  role.setState([...role.state, 'DEPARTMENTS']);
                                } else {
                                  role.setState(role.state.filter(m => m !== 'DEPARTMENTS'));
                                }
                              }}
                              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Departments</span>
                          </label>
                        </div>
                      </div>

                      {/* Finance & Payroll */}
                      <div>
                        <h4 className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">💰 Finance & Payroll</h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {['PAYSLIPS', 'PAY_REGISTER', 'ALLOWANCES_DEDUCTIONS'].map((module) => (
                            <label key={module} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={role.state.includes(module)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    role.setState([...role.state, module]);
                                  } else {
                                    role.setState(role.state.filter(m => m !== module));
                                  }
                                }}
                                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                {module === 'PAY_REGISTER' ? 'Pay Register' : module === 'ALLOWANCES_DEDUCTIONS' ? 'Allowances & Deductions' : 'Payslips'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end">
                  <button
                    onClick={saveFeatureControlSettings}
                    disabled={saving}
                    className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Feature Control'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overtime' && (
          <div className="space-y-6">
            {otSettingsLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <>
                {/* OT Settings Form */}
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Overtime Settings</h2>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Configure global overtime payment settings. These settings can be overridden at the department level.
                  </p>

                  {message && (
                    <div
                      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                    >
                      {message.text}
                    </div>
                  )}

                  <div className="space-y-6">
                    {/* OT Pay Per Hour */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Overtime Pay Per Hour (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={otSettings.otPayPerHour}
                        onChange={(e) => setOTSettings({ ...otSettings, otPayPerHour: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="e.g., 100, 150, 200"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Amount paid per hour of approved overtime worked
                      </p>
                    </div>

                    {/* Minimum OT Hours */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Minimum Overtime Hours
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={otSettings.minOTHours}
                        onChange={(e) => setOTSettings({ ...otSettings, minOTHours: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="e.g., 1, 2, 2.5"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Minimum overtime hours required to be eligible for overtime pay
                      </p>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end">
                      <button
                        onClick={saveOTSettings}
                        disabled={saving || otSettingsLoading}
                        className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save OT Settings'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* OT Workflow Configuration */}
                <div className="space-y-6">
                  {/* Workflow Enable Toggle */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Enable OT Workflow</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Multi-step approval process for Overtime requests</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={otSettings.workflow?.isEnabled || false}
                          onChange={(e) => setOTSettings(prev => ({
                            ...prev,
                            workflow: { ...prev.workflow, isEnabled: e.target.checked }
                          }))}
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                      </label>
                    </div>

                    {/* Manager Approval Toggle */}
                    {otSettings.workflow?.isEnabled && (
                      <div className="mt-4 border-t border-slate-200/50 pt-4 dark:border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Manager Approval</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Require approval from employee&apos;s reporting manager</p>
                          </div>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={otSettings.workflow?.steps?.some(s => s.approverRole === 'manager') || false}
                              onChange={(e) => {
                                const includeManager = e.target.checked;
                                setOTSettings(prev => {
                                  const finalRole = prev.workflow?.finalAuthority?.role || 'hr';
                                  let newSteps: WorkflowStep[] = [];

                                  if (finalRole === 'hr') {
                                    if (includeManager) {
                                      newSteps = [
                                        { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'pending', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null },
                                        { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                      ];
                                    } else {
                                      newSteps = [
                                        { stepOrder: 1, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                      ];
                                    }
                                  } else {
                                    // If Manager is final authority, they are the only step essentially
                                    newSteps = [
                                      { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                    ];
                                  }
                                  return { ...prev, workflow: { ...prev.workflow, steps: newSteps } };
                                });
                              }}
                              className="peer sr-only"
                            />
                            <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                          </label>
                        </div>


                      </div>
                    )}
                  </div>

                  {/* Final Authority */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                    <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Final Approval Authority</h3>
                    <div className="flex flex-col gap-3">
                      {/* Manager Option */}
                      {otSettings.workflow?.steps?.some(s => s.approverRole === 'manager') && (
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            type="radio"
                            name="otFinalAuthority"
                            checked={otSettings.workflow?.finalAuthority?.role === 'manager'}
                            onChange={() => setOTSettings(prev => ({
                              ...prev,
                              workflow: {
                                ...prev.workflow,
                                steps: [
                                  { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                ],
                                finalAuthority: { role: 'manager', anyHRCanApprove: false }
                              }
                            }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Manager (Division Head)</span>
                        </label>
                      )}

                      {/* HR Option */}
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                        <input
                          type="radio"
                          name="otFinalAuthority"
                          checked={otSettings.workflow?.finalAuthority?.role === 'hr'}
                          onChange={() => setOTSettings(prev => {
                            const hasManager = prev.workflow.steps?.some(s => s.approverRole === 'manager') || false;
                            let newSteps: WorkflowStep[] = [];
                            if (hasManager) {
                              newSteps = [
                                { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'pending', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null },
                                { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                              ];
                            } else {
                              newSteps = [
                                { stepOrder: 1, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                              ];
                            }
                            return {
                              ...prev,
                              workflow: {
                                ...prev.workflow,
                                steps: newSteps,
                                finalAuthority: {
                                  role: 'hr',
                                  anyHRCanApprove: prev.workflow.finalAuthority?.anyHRCanApprove ?? false
                                }
                              }
                            };
                          })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">HR</span>
                      </label>
                    </div>
                  </div>

                  {/* Any HR Can Approve Toggle */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Any HR Can Give Final Approval</span>
                      <input
                        type="checkbox"
                        checked={otSettings.workflow?.finalAuthority?.anyHRCanApprove || false}
                        onChange={(e) => setOTSettings(prev => ({
                          ...prev,
                          workflow: { ...prev.workflow, finalAuthority: { ...prev.workflow.finalAuthority, anyHRCanApprove: e.target.checked } }
                        }))}
                        className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                  </div>


                  <button
                    onClick={saveOTWorkflow}
                    disabled={saving}
                    className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save OT Workflow'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="space-y-6">
            {permissionRulesLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Permission Deduction Rules</h2>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Configure global permission deduction rules. These settings can be overridden at the department level.
                  </p>

                  {message && (
                    <div
                      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                        }`}
                    >
                      {message.text}
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Count Threshold
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={permissionDeductionRules.countThreshold ?? ''}
                        onChange={(e) => setPermissionDeductionRules(prev => ({ ...prev, countThreshold: e.target.value ? parseInt(e.target.value) : null }))}
                        placeholder="e.g., 4"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Number of permissions to trigger deduction
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Deduction Type
                      </label>
                      <select
                        value={permissionDeductionRules.deductionType ?? ''}
                        onChange={(e) => setPermissionDeductionRules(prev => ({ ...prev, deductionType: (e.target.value as 'half_day' | 'full_day' | 'custom_amount') || null }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Select Type</option>
                        <option value="half_day">Half Day</option>
                        <option value="full_day">Full Day</option>
                        <option value="custom_amount">Custom Amount</option>
                      </select>
                    </div>

                    {permissionDeductionRules.deductionType === 'custom_amount' && (
                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Custom Deduction Amount (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={permissionDeductionRules.deductionAmount ?? ''}
                          onChange={(e) => setPermissionDeductionRules(prev => ({ ...prev, deductionAmount: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="e.g., 500"
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Minimum Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={permissionDeductionRules.minimumDuration ?? ''}
                        onChange={(e) => setPermissionDeductionRules(prev => ({ ...prev, minimumDuration: e.target.value ? parseInt(e.target.value) : null }))}
                        placeholder="e.g., 60 (1 hour)"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Only count permissions with duration {'>='} this value
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Calculation Mode
                      </label>
                      <select
                        value={permissionDeductionRules.calculationMode ?? ''}
                        onChange={(e) => setPermissionDeductionRules(prev => ({ ...prev, calculationMode: (e.target.value as 'proportional' | 'floor') || null }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Select Mode</option>
                        <option value="proportional">Proportional (with partial deductions)</option>
                        <option value="floor">Floor (only full multiples)</option>
                      </select>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Proportional: 5 permissions = 1.25× deduction | Floor: 5 permissions = 1× deduction (ignores remainder)
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={savePermissionDeductionRules}
                        disabled={saving || permissionRulesLoading}
                        className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Permission Deduction Rules'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Permission Workflow Configuration */}
                <div className="space-y-6">
                  {/* Workflow Enable Toggle */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Enable Permission Workflow</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Multi-step approval process for Permission requests</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={permissionWorkflow.isEnabled}
                          onChange={(e) => setPermissionWorkflow(prev => ({ ...prev, isEnabled: e.target.checked }))}
                          className="peer sr-only"
                        />
                        <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                      </label>
                    </div>

                    {/* Manager Approval Toggle */}
                    {permissionWorkflow.isEnabled && (
                      <div className="mt-4 border-t border-slate-200/50 pt-4 dark:border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Manager Approval</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Require approval from employee's reporting manager</p>
                          </div>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={permissionWorkflow.steps.some(s => s.approverRole === 'manager')}
                              onChange={(e) => {
                                const includeManager = e.target.checked;
                                setPermissionWorkflow(prev => {
                                  const finalRole = prev.finalAuthority?.role || 'hr';
                                  let newSteps: WorkflowStep[] = [];

                                  if (finalRole === 'hr') {
                                    if (includeManager) {
                                      newSteps = [
                                        { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'pending', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null },
                                        { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                      ];
                                    } else {
                                      newSteps = [
                                        { stepOrder: 1, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                      ];
                                    }
                                  } else {
                                    newSteps = [
                                      { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                                    ];
                                  }
                                  return { ...prev, steps: newSteps };
                                });
                              }}
                              className="peer sr-only"
                            />
                            <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800"></div>
                          </label>
                        </div>


                      </div>
                    )}
                  </div>

                  {/* Final Authority */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                    <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Final Approval Authority</h3>
                    <div className="flex flex-col gap-3">
                      {/* Manager Option */}
                      {permissionWorkflow.steps.some(s => s.approverRole === 'manager') && (
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            type="radio"
                            name="permissionFinalAuthority"
                            checked={permissionWorkflow.finalAuthority?.role === 'manager'}
                            onChange={() => setPermissionWorkflow(prev => ({
                              ...prev,
                              steps: [
                                { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                              ],
                              finalAuthority: { role: 'manager', anyHRCanApprove: false }
                            }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Manager (Division Head)</span>
                        </label>
                      )}

                      {/* HR Option */}
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800">
                        <input
                          type="radio"
                          name="permissionFinalAuthority"
                          checked={permissionWorkflow.finalAuthority?.role === 'hr'}
                          onChange={() => setPermissionWorkflow(prev => {
                            const hasManager = prev.steps.some(s => s.approverRole === 'manager');
                            let newSteps: WorkflowStep[] = [];
                            if (hasManager) {
                              newSteps = [
                                { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'pending', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null },
                                { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                              ];
                            } else {
                              newSteps = [
                                { stepOrder: 1, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'rejected', isActive: true, nextStepOnApprove: null }
                              ];
                            }
                            return {
                              ...prev,
                              steps: newSteps,
                              finalAuthority: {
                                role: 'hr',
                                anyHRCanApprove: prev.finalAuthority?.anyHRCanApprove ?? false
                              }
                            };
                          })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">HR</span>
                      </label>
                    </div>
                  </div>

                  {/* Any HR Can Approve Toggle */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Any HR Can Give Final Approval</span>
                      <input
                        type="checkbox"
                        checked={permissionWorkflow.finalAuthority?.anyHRCanApprove || false}
                        onChange={(e) => setPermissionWorkflow(prev => ({
                          ...prev,
                          finalAuthority: { ...prev.finalAuthority, anyHRCanApprove: e.target.checked }
                        }))}
                        className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                  </div>

                  <button
                    onClick={savePermissionWorkflow}
                    disabled={saving}
                    className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Permission Workflow'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'attendance_deductions' && (
          <div className="space-y-6">
            {attendanceRulesLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Attendance Deduction Rules</h2>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Configure global attendance deduction rules based on combined late-in and early-out count. These settings can be overridden at the department level.
                  </p>

                  {message && (
                    <div
                      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                        }`}
                    >
                      {message.text}
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Combined Count Threshold
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={attendanceDeductionRules.combinedCountThreshold ?? ''}
                        onChange={(e) => setAttendanceDeductionRules(prev => ({ ...prev, combinedCountThreshold: e.target.value ? parseInt(e.target.value) : null }))}
                        placeholder="e.g., 4"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Combined count (late-ins + early-outs) to trigger deduction
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Deduction Type
                      </label>
                      <select
                        value={attendanceDeductionRules.deductionType ?? ''}
                        onChange={(e) => setAttendanceDeductionRules(prev => ({ ...prev, deductionType: (e.target.value as 'half_day' | 'full_day' | 'custom_amount') || null }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Select Type</option>
                        <option value="half_day">Half Day</option>
                        <option value="full_day">Full Day</option>
                        <option value="custom_amount">Custom Amount</option>
                      </select>
                    </div>

                    {attendanceDeductionRules.deductionType === 'custom_amount' && (
                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Custom Deduction Amount (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={attendanceDeductionRules.deductionAmount ?? ''}
                          onChange={(e) => setAttendanceDeductionRules(prev => ({ ...prev, deductionAmount: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="e.g., 500"
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Minimum Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={attendanceDeductionRules.minimumDuration ?? ''}
                        onChange={(e) => setAttendanceDeductionRules(prev => ({ ...prev, minimumDuration: e.target.value ? parseInt(e.target.value) : null }))}
                        placeholder="e.g., 60 (1 hour)"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Only count late-ins/early-outs with duration {'>='} this value
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Calculation Mode
                      </label>
                      <select
                        value={attendanceDeductionRules.calculationMode ?? ''}
                        onChange={(e) => setAttendanceDeductionRules(prev => ({ ...prev, calculationMode: (e.target.value as 'proportional' | 'floor') || null }))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Select Mode</option>
                        <option value="proportional">Proportional (with partial deductions)</option>
                        <option value="floor">Floor (only full multiples)</option>
                      </select>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Proportional: 5 count = 1.25× deduction | Floor: 5 count = 1× deduction (ignores remainder)
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={saveAttendanceDeductionRules}
                        disabled={saving || attendanceRulesLoading}
                        className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Attendance Deduction Rules'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'attendance_deductions' && (
          <div className="space-y-6">
            {earlyOutLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Early-Out Rules</h2>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Configure independent early-out rules. When enabled, early-outs follow these settings; otherwise they use the combined late-in + early-out logic.
                  </p>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable Early-Out Rules</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Toggle to apply dedicated early-out logic</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={earlyOutSettings.isEnabled}
                          onChange={(e) => setEarlyOutSettings(prev => ({ ...prev, isEnabled: e.target.checked }))}
                        />
                        <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-500 peer-checked:after:translate-x-5"></div>
                      </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Allowed Early-Out Per Day (Minutes)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={earlyOutSettings.allowedDurationMinutes}
                        onChange={(e) => setEarlyOutSettings(prev => ({ ...prev, allowedDurationMinutes: parseInt(e.target.value || '0') }))}
                        placeholder="e.g., 30"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Minutes of early-out allowed per day without deduction.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Minimum Duration to Count (Minutes)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={earlyOutSettings.minimumDuration}
                        onChange={(e) => setEarlyOutSettings(prev => ({ ...prev, minimumDuration: parseInt(e.target.value || '0') }))}
                        placeholder="e.g., 10"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Only early-outs greater than or equal to this duration will be considered for deduction.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Early-Out Deduction Ranges</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Define ranges and apply quarter/half/full day or custom amount</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {earlyOutSettings.deductionRanges.length === 0 && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">No ranges configured.</p>
                        )}
                        {earlyOutSettings.deductionRanges.map((range, idx) => (
                          <div key={range._id || idx} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                              <span className="font-semibold">{range.minMinutes}–{range.maxMinutes} min</span>
                              <span className="text-slate-500">|</span>
                              <span className="capitalize">{range.deductionType.replace('_', ' ')}</span>
                              {range.deductionType === 'custom_amount' && range.deductionAmount && (
                                <span className="text-slate-500">₹{range.deductionAmount}</span>
                              )}
                              {range.description && <span className="text-slate-500">— {range.description}</span>}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => updateEarlyOutRange(range._id || '', {
                                  deductionType: range.deductionType,
                                  deductionAmount: range.deductionType === 'custom_amount' ? range.deductionAmount : undefined,
                                })}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-300"
                              >
                                Refresh
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteEarlyOutRange(range._id || '')}
                                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:border-red-400 dark:border-red-700 dark:text-red-300 dark:hover:border-red-500"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-5">
                        <input
                          type="number"
                          min="0"
                          placeholder="Min (min)"
                          value={newRange.minMinutes}
                          onChange={(e) => setNewRange(prev => ({ ...prev, minMinutes: e.target.value }))}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="Max (min)"
                          value={newRange.maxMinutes}
                          onChange={(e) => setNewRange(prev => ({ ...prev, maxMinutes: e.target.value }))}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <select
                          value={newRange.deductionType}
                          onChange={(e) => setNewRange(prev => ({ ...prev, deductionType: e.target.value as any }))}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        >
                          <option value="quarter_day">Quarter Day</option>
                          <option value="half_day">Half Day</option>
                          <option value="full_day">Full Day</option>
                          <option value="custom_amount">Custom Amount</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount (₹, if custom)"
                          value={newRange.deductionAmount}
                          onChange={(e) => setNewRange(prev => ({ ...prev, deductionAmount: e.target.value }))}
                          disabled={newRange.deductionType !== 'custom_amount'}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="Description"
                          value={newRange.description}
                          onChange={(e) => setNewRange(prev => ({ ...prev, description: e.target.value }))}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <div className="md:col-span-5 flex justify-end">
                          <button
                            type="button"
                            onClick={addEarlyOutRange}
                            className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600"
                          >
                            Add Range
                          </button>
                        </div>
                      </div>

                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={saveEarlyOutSettings}
                        disabled={earlyOutSaving || earlyOutLoading}
                        className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {earlyOutSaving ? 'Saving...' : 'Save Early-Out Settings'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'communications' && (
          <div className="space-y-6">
            {communicationsLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Password Management</h2>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Configure how temporary passwords are generated for new employees and users.
                  </p>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <button
                      onClick={() => setPasswordGenerationMode('random')}
                      className={`relative flex flex-col items-start rounded-2xl border p-5 text-left transition-all ${passwordGenerationMode === 'random'
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-900/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
                        }`}
                    >
                      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${passwordGenerationMode === 'random' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Random Password</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Secure 10-character alphanumeric password</p>
                      {passwordGenerationMode === 'random' && <div className="absolute right-4 top-4 text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>}
                    </button>

                    <button
                      onClick={() => setPasswordGenerationMode('phone_empno')}
                      className={`relative flex flex-col items-start rounded-2xl border p-5 text-left transition-all ${passwordGenerationMode === 'phone_empno'
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-900/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
                        }`}
                    >
                      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${passwordGenerationMode === 'phone_empno' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Predictable Password</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last 4 digits of phone + Employee ID</p>
                      {passwordGenerationMode === 'phone_empno' && <div className="absolute right-4 top-4 text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>}
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                  <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Credential Delivery Strategy</h2>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Define how credentials should be sent to employees upon account creation.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { id: 'email_only', label: 'Email Only', desc: 'Send via Email only', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                      { id: 'sms_only', label: 'SMS Only', desc: 'Send via SMS only', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                      { id: 'both', label: 'Email & SMS', desc: 'Send via both channels', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
                      { id: 'intelligent', label: 'Intelligent', desc: 'Auto-select based on availability', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setCredentialDeliveryStrategy(item.id as any)}
                        className={`group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${credentialDeliveryStrategy === item.id
                          ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-900/10'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
                          }`}
                      >
                        <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${credentialDeliveryStrategy === item.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                          </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</h3>
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                        {credentialDeliveryStrategy === item.id && <div className="absolute right-3 top-3 text-indigo-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
                    <div className="flex gap-3">
                      <div className="text-blue-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-100">About {credentialDeliveryStrategy === 'intelligent' ? 'Intelligent Mode' : credentialDeliveryStrategy.replace('_', ' ')}</h4>
                        <p className="mt-1 text-[11px] leading-relaxed text-blue-800/80 dark:text-blue-200/80">
                          {credentialDeliveryStrategy === 'intelligent'
                            ? "Prioritizes SMS for mobile accessibility. If no phone number is found, it automatically falls back to Email delivery."
                            : credentialDeliveryStrategy === 'both'
                              ? "Sends credentials to both Email and Phone Number for maximum visibility and record keeping."
                              : `Sends credentials exclusively via ${credentialDeliveryStrategy === 'email_only' ? 'Email' : 'SMS'}. Ensure users have the required contact info.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={saveCommunicationSettings}
                      disabled={saving}
                      className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:shadow-blue-500/40 active:scale-95 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Communication Settings'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'general' && (
          <div className="space-y-6">
            {generalSettingsLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
                <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">General System Settings</h2>
                <p className="mb-8 text-sm text-slate-600 dark:text-slate-400">
                  Global configurations for attendance, payroll, and system-wide defaults.
                </p>

                {message && activeTab === 'general' && (
                  <div
                    className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
                      ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                      : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                      }`}
                  >
                    {message.text}
                  </div>
                )}

                <div className="space-y-8">
                  {/* Grace Period Section */}
                  <section>
                    <div className="mb-4 flex items-center gap-2">
                      <div className="h-5 w-1 rounded-full bg-blue-500"></div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attendance Grace Periods</h3>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2">
                      {/* Late In Grace */}
                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Late In Grace Period (Minutes)
                        </label>
                        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                          Minutes allowed after shift start before being marked as late.
                        </p>
                        <input
                          type="number"
                          min="0"
                          value={lateInGrace}
                          onChange={(e) => setLateInGrace(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>

                      {/* Early Out Grace */}
                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Early Out Grace Period (Minutes)
                        </label>
                        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                          Minutes allowed before shift end without recording an early exit.
                        </p>
                        <input
                          type="number"
                          min="0"
                          value={earlyOutGrace}
                          onChange={(e) => setEarlyOutGrace(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4">
                    <button
                      onClick={saveGeneralSettings}
                      disabled={saving}
                      className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:shadow-blue-500/40 active:scale-95 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save General Settings'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {
        editingDuration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit Duration</h3>
                <button
                  onClick={() => setEditingDuration(null)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Label
                  </label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="e.g., Full Day"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setEditingDuration(null)}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={saving || !editDuration}
                    className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}