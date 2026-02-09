'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Clock, Percent, ShieldCheck, Plus, Trash2 } from 'lucide-react';

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

const OTSettings = () => {
    const [otSettings, setOTSettings] = useState({
        otPayPerHour: 0,
        minOTHours: 0,
        workflow: {
            isEnabled: false,
            steps: [] as WorkflowStep[],
            finalAuthority: { role: 'manager', anyHRCanApprove: false }
        }
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getOvertimeSettings();
            if (res.success && res.data) {
                setOTSettings({
                    otPayPerHour: res.data.payPerHour || 0,
                    minOTHours: res.data.minOTHours || 0,
                    workflow: res.data.workflow || { isEnabled: false, steps: [], finalAuthority: { role: 'manager', anyHRCanApprove: false } },
                });
            }
        } catch (err) {
            console.error('Error loading OT settings:', err);
            toast.error('Failed to load OT settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSaveGeneral = async () => {
        try {
            setSaving(true);
            const res = await api.saveOvertimeSettings({
                otPayPerHour: otSettings.otPayPerHour,
                minOTHours: otSettings.minOTHours,
            });
            if (res.success) toast.success('General OT settings saved');
            else toast.error(res.message || 'Failed to save');
        } catch (err) {
            toast.error('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveWorkflow = async () => {
        try {
            setSaving(true);
            const res = await api.saveOvertimeSettings({
                workflow: otSettings.workflow,
            });
            if (res.success) toast.success('OT workflow saved successfully');
            else toast.error(res.message || 'Failed to save');
        } catch (err) {
            toast.error('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Overtime (OT) Configuration</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Define OT pay rates and approval workflows.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* General OT Rules */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-6">
                            <Clock className="h-4 w-4 text-indigo-500" />
                            General Rules
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">OT Pay per Hour</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                                        <Percent className="h-4 w-4" />
                                    </div>
                                    <input
                                        type="number"
                                        value={otSettings.otPayPerHour}
                                        onChange={(e) => setOTSettings({ ...otSettings, otPayPerHour: Number(e.target.value) })}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Minimum OT Minutes</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                                        <Clock className="h-4 w-4" />
                                    </div>
                                    <input
                                        type="number"
                                        value={otSettings.minOTHours}
                                        onChange={(e) => setOTSettings({ ...otSettings, minOTHours: Number(e.target.value) })}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                    />
                                </div>
                                <p className="mt-1 text-[10px] text-gray-500">OT below this duration will not be recorded.</p>
                            </div>
                            <button
                                onClick={handleSaveGeneral}
                                disabled={saving}
                                className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
                            >
                                {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                                Update Rates
                            </button>
                        </div>
                    </div>
                </div>

                {/* OT Workflow */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                Approval Workflow
                            </h3>
                            <div className="flex items-center gap-4">
                                <span className="text-xs text-gray-500">Enable Workflow</span>
                                <button
                                    onClick={() => setOTSettings({ ...otSettings, workflow: { ...otSettings.workflow, isEnabled: !otSettings.workflow.isEnabled } })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${otSettings.workflow.isEnabled ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${otSettings.workflow.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>

                        {otSettings.workflow.isEnabled && (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                <div className="space-y-4">
                                    {otSettings.workflow.steps.map((step, idx) => (
                                        <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                                                {step.stepOrder}
                                            </div>
                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                <input
                                                    type="text"
                                                    placeholder="Step Name"
                                                    value={step.stepName}
                                                    onChange={(e) => {
                                                        const newSteps = [...otSettings.workflow.steps];
                                                        newSteps[idx].stepName = e.target.value;
                                                        setOTSettings({ ...otSettings, workflow: { ...otSettings.workflow, steps: newSteps } });
                                                    }}
                                                    className="bg-transparent border-b border-gray-200 focus:border-indigo-500 text-sm py-1 outline-none dark:border-gray-700 dark:text-white"
                                                />
                                                <select
                                                    value={step.approverRole}
                                                    onChange={(e) => {
                                                        const newSteps = [...otSettings.workflow.steps];
                                                        newSteps[idx].approverRole = e.target.value;
                                                        setOTSettings({ ...otSettings, workflow: { ...otSettings.workflow, steps: newSteps } });
                                                    }}
                                                    className="bg-transparent border-b border-gray-200 focus:border-indigo-500 text-xs py-1 outline-none dark:border-gray-700 dark:text-white"
                                                >
                                                    <option value="manager">Reporting Manager</option>
                                                    <option value="hod">Department Head (HOD)</option>
                                                    <option value="hr">Human Resources (HR)</option>
                                                    <option value="super_admin">Superadmin</option>
                                                </select>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newSteps = otSettings.workflow.steps.filter((_, i) => i !== idx);
                                                    setOTSettings({ ...otSettings, workflow: { ...otSettings.workflow, steps: newSteps.map((s, i) => ({ ...s, stepOrder: i + 1 })) } });
                                                }}
                                                className="text-red-400 hover:text-red-600 transition"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => {
                                            const nextOrder = otSettings.workflow.steps.length + 1;
                                            const newStep = { stepOrder: nextOrder, stepName: `Level ${nextOrder}`, approverRole: 'manager', availableActions: ['approve', 'reject'], approvedStatus: 'pending', rejectedStatus: 'rejected', nextStepOnApprove: null, isActive: true };
                                            setOTSettings({ ...otSettings, workflow: { ...otSettings.workflow, steps: [...otSettings.workflow.steps, newStep] } });
                                        }}
                                        className="flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 py-2"
                                    >
                                        <Plus className="h-4 w-4" /> Add Approval Level
                                    </button>
                                </div>

                                <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                                    <button
                                        onClick={handleSaveWorkflow}
                                        className="px-8 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition"
                                    >
                                        Save Workflow Configuration
                                    </button>
                                </div>
                            </div>
                        )}
                        {!otSettings.workflow.isEnabled && (
                            <div className="py-20 text-center">
                                <p className="text-gray-400 text-sm">Enable workflow to configure multi-level OT approvals.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OTSettings;
