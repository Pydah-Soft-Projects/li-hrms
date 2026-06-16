'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
    SettingsOutlineButton,
    SettingsPanel,
    SettingsPanelHeader,
    SettingsSaveBar,
    SettingsSectionCard,
    SettingsToggleRow,
} from './SettingsPageShell';
import {
    settingsFieldHelpClass,
    settingsInputClass,
    settingsInputStyle,
    settingsLedgerBorder,
    settingsSectionTitleClass,
} from '@/lib/settingsUi';
import { Plus, Trash2 } from 'lucide-react';
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

type ApiShiftRange = {
    _id?: string;
    minShiftHours: number;
    maxShiftHours: number;
    minimumMinutes?: number;
    allowedMinutes: number;
    description?: string;
};
type ApiRuleSet = { shiftDurationRanges?: ApiShiftRange[] };

const toLocalRuleSet = (rs?: ApiRuleSet): AutoRuleSet => ({
    shiftDurationRanges: (rs?.shiftDurationRanges || []).map((r) => ({
        _id: r._id,
        minShiftHours: r.minShiftHours,
        maxShiftHours: r.maxShiftHours,
        minimumMinutes: r.minimumMinutes ?? 1,
        allowedMinutes: r.allowedMinutes,
        description: r.description,
    })),
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
                    lateInRules: toLocalRuleSet(autoRes.data.lateInRules),
                    earlyOutRules: toLocalRuleSet(autoRes.data.earlyOutRules),
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
                    lateInRules: toLocalRuleSet(res.data.lateInRules),
                    earlyOutRules: toLocalRuleSet(res.data.earlyOutRules),
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

    const inputCls = settingsInputClass();
    const inputStyle = settingsInputStyle();

    const renderRangeEditor = (title: string, key: 'lateInRules' | 'earlyOutRules') => {
        const ranges = autoEdgeSettings[key]?.shiftDurationRanges || [];
        return (
            <div className="space-y-3 border p-4" style={settingsLedgerBorder}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className={settingsSectionTitleClass}>{title}</p>
                        <p className={settingsFieldHelpClass}>Match by shift duration, ignore tiny misses, and cap by allowed minutes.</p>
                    </div>
                    <SettingsOutlineButton onClick={() => addAutoRange(key)}>
                        <Plus className="h-3.5 w-3.5" />
                        Add
                    </SettingsOutlineButton>
                </div>

                {ranges.length === 0 ? (
                    <div className="border border-dashed px-4 py-5 text-center text-xs font-medium text-stone-400" style={settingsLedgerBorder}>
                        No ranges configured.
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="hidden gap-2 px-1 text-[9px] font-semibold uppercase tracking-widest text-stone-400 md:grid md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]">
                            <span>Min shift hrs</span>
                            <span>Max shift hrs</span>
                            <span>Min trigger mins</span>
                            <span>Allowed mins</span>
                            <span>Description</span>
                            <span />
                        </div>
                        {ranges.map((range, index) => (
                            <div key={range._id || index} className="grid grid-cols-1 gap-2 border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]" style={settingsLedgerBorder}>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={range.minShiftHours}
                                    onChange={(e) => updateRange(key, index, 'minShiftHours', e.target.value)}
                                    className={`${inputCls} min-w-0 text-xs`}
                                    style={inputStyle}
                                    placeholder="Min hrs"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={range.maxShiftHours}
                                    onChange={(e) => updateRange(key, index, 'maxShiftHours', e.target.value)}
                                    className={`${inputCls} min-w-0 text-xs`}
                                    style={inputStyle}
                                    placeholder="Max hrs"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={range.minimumMinutes ?? 1}
                                    onChange={(e) => updateRange(key, index, 'minimumMinutes', e.target.value)}
                                    className={`${inputCls} min-w-0 text-xs`}
                                    style={inputStyle}
                                    placeholder="Min trigger"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    value={range.allowedMinutes}
                                    onChange={(e) => updateRange(key, index, 'allowedMinutes', e.target.value)}
                                    className={`${inputCls} min-w-0 text-xs`}
                                    style={inputStyle}
                                    placeholder="Minutes"
                                />
                                <input
                                    type="text"
                                    value={range.description || ''}
                                    onChange={(e) => updateRange(key, index, 'description', e.target.value)}
                                    className={`${inputCls} min-w-0 text-xs`}
                                    style={inputStyle}
                                    placeholder="Description"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeAutoRange(key, index)}
                                    className="flex h-9 w-9 items-center justify-center border text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                    style={settingsLedgerBorder}
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
        <SettingsPanel>
            <SettingsPanelHeader
                section="Permissions"
                title="Short-Term Absence"
                subtitle="Configure automated deduction logic and approval gates for short leave (Permissions)."
            />

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="space-y-6">
                    <SettingsSectionCard
                        title="Auto Late-In / Early-Out Permissions"
                        description="Shift-duration based auto approval configuration"
                        accent
                    >
                        <SettingsToggleRow
                            id="auto-edge-permissions"
                            label="Enable auto permissions"
                            description="Automatically apply permission rules for late-in and early-out based on shift duration."
                            checked={autoEdgeSettings.isEnabled}
                            onChange={(next) => setAutoEdgeSettings((prev) => ({ ...prev, isEnabled: next }))}
                        />

                        <div className="mt-5 space-y-5">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                                <div className="space-y-2">
                                    <label className={`${settingsSectionTitleClass} pl-1`}>Apply Automatically For</label>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {[
                                            { id: 'late_in', label: 'Late In' },
                                            { id: 'early_out', label: 'Early Out' },
                                            { id: 'both', label: 'Both' },
                                        ].map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setAutoEdgeSettings((prev) => ({ ...prev, applyFor: option.id as AutoApplyFor }))}
                                                className={`border px-4 py-3 text-xs font-semibold uppercase transition-all ${autoEdgeSettings.applyFor === option.id
                                                    ? 'border-[color:var(--ps-accent-border)] bg-[var(--ps-accent-soft)] text-[color:var(--ps-accent-ink)]'
                                                    : 'border-transparent text-stone-400 hover:border-stone-200 hover:bg-stone-50 dark:hover:border-stone-800 dark:hover:bg-stone-900'
                                                    }`}
                                                style={settingsLedgerBorder}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {autoEdgeSettings.applyFor === 'both' && (
                                    <label className="flex h-11 items-center justify-between gap-3 border px-4 text-xs font-semibold text-stone-600 dark:text-stone-300" style={settingsLedgerBorder}>
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

                            <SettingsSaveBar
                                onSave={handleSaveAutoEdgeSettings}
                                saving={saving}
                                label="Save Auto Permission Settings"
                            />
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard
                        title="Deduction Logic"
                        description="Automated payroll adjustments"
                        className="flex min-h-[500px] flex-col"
                    >
                        <div className="flex flex-1 flex-col space-y-4 sm:space-y-5">
                            <div className="space-y-2">
                                <label className={`${settingsSectionTitleClass} pl-1`}>Free Allowed (Monthly)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={rules.freeAllowedPerMonth ?? ''}
                                    onChange={(e) => setRules({ ...rules, freeAllowedPerMonth: e.target.value !== '' ? Number(e.target.value) : null })}
                                    className={inputCls}
                                    style={inputStyle}
                                    placeholder="e.g. 3"
                                />
                                <p className={settingsFieldHelpClass}>First N permissions per month are free; only count above this is used for deduction.</p>
                            </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={`${settingsSectionTitleClass} pl-1`}>Every N (Above Free) = 1 Unit</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={rules.countThreshold ?? ''}
                                    onChange={(e) => setRules({ ...rules, countThreshold: e.target.value !== '' ? parseInt(e.target.value, 10) : null })}
                                    className={inputCls}
                                    style={inputStyle}
                                    placeholder="e.g. 3"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={`${settingsSectionTitleClass} pl-1`}>Min. Duration (Minutes)</label>
                                <input
                                    type="number"
                                    value={rules.minimumDuration ?? ''}
                                    onChange={(e) => setRules({ ...rules, minimumDuration: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                                    className={inputCls}
                                    style={inputStyle}
                                    placeholder="e.g. 30"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className={`${settingsSectionTitleClass} pl-1`}>Calculation Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'floor', label: 'Floor (full units only)' },
                                    { id: 'proportional', label: 'Proportional (partial allowed)' },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setRules({ ...rules, calculationMode: mode.id as 'floor' | 'proportional' })}
                                        className={`border px-4 py-3 text-[10px] font-semibold uppercase transition-all ${rules.calculationMode === mode.id ? 'border-[color:var(--ps-accent-border)] bg-[var(--ps-accent-soft)] text-[color:var(--ps-accent-ink)]' : 'border-transparent text-stone-400 hover:border-stone-200 hover:bg-stone-50 dark:hover:border-stone-800 dark:hover:bg-stone-900'}`}
                                        style={settingsLedgerBorder}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3 border-t pt-2" style={settingsLedgerBorder}>
                            <p className={`${settingsSectionTitleClass} pl-1`}>Apply Date Window</p>
                            <label className="flex items-center justify-between text-[12px] text-gray-600 dark:text-gray-300">
                                <span>Allow backdated</span>
                                <input
                                    type="checkbox"
                                    checked={datePolicy.allowBackdated}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, allowBackdated: e.target.checked }))}
                                />
                            </label>
                            <div className="flex items-center justify-between gap-2">
                                <label className={`${settingsSectionTitleClass} pl-1`}>Max backdated days</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={datePolicy.maxBackdatedDays}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, maxBackdatedDays: Number(e.target.value || 0) }))}
                                    className={`${inputCls} w-28 text-right text-sm`}
                                    style={inputStyle}
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
                                <label className={`${settingsSectionTitleClass} pl-1`}>Max advance days</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={datePolicy.maxAdvanceDays}
                                    onChange={(e) => setDatePolicy((prev) => ({ ...prev, maxAdvanceDays: Number(e.target.value || 0) }))}
                                    className={`${inputCls} w-28 text-right text-sm`}
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className={`${settingsSectionTitleClass} pl-1`}>Deduction Mode</label>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {[
                                    { id: 'half_day', label: '0.5 Day' },
                                    { id: 'full_day', label: '1 Day' },
                                    { id: 'custom_days', label: 'Custom days' },
                                    { id: 'custom_amount', label: 'Fixed ₹' },
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setRules({ ...rules, deductionType: type.id as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' })}
                                        className={`border px-4 py-3 text-xs font-semibold uppercase transition-all ${rules.deductionType === type.id
                                            ? 'border-[color:var(--ps-accent-border)] bg-[var(--ps-accent-soft)] text-[color:var(--ps-accent-ink)]'
                                            : 'border-transparent text-stone-400 hover:border-stone-200 hover:bg-stone-50 dark:hover:border-stone-800 dark:hover:bg-stone-900'
                                            }`}
                                        style={settingsLedgerBorder}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                            {rules.deductionType === 'custom_days' && (
                                <div className="mt-2">
                                    <label className={`mb-1 block ${settingsSectionTitleClass} pl-1`}>Deduction days per unit (e.g. 1.5, 2, 3.25)</label>
                                    <input
                                        type="number"
                                        step={0.25}
                                        min={0}
                                        value={rules.deductionDays ?? ''}
                                        onChange={(e) => setRules({ ...rules, deductionDays: e.target.value !== '' ? Number(e.target.value) : null })}
                                        className={`${inputCls} max-w-[120px] text-sm`}
                                        style={inputStyle}
                                        placeholder="e.g. 1.5"
                                    />
                                </div>
                            )}
                            {rules.deductionType === 'custom_amount' && (
                                <div className="mt-2">
                                    <label className={`mb-1 block ${settingsSectionTitleClass} pl-1`}>Amount (₹) per unit</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={rules.deductionAmount ?? ''}
                                        onChange={(e) => setRules({ ...rules, deductionAmount: e.target.value !== '' ? Number(e.target.value) : null })}
                                        className={`${inputCls} max-w-[120px] text-sm`}
                                        style={inputStyle}
                                        placeholder="e.g. 500"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mt-auto">
                            <SettingsSaveBar onSave={handleSaveRules} saving={saving} label="Commit Logic Parameters" />
                        </div>
                    </div>
                    </SettingsSectionCard>
                </div>

                <SettingsSectionCard
                    title="Approval Chain"
                    description="Keep this lean and role-based for faster approvals."
                    className="flex flex-col xl:sticky xl:top-24"
                >
                    <WorkflowManager
                        workflow={workflow}
                        onChange={(newWorkflow: WorkflowData) => setWorkflow(newWorkflow)}
                        title="Multi-Level Approval"
                        description="Workflow Engine for short-term absence."
                        addStepLabel="Add Approval Step"
                    />
                    <div className="mt-4">
                        <SettingsSaveBar onSave={handleSaveWorkflow} saving={saving} label="Save Approval Chain" />
                    </div>
                </SettingsSectionCard>
            </div>
        </SettingsPanel>
    );
};

export default PermissionsSettings;
