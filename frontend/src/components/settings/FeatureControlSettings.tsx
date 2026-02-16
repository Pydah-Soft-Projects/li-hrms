'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, LayoutGrid, User, Users, Briefcase, ChevronRight } from 'lucide-react';

const availableModules = [
    { id: 'DASHBOARD', label: 'Dashboard' },
    { id: 'PROFILE', label: 'My Profile' },
    { id: 'EMPLOYEES', label: 'Employees' },
    { id: 'ATTENDANCE', label: 'Attendance' },
    { id: 'LEAVE_OD', label: 'Leave & OD' },
    { id: 'OT_PERMISSIONS', label: 'OT & Permissions' },
    { id: 'SHIFTS', label: 'Shifts' },
    { id: 'DEPARTMENTS', label: 'Departments/Nodes' },
    { id: 'PAYSLIPS', label: 'Payslips' },
    { id: 'PAY_REGISTER', label: 'Payroll Register' },
    { id: 'ALLOWANCES_DEDUCTIONS', label: 'Allowance/Deduction' },
    { id: 'CCL', label: 'CCL Management' },
    { id: 'HOLIDAY_CALENDAR', label: 'Holiday Calendar' },
    { id: 'SETTINGS', label: 'System Settings' },
];

const FeatureControlSettings = () => {
    const [featureControlEmployee, setFeatureControlEmployee] = useState<string[]>([]);
    const [featureControlHOD, setFeatureControlHOD] = useState<string[]>([]);
    const [featureControlHR, setFeatureControlHR] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const [resEmp, resHOD, resHR] = await Promise.all([
                api.getSetting('feature_control_employee'),
                api.getSetting('feature_control_hod'),
                api.getSetting('feature_control_hr'),
            ]);

            if (resEmp.success && resEmp.data?.value?.activeModules) setFeatureControlEmployee(resEmp.data.value.activeModules);
            if (resHOD.success && resHOD.data?.value?.activeModules) setFeatureControlHOD(resHOD.data.value.activeModules);
            if (resHR.success && resHR.data?.value?.activeModules) setFeatureControlHR(resHR.data.value.activeModules);
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
                api.upsertSetting({ key: 'feature_control_employee', value: { activeModules: featureControlEmployee }, category: 'feature_control' }),
                api.upsertSetting({ key: 'feature_control_hod', value: { activeModules: featureControlHOD }, category: 'feature_control' }),
                api.upsertSetting({ key: 'feature_control_hr', value: { activeModules: featureControlHR }, category: 'feature_control' }),
            ]);
            toast.success('Feature control settings saved successfully');
        } catch (err) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const toggleModule = (role: 'employee' | 'hod' | 'hr', moduleId: string) => {
        const setters = {
            employee: [featureControlEmployee, setFeatureControlEmployee],
            hod: [featureControlHOD, setFeatureControlHOD],
            hr: [featureControlHR, setFeatureControlHR],
        };
        const [current, setter] = setters[role] as [string[], any];
        if (current.includes(moduleId)) {
            setter(current.filter(id => id !== moduleId));
        } else {
            setter([...current, moduleId]);
        }
    };

    if (loading) return <SettingsSkeleton />;

    const RoleCard = ({ role, title, icon: Icon, colorClass, state }: any) => (
        <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">{title}</h3>
            </div>

            <div className="p-6 flex-1 bg-gray-50/30 dark:bg-black/10">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Enabled Modules</p>
                <div className="grid grid-cols-2 gap-2">
                    {availableModules.map((mod) => (
                        <button
                            key={mod.id}
                            onClick={() => toggleModule(role, mod.id)}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[11px] font-bold transition-all ${state.includes(mod.id)
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 shadow-sm shadow-indigo-500/10'
                                : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200 dark:border-gray-700 dark:bg-[#0F172A] dark:hover:border-gray-600'
                                }`}
                        >
                            <span>{mod.label}</span>
                            {state.includes(mod.id) ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
                            ) : (
                                <div className="h-1.5 w-1.5 rounded-full bg-gray-200 dark:bg-gray-800" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600">Permissions</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Feature Control</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure module visibility and access for different system roles.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={loadSettings}
                        className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        Reset
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:opacity-50 transform active:scale-95"
                    >
                        {saving ? <Spinner className="h-3 w-3" /> : <Save className="h-3.5 w-3.5" />}
                        Save Changes
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <RoleCard
                    role="employee"
                    title="Employee"
                    icon={User}
                    colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    state={featureControlEmployee}
                />
                <RoleCard
                    role="hod"
                    title="Head of Department"
                    icon={Briefcase}
                    colorClass="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                    state={featureControlHOD}
                />
                <RoleCard
                    role="hr"
                    title="Human Resources"
                    icon={Users}
                    colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                    state={featureControlHR}
                />
            </div>
        </div>
    );
};

export default FeatureControlSettings;
