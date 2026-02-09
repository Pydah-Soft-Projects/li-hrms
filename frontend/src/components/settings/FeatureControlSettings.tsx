'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, LayoutGrid, User, Users, Briefcase } from 'lucide-react';

const availableModules = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'employees', label: 'Employees' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leaves', label: 'Leaves' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'loans', label: 'Loans' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
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

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    const RoleCard = ({ role, title, icon: Icon, colorClass, state }: any) => (
        <div className={`p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50`}>
            <div className="flex items-center gap-3 mb-6">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{title}</h3>
                    <p className="text-xs text-gray-500">Enabled modules for this role.</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {availableModules.map((mod) => (
                    <button
                        key={mod.id}
                        onClick={() => toggleModule(role, mod.id)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${state.includes(mod.id)
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                                : 'border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200 dark:border-gray-700 dark:bg-gray-900/30'
                            }`}
                    >
                        {mod.label}
                        {state.includes(mod.id) && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Feature Control</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure module visibility and access for different system roles.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                    {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                    Save Changes
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <RoleCard
                    role="employee"
                    title="Employee"
                    icon={User}
                    colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                    state={featureControlEmployee}
                />
                <RoleCard
                    role="hod"
                    title="Head of Department"
                    icon={Briefcase}
                    colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"
                    state={featureControlHOD}
                />
                <RoleCard
                    role="hr"
                    title="Human Resources"
                    icon={Users}
                    colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                    state={featureControlHR}
                />
            </div>
        </div>
    );
};

export default FeatureControlSettings;
