'use client';

import React, { useState, useEffect } from 'react';
import { api, Role, User } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { User as UserIcon, Users, Briefcase, UserCog, Edit, Plus, Trash2, Shield, CheckCircle, ShieldAlert } from 'lucide-react';
import {
  SettingsOutlineButton,
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSaveBar,
  SettingsSectionCard,
} from './SettingsPageShell';
import {
  settingsFieldHelpClass,
  settingsInputClass,
  settingsInputStyle,
  settingsLedgerBorder,
  settingsOutlineButtonClass,
  settingsOutlineButtonStyle,
  settingsSectionTitleClass,
} from '@/lib/settingsUi';
import {
  getAccessLevelLabel,
} from '@/lib/modulePermissionLabels';
import {
  LoanDetailDialog,
  LoanDetailDialogBody,
  LoanDetailDialogHeader,
  LoanDialogFooter,
  LoanFormLabel,
  loansDialogDangerButtonClass,
} from '@/components/loans/LoanDetailDialogShell';

const availableModules: { id: string; label: string }[] = [
  { id: 'DASHBOARD', label: 'Dashboard' },
  { id: 'PROFILE', label: 'My Profile' },
  { id: 'EMPLOYEES', label: 'Employees' },
  { id: 'ASSETS_MANAGEMENT', label: 'Assets Management' },
  { id: 'RESIGNATION', label: 'Resignations' },
  { id: 'PROMOTIONS_TRANSFERS', label: 'Promotions & Transfers' },
  { id: 'ATTENDANCE', label: 'Attendance' },
  { id: 'LEAVE_OD', label: 'Leave & OD' },
  { id: 'LEAVE_REGISTER', label: 'Leave Register' },
  { id: 'OT_PERMISSIONS', label: 'OT & Permissions' },
  { id: 'SHIFTS', label: 'Shifts' },
  { id: 'DEPARTMENTS', label: 'Departments' },
  { id: 'PAYSLIPS', label: 'Payslips' },
  { id: 'PAY_REGISTER', label: 'Pay Register' },
  { id: 'ALLOWANCES_DEDUCTIONS', label: 'Allowances & Deductions' },
  { id: 'LOANS', label: 'Loans & Salary Advance' },
  { id: 'CCL', label: 'CCL' },
  { id: 'HOLIDAY_CALENDAR', label: 'Holidays' },
  { id: 'HOLIDAY_CALENDAR_MANAGE_GLOBAL', label: 'Holidays (Global Manage)' },
  { id: 'SETTINGS', label: 'Settings' },
];

type FeatureControlRole = 'employee' | 'hod' | 'hr' | 'manager';

/** Normalize stored activeModules: plain "MODULE" → "MODULE:write" so UI and save use :read/:write consistently */
function normalizeActiveModules(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').map((v) => {
    const s = String(v).trim();
    if (!s) return null;
    if (s.includes(':')) return s; // already "MODULE:read" or "MODULE:write"
    return `${s}:write`; // legacy plain id → treat as write
  }).filter(Boolean) as string[];
}

