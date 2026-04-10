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
        freeAllowedPerMonth: null as number | null,
        countThreshold: null as number | null,
        deductionType: null as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' | null,
        deductionDays: null as number | null,
        deductionAmount: null as number | null,
        minimumDuration: null as number | null,
        calculationMode: null as 'proportional' | 'floor' | null,
    });
    const [workflow, setWorkflow] = useState<WorkflowData>({
        isEnabled: true,
        steps: [],
        finalAuthority: { role: 'admin', anyHRCanApprove: false },
    });
    const [datePolicy, setDatePolicy] = useState({
        allowBackdated: false,
        maxBackdatedDays: 0,
        allowFutureDated: true,
        maxAdvanceDays: 365,
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.getPermissionDeductionSettings();
            if (res.success && res.data) {
                if (res.data.deductionRules) setRules(res.data.deductionRules);
                if (res.data.workflow) setWorkflow(res.data.workflow);
                setDatePolicy({
                    allowBackdated: Boolean(res.data.allowBackdated),
                    maxBackdatedDays: Number(res.data.maxBackdatedDays ?? 0),
                    allowFutureDated: res.data.allowFutureDated !== false,
                    maxAdvanceDays: Number(res.data.maxAdvanceDays ?? 365),
                });
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
                ...datePolicy,
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
                ...datePolicy,
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

            <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6 items-start">
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

                    <div className="p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5 flex-1">
                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Free Allowed (Monthly)</label>
                            <input
                                type="number"
                                min={0}
                                value={rules.freeAllowedPerMonth ?? ''}
                                onChange={(e) => setRules({ ...rules, freeAllowedPerMonth: e.target.value !== '' ? Number(e.target.value) : null })}
                                className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold"
                                placeholder="e.g. 3"
                            />
                            <p className="text-[10px] text-gray-500">First N permissions per month are free; only count above this is used for deduction.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Every N (Above Free) = 1 Unit</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={rules.countThreshold ?? ''}
                                    onChange={(e) => setRules({ ...rules, countThreshold: e.target.value !== '' ? parseInt(e.target.value, 10) : null })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold"
                                    placeholder="e.g. 3"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Min. Duration (Minutes)</label>
                                <input
                                    type="number"
                                    value={rules.minimumDuration ?? ''}
                                    onChange={(e) => setRules({ ...rules, minimumDuration: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold"
                                    placeholder="e.g. 30"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Calculation Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'floor', label: 'Floor (full units only)' },
                                    { id: 'proportional', label: 'Proportional (partial allowed)' },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setRules({ ...rules, calculationMode: mode.id as 'floor' | 'proportional' })}
                                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all border ${rules.calculationMode === mode.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white dark:bg-black/20 border-gray-100 dark:border-gray-800 text-gray-400 hover:border-emerald-500/30'}`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Apply Date Window</p>
                            <label className="flex items-center justify-between text-[12px] text-gray-600 dark:text-gray-300">
                                <span>Allow backdated</span>
                                <input
                                    type="checkbox"
                                    checked={datePolicy.allowBackdated}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, allowBackdated: e.target.checked }))}
                                />
                            </label>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Max backdated days</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={datePolicy.maxBackdatedDays}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, maxBackdatedDays: Number(e.target.value || 0) }))}
                                    className="w-28 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2 text-sm font-bold text-right"
                                />
                            </div>
                            <label className="flex items-center justify-between text-[12px] text-gray-600 dark:text-gray-300">
                                <span>Allow future-dated</span>
                                <input
                                    type="checkbox"
                                    checked={datePolicy.allowFutureDated}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, allowFutureDated: e.target.checked }))}
                                />
                            </label>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Max advance days</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={datePolicy.maxAdvanceDays}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, maxAdvanceDays: Number(e.target.value || 0) }))}
                                    className="w-28 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2 text-sm font-bold text-right"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Deduction Mode</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { id: 'half_day', label: '0.5 Day' },
                                    { id: 'full_day', label: '1 Day' },
                                    { id: 'custom_days', label: 'Custom days' },
                                    { id: 'custom_amount', label: 'Fixed ₹' },
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setRules({ ...rules, deductionType: type.id as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' })}
                                        className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-all border ${rules.deductionType === type.id
                                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                                            : 'bg-white dark:bg-black/20 border-gray-100 dark:border-gray-800 text-gray-400 hover:border-emerald-500/30'
                                            }`}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                            {rules.deductionType === 'custom_days' && (
                                <div className="mt-2">
                                    <label className="block text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1 mb-1">Deduction days per unit (e.g. 1.5, 2, 3.25)</label>
                                    <input
                                        type="number"
                                        step={0.25}
                                        min={0}
                                        value={rules.deductionDays ?? ''}
                                        onChange={(e) => setRules({ ...rules, deductionDays: e.target.value !== '' ? Number(e.target.value) : null })}
                                        className="w-full max-w-[120px] bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2 text-sm font-bold"
                                        placeholder="e.g. 1.5"
                                    />
                                </div>
                            )}
                            {rules.deductionType === 'custom_amount' && (
                                <div className="mt-2">
                                    <label className="block text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1 mb-1">Amount (₹) per unit</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={rules.deductionAmount ?? ''}
                                        onChange={(e) => setRules({ ...rules, deductionAmount: e.target.value !== '' ? Number(e.target.value) : null })}
                                        className="w-full max-w-[120px] bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2 text-sm font-bold"
                                        placeholder="e.g. 500"
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleSaveRules}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white py-3.5 text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 mt-auto"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Commit Logic Parameters
                        </button>
                    </div>
                </section>

                {/* Workflow section */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col xl:sticky xl:top-24">
                    <div className="p-4 sm:p-5 lg:p-6 space-y-4 flex-1">
                        <div className="rounded-xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-900/10 px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                Approval Chain
                            </p>
                            <p className="text-[11px] text-purple-700/80 dark:text-purple-200/80 mt-0.5">
                                Keep this lean and role-based for faster approvals.
                            </p>
                        </div>
                        <WorkflowManager
                            workflow={workflow}
                            onChange={(newWorkflow: WorkflowData) => setWorkflow(newWorkflow)}
                            title="Multi-Level Approval"
                            description="Workflow Engine for short-term absence."
                            addStepLabel="Add Approval Step"
                        />

                        <button
                            onClick={handleSaveWorkflow}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white py-3.5 text-xs font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20 active:scale-95 disabled:opacity-50 mt-auto"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Save Approval Chain
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PermissionsSettings;
