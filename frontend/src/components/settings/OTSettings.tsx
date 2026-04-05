'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Clock, ChevronRight, Percent } from 'lucide-react';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';

type OtSettingsState = {
    payPerHour: number;
    multiplier: number;
    minOTHours: number;
    roundingMinutes: number;
    recognitionMode: string;
    thresholdHours: number | null;
    roundUpIfFractionMinutesGte: number | null;
    autoCreateOtRequest: boolean;
    payCalculationMode: string;
    otSalaryBasis: string;
    daysPerMonthMode: string;
    fixedDaysPerMonth: number;
    defaultWorkingHoursPerDay: number;
    workflow: WorkflowData;
};

const defaultOt: OtSettingsState = {
    payPerHour: 0,
    multiplier: 1.5,
    minOTHours: 0,
    roundingMinutes: 15,
    recognitionMode: 'none',
    thresholdHours: null,
    roundUpIfFractionMinutesGte: null,
    autoCreateOtRequest: false,
    payCalculationMode: 'flat_per_hour',
    otSalaryBasis: 'gross',
    daysPerMonthMode: 'calendar',
    fixedDaysPerMonth: 30,
    defaultWorkingHoursPerDay: 8,
    workflow: {
        isEnabled: true,
        steps: [],
        finalAuthority: { role: 'admin', anyHRCanApprove: false },
    },
};

type SimResult = {
    eligible: boolean;
    finalHours: number;
    rawHours: number;
    steps: string[];
    policyUsed: Record<string, unknown>;
};

