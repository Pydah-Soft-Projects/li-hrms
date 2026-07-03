'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
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
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import { useCallback } from 'react';
import {
    AutoEdgePermissionRulesEditor,
    emptyRuleSet,
    normalizeAutoRulesForApi,
    toLocalRuleSet,
    validateAutoRuleSets,
    type AutoRuleSet,
} from './AutoEdgePermissionRulesEditor';

type AutoApplyFor = 'late_in' | 'early_out' | 'both';

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
        const lateInRules = normalizeAutoRulesForApi(autoEdgeSettings.lateInRules);
        const sharedSource = autoEdgeSettings.applyFor === 'early_out'
            ? normalizeAutoRulesForApi(autoEdgeSettings.earlyOutRules)
            : lateInRules;
        const earlyOutRules = autoEdgeSettings.useSameRulesForBoth
            ? sharedSource
            : normalizeAutoRulesForApi(autoEdgeSettings.earlyOutRules);

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

        return validateAutoRuleSets(relevantSets, autoEdgeSettings.isEnabled);
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

                            {autoEdgeSettings.applyFor === 'late_in' && (
                                <AutoEdgePermissionRulesEditor
                                    title="Late-in ranges"
                                    help="Match by shift duration (HH:MM hours). Times are 24-hour format."
                                    ruleSet={autoEdgeSettings.lateInRules}
                                    onChange={(next) => updateAutoRuleSet('lateInRules', next)}
                                />
                            )}
                            {autoEdgeSettings.applyFor === 'early_out' && (
                                <AutoEdgePermissionRulesEditor
                                    title="Early-out ranges"
                                    help="Match by shift duration (HH:MM hours). Times are 24-hour format."
                                    ruleSet={autoEdgeSettings.earlyOutRules}
                                    onChange={(next) => updateAutoRuleSet('earlyOutRules', next)}
                                />
                            )}
                            {autoEdgeSettings.applyFor === 'both' && autoEdgeSettings.useSameRulesForBoth && (
                                <AutoEdgePermissionRulesEditor
                                    title="Shared late-in and early-out ranges"
                                    ruleSet={autoEdgeSettings.lateInRules}
                                    onChange={(next) => updateAutoRuleSet('lateInRules', next)}
                                />
                            )}
                            {autoEdgeSettings.applyFor === 'both' && !autoEdgeSettings.useSameRulesForBoth && (
                                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                                    <AutoEdgePermissionRulesEditor
                                        title="Late-in ranges"
                                        ruleSet={autoEdgeSettings.lateInRules}
                                        onChange={(next) => updateAutoRuleSet('lateInRules', next)}
                                    />
                                    <AutoEdgePermissionRulesEditor
                                        title="Early-out ranges"
                                        ruleSet={autoEdgeSettings.earlyOutRules}
                                        onChange={(next) => updateAutoRuleSet('earlyOutRules', next)}
                                    />
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