const FeatureControlSettings = () => {
  const [featureControlEmployee, setFeatureControlEmployee] = useState<string[]>([]);
  const [featureControlHOD, setFeatureControlHOD] = useState<string[]>([]);
  const [featureControlHR, setFeatureControlHR] = useState<string[]>([]);
  const [featureControlManager, setFeatureControlManager] = useState<string[]>([]);
  const [roleMetadata, setRoleMetadata] = useState<Record<FeatureControlRole, { name: string; description: string }>>({
    employee: { name: 'Employee', description: 'Standard employee access' },
    hod: { name: 'Head of Department', description: 'Manage department-level data' },
    hr: { name: 'Human Resources', description: 'Access to employee management tools' },
    manager: { name: 'Manager', description: 'Manage division-level data' },
  });
  const [customRoles, setCustomRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleData, setNewRoleData] = useState({ name: '', description: '' });
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [assignedUsers, setAssignedUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [resEmp, resHOD, resHR, resManager, resRoles] = await Promise.all([
        api.getSetting('feature_control_employee'),
        api.getSetting('feature_control_hod'),
        api.getSetting('feature_control_hr'),
        api.getSetting('feature_control_manager'),
        api.getRoles(),
      ]);


      const val = (r: any) => r?.data?.value;
      if (resEmp?.success) {
        setFeatureControlEmployee(normalizeActiveModules(val(resEmp)?.activeModules));
        if (val(resEmp)?.name) setRoleMetadata(prev => ({ ...prev, employee: { name: val(resEmp).name, description: val(resEmp).description || 'Standard employee access' } }));
      }
      if (resHOD?.success) {
        setFeatureControlHOD(normalizeActiveModules(val(resHOD)?.activeModules));
        if (val(resHOD)?.name) setRoleMetadata(prev => ({ ...prev, hod: { name: val(resHOD).name, description: val(resHOD).description || 'Manage department-level data' } }));
      }
      if (resHR?.success) {
        setFeatureControlHR(normalizeActiveModules(val(resHR)?.activeModules));
        if (val(resHR)?.name) setRoleMetadata(prev => ({ ...prev, hr: { name: val(resHR).name, description: val(resHR).description || 'Access to employee management tools' } }));
      }
      if (resManager?.success) {
        setFeatureControlManager(normalizeActiveModules(val(resManager)?.activeModules));
        if (val(resManager)?.name) setRoleMetadata(prev => ({ ...prev, manager: { name: val(resManager).name, description: val(resManager).description || 'Manage division-level data' } }));
      }
      if (resRoles?.success) setCustomRoles(resRoles.data || []);
    } catch (err) {
      console.error('Failed to load feature control settings', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await Promise.all([
        api.upsertSetting({ key: 'feature_control_employee', value: { activeModules: featureControlEmployee, name: roleMetadata.employee.name, description: roleMetadata.employee.description }, category: 'feature_control' }),
        api.upsertSetting({ key: 'feature_control_hod', value: { activeModules: featureControlHOD, name: roleMetadata.hod.name, description: roleMetadata.hod.description }, category: 'feature_control' }),
        api.upsertSetting({ key: 'feature_control_hr', value: { activeModules: featureControlHR, name: roleMetadata.hr.name, description: roleMetadata.hr.description }, category: 'feature_control' }),
        api.upsertSetting({ key: 'feature_control_manager', value: { activeModules: featureControlManager, name: roleMetadata.manager.name, description: roleMetadata.manager.description }, category: 'feature_control' }),
      ]);
      toast.success('Feature control settings saved successfully');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = () => {
    setNewRoleData({ name: '', description: '' });
    setShowCreateModal(true);
  };

  const handleConfirmCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleData.name) return;
    
    try {
      setCreatingRole(true);
      const res = await api.createRole({ 
        name: newRoleData.name, 
        description: newRoleData.description || `Custom role for ${newRoleData.name}`, 
        activeModules: [] 
      });
      if (res.success && res.data) {
        setCustomRoles((prev) => [...prev, res.data!]);
        toast.success('New role created successfully');
        setShowCreateModal(false);
      } else {
        toast.error(res.message || 'Failed to create role');
      }
    } catch (err) {
      toast.error('Failed to create role');
    } finally {
      setCreatingRole(false);
    }
  };

  const handleUpdateRoleDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    
    // Check if it's a system role
    const systemRoleKeys: Record<string, FeatureControlRole> = {
      employee: 'employee',
      hod: 'hod',
      hr: 'hr',
      manager: 'manager'
    };

    if (systemRoleKeys[editingRole._id]) {
      const type = systemRoleKeys[editingRole._id];
      setRoleMetadata(prev => ({
        ...prev,
        [type]: { name: editingRole.name, description: editingRole.description || '' }
      }));
      toast.success('System role metadata updated locally. Click Save to persist all changes.');
      setEditingRole(null);
      return;
    }

    try {
      setSaving(true);
      const res = await api.updateRole(editingRole._id, { 
        name: editingRole.name, 
        description: editingRole.description 
      });
      if (res.success) {
        setCustomRoles(prev => prev.map(r => r._id === editingRole._id ? { ...r, name: editingRole.name, description: editingRole.description } : r));
        toast.success('Role updated');
        setEditingRole(null);
      }
    } catch (err) {
      toast.error('Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const initiateDelete = async (role: Role) => {
    setDeletingRole(role);
    setLoadingUsers(true);
    try {
      const res = await api.getRoleAssignedUsers(role._id);
      if (res.success) {
        setAssignedUsers(res.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch assigned users', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRole) return;

    try {
      setSaving(true);
      const res = await api.deleteRole(deletingRole._id);
      if (res.success) {
        setCustomRoles((prev) => prev.filter((r) => r._id !== deletingRole._id));
        toast.success('Role deleted');
        setDeletingRole(null);
      } else {
        toast.error(res.message || 'Failed to delete role');
      }
    } catch (err) {
      toast.error('Error deleting role');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (id: string, name: string) => {
    // Legacy - replaced by initiateDelete
  };

  const updateCustomRoleModules = async (roleId: string, modules: string[]) => {
    try {
      const res = await api.updateRole(roleId, { activeModules: modules });
      if (res.success) {
        setCustomRoles((prev) => prev.map((r) => (r._id === roleId ? { ...r, activeModules: modules } : r)));
      }
    } catch (err) {
      toast.error('Failed to update role permissions');
    }
  };

  /** Current permission state for a module from activeModules array */
  const getModuleState = (state: string[], moduleId: string): 'disabled' | 'read' | 'write' => {
    if (state.includes(`${moduleId}:write`)) return 'write';
    if (state.includes(moduleId)) return 'write'; // legacy plain id
    if (state.includes(`${moduleId}:read`)) return 'read';
    return 'disabled';
  };

  /** Cycle tile: disabled → read → write → disabled */
  const cycleModule = (role: FeatureControlRole, moduleId: string) => {
    const setters: Record<FeatureControlRole, [string[], React.Dispatch<React.SetStateAction<string[]>>]> = {
      employee: [featureControlEmployee, setFeatureControlEmployee],
      hod: [featureControlHOD, setFeatureControlHOD],
      hr: [featureControlHR, setFeatureControlHR],
      manager: [featureControlManager, setFeatureControlManager],
    };
    const [current, setter] = setters[role];
    const state = getModuleState(current, moduleId);
    const without = current.filter((id) => id !== moduleId && id !== `${moduleId}:read` && id !== `${moduleId}:write`);
    if (state === 'disabled') {
      setter([...without, `${moduleId}:read`]);
    } else if (state === 'read') {
      setter([...without, `${moduleId}:read`, `${moduleId}:write`]);
    } else {
      setter(without);
    }
  };

  const cycleCustomRoleModule = (roleId: string, moduleId: string) => {
    const role = customRoles.find((r) => r._id === roleId);
    if (!role) return;

    const current = role.activeModules || [];
    const state = getModuleState(current, moduleId);
    const without = current.filter((id) => id !== moduleId && id !== `${moduleId}:read` && id !== `${moduleId}:write`);

    let next: string[];
    if (state === 'disabled') {
      next = [...without, `${moduleId}:read`];
    } else if (state === 'read') {
      next = [...without, `${moduleId}:read`, `${moduleId}:write`];
    } else {
      next = without;
    }

    updateCustomRoleModules(roleId, next);
  };

  if (loading) return <SettingsSkeleton />;

  const RoleCard = ({ role, title, icon: Icon, colorClass, state }: { role: FeatureControlRole; title: string; icon: React.ComponentType<{ className?: string }>; colorClass: string; state: string[] }) => (
    <SettingsSectionCard title={title} className="flex flex-col group">
      <div className="-mt-2 mb-4 flex items-center justify-between gap-3 border-b pb-3" style={settingsLedgerBorder}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center border ${colorClass}`} style={settingsLedgerBorder}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditingRole({ 
              _id: role, 
              name: roleMetadata[role].name, 
              description: roleMetadata[role].description, 
              activeModules: state,
              isSystemRole: true 
            } as any)}
            className="p-1.5 text-stone-400 transition-all hover:bg-[var(--ps-accent-soft)] hover:text-[color:var(--ps-accent)]"
            title="Edit Role Label/Description"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-2">
          {availableModules.map((mod) => {
            const tileState = getModuleState(state, mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => cycleModule(role, mod.id)}
                title={`${mod.label} — ${getAccessLevelLabel(mod.id, tileState)} (click to cycle)`}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                  tileState === 'write'
                    ? 'border-emerald-500/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-600/60'
                    : tileState === 'read'
                    ? 'border-blue-500/80 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-600/60'
                    : 'border-slate-200 bg-slate-50/50 text-slate-500 hover:border-slate-300 hover:bg-slate-100/80 dark:border-slate-600 dark:bg-slate-800/30 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="truncate">{mod.label}</span>
                {tileState === 'write' ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                ) : tileState === 'read' ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </SettingsSectionCard>
  );

  const CustomRoleCard = ({ role }: { role: Role }) => (
    <SettingsSectionCard title={role.name} className="relative flex flex-col group">
      <div className="-mt-2 mb-4 flex items-center justify-between gap-3 border-b pb-3" style={settingsLedgerBorder}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center border text-[color:var(--ps-accent)]"
          style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}
        >
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditingRole(role)}
            className="p-1.5 text-stone-400 transition-all hover:bg-[var(--ps-accent-soft)] hover:text-[color:var(--ps-accent)]"
            title="Edit Role"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => initiateDelete(role)}
            className="p-1.5 text-stone-400 transition-all hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
            title="Delete Role"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-2">
          {availableModules.map((mod) => {
            const tileState = getModuleState(role.activeModules || [], mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => cycleCustomRoleModule(role._id, mod.id)}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                  tileState === 'write'
                    ? 'border-emerald-500/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-600/60'
                    : tileState === 'read'
                    ? 'border-blue-500/80 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-600/60'
                    : 'border-slate-200 bg-slate-50/50 text-slate-500 hover:border-slate-300 hover:bg-slate-100/80 dark:border-slate-600 dark:bg-slate-800/30 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="truncate">{mod.label}</span>
                {tileState === 'write' ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                ) : tileState === 'read' ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </SettingsSectionCard>
  );

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        section="Feature Control"
        title="Permissions by role"
        subtitle="Control which modules each role can access. Most modules use Read/Write; Payslips uses Self, Scoped, and Release (per user)."
      />

      <div className="flex flex-wrap items-center gap-2">
        <SettingsOutlineButton onClick={loadSettings}>Reset</SettingsOutlineButton>
        <SettingsOutlineButton onClick={handleCreateRole}>
          {creatingRole ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          Create Role
        </SettingsOutlineButton>
      </div>

      <div className={`flex flex-col gap-2 text-xs ${settingsFieldHelpClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-600 dark:text-stone-300">Legend:</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-500 align-middle mr-1" />Off</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-blue-500 align-middle mr-1" />Read</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle mr-1" />Write</span>
          <span className="text-slate-400 dark:text-slate-500">— Click a tile to cycle.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-stone-500 dark:text-stone-400">
          <span className="font-medium text-stone-600 dark:text-stone-300">Payslips:</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-blue-500 align-middle mr-1" />Self</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle mr-1" />Scoped</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-teal-500 align-middle mr-1" />Release</span>
          <span className="text-slate-400">— Release is set per user under Users.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <RoleCard role="employee" title={roleMetadata.employee.name} icon={UserIcon} colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" state={featureControlEmployee} />
        <RoleCard role="manager" title={roleMetadata.manager.name} icon={UserCog} colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" state={featureControlManager} />
        <RoleCard role="hod" title={roleMetadata.hod.name} icon={Briefcase} colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" state={featureControlHOD} />
        <RoleCard role="hr" title={roleMetadata.hr.name} icon={Users} colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" state={featureControlHR} />
      </div>

      {customRoles.length > 0 ? (
        <SettingsSectionCard title="Dynamic Roles" description="Custom roles created for specific user permissions.">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {customRoles.map((role) => (
              <CustomRoleCard key={role._id} role={role} />
            ))}
          </div>
        </SettingsSectionCard>
      ) : (
        <div
          className="flex flex-col items-center border border-dashed p-12 text-center"
          style={settingsLedgerBorder}
        >
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center"
            style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }}
          >
            <Shield className="h-6 w-6" />
          </div>
          <h4 className="font-medium text-stone-900 dark:text-stone-100">No dynamic roles yet</h4>
          <p className={`mt-1 max-w-xs text-sm ${settingsFieldHelpClass}`}>
            Create custom roles to give grouped permissions to specific employees.
          </p>
          <button
            type="button"
            onClick={handleCreateRole}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--ps-accent)] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Create your first role
          </button>
        </div>
      )}

      <SettingsSaveBar onSave={handleSave} saving={saving} label="Save permissions" />

      <LoanDetailDialog open={showCreateModal} onClose={() => setShowCreateModal(false)} maxWidth="max-w-md" layerClass="z-[100]">
        <form onSubmit={handleConfirmCreateRole} className="flex min-h-0 flex-1 flex-col">
          <LoanDetailDialogHeader
            badge="Role"
            title="Create new role"
            subtitle="Define name and description for a custom permission group"
            onClose={() => setShowCreateModal(false)}
          />
          <LoanDetailDialogBody>
            <div className="space-y-4">
              <div>
                <LoanFormLabel>Role name</LoanFormLabel>
                <input
                  type="text"
                  value={newRoleData.name}
                  onChange={(e) => setNewRoleData({ ...newRoleData, name: e.target.value })}
                  placeholder="e.g. Specialized Auditor"
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  required
                />
              </div>
              <div>
                <LoanFormLabel>Description (optional)</LoanFormLabel>
                <textarea
                  value={newRoleData.description}
                  onChange={(e) => setNewRoleData({ ...newRoleData, description: e.target.value })}
                  placeholder="Describe the responsibilities of this role..."
                  className={`${settingsInputClass()} min-h-[100px]`}
                  style={settingsInputStyle()}
                />
              </div>
            </div>
          </LoanDetailDialogBody>
          <LoanDialogFooter
            onCancel={() => setShowCreateModal(false)}
            submitLabel="Create role"
            loading={creatingRole}
          />
        </form>
      </LoanDetailDialog>

      <LoanDetailDialog open={!!editingRole} onClose={() => setEditingRole(null)} maxWidth="max-w-md" layerClass="z-[100]">
        <form onSubmit={handleUpdateRoleDetails} className="flex min-h-0 flex-1 flex-col">
          <LoanDetailDialogHeader
            badge="Role"
            title="Edit role details"
            subtitle="Update display name and description"
            onClose={() => setEditingRole(null)}
          />
          <LoanDetailDialogBody>
            {editingRole ? (
              <div className="space-y-4">
                <div>
                  <LoanFormLabel>Role name</LoanFormLabel>
                  <input
                    type="text"
                    value={editingRole.name}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    required
                  />
                </div>
                <div>
                  <LoanFormLabel>Description (optional)</LoanFormLabel>
                  <textarea
                    value={editingRole.description || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                    className={`${settingsInputClass()} min-h-[100px]`}
                    style={settingsInputStyle()}
                  />
                </div>
              </div>
            ) : null}
          </LoanDetailDialogBody>
          <LoanDialogFooter
            onCancel={() => setEditingRole(null)}
            submitLabel="Save changes"
            loading={saving}
          />
        </form>
      </LoanDetailDialog>

      <LoanDetailDialog open={!!deletingRole} onClose={() => setDeletingRole(null)} maxWidth="max-w-lg" layerClass="z-[100]">
        <LoanDetailDialogHeader
          badge="Role"
          title="Delete role?"
          subtitle={deletingRole ? `Remove "${deletingRole.name}" and its permissions` : undefined}
          onClose={() => setDeletingRole(null)}
        />
        <LoanDetailDialogBody>
          {deletingRole ? (
            <div className="space-y-4">
              <p className={`text-sm ${settingsFieldHelpClass}`}>This action cannot be undone.</p>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className={settingsSectionTitleClass}>Linked employees</h4>
                  <span
                    className="px-2 py-0.5 text-[10px] font-bold"
                    style={
                      assignedUsers.length > 0
                        ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent-ink)' }
                        : undefined
                    }
                  >
                    {loadingUsers ? 'Checking...' : `${assignedUsers.length} users affected`}
                  </span>
                </div>
                {loadingUsers ? (
                  <div className="flex justify-center py-8">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : assignedUsers.length > 0 ? (
                  <div className="max-h-[200px] divide-y overflow-y-auto border" style={settingsLedgerBorder}>
                    {assignedUsers.map((u) => (
                      <div key={u._id} className="flex items-center justify-between p-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{u.name}</p>
                          <p className="text-[10px] lowercase text-stone-400">{u.email}</p>
                        </div>
                        <span className="bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 dark:bg-stone-900">
                          {u.employeeId}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed py-6 text-center" style={settingsLedgerBorder}>
                    <CheckCircle className="mx-auto mb-2 h-5 w-5 text-emerald-500" />
                    <p className={`text-xs ${settingsFieldHelpClass}`}>No users are currently assigned to this role.</p>
                  </div>
                )}
              </div>
              {assignedUsers.length > 0 ? (
                <div className="flex gap-3 border p-3" style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}>
                  <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-[11px] font-medium leading-normal text-amber-800 dark:text-amber-300">
                    Deleting this role removes associated permissions; users fall back to default system role permissions.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </LoanDetailDialogBody>
        <div className="flex gap-3 border-t px-5 py-4 sm:px-6" style={settingsLedgerBorder}>
          <button type="button" onClick={() => setDeletingRole(null)} className={`flex-1 ${settingsOutlineButtonClass()}`} style={settingsOutlineButtonStyle()}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={saving || (assignedUsers.length > 0 && !!deletingRole?.isSystemRole)}
            className={`flex-1 ${loansDialogDangerButtonClass()}`}
          >
            {saving ? <Spinner className="h-4 w-4" /> : 'Yes, delete role'}
          </button>
        </div>
      </LoanDetailDialog>
    </SettingsPanel>
  );
};

export default FeatureControlSettings;