const OTSettings = () => {
    const [otSettings, setOTSettings] = useState<OtSettingsState>(defaultOt);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [simRawHours, setSimRawHours] = useState('1.37');
    const [simLoading, setSimLoading] = useState(false);
    const [simResult, setSimResult] = useState<SimResult | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                setLoading(true);
                const res = await api.getOvertimeSettings();
                if (res.success && res.data) {
                    const d = res.data as Record<string, unknown>;
                    setOTSettings({
                        ...defaultOt,
                        ...d,
                        payPerHour: Number(d.payPerHour ?? 0),
                        multiplier: Number(d.multiplier ?? 1.5),
                        minOTHours: Number(d.minOTHours ?? 0),
                        roundingMinutes: Number(d.roundingMinutes ?? 15),
                        recognitionMode: String(d.recognitionMode ?? 'none'),
                        thresholdHours:
                            d.thresholdHours === null || d.thresholdHours === undefined
                                ? null
                                : Number(d.thresholdHours),
                        roundUpIfFractionMinutesGte:
                            d.roundUpIfFractionMinutesGte === null || d.roundUpIfFractionMinutesGte === undefined
                                ? null
                                : Number(d.roundUpIfFractionMinutesGte),
                        autoCreateOtRequest: Boolean(d.autoCreateOtRequest),
                        payCalculationMode: String(d.payCalculationMode ?? 'flat_per_hour'),
                        otSalaryBasis: String(d.otSalaryBasis ?? 'gross'),
                        daysPerMonthMode: String(d.daysPerMonthMode ?? 'calendar'),
                        fixedDaysPerMonth: Number(d.fixedDaysPerMonth ?? 30),
                        defaultWorkingHoursPerDay: Number(d.defaultWorkingHoursPerDay ?? 8),
                        workflow: (d.workflow as WorkflowData) || defaultOt.workflow,
                    });
                }
            } catch (err) {
                console.error('Failed to load OT settings', err);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSaveParams = async () => {
        try {
            setSaving(true);
            await api.saveOvertimeSettings({
                payPerHour: otSettings.payPerHour,
                multiplier: otSettings.multiplier,
                minOTHours: otSettings.minOTHours,
                roundingMinutes: otSettings.roundingMinutes,
                recognitionMode: otSettings.recognitionMode,
                thresholdHours: otSettings.thresholdHours,
                roundUpIfFractionMinutesGte: otSettings.roundUpIfFractionMinutesGte,
                autoCreateOtRequest: otSettings.autoCreateOtRequest,
                payCalculationMode: otSettings.payCalculationMode,
                otSalaryBasis: otSettings.otSalaryBasis,
                daysPerMonthMode: otSettings.daysPerMonthMode,
                fixedDaysPerMonth: otSettings.fixedDaysPerMonth,
                defaultWorkingHoursPerDay: otSettings.defaultWorkingHoursPerDay,
                workflow: otSettings.workflow,
            });
            toast.success('OT parameters updated');
        } catch {
            toast.error('Failed to save parameters');
        } finally {
            setSaving(false);
        }
    };

    const handleSimulatePolicy = async () => {
        const raw = parseFloat(simRawHours);
        if (!Number.isFinite(raw) || raw < 0) {
            toast.error('Enter a valid raw OT hours value (≥ 0)');
            return;
        }
        try {
            setSimLoading(true);
            const res = await api.simulateOtHoursPolicy({
                rawHours: raw,
                policy: {
                    recognitionMode: otSettings.recognitionMode,
                    thresholdHours: otSettings.thresholdHours,
                    minOTHours: otSettings.minOTHours,
                    roundingMinutes: otSettings.roundingMinutes,
                    roundUpIfFractionMinutesGte: otSettings.roundUpIfFractionMinutesGte,
                },
            });
            if (!res.success) {
                toast.error((res as { message?: string }).message || 'Simulation failed');
                setSimResult(null);
                return;
            }
            const payload = res as { data?: SimResult };
            setSimResult(payload.data ?? null);
        } catch {
            toast.error('Simulation failed');
            setSimResult(null);
        } finally {
            setSimLoading(false);
        }
    };

    const handleSaveWorkflow = async () => {
        try {
            setSaving(true);
            const updatedSettings = {
                ...otSettings,
                workflow: {
                    ...otSettings.workflow,
                    isEnabled: true
                }
            };
            await api.saveOvertimeSettings(updatedSettings);
            toast.success('Approval escalation updated');
        } catch {
            toast.error('Failed to save workflow');
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
                        <span className="text-indigo-600">Overtime</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Overtime (OT)</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Rates, automatic hour rules, formula pay (z/y)/x, and approvals.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* OT Parameters */}
                <div className="xl:col-span-1">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden sticky top-24 p-4 sm:p-6 lg:p-8">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <Clock className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Parameters</h3>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex justify-between items-center bg-gray-50/50 dark:bg-black/10 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2">
                                            <Percent className="h-3.5 w-3.5 text-gray-400" />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Rate/Hr</span>
                                        </div>
                                        <input
                                            type="number"
                                            value={otSettings.payPerHour ?? ''}
                                            onChange={(e) => setOTSettings({ ...otSettings, payPerHour: parseFloat(e.target.value) })}
                                            className="w-16 bg-transparent text-right text-sm font-black text-indigo-600 outline-none"
                                        />
                                    </div>

                                    <div className="flex justify-between items-center bg-gray-50/50 dark:bg-black/10 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2">
                                            <Percent className="h-3.5 w-3.5 text-gray-400" />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Multiplier</span>
                                        </div>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={otSettings.multiplier ?? ''}
                                            onChange={(e) => setOTSettings({ ...otSettings, multiplier: parseFloat(e.target.value) })}
                                            className="w-12 bg-transparent text-right text-sm font-black text-indigo-600 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex justify-between items-center bg-gray-50/50 dark:bg-black/10 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Min OT</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={otSettings.minOTHours ?? ''}
                                                onChange={(e) => setOTSettings({ ...otSettings, minOTHours: parseFloat(e.target.value) })}
                                                className="w-12 bg-transparent text-right text-sm font-black text-indigo-600 outline-none"
                                            />
                                            <span className="text-[8px] font-bold text-gray-400 uppercase">Hrs</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center bg-gray-50/50 dark:bg-black/10 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Rounding</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={otSettings.roundingMinutes ?? ''}
                                                onChange={(e) => setOTSettings({ ...otSettings, roundingMinutes: parseInt(e.target.value) })}
                                                className="w-12 bg-transparent text-right text-sm font-black text-indigo-600 outline-none"
                                            />
                                            <span className="text-[8px] font-bold text-gray-400 uppercase">Min</span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[9px] text-gray-400 px-1">
                                    Nearest N-minute grid (after threshold and minimum). Use 0 to disable.
                                </p>

                                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Hour rules (automatic)</p>
                                    <select
                                        value={otSettings.recognitionMode}
                                        onChange={(e) => setOTSettings({ ...otSettings, recognitionMode: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                    >
                                        <option value="none">No threshold</option>
                                        <option value="threshold_full">Threshold — full raw hours count once met</option>
                                    </select>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-gray-500">Threshold (h)</span>
                                        <input
                                            type="number"
                                            step="0.25"
                                            value={otSettings.thresholdHours ?? ''}
                                            onChange={(e) =>
                                                setOTSettings({
                                                    ...otSettings,
                                                    thresholdHours: e.target.value === '' ? null : parseFloat(e.target.value),
                                                })
                                            }
                                            className="w-20 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-gray-500">Round up to next hour if frac min ≥</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={59}
                                            value={otSettings.roundUpIfFractionMinutesGte ?? ''}
                                            onChange={(e) =>
                                                setOTSettings({
                                                    ...otSettings,
                                                    roundUpIfFractionMinutesGte:
                                                        e.target.value === '' ? null : parseInt(e.target.value, 10),
                                                })
                                            }
                                            placeholder="off"
                                            className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-[10px] text-gray-600 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={otSettings.autoCreateOtRequest}
                                            onChange={(e) =>
                                                setOTSettings({ ...otSettings, autoCreateOtRequest: e.target.checked })
                                            }
                                        />
                                        Auto-create pending OT when extra hours are detected
                                    </label>
                                </div>

                                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Pay formula</p>
                                    <select
                                        value={otSettings.payCalculationMode}
                                        onChange={(e) => setOTSettings({ ...otSettings, payCalculationMode: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                    >
                                        <option value="flat_per_hour">Flat ₹/hour × hours × multiplier</option>
                                        <option value="formula">(z/y)/x × hours × multiplier</option>
                                    </select>
                                    <select
                                        value={otSettings.otSalaryBasis}
                                        onChange={(e) => setOTSettings({ ...otSettings, otSalaryBasis: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                    >
                                        <option value="gross">z = gross salary</option>
                                        <option value="basic">z = basic (from salary components)</option>
                                    </select>
                                    <select
                                        value={otSettings.daysPerMonthMode}
                                        onChange={(e) => setOTSettings({ ...otSettings, daysPerMonthMode: e.target.value })}
                                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                    >
                                        <option value="calendar">y = calendar days in payroll month</option>
                                        <option value="fixed">y = fixed days</option>
                                    </select>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-gray-500">Fixed y (if fixed)</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={31}
                                            value={otSettings.fixedDaysPerMonth}
                                            onChange={(e) =>
                                                setOTSettings({
                                                    ...otSettings,
                                                    fixedDaysPerMonth: parseInt(e.target.value, 10) || 30,
                                                })
                                            }
                                            className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-gray-500">Default x (h/day)</span>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min={0.5}
                                            value={otSettings.defaultWorkingHoursPerDay}
                                            onChange={(e) =>
                                                setOTSettings({
                                                    ...otSettings,
                                                    defaultWorkingHoursPerDay: parseFloat(e.target.value) || 8,
                                                })
                                            }
                                            className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSaveParams}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-xs font-bold text-white transition hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
                            >
                                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                Commit Parameters
                            </button>
                        </div>
                    </section>
                </div>

                {/* OT Workflow */}
                <div className="xl:col-span-2 space-y-6">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden min-h-[400px] p-4 sm:p-6 lg:p-8">
                        <div className="p-8">
                            <WorkflowManager
                                workflow={otSettings.workflow}
                                onChange={(newWorkflow: WorkflowData) => setOTSettings({ ...otSettings, workflow: newWorkflow })}
                                title="Multi-Level Approval"
                                description="Workflow Engine for overtime hierarchies."
                                addStepLabel="Append Authorization Level"
                            />

                            <button
                                onClick={handleSaveWorkflow}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white py-4 text-xs font-bold hover:bg-purple-700 transition-all shadow-xl shadow-purple-500/20 active:scale-95 disabled:opacity-50 mt-8"
                            >
                                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                Commit Authorization Chain
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 sm:p-8">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-1">
                    Policy simulator
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Try raw OT hours against the rules above (including unsaved values). Does not persist data.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Raw hours</label>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={simRawHours}
                            onChange={(e) => setSimRawHours(e.target.value)}
                            className="w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleSimulatePolicy}
                        disabled={simLoading}
                        className="rounded-xl bg-slate-800 dark:bg-slate-600 text-white px-4 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50"
                    >
                        {simLoading ? 'Running…' : 'Run simulation'}
                    </button>
                </div>
                {simResult && (
                    <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-black/20 p-4 text-xs space-y-2">
                        <p>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Eligible:</span>{' '}
                            {simResult.eligible ? 'yes' : 'no'}
                        </p>
                        <p>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Final hours:</span>{' '}
                            {simResult.finalHours}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Steps:</span>{' '}
                            {simResult.steps?.join(' → ') || '—'}
                        </p>
                        <p className="text-[10px] text-gray-500 font-mono break-all">
                            {JSON.stringify(simResult.policyUsed)}
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
};

export default OTSettings;
