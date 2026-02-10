'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Calculator, ChevronRight } from 'lucide-react';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import { useCallback } from 'react';

const PermissionsSettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rules, setRules] = useState({
        countThreshold: null as number | null,
        deductionType: null as 'half_day' | 'full_day' | 'custom_amount' | null,
        deductionAmount: null as number | null,
        minimumDuration: null as number | null,
        calculationMode: null as 'proportional' | 'floor' | null,
    });
    const [workflow, setWorkflow] = useState<WorkflowData>({
        isEnabled: true,
        steps: [],
        finalAuthority: { role: 'admin', anyHRCanApprove: false },
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.getPermissionDeductionSettings();
            if (res.success && res.data) {
                if (res.data.deductionRules) setRules(res.data.deductionRules);
                if (res.data.workflow) setWorkflow(res.data.workflow);
            }
        } catch (err) {
            console.error('Failed to load settings', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSaveRules = async () => {
        try {
            setSaving(true);
            await api.savePermissionDeductionSettings({
                deductionRules: rules,
                workflow: { ...workflow, isEnabled: true },
            });
            toast.success('Deduction rules saved');
        } catch {
            toast.error('Failed to save rules');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveWorkflow = async () => {
        try {
            setSaving(true);
            await api.savePermissionDeductionSettings({
                deductionRules: rules,
                workflow: { ...workflow, isEnabled: true },
            });
            toast.success('Gate protocol saved');
        } catch {
            toast.error('Failed to save protocol');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <SettingsSkeleton />;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600">Permissions</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Short-Term Absence</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure automated deduction logic and approval gates for short leave (Permissions).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                {/* Deduction Rules */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/10 flex items-center gap-3 sm:gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50">
                            <Calculator className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Deduction Logic</h3>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">Automated payroll adjustments</p>
                        </div>
                    </div>

                    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 flex-1">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Threshold (Count)</label>
                                <input
                                    type="number"
                                    value={rules.countThreshold || ''}
                                    onChange={(e) => setRules({ ...rules, countThreshold: parseInt(e.target.value) })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold"
                                    placeholder="e.g. 3"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Min. Duration (Hrs)</label>
                                <input
                                    type="number"
                                    value={rules.minimumDuration || ''}
                                    onChange={(e) => setRules({ ...rules, minimumDuration: parseFloat(e.target.value) })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold"
                                    placeholder="e.g. 0.5"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Deduction Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['half_day', 'full_day'].map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setRules({ ...rules, deductionType: type as 'half_day' | 'full_day' })}
                                        className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-all border ${rules.deductionType === type
                                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                                            : 'bg-white dark:bg-black/20 border-gray-100 dark:border-gray-800 text-gray-400 hover:border-emerald-500/30'
                                            }`}
                                    >
                                        {type.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleSaveRules}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white py-4 text-xs font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 disabled:opacity-50 mt-auto"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Commit Logic Parameters
                        </button>
                    </div>
                </section>

                {/* Workflow section */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 flex-1">
                        <WorkflowManager
                            workflow={workflow}
                            onChange={(newWorkflow: WorkflowData) => setWorkflow(newWorkflow)}
                            title="Multi-Level Approval"
                            description="Workflow Engine for short-term absence."
                            addStepLabel="Append Authorization Level"
                        />

                        <button
                            onClick={handleSaveWorkflow}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white py-4 text-xs font-bold hover:bg-purple-700 transition-all shadow-xl shadow-purple-500/20 active:scale-95 disabled:opacity-50 mt-auto"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Commit Authorization Chain
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PermissionsSettings;
