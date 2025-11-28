'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type TabType = 'shift' | 'employee' | 'leaves' | 'loan' | 'salary_advance' | 'attendance' | 'payroll' | 'general';

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
  
  // New leave type form
  const [newLeaveType, setNewLeaveType] = useState({ code: '', name: '', description: '', maxDaysPerYear: 12 });
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
  });

  useEffect(() => {
    if (activeTab === 'shift') {
      loadShiftDurations();
    } else if (activeTab === 'employee') {
      loadEmployeeSettings();
    } else if (activeTab === 'leaves') {
      loadLeaveSettings();
    } else if (activeTab === 'loan' || activeTab === 'salary_advance') {
      loadLoanSettings(activeTab);
    }
  }, [activeTab]);
  
  // Load workspaces when workspace permissions tab is selected
  useEffect(() => {
    if (activeTab === 'leaves' && leaveSubTab === 'workspacePermissions') {
      loadWorkspaces();
    }
  }, [leaveSubTab]);

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

  const loadWorkflowUsers = async () => {
    try {
      const currentType = activeTab === 'loan' ? 'loan' : 'salary_advance';
      const response = await api.getUsersForLoanWorkflow(currentType);
      if (response.success && response.data) {
        setWorkflowUsers(response.data.users || []);
        setWorkflowUsersByRole(response.data.usersByRole || {});
      }
    } catch (err) {
      console.error('Error loading workflow users:', err);
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
        setNewLeaveType({ code: '', name: '', description: '', maxDaysPerYear: 12 });
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
    { id: 'payroll', label: 'Payroll' },
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
                className={`flex-1 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  activeTab === tab.id
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
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                  message.type === 'success'
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
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
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
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                  message.type === 'success'
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* MSSQL Connection Status */}
            <div className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 ${
              mssqlConnected 
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
                : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
            }`}>
              <div className={`h-3 w-3 rounded-full ${mssqlConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
              <span className={`text-sm font-medium ${
                mssqlConnected 
                  ? 'text-green-700 dark:text-green-400' 
                  : 'text-amber-700 dark:text-amber-400'
              }`}>
                MSSQL (HRMS Database): {mssqlConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            {employeeSettingsLoading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 py-12 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
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
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all ${
                          employeeDataSource === option.value
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
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all ${
                          employeeDeleteTarget === option.value
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
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                  message.type === 'success'
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
                    className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      leaveSubTab === tab.id
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
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
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
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
                        <button
                          onClick={handleAddLeaveType}
                          disabled={saving || !newLeaveType.code || !newLeaveType.name}
                          className="rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
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
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{type.name}</span>
                                  {type.maxDaysPerYear && (
                                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                      (Max: {type.maxDaysPerYear} days/year)
                                    </span>
                                  )}
                                  {type.description && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500">{type.description}</p>
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
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-pink-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-pink-900/10">
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
                          className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/30 transition-all hover:from-pink-600 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                            checked={leaveSettings?.workflow.isEnabled || false}
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
                                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                                  step.approverRole === 'hod' 
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
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-green-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-green-900/10">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Final Authority</h3>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="finalAuthority"
                            checked={leaveSettings?.workflow?.finalAuthority?.role === 'hr'}
                            onChange={() => setLeaveSettings(prev => prev ? {
                              ...prev,
                              workflow: { ...prev.workflow, finalAuthority: { ...(prev.workflow?.finalAuthority || {}), role: 'hr', anyHRCanApprove: prev.workflow?.finalAuthority?.anyHRCanApprove ?? true } }
                            } : null)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">HR</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="finalAuthority"
                            checked={leaveSettings?.workflow?.finalAuthority?.role === 'super_admin'}
                            onChange={() => setLeaveSettings(prev => prev ? {
                              ...prev,
                              workflow: { ...prev.workflow, finalAuthority: { ...(prev.workflow?.finalAuthority || {}), role: 'super_admin', anyHRCanApprove: prev.workflow?.finalAuthority?.anyHRCanApprove ?? true } }
                            } : null)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Super Admin Only</span>
                        </label>
                      </div>
                      <label className="mt-3 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={leaveSettings?.workflow?.finalAuthority?.anyHRCanApprove || false}
                          onChange={(e) => setLeaveSettings(prev => prev ? {
                            ...prev,
                            workflow: { ...prev.workflow, finalAuthority: { ...(prev.workflow?.finalAuthority || {}), role: prev.workflow?.finalAuthority?.role || 'hr', anyHRCanApprove: e.target.checked } }
                          } : null)}
                          className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Any HR can give final approval</span>
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
                            checked={odSettings?.workflow.isEnabled || false}
                            onChange={(e) => setODSettings(prev => prev ? {
                              ...prev,
                              workflow: { ...prev.workflow, isEnabled: e.target.checked }
                            } : null)}
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800"></div>
                        </label>
                      </div>
                    </div>

                    {/* OD Workflow Steps */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">OD Approval Flow</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Same flow as leave by default</p>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-4">
                          {odSettings?.workflow?.steps && odSettings.workflow.steps.map((step, index) => (
                            <div key={step.stepOrder} className="flex items-center gap-4">
                              <div className="flex flex-col items-center">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                                  step.approverRole === 'hod' 
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
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
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                              ✓
                            </div>
                            <span className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">Approved</span>
                          </div>
                        </div>
                      </div>
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
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
                              className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 ${
                                isEmployeeWorkspace ? 'opacity-60' : ''
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
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800 ${
                                        isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
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
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-blue-800 ${
                                        isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
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
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800 ${
                                        isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
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
                                      <div className={`peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-purple-800 ${
                                        isEmployeeWorkspace ? 'opacity-50 cursor-not-allowed' : ''
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
                            loadWorkflowUsers();
                          }
                        }}
                        className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                          loanSubTab === tab.id
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

                {/* Workflow Sub-tab */}
                {loanSubTab === 'workflow' && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Workflow Configuration</h3>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            defaultChecked={loanSettings?.workflow?.useDynamicWorkflow || false}
                            className="rounded border-slate-300"
                          />
                          Enable Dynamic Workflow
                        </label>
                      </div>
                      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                        Configure the approval workflow steps. Enable dynamic workflow to assign specific users to each step.
                      </p>
                      {/* Workflow steps UI will go here */}
                      <div className="text-sm text-slate-500">Workflow configuration UI coming soon...</div>
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
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Attendance Settings</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Attendance-related settings will be configured here.</p>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Payroll Settings</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Payroll-related settings will be configured here.</p>
          </div>
        )}

        {activeTab === 'general' && (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95 sm:p-8">
            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">General Settings</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">General system settings will be configured here.</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingDuration && (
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
      )}
    </div>
  );
}
