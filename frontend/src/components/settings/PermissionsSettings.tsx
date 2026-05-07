'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Calculator, ChevronRight, Clock3, Plus, Trash2 } from 'lucide-react';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import { useCallback } from 'react';

type AutoApplyFor = 'late_in' | 'early_out' | 'both';
type ShiftRange = {
    _id?: string;
    minShiftHours: number | '';
    maxShiftHours: number | '';
    minimumMinutes: number | '';
    allowedMinutes: number | '';
    description?: string;
};
type AutoRuleSet = {
    shiftDurationRanges: ShiftRange[];
};

const emptyRuleSet = (): AutoRuleSet => ({ shiftDurationRanges: [] });
const defaultRange = (): ShiftRange => ({
    minShiftHours: '',
    maxShiftHours: '',
    minimumMinutes: 1,
    allowedMinutes: '',
    description: '',
});

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
    const [autoEdgeSettings, setAutoEdgeSettings] = useState<{
        isEnabled: boolean;
        applyFor: AutoApplyFor;
        useSameRulesForBoth: boolean;
        lateInRules: AutoRuleSet;
        earlyOutRules: AutoRuleSet;
    }>({
        isEnabled: false,
        applyFor: 'both',
        useSameRulesForBoth: true,
        lateInRules: emptyRuleSet(),
        earlyOutRules: emptyRuleSet(),
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const [res, autoRes] = await Promise.all([
                api.getPermissionDeductionSettings(),
                api.getAutoEdgePermissionSettings(),
            ]);
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
            if (autoRes.success && autoRes.data) {
                setAutoEdgeSettings({
                    isEnabled: Boolean(autoRes.data.isEnabled),
                    applyFor: (autoRes.data.applyFor || 'both') as AutoApplyFor,
                    useSameRulesForBoth: autoRes.data.useSameRulesForBoth !== false,
                    lateInRules: autoRes.data.lateInRules || emptyRuleSet(),
                    earlyOutRules: autoRes.data.earlyOutRules || emptyRuleSet(),
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

    const updateAutoRuleSet = (key: 'lateInRules' | 'earlyOutRules', nextRules: AutoRuleSet) => {
        setAutoEdgeSettings((prev) => {
            if (prev.useSameRulesForBoth) {
                return {
                    ...prev,
                    lateInRules: nextRules,
                    earlyOutRules: nextRules,
                };
            }
            return { ...prev, [key]: nextRules };
        });
    };

    const updateRange = (
        key: 'lateInRules' | 'earlyOutRules',
        index: number,
        field: keyof ShiftRange,
        value: string
    ) => {
        const current = autoEdgeSettings[key]?.shiftDurationRanges || [];
        const nextRanges = current.map((range, idx) => {
            if (idx !== index) return range;
            if (field === 'description') return { ...range, [field]: value };
            return { ...range, [field]: value === '' ? '' : Number(value) };
        });
        updateAutoRuleSet(key, { shiftDurationRanges: nextRanges });
    };

    const addAutoRange = (key: 'lateInRules' | 'earlyOutRules') => {
        const current = autoEdgeSettings[key]?.shiftDurationRanges || [];
        updateAutoRuleSet(key, { shiftDurationRanges: [...current, defaultRange()] });
    };

    const removeAutoRange = (key: 'lateInRules' | 'earlyOutRules', index: number) => {
        const current = autoEdgeSettings[key]?.shiftDurationRanges || [];
        updateAutoRuleSet(key, { shiftDurationRanges: current.filter((_, idx) => idx !== index) });
    };

    const handleSameRulesChange = (checked: boolean) => {
        setAutoEdgeSettings((prev) => {
            const source = prev.lateInRules?.shiftDurationRanges?.length ? prev.lateInRules : prev.earlyOutRules;
            return {
                ...prev,
                useSameRulesForBoth: checked,
                lateInRules: checked ? source : prev.lateInRules,
                earlyOutRules: checked ? source : prev.earlyOutRules,
            };
        });
    };

    const normalizeAutoPayload = () => {
        const normalizeRules = (rules: AutoRuleSet) => ({
            shiftDurationRanges: (rules.shiftDurationRanges || []).map((range) => ({
                minShiftHours: Number(range.minShiftHours),
                maxShiftHours: Number(range.maxShiftHours),
                minimumMinutes: range.minimumMinutes === '' || range.minimumMinutes === undefined ? 1 : Number(range.minimumMinutes),
                allowedMinutes: Number(range.allowedMinutes),
                description: String(range.description || '').trim(),
            })),
        });

        const lateInRules = normalizeRules(autoEdgeSettings.lateInRules);
        const sharedSource = autoEdgeSettings.applyFor === 'early_out'
            ? normalizeRules(autoEdgeSettings.earlyOutRules)
            : lateInRules;
        const earlyOutRules = autoEdgeSettings.useSameRulesForBoth
            ? sharedSource
            : normalizeRules(autoEdgeSettings.earlyOutRules);

        return {
            isEnabled: autoEdgeSettings.isEnabled,
            applyFor: autoEdgeSettings.applyFor,
            useSameRulesForBoth: autoEdgeSettings.useSameRulesForBoth,
            lateInRules: autoEdgeSettings.useSameRulesForBoth ? sharedSource : lateInRules,
            earlyOutRules,
        };
    };

    const validateAutoRules = () => {
        const sets = autoEdgeSettings.useSameRulesForBoth
            ? [{ label: 'Auto permission rules', rules: autoEdgeSettings.lateInRules }]
            : [
                { label: 'Late-in rules', rules: autoEdgeSettings.lateInRules },
                { label: 'Early-out rules', rules: autoEdgeSettings.earlyOutRules },
            ];
        const relevantSets = autoEdgeSettings.applyFor === 'late_in'
            ? [{ label: 'Late-in rules', rules: autoEdgeSettings.lateInRules }]
            : autoEdgeSettings.applyFor === 'early_out'
                ? [{ label: 'Early-out rules', rules: autoEdgeSettings.earlyOutRules }]
                : sets;

        if (autoEdgeSettings.isEnabled) {
            for (const set of relevantSets) {
                if (!set.rules.shiftDurationRanges?.length) {
                    return `${set.label}: add at least one range before enabling auto mode.`;
                }
            }
        }

        for (const set of relevantSets) {
            for (const range of set.rules.shiftDurationRanges || []) {
                if (range.minShiftHours === '' || range.maxShiftHours === '' || range.allowedMinutes === '' || range.minimumMinutes === '') {
                    return `${set.label}: fill min shift, max shift, minimum minutes, and allowed minutes for every range.`;
                }
                if (Number(range.maxShiftHours) <= Number(range.minShiftHours)) {
                    return `${set.label}: max shift hours must be greater than min shift hours.`;
                }
                if (Number(range.minimumMinutes) > Number(range.allowedMinutes)) {
                    return `${set.label}: minimum minutes cannot be greater than allowed minutes.`;
                }
            }
        }
        return null;
    };

    const handleSaveAutoEdgeSettings = async () => {
        const validationError = validateAutoRules();
        if (validationError) {
            toast.error(validationError);
            return;
        }
        try {
            setSaving(true);
            const res = await api.saveAutoEdgePermissionSettings(normalizeAutoPayload());
            if (res.success && res.data) {
                setAutoEdgeSettings({
                    isEnabled: Boolean(res.data.isEnabled),
                    applyFor: (res.data.applyFor || 'both') as AutoApplyFor,
                    useSameRulesForBoth: res.data.useSameRulesForBoth !== false,
                    lateInRules: res.data.lateInRules || emptyRuleSet(),
                    earlyOutRules: res.data.earlyOutRules || emptyRuleSet(),
                });
                toast.success('Auto permission settings saved');
            } else {
                toast.error(res.error || 'Failed to save auto settings');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save auto settings';
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    const renderRangeEditor = (title: string, key: 'lateInRules' | 'earlyOutRules') => {
        const ranges = autoEdgeSettings[key]?.shiftDurationRanges || [];
        return (
            <div className="space-y-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">{title}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">Match by shift duration, ignore tiny misses, and cap by allowed minutes.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => addAutoRange(key)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                    </button>
                </div>

                {ranges.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-4 py-5 text-center text-xs font-medium text-gray-400">
                        No ranges configured.
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto] gap-2 px-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
                            <span>Min shift hrs</span>
                            <span>Max shift hrs</span>
                            <span>Min trigger mins</span>
                            <span>Allowed mins</span>
                            <span>Description</span>
                            <span />
                        </div>
                        {ranges.map((range, index) => (
                            <div key={range._id || index} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-[#0F172A] md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]">
                                <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={range.minShiftHours}
                                    onChange={(e) => updateRange(key, index, 'minShiftHours', e.target.value)}
                                    className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-black/20"
                                    placeholder="Min hrs"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={range.maxShiftHours}
                                    onChange={(e) => updateRange(key, index, 'maxShiftHours', e.target.value)}
                                    className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-black/20"
                                    placeholder="Max hrs"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={range.minimumMinutes ?? 1}
                                    onChange={(e) => updateRange(key, index, 'minimumMinutes', e.target.value)}
                                    className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-black/20"
                                    placeholder="Min trigger"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    value={range.allowedMinutes}
                                    onChange={(e) => updateRange(key, index, 'allowedMinutes', e.target.value)}
                                    className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-black/20"
                                    placeholder="Minutes"
                                />
                                <input
                                    type="text"
                                    value={range.description || ''}
                                    onChange={(e) => updateRange(key, index, 'description', e.target.value)}
                                    className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-black/20"
                                    placeholder="Description"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeAutoRange(key, index)}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20"
                                    title="Remove range"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
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
                <div className="space-y-6">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 border-b border-gray-100 dark:border-gray-800 bg-sky-50/50 dark:bg-sky-950/10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-100 dark:border-sky-800/50">
                                    <Clock3 className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Auto Late-In / Early-Out Permissions</h3>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">Shift-duration based auto approval configuration</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAutoEdgeSettings((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${autoEdgeSettings.isEnabled ? 'bg-sky-600 shadow-[0_0_12px_rgba(2,132,199,0.3)]' : 'bg-gray-200 dark:bg-gray-800'}`}
                                aria-label="Toggle auto permission settings"
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ${autoEdgeSettings.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 lg:p-7 space-y-5">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest pl-1">Apply Automatically For</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        {[
                                            { id: 'late_in', label: 'Late In' },
                                            { id: 'early_out', label: 'Early Out' },
                                            { id: 'both', label: 'Both' },
                                        ].map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setAutoEdgeSettings((prev) => ({ ...prev, applyFor: option.id as AutoApplyFor }))}
                                                className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-all border ${autoEdgeSettings.applyFor === option.id
                                                    ? 'bg-sky-600 border-sky-600 text-white shadow-lg shadow-sky-500/20'
                                                    : 'bg-white dark:bg-black/20 border-gray-100 dark:border-gray-800 text-gray-400 hover:border-sky-500/30'
                                                    }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {autoEdgeSettings.applyFor === 'both' && (
                                    <label className="flex h-11 items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-bold text-gray-600 dark:border-gray-800 dark:bg-black/20 dark:text-gray-300">
                                        <span>Same ranges for both</span>
                                        <input
                                            type="checkbox"
                                            checked={autoEdgeSettings.useSameRulesForBoth}
                                            onChange={(e) => handleSameRulesChange(e.target.checked)}
                                        />
                                    </label>
                                )}
                            </div>

                            {autoEdgeSettings.applyFor === 'late_in' && renderRangeEditor('Late-in ranges', 'lateInRules')}
                            {autoEdgeSettings.applyFor === 'early_out' && renderRangeEditor('Early-out ranges', 'earlyOutRules')}
                            {autoEdgeSettings.applyFor === 'both' && autoEdgeSettings.useSameRulesForBoth && renderRangeEditor('Shared late-in and early-out ranges', 'lateInRules')}
                            {autoEdgeSettings.applyFor === 'both' && !autoEdgeSettings.useSameRulesForBoth && (
                                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                                    {renderRangeEditor('Late-in ranges', 'lateInRules')}
                                    {renderRangeEditor('Early-out ranges', 'earlyOutRules')}
                                </div>
                            )}

                            <button
                                onClick={handleSaveAutoEdgeSettings}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3.5 text-xs font-bold hover:bg-sky-700 transition-all shadow-lg shadow-sky-500/20 active:scale-95 disabled:opacity-50"
                            >
                                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                Save Auto Permission Settings
                            </button>
                        </div>
                    </section>

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
                </div>

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
