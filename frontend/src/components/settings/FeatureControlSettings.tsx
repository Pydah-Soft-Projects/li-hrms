'use client';

import React, { useState, useEffect } from 'react';
import { api, Role, User } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, User as UserIcon, Users, Briefcase, ChevronRight, UserCog, Edit, Plus, Trash2, Shield, Info, X, CheckCircle, ShieldAlert } from 'lucide-react';

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
    <section className="bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col group">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditingRole({ 
              _id: role, 
              name: roleMetadata[role].name, 
              description: roleMetadata[role].description, 
              activeModules: state,
              isSystemRole: true 
            } as any)}
            className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-all"
            title="Edit Role Label/Description"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1">
        <div className="grid grid-cols-2 gap-2">
          {availableModules.map((mod) => {
            const tileState = getModuleState(state, mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => cycleModule(role, mod.id)}
                title={`${mod.label} — ${tileState === 'disabled' ? 'Off' : tileState === 'read' ? 'Read' : 'Write'} (click to cycle)`}
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
    </section>
  );

  const CustomRoleCard = ({ role }: { role: Role }) => (
    <section className="bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col group relative">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <Shield className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[150px]">{role.name}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditingRole(role)}
            className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-all"
            title="Edit Role"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => initiateDelete(role)}
            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-md transition-all"
            title="Delete Role"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1">
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
    </section>
  );

  return (
    <div className="w-full max-w-[1600px] space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Settings</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">Feature Control</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Permissions by role</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Control which modules each role can see and whether they have read or write access.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={loadSettings}
            className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleCreateRole}
            disabled={creatingRole}
            className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            {creatingRole ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create Role
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-600 dark:text-slate-300">Legend:</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-500 align-middle mr-1" />Off</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-blue-500 align-middle mr-1" />Read</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle mr-1" />Write</span>
        <span className="text-slate-400 dark:text-slate-500">— Click a tile to cycle.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <RoleCard role="employee" title={roleMetadata.employee.name} icon={UserIcon} colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" state={featureControlEmployee} />
        <RoleCard role="manager" title={roleMetadata.manager.name} icon={UserCog} colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" state={featureControlManager} />
        <RoleCard role="hod" title={roleMetadata.hod.name} icon={Briefcase} colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" state={featureControlHOD} />
        <RoleCard role="hr" title={roleMetadata.hr.name} icon={Users} colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" state={featureControlHR} />
      </div>

      {(customRoles.length > 0) && (
        <div className="space-y-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-md font-semibold text-slate-900 dark:text-white">Dynamic Roles</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Custom roles created for specific user permissions.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {customRoles.map((role) => (
              <CustomRoleCard key={role._id} role={role} />
            ))}
          </div>
        </div>
      )}

      {customRoles.length === 0 && (
          <div className="mt-8 p-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-slate-400" />
              </div>
              <h4 className="text-slate-900 dark:text-white font-medium">No dynamic roles yet</h4>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mt-1">Create custom roles to give grouped permissions to specific employees.</p>
              <button
                  type="button"
                  onClick={handleCreateRole}
                  className="mt-4 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:underline flex items-center gap-1"
              >
                  <Plus className="h-3.5 w-3.5" />
                  Create your first role
              </button>
          </div>
      )}

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden scale-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create New Role</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleConfirmCreateRole} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Role Name</label>
                <input 
                  type="text" 
                  value={newRoleData.name} 
                  onChange={e => setNewRoleData({...newRoleData, name: e.target.value})}
                  placeholder="e.g. Specialized Auditor"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Description (Optional)</label>
                <textarea 
                  value={newRoleData.description} 
                  onChange={e => setNewRoleData({...newRoleData, description: e.target.value})}
                  placeholder="Describe the responsibilities of this role..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={creatingRole} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 disabled:opacity-50">
                  {creatingRole ? <Spinner className="h-4 w-4 mx-auto" /> : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden scale-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Role Details</h3>
              <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleUpdateRoleDetails} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Role Name</label>
                <input 
                  type="text" 
                  value={editingRole.name} 
                  onChange={e => setEditingRole({...editingRole, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">Description (Optional)</label>
                <textarea 
                  value={editingRole.description || ''} 
                  onChange={e => setEditingRole({...editingRole, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingRole(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 disabled:opacity-50">
                  {saving ? <Spinner className="h-4 w-4 mx-auto" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Role Modal (Impact Analysis) */}
      {deletingRole && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden scale-in duration-200">
            <div className="p-6 text-center">
              <div className="h-14 w-14 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Delete Role?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">"{deletingRole.name}"</span>? 
                This action cannot be undone.
              </p>

              <div className="mt-6 text-left">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Linked Employees</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${assignedUsers.length > 0 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                    {loadingUsers ? 'Checking...' : `${assignedUsers.length} Users Affected`}
                  </span>
                </div>

                {loadingUsers ? (
                  <div className="py-8 flex justify-center"><Spinner className="h-6 w-6" /></div>
                ) : assignedUsers.length > 0 ? (
                  <div className="max-h-[200px] overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800">
                    {assignedUsers.map(u => (
                      <div key={u._id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{u.name}</p>
                          <p className="text-[10px] text-slate-400 lowercase">{u.email}</p>
                        </div>
                        <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">{u.employeeId}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                    <CheckCircle className="h-5 w-5 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No users are currently assigned to this role.</p>
                  </div>
                )}
              </div>

              {assignedUsers.length > 0 && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl flex gap-3 text-left">
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-normal font-medium">
                    Note: Deleting this role will remove all associated permissions from these users. They will fall back to their default system role permissions.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button onClick={() => setDeletingRole(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800">Cancel</button>
              <button 
                onClick={handleConfirmDelete} 
                disabled={saving || (assignedUsers.length > 0 && deletingRole.isSystemRole)} 
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 shadow-lg shadow-rose-600/20 disabled:opacity-50"
              >
                {saving ? <Spinner className="h-4 w-4 mx-auto" /> : 'Yes, Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatureControlSettings;
