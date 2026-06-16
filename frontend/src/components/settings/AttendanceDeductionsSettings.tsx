'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import { AlertTriangle, Clock, Calculator, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useCallback } from 'react';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsToggleRow,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import {
  settingsInputClass,
  settingsInputStyle,
  settingsLedgerBorder,
  settingsFieldHelpClass,
} from '@/lib/settingsUi';

const AttendanceDeductionsSettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rules, setRules] = useState({
        freeAllowedPerMonth: null as number | null,
        combinedCountThreshold: null as number | null,
        deductionType: null as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' | null,
        deductionDays: null as number | null,
        deductionAmount: null as number | null,
        minimumDuration: null as number | null,
        calculationMode: null as 'proportional' | 'floor' | null,
    });
    const [earlyOut, setEarlyOut] = useState<{
        isEnabled: boolean;
        allowedDurationMinutes: number;
        minimumDuration: number;
        deductionRanges: { _id: string; minMinutes: string | number; maxMinutes: string | number; deductionType: 'quarter_day' | 'half_day' | 'full_day'; deductionAmount: string | number; description: string }[];
    }>({
        isEnabled: false,
        allowedDurationMinutes: 0,
        minimumDuration: 0,
        deductionRanges: [],
    });
    const [newRange, setNewRange] = useState({
        minMinutes: '',
        maxMinutes: '',
        deductionType: 'quarter_day' as 'quarter_day' | 'half_day' | 'full_day',
        deductionAmount: '',
        description: '',
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const [resRules, resEarly] = await Promise.all([
                api.getAttendanceDeductionSettings(),
                api.getEarlyOutSettings()
            ]);
            if (resRules.success && resRules.data && resRules.data.deductionRules) setRules(resRules.data.deductionRules);
            if (resEarly.success && resEarly.data) setEarlyOut(resEarly.data);
        } catch (err) {
            console.error('Error loading deduction settings:', err);
            toast.error('Failed to load settings');
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
            const res = await api.saveAttendanceDeductionSettings({ deductionRules: rules });
            if (res.success) toast.success('Deduction rules saved');
            else toast.error('Failed to save rules');
        } catch {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEarlyOut = async () => {
        try {
            setSaving(true);
            const res = await api.saveEarlyOutSettings(earlyOut);
            if (res.success) toast.success('Early-out settings saved');
            else toast.error('Failed to save');
        } catch {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const addRange = () => {
        if (!newRange.minMinutes || !newRange.maxMinutes) return;
        setEarlyOut({
            ...earlyOut,
            deductionRanges: [...earlyOut.deductionRanges, { ...newRange, _id: Date.now().toString() }]
        });
        setNewRange({ minMinutes: '', maxMinutes: '', deductionType: 'quarter_day', deductionAmount: '', description: '' });
    };

    if (loading) return <SettingsSkeleton />;

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section="Deductions"
                title="Attendance Logic & Penalties"
                subtitle="Configure automated Loss-of-Pay (LOP) triggers for attendance irregularities and threshold breaches."
            />

            <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
                <SettingsSectionCard
                    title="Combined Multi-Count Penalties"
                    description="Late-In & Early-Out Aggregation"
                >
                    <div className="mb-6 flex items-center gap-4">
                        <div
                            className="flex h-12 w-12 items-center justify-center border text-red-600 dark:text-red-400"
                            style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(239, 68, 68, 0.08)' }}
                        >
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="space-y-8">
                        <SettingsField
                            label="Free Allowed (Monthly)"
                            help="First N late-ins + early-outs per month are free; only count above this is used for deduction."
                        >
                            <div className="relative mx-auto max-w-[120px]">
                                <input
                                    type="number"
                                    min={0}
                                    value={rules.freeAllowedPerMonth ?? ''}
                                    onChange={(e) => setRules({ ...rules, freeAllowedPerMonth: e.target.value !== '' ? Number(e.target.value) : null })}
                                    className={`${settingsInputClass()} text-center text-2xl font-black`}
                                    style={settingsInputStyle()}
                                    placeholder="0"
                                />
                            </div>
                        </SettingsField>

                        <SettingsField
                            label="Every N (Above Free) = 1 Unit"
                            help="Deduction applies for every N occurrences above the free limit (e.g. every 3 = 1 unit)."
                        >
                            <div className="relative mx-auto max-w-[120px]">
                                <input
                                    type="number"
                                    min={1}
                                    value={rules.combinedCountThreshold ?? ''}
                                    onChange={(e) => setRules({ ...rules, combinedCountThreshold: e.target.value ? Number(e.target.value) : null })}
                                    className={`${settingsInputClass()} text-center text-2xl font-black`}
                                    style={settingsInputStyle()}
                                    placeholder="e.g. 3"
                                />
                                <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] font-black text-white dark:border-stone-950">#</div>
                            </div>
                        </SettingsField>

                        <SettingsField label="Calculation Mode">
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'floor', label: 'Floor (full units only)' },
                                    { id: 'proportional', label: 'Proportional (partial allowed)' },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setRules({ ...rules, calculationMode: mode.id as 'floor' | 'proportional' })}
                                        className={`rounded-xl border px-4 py-3 text-[10px] font-black uppercase transition-all ${
                                            rules.calculationMode === mode.id
                                                ? 'border-red-500 bg-red-50/30 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                                                : 'border-stone-200 text-stone-400 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700'
                                        }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </SettingsField>

                        <SettingsField label="Select Penalty Magnitude">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                                {[
                                    { id: 'half_day', label: '0.5 Day LOP' },
                                    { id: 'full_day', label: '1.0 Day LOP' },
                                    { id: 'custom_days', label: 'Custom days' },
                                    { id: 'custom_amount', label: 'Fixed Fee (₹)' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setRules({ ...rules, deductionType: type.id as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' })}
                                        className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all ${
                                            rules.deductionType === type.id
                                                ? 'scale-[1.05] border-red-500 bg-red-50/30 text-red-700 shadow-lg shadow-red-500/10 dark:bg-red-950/20 dark:text-red-400'
                                                : 'border-stone-200 bg-transparent text-stone-400 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700'
                                        }`}
                                    >
                                        <div className={`h-2 w-2 rounded-full transition-all ${rules.deductionType === type.id ? 'scale-125 bg-red-500' : 'bg-stone-200 dark:bg-stone-800'}`} />
                                        <span className="text-[11px] font-black uppercase tracking-tight">{type.label}</span>
                                    </button>
                                ))}
                            </div>
                            {rules.deductionType === 'custom_days' && (
                                <div className="mt-3">
                                    <SettingsField label="Deduction days per unit (e.g. 1.5, 2, 3.25)">
                                        <input
                                            type="number"
                                            step={0.25}
                                            min={0}
                                            value={rules.deductionDays ?? ''}
                                            onChange={(e) => setRules({ ...rules, deductionDays: e.target.value !== '' ? Number(e.target.value) : null })}
                                            className={`${settingsInputClass()} max-w-[140px]`}
                                            style={settingsInputStyle()}
                                            placeholder="e.g. 1.5"
                                        />
                                    </SettingsField>
                                </div>
                            )}
                            {rules.deductionType === 'custom_amount' && (
                                <div className="mt-3">
                                    <SettingsField label="Amount (₹) per unit">
                                        <input
                                            type="number"
                                            min={0}
                                            value={rules.deductionAmount ?? ''}
                                            onChange={(e) => setRules({ ...rules, deductionAmount: e.target.value !== '' ? Number(e.target.value) : null })}
                                            className={`${settingsInputClass()} max-w-[140px]`}
                                            style={settingsInputStyle()}
                                            placeholder="e.g. 500"
                                        />
                                    </SettingsField>
                                </div>
                            )}
                        </SettingsField>

                        <SettingsSaveBar onSave={handleSaveRules} saving={saving} label="Commit Combined Protocols" />
                    </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                    title="Time-Sectored Early-Out"
                    description="Duration-Based Scalar Penalties"
                >
                    <div className="mb-6 flex items-center gap-4">
                        <div
                            className="flex h-12 w-12 items-center justify-center border text-amber-600 dark:text-amber-400"
                            style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(245, 158, 11, 0.08)' }}
                        >
                            <Clock className="h-6 w-6" />
                        </div>
                    </div>

                    <SettingsToggleRow
                        id="early-out-enabled"
                        label="Enable early-out graduated deductions"
                        description="Enable to activate graduated penalties based on precise exit duration."
                        checked={earlyOut.isEnabled}
                        onChange={(next) => setEarlyOut({ ...earlyOut, isEnabled: next })}
                    />

                    <div className="mt-8 space-y-8">
                        {earlyOut.isEnabled ? (
                            <div className="animate-in slide-in-from-top-2 space-y-8 duration-500">
                                <div className="grid grid-cols-2 gap-6">
                                    <SettingsField label="Monthly Grace (Min)">
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={earlyOut.allowedDurationMinutes}
                                                onChange={(e) => setEarlyOut({ ...earlyOut, allowedDurationMinutes: Number(e.target.value) })}
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            />
                                            <Calculator className="absolute right-4 top-4 h-4 w-4 text-stone-300" />
                                        </div>
                                    </SettingsField>
                                    <SettingsField label="Hard Minimum (Min)">
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={earlyOut.minimumDuration}
                                                onChange={(e) => setEarlyOut({ ...earlyOut, minimumDuration: Number(e.target.value) })}
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            />
                                            <Clock className="absolute right-4 top-4 h-4 w-4 text-stone-300" />
                                        </div>
                                    </SettingsField>
                                </div>

                                <SettingsField label="Graduated Penalty Matrix">
                                    <div className="space-y-3">
                                        {earlyOut.deductionRanges.map((range, idx) => (
                                            <div
                                                key={idx}
                                                className="group flex items-center gap-4 border p-4 transition-colors hover:border-amber-200 dark:hover:border-amber-900/50"
                                                style={settingsLedgerBorder}
                                            >
                                                <div className="flex flex-1 items-center gap-3">
                                                    <span className="text-xs font-black text-stone-900 dark:text-stone-100">{range.minMinutes}</span>
                                                    <div className="relative h-px flex-1 bg-stone-100 dark:bg-stone-800">
                                                        <ArrowRight className="absolute -top-1.5 left-1/2 -ml-2 h-3 w-3 text-stone-200" />
                                                    </div>
                                                    <span className="text-xs font-black text-stone-900 dark:text-stone-100">
                                                        {range.maxMinutes} <span className="ml-1 text-[10px] font-medium uppercase text-stone-400">min</span>
                                                    </span>
                                                </div>
                                                <div className="rounded-lg border border-amber-100/50 bg-amber-50/50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
                                                    {range.deductionType.replace('_', ' ')}
                                                </div>
                                                <button
                                                    onClick={() => setEarlyOut({ ...earlyOut, deductionRanges: earlyOut.deductionRanges.filter((_, i) => i !== idx) })}
                                                    className="rounded-lg p-2 text-stone-300 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}

                                        <div
                                            className="grid grid-cols-1 gap-3 border-2 border-dashed p-4 md:grid-cols-4"
                                            style={settingsLedgerBorder}
                                        >
                                            <input
                                                type="number"
                                                placeholder="Min (m)"
                                                value={newRange.minMinutes}
                                                onChange={(e) => setNewRange({ ...newRange, minMinutes: e.target.value })}
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Max (m)"
                                                value={newRange.maxMinutes}
                                                onChange={(e) => setNewRange({ ...newRange, maxMinutes: e.target.value })}
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            />
                                            <select
                                                value={newRange.deductionType}
                                                onChange={(e) => setNewRange({ ...newRange, deductionType: e.target.value as 'quarter_day' | 'half_day' | 'full_day' })}
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            >
                                                <option value="quarter_day">0.25 Day</option>
                                                <option value="half_day">0.5 Day</option>
                                                <option value="full_day">1 Day</option>
                                            </select>
                                            <button
                                                onClick={addRange}
                                                className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-600"
                                            >
                                                <Plus className="h-4 w-4" /> Add
                                            </button>
                                        </div>
                                    </div>
                                </SettingsField>

                                <SettingsSaveBar onSave={handleSaveEarlyOut} saving={saving} label="Deploy Scalar Rules" />
                            </div>
                        ) : (
                            <div
                                className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed py-24 text-center"
                                style={settingsLedgerBorder}
                            >
                                <div
                                    className="flex h-16 w-16 items-center justify-center border"
                                    style={settingsLedgerBorder}
                                >
                                    <Clock className="h-8 w-8 text-stone-200" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold uppercase tracking-tight text-stone-900 dark:text-stone-100">Scalar Inactive</h4>
                                    <p className={`${settingsFieldHelpClass} mx-auto mt-1 max-w-xs`}>Enable to activate graduated penalties based on precise exit duration.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </SettingsSectionCard>
            </div>
        </SettingsPanel>
    );
};

export default AttendanceDeductionsSettings;
