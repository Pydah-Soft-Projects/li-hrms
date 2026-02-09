'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Banknote, ShieldCheck, Globe, Users, Plus, Trash2, Coins } from 'lucide-react';

const LoanSettings = ({ type = 'loan' }: { type?: 'loan' | 'salary_advance' }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [subTab, setSubTab] = useState<'general' | 'workflow' | 'workspacePermissions'>('general');
    const [workspaces, setWorkspaces] = useState<any[]>([]);
    const [generalSettings, setGeneralSettings] = useState({
        minAmount: 1000,
        maxAmount: null as number | null,
        minDuration: 1,
        maxDuration: 60,
        interestRate: 0,
        isInterestApplicable: false,
        maxActivePerEmployee: 1,
        minServicePeriod: 0,
        considerAttendance: true,
    });
    const [workflow, setWorkflow] = useState({
        isEnabled: false,
        steps: [] as any[],
        finalAuthority: { role: 'manager', anyHRCanApprove: false }
    });
    const [workspacePermissions, setWorkspacePermissions] = useState<Record<string, any>>({});

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getLoanSettings(type);
            if (res.success && res.data) {
                setGeneralSettings(res.data.general || generalSettings);
                setWorkflow(res.data.workflow || workflow);
                setWorkspacePermissions(res.data.workspacePermissions || {});
            }

            const wsRes = await api.getWorkspaces();
            if (wsRes.success) setWorkspaces(wsRes.data || []);
        } catch (err) {
            console.error(`Error loading ${type} settings:`, err);
            toast.error(`Failed to load ${type} settings`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, [type]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await api.updateLoanSettings(type, {
                general: generalSettings,
                workflow,
                workspacePermissions,
            });
            if (res.success) toast.success(`${type === 'loan' ? 'Loan' : 'Salary Advance'} settings saved`);
            else toast.error(res.message || 'Failed to save settings');
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
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white capitalize">{type.replace('_', ' ')} Settings</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Manage limits, workflows, and permissions for {type.replace('_', ' ')} requests.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                    {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                    Save {type === 'loan' ? 'Loan' : 'Advance'} Config
                </button>
            </div>

            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
                {[
                    { id: 'general' as const, label: 'Policy', icon: Banknote },
                    { id: 'workflow' as const, label: 'Approval Flow', icon: ShieldCheck },
                    { id: 'workspacePermissions' as const, label: 'Workspace Access', icon: Globe }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setSubTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${subTab === tab.id ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        <tab.icon className="h-3.5 w-3.5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {subTab === 'general' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Amount Limits</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Minimum Amount</label>
                                    <input
                                        type="number"
                                        value={generalSettings.minAmount}
                                        onChange={(e) => setGeneralSettings({ ...generalSettings, minAmount: Number(e.target.value) })}
                                        className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Maximum Amount (optional)</label>
                                    <input
                                        type="number"
                                        value={generalSettings.maxAmount || ''}
                                        onChange={(e) => setGeneralSettings({ ...generalSettings, maxAmount: e.target.value ? Number(e.target.value) : null })}
                                        className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Duration & Interest</h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Min Months</label>
                                        <input type="number" value={generalSettings.minDuration} onChange={(e) => setGeneralSettings({ ...generalSettings, minDuration: Number(e.target.value) })} className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Max Months</label>
                                        <input type="number" value={generalSettings.maxDuration} onChange={(e) => setGeneralSettings({ ...generalSettings, maxDuration: Number(e.target.value) })} className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={generalSettings.isInterestApplicable} onChange={(e) => setGeneralSettings({ ...generalSettings, isInterestApplicable: e.target.checked })} className="rounded dark:bg-gray-900 border-gray-300 text-indigo-600" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Apply Interest</span>
                                    </label>
                                    {generalSettings.isInterestApplicable && (
                                        <input type="number" placeholder="Rate %" value={generalSettings.interestRate} onChange={(e) => setGeneralSettings({ ...generalSettings, interestRate: Number(e.target.value) })} className="w-full mt-2 bg-indigo-50/50 dark:bg-indigo-900/20 border-none rounded-xl px-4 py-2 text-sm" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Eligibility</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min Service (Months)</label>
                                    <input type="number" value={generalSettings.minServicePeriod} onChange={(e) => setGeneralSettings({ ...generalSettings, minServicePeriod: Number(e.target.value) })} className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-sm" />
                                </div>
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Check Attendance</span>
                                    <button onClick={() => setGeneralSettings({ ...generalSettings, considerAttendance: !generalSettings.considerAttendance })} className={`w-10 h-5 rounded-full transition-colors ${generalSettings.considerAttendance ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                        <div className={`h-4 w-4 bg-white rounded-full transition-transform ${generalSettings.considerAttendance ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {subTab === 'workflow' && (
                    <div className="p-8 rounded-3xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Multi-Level Approval Flow</h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400">Enabled</span>
                                <button
                                    onClick={() => setWorkflow({ ...workflow, isEnabled: !workflow.isEnabled })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${workflow.isEnabled ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${workflow.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>

                        {workflow.isEnabled ? (
                            <div className="space-y-4">
                                {workflow.steps.map((step, idx) => (
                                    <div key={idx} className="flex items-center gap-6 p-5 rounded-2xl bg-white border border-gray-100 dark:bg-gray-900 dark:border-gray-700 shadow-sm">
                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 font-bold">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-8">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase font-bold">Step Label</label>
                                                <input type="text" value={step.stepName} onChange={(e) => {
                                                    const steps = [...workflow.steps];
                                                    steps[idx].stepName = e.target.value;
                                                    setWorkflow({ ...workflow, steps });
                                                }} className="w-full bg-transparent border-b border-gray-100 dark:border-gray-800 py-1 text-sm outline-none" placeholder="e.g. HR Review" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase font-bold">Approver Role</label>
                                                <select value={step.approverRole} onChange={(e) => {
                                                    const steps = [...workflow.steps];
                                                    steps[idx].approverRole = e.target.value;
                                                    setWorkflow({ ...workflow, steps });
                                                }} className="w-full bg-transparent border-b border-gray-100 dark:border-gray-800 py-1 text-sm outline-none">
                                                    <option value="manager">Manager</option>
                                                    <option value="hod">HOD</option>
                                                    <option value="hr">HR</option>
                                                </select>
                                            </div>
                                        </div>
                                        <button onClick={() => setWorkflow({ ...workflow, steps: workflow.steps.filter((_, i) => i !== idx) })} className="p-2 text-red-200 hover:text-red-500 transition">
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setWorkflow({ ...workflow, steps: [...workflow.steps, { stepOrder: workflow.steps.length + 1, stepName: '', approverRole: 'manager', isActive: true }] })}
                                    className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 p-4 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl w-full justify-center"
                                >
                                    <Plus className="h-4 w-4" /> Add Next Approval Step
                                </button>
                            </div>
                        ) : (
                            <div className="py-12 text-center text-gray-400 flex flex-col items-center">
                                <ShieldCheck className="h-12 w-12 mb-3 opacity-10" />
                                <p className="text-sm">Workflow is currently disabled. All requests will be auto-approved.</p>
                            </div>
                        )}
                    </div>
                )}

                {subTab === 'workspacePermissions' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-300">
                        {workspaces.map((ws) => (
                            <div key={ws._id} className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-sm font-bold">
                                        {ws.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white max-w-[150px] truncate">{ws.name}</h4>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">ID: {ws.code || ws._id.slice(-6)}</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Self Apply</span>
                                        <button
                                            onClick={() => {
                                                const next = { ...workspacePermissions };
                                                next[ws._id] = { ...next[ws._id], canApplyForSelf: !next[ws._id]?.canApplyForSelf };
                                                setWorkspacePermissions(next);
                                            }}
                                            className={`w-8 h-4 rounded-full ${workspacePermissions[ws._id]?.canApplyForSelf ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                        >
                                            <div className={`h-3 w-3 bg-white rounded-full transition-transform ${workspacePermissions[ws._id]?.canApplyForSelf ? 'translate-x-4' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">On Behalf</span>
                                        <button
                                            onClick={() => {
                                                const next = { ...workspacePermissions };
                                                next[ws._id] = { ...next[ws._id], canApplyForOthers: !next[ws._id]?.canApplyForOthers };
                                                setWorkspacePermissions(next);
                                            }}
                                            className={`w-8 h-4 rounded-full ${workspacePermissions[ws._id]?.canApplyForOthers ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                        >
                                            <div className={`h-3 w-3 bg-white rounded-full transition-transform ${workspacePermissions[ws._id]?.canApplyForOthers ? 'translate-x-4' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoanSettings;
