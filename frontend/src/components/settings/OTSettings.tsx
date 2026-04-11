'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Clock, ChevronRight } from 'lucide-react';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import { minutesToHHMM, hhmmToMinutes, hoursToHHMM, hhmmToHours } from './otTimeHelpers';

type OtSettingsState = {
    payPerHour: number;
    multiplier: number;
    minOTHours: number;
    roundingMinutes: number;
    recognitionMode: string;
    thresholdHours: number | null;
    roundUpIfFractionMinutesGte: number | null;
    otHourRanges: { minMinutes: number; maxMinutes: number; creditedMinutes: number; label?: string }[];
    autoCreateOtRequest: boolean;
    defaultWorkingHoursPerDay: number;
    allowBackdated: boolean;
    maxBackdatedDays: number;
    allowFutureDated: boolean;
    maxAdvanceDays: number;
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
    otHourRanges: [],
    autoCreateOtRequest: false,
    defaultWorkingHoursPerDay: 8,
    allowBackdated: false,
    maxBackdatedDays: 0,
    allowFutureDated: true,
    maxAdvanceDays: 365,
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
    const [simRawHours, setSimRawHours] = useState('01:22');
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
                        otHourRanges: Array.isArray(d.otHourRanges)
                            ? (d.otHourRanges as { minMinutes: number; maxMinutes: number; creditedMinutes: number; label?: string }[])
                            : [],
                        autoCreateOtRequest: Boolean(d.autoCreateOtRequest),
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
                otHourRanges: otSettings.otHourRanges,
                autoCreateOtRequest: otSettings.autoCreateOtRequest,
                defaultWorkingHoursPerDay: otSettings.defaultWorkingHoursPerDay,
                allowBackdated: otSettings.allowBackdated,
                maxBackdatedDays: otSettings.maxBackdatedDays,
                allowFutureDated: otSettings.allowFutureDated,
                maxAdvanceDays: otSettings.maxAdvanceDays,
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
        const rawMinutes = hhmmToMinutes(simRawHours);
        if (!simRawHours || !/^\d{1,2}:[0-5]\d$/.test(simRawHours) || rawMinutes < 0) {
            toast.error('Enter a valid raw OT duration in HH:MM format');
            return;
        }
        const raw = rawMinutes / 60;
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
                    otHourRanges: otSettings.otHourRanges,
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600">Overtime</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Overtime (OT)</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Automatic OT hour rules, range slabs, employee hourly OT pay, and approvals.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1.95fr] gap-6 items-start">
                {/* OT Parameters */}
                <div>
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden sticky top-24">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <Clock className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Parameters</h3>
                        </div>

                        <div className="p-5 space-y-6">
                            <div className="space-y-4">
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
                                        <span className="text-[10px] text-gray-500">Threshold (HH:MM)</span>
                                        <input
                                            type="time"
                                            step={60}
                                            value={hoursToHHMM(otSettings.thresholdHours)}
                                            onChange={(e) =>
                                                setOTSettings({
                                                    ...otSettings,
                                                    thresholdHours: hhmmToHours(e.target.value),
                                                })
                                            }
                                            className="w-28 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
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
                                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Apply date window</p>
                                        <label className="flex items-center justify-between text-[10px] text-gray-600 dark:text-gray-300">
                                            <span>Allow backdated</span>
                                            <input
                                                type="checkbox"
                                                checked={otSettings.allowBackdated}
                                                onChange={(e) => setOTSettings({ ...otSettings, allowBackdated: e.target.checked })}
                                            />
                                        </label>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-gray-500">Max backdated days</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={otSettings.maxBackdatedDays}
                                                onChange={(e) => setOTSettings({ ...otSettings, maxBackdatedDays: Number(e.target.value || 0) })}
                                                className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
                                            />
                                        </div>
                                        <label className="flex items-center justify-between text-[10px] text-gray-600 dark:text-gray-300">
                                            <span>Allow future-dated</span>
                                            <input
                                                type="checkbox"
                                                checked={otSettings.allowFutureDated}
                                                onChange={(e) => setOTSettings({ ...otSettings, allowFutureDated: e.target.checked })}
                                            />
                                        </label>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-gray-500">Max advance days</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={otSettings.maxAdvanceDays}
                                                onChange={(e) => setOTSettings({ ...otSettings, maxAdvanceDays: Number(e.target.value || 0) })}
                                                className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-right"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                        OT pay basis
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        Per hour pay = (employee monthly basic / payroll days) / working hours per day.
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-gray-500">Default hours/day</span>
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
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter pt-2">
                                        Ranges (HH:MM)
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        Example: 00:30 to 01:00 consider as 01:00
                                    </p>
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-9 gap-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 px-1">
                                            <span className="col-span-2">From</span>
                                            <span className="col-span-1 text-center">-</span>
                                            <span className="col-span-2">To</span>
                                            <span className="col-span-1 text-center">=</span>
                                            <span className="col-span-2">Consider As</span>
                                            <span className="col-span-1 text-right">Action</span>
                                        </div>
                                        {otSettings.otHourRanges.map((r, idx) => (
                                            <div key={idx} className="grid grid-cols-9 gap-2 items-center rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-slate-900/30 p-2">
                                                <input
                                                    type="time"
                                                    step={60}
                                                    value={minutesToHHMM(r.minMinutes)}
                                                    onChange={(e) => {
                                                        const next = [...otSettings.otHourRanges];
                                                        next[idx] = { ...next[idx], minMinutes: hhmmToMinutes(e.target.value) };
                                                        setOTSettings({ ...otSettings, otHourRanges: next });
                                                    }}
                                                    className="col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs"
                                                />
                                                <span className="text-[10px] text-gray-500 text-center">to</span>
                                                <input
                                                    type="time"
                                                    step={60}
                                                    value={minutesToHHMM(r.maxMinutes)}
                                                    onChange={(e) => {
                                                        const next = [...otSettings.otHourRanges];
                                                        next[idx] = { ...next[idx], maxMinutes: hhmmToMinutes(e.target.value) };
                                                        setOTSettings({ ...otSettings, otHourRanges: next });
                                                    }}
                                                    className="col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs"
                                                />
                                                <span className="text-[10px] text-gray-500 text-center">consider</span>
                                                <input
                                                    type="time"
                                                    step={60}
                                                    value={minutesToHHMM(r.creditedMinutes)}
                                                    onChange={(e) => {
                                                        const next = [...otSettings.otHourRanges];
                                                        next[idx] = { ...next[idx], creditedMinutes: hhmmToMinutes(e.target.value) };
                                                        setOTSettings({ ...otSettings, otHourRanges: next });
                                                    }}
                                                    className="col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = otSettings.otHourRanges.filter((_, i) => i !== idx);
                                                        setOTSettings({ ...otSettings, otHourRanges: next });
                                                    }}
                                                    className="text-[10px] text-red-600 font-bold col-span-1 text-right"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOTSettings({
                                                    ...otSettings,
                                                    otHourRanges: [
                                                        ...otSettings.otHourRanges,
                                                        { minMinutes: 0, maxMinutes: 0, creditedMinutes: 0, label: '' },
                                                    ],
                                                })
                                            }
                                            className="text-[10px] text-indigo-600 font-bold hover:text-indigo-700"
                                        >
                                            + Add range
                                        </button>
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
                <div className="space-y-6">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden min-h-[400px] p-4 sm:p-5 lg:p-6">
                        <div className="rounded-xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-900/10 px-3 py-2 mb-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                Approval Chain
                            </p>
                            <p className="text-[11px] text-purple-700/80 dark:text-purple-200/80 mt-0.5">
                                Keep steps minimal for faster OT approvals.
                            </p>
                        </div>
                        <div className="px-1">
                            <WorkflowManager
                                workflow={otSettings.workflow}
                                onChange={(newWorkflow: WorkflowData) => setOTSettings({ ...otSettings, workflow: newWorkflow })}
                                title="Multi-Level Approval"
                                description="Workflow Engine for overtime hierarchies."
                                addStepLabel="Add Approval Step"
                            />

                            <button
                                onClick={handleSaveWorkflow}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white py-3.5 text-xs font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20 active:scale-95 disabled:opacity-50 mt-6"
                            >
                                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                Save Approval Chain
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
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Raw OT (HH:MM)</label>
                        <input
                            type="time"
                            step={60}
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
                            {minutesToHHMM(Math.round((simResult.finalHours || 0) * 60))} ({simResult.finalHours})
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
