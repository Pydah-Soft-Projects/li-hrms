'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Settings, Calculator, RefreshCw, Save, AlertTriangle, Calendar, ChevronRight, Clock } from 'lucide-react';

interface LeavePolicySettings {
    financialYear: {
        startMonth: number;
        startDay: number;
        useCalendarYear: boolean;
    };
    earnedLeave: {
        enabled: boolean;
        earningType: 'attendance_based' | 'fixed';
        attendanceRules: {
            minDaysForFirstEL: number;
            daysPerEL: number;
            maxELPerMonth: number;
            maxELPerYear: number;
            considerPresentDays: boolean;
            considerHolidays: boolean;
            attendanceRanges: Array<{
                minDays: number;
                maxDays: number;
                elEarned: number;
                description: string;
            }>;
        };
        fixedRules: {
            elPerMonth: number;
            maxELPerYear: number;
        };
    };
    carryForward: {
        casualLeave: {
            enabled: boolean;
            maxMonths: number;
            expiryMonths: number;
            carryForwardToNextYear: boolean;
        };
        earnedLeave: {
            enabled: boolean;
            maxMonths: number;
            expiryMonths: number;
            carryForwardToNextYear: boolean;
        };
        compensatoryOff: {
            enabled: boolean;
            maxMonths: number;
            expiryMonths: number;
            carryForwardToNextYear: boolean;
        };
    };
    annualCLReset: {
        enabled: boolean;
        resetToBalance: number;
        addCarryForward: boolean;
        resetMonth: number;
        resetDay: number;
    };
    autoUpdate: {
        enabled: boolean;
        updateFrequency: 'daily' | 'weekly' | 'monthly';
        updateDay: number;
    };
}

const LeavePolicySettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const getDefaultSettings = (): LeavePolicySettings => ({
        financialYear: {
            startMonth: 4,
            startDay: 1,
            useCalendarYear: false
        },
        earnedLeave: {
            enabled: true,
            earningType: 'attendance_based',
            attendanceRules: {
                minDaysForFirstEL: 20,
                daysPerEL: 20,
                maxELPerMonth: 2,
                maxELPerYear: 12,
                considerPresentDays: true,
                considerHolidays: true,
                attendanceRanges: [
                    { minDays: 1, maxDays: 10, elEarned: 0, description: '01-10 days = 0 EL' },
                    { minDays: 11, maxDays: 20, elEarned: 1, description: '11-20 days = 1 EL' },
                    { minDays: 21, maxDays: 25, elEarned: 1, description: '21-25 days = 1 EL' },
                    { minDays: 26, maxDays: 31, elEarned: 2, description: '26-31 days = 2 EL' }
                ]
            },
            fixedRules: {
                elPerMonth: 1,
                maxELPerYear: 12
            }
        },
        carryForward: {
            casualLeave: {
                enabled: true,
                maxMonths: 12,
                expiryMonths: 12,
                carryForwardToNextYear: true
            },
            earnedLeave: {
                enabled: true,
                maxMonths: 24,
                expiryMonths: 60,
                carryForwardToNextYear: true
            },
            compensatoryOff: {
                enabled: true,
                maxMonths: 6,
                expiryMonths: 6,
                carryForwardToNextYear: false
            }
        },
        annualCLReset: {
            enabled: true,
            resetToBalance: 12,
            addCarryForward: true,
            resetMonth: 4,
            resetDay: 1
        },
        autoUpdate: {
            enabled: true,
            updateFrequency: 'monthly',
            updateDay: 1
        }
    });

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getLeavePolicySettings();
            const defaults = getDefaultSettings();
            if (res.success && res.data) {
                const data = res.data as Record<string, any>;
                setSettings({
                    financialYear: { ...defaults.financialYear, ...data.financialYear },
                    earnedLeave: {
                        enabled: data.earnedLeave?.enabled ?? defaults.earnedLeave.enabled,
                        earningType: data.earnedLeave?.earningType ?? defaults.earnedLeave.earningType,
                        attendanceRules: {
                            ...defaults.earnedLeave.attendanceRules,
                            ...data.earnedLeave?.attendanceRules,
                            // Backend stores under earnedLeave.attendanceRules.attendanceRanges (legacy: earnedLeave.attendanceRanges)
                            attendanceRanges: Array.isArray(data.earnedLeave?.attendanceRules?.attendanceRanges)
                                ? data.earnedLeave.attendanceRules.attendanceRanges
                                : Array.isArray(data.earnedLeave?.attendanceRanges)
                                    ? data.earnedLeave.attendanceRanges
                                    : defaults.earnedLeave.attendanceRules.attendanceRanges
                        },
                        fixedRules: { ...defaults.earnedLeave.fixedRules, ...data.earnedLeave?.fixedRules }
                    },
                    carryForward: {
                        casualLeave: { ...defaults.carryForward.casualLeave, ...data.carryForward?.casualLeave },
                        earnedLeave: { ...defaults.carryForward.earnedLeave, ...data.carryForward?.earnedLeave },
                        compensatoryOff: { ...defaults.carryForward.compensatoryOff, ...data.carryForward?.compensatoryOff }
                    },
                    annualCLReset: { ...defaults.annualCLReset, ...data.annualCLReset },
                    autoUpdate: { ...defaults.autoUpdate, ...data.autoUpdate }
                });
            } else {
                setSettings(getDefaultSettings());
                console.log('[LeavePolicySettings] Using default settings');
            }
        } catch (error: any) {
            console.error('Error loading settings:', error);
            toast.error('Failed to load leave policy settings');
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        if (!settings) return;
        
        setSaving(true);
        try {
            await api.updateLeavePolicySettings(settings);
            toast.success('Leave policy settings saved successfully!');
        } catch (error: any) {
            console.error('Error saving settings:', error);
            toast.error('Error saving settings: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const updateSettings = (section: string, field: string, value: any) => {
        if (!settings) return;
        
        const keys = section.split('.');
        const updatedSettings = { ...settings };
        
        // Navigate nested object
        let current: any = updatedSettings;
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        
        // Special handling for attendanceRanges array
        if (keys[keys.length - 1] === 'attendanceRanges' && Array.isArray(value)) {
            current[keys[keys.length - 1]] = value;
        } else {
            current[keys[keys.length - 1]] = value;
        }
        
        setSettings(updatedSettings);
    };

    const addAttendanceRange = () => {
        if (!settings) return;
        
        const newRange = {
            minDays: 1,
            maxDays: 10,
            elEarned: 0,
            description: '01-10 days = 0 EL'
        };
        
        const updatedRanges = [...(settings.earnedLeave?.attendanceRules?.attendanceRanges ?? []), newRange];
        
        updateSettings('earnedLeave.attendanceRules.attendanceRanges', '', updatedRanges);
        toast.success('Attendance range added successfully!');
    };

    const removeAttendanceRange = (index: number) => {
        const ranges = settings?.earnedLeave?.attendanceRules?.attendanceRanges;
        if (!settings || !Array.isArray(ranges)) return;
        
        const updatedRanges = ranges.filter((_, i) => i !== index);
        
        updateSettings('earnedLeave.attendanceRules.attendanceRanges', '', updatedRanges);
        toast.success('Attendance range removed successfully!');
    };

    const updateAttendanceRange = (index: number, field: string, value: any) => {
        const ranges = settings?.earnedLeave?.attendanceRules?.attendanceRanges;
        if (!settings || !Array.isArray(ranges)) return;
        
        const updatedRanges = [...ranges];
        updatedRanges[index] = {
            ...updatedRanges[index],
            [field]: value
        };
        
        updateSettings('earnedLeave.attendanceRules.attendanceRanges', '', updatedRanges);
    };

    if (loading) return <SettingsSkeleton />;

    if (!settings) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <div className="text-center">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Loading Settings...</h3>
                    <p className="text-gray-500 dark:text-gray-400">Please wait while we load leave policy settings</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                            <span>Settings</span>
                            <ChevronRight className="h-3 w-3" />
                            <span className="text-indigo-600">Leave Policy</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Leave Policy Configuration</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Configure financial year, earned leave rules, carry forward, and annual CL reset.
                        </p>
                    </div>
                    <button
                        onClick={saveSettings}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                {/* ——— Left column: Financial Year + EL Earning Rules ——— */}
                <div className="space-y-6 min-w-0">
                    {/* 1. Financial Year */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                            <Calendar className="w-4 h-4 text-indigo-600" />
                            Financial Year
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Leave cycles and annual reset.</p>

                        {/* Use calendar year — same toggle style as Leave Settings (Backdated / Future Dated) */}
                        <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 mb-4">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Use calendar year (Jan–Dec)</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings.financialYear.useCalendarYear}
                                onClick={() => updateSettings('financialYear.useCalendarYear', '', !settings.financialYear.useCalendarYear)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.financialYear.useCalendarYear ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.financialYear.useCalendarYear ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {!settings.financialYear.useCalendarYear && (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Start Month</label>
                                    <select
                                        value={settings.financialYear.startMonth}
                                        onChange={(e) => updateSettings('financialYear.startMonth', '', parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {[...Array(12)].map((_, i) => (
                                            <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Start Day</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={settings.financialYear.startDay}
                                        onChange={(e) => updateSettings('financialYear.startDay', '', parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        )}
                    </section>

                    {/* 2. EL Earning Rules */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                            <Calculator className="w-4 h-4 text-indigo-600" />
                            EL Earning Rules
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Enable earned leave and set how EL is accrued (attendance-based or fixed).</p>

                        {/* Enable EL — same toggle style as Financial Year / Backdated */}
                        <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 mb-4">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Earned Leave (EL)</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings.earnedLeave.enabled}
                                onClick={() => updateSettings('earnedLeave.enabled', '', !settings.earnedLeave.enabled)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.earnedLeave.enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.earnedLeave.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {!settings.earnedLeave.enabled && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">EL is disabled. Turn on to configure earning type and rules.</p>
                        )}

                        {settings.earnedLeave.enabled && (
                        <>
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Earning type</label>
                                <select
                                    value={settings.earnedLeave.earningType}
                                    onChange={(e) => updateSettings('earnedLeave.earningType', '', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="attendance_based">Attendance based</option>
                                    <option value="fixed">Fixed amount</option>
                                </select>
                            </div>

                            {settings.earnedLeave.earningType === 'attendance_based' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Min days (first EL)</label>
                                            <input type="number" min="1" max="31" value={settings.earnedLeave.attendanceRules.minDaysForFirstEL}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.minDaysForFirstEL', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Days per EL</label>
                                            <input type="number" min="1" max="31" value={settings.earnedLeave.attendanceRules.daysPerEL}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.daysPerEL', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max EL / month</label>
                                            <input type="number" min="0" max="10" value={settings.earnedLeave.attendanceRules.maxELPerMonth}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerMonth', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max EL / year</label>
                                            <input type="number" min="0" max="50" value={settings.earnedLeave.attendanceRules.maxELPerYear}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerYear', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={settings.earnedLeave.attendanceRules.considerPresentDays}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.considerPresentDays', '', e.target.checked)}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Consider present days</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={settings.earnedLeave.attendanceRules.considerHolidays}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.considerHolidays', '', e.target.checked)}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Consider holidays</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {settings.earnedLeave.earningType === 'fixed' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">EL per month</label>
                                        <input type="number" min="0" max="10" value={settings.earnedLeave.fixedRules.elPerMonth}
                                            onChange={(e) => updateSettings('earnedLeave.fixedRules.elPerMonth', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max EL / year</label>
                                        <input type="number" min="0" max="50" value={settings.earnedLeave.fixedRules.maxELPerYear}
                                            onChange={(e) => updateSettings('earnedLeave.fixedRules.maxELPerYear', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {settings.earnedLeave.earningType === 'attendance_based' && (
                            <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Attendance ranges (cumulative)</h4>
                                    <button type="button" onClick={() => addAttendanceRange()}
                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-medium">
                                        Add range
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg mb-4">
                                    Each range adds EL when attendance falls in that band. Example: 25 days → 0+1+1+2 = 4 EL.
                                </p>
                                <div className="grid grid-cols-1 gap-4">
                                        {(settings.earnedLeave?.attendanceRules?.attendanceRanges ?? []).map((range: any, index: number) => (
                                            <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Range {index + 1}</h4>
                                                    <button
                                                        onClick={() => removeAttendanceRange(index)}
                                                        className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Min Days
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="31"
                                                            value={range.minDays}
                                                            onChange={(e) => updateAttendanceRange(index, 'minDays', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Max Days
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="31"
                                                            value={range.maxDays}
                                                            onChange={(e) => updateAttendanceRange(index, 'maxDays', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            EL Earned
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="10"
                                                            value={range.elEarned}
                                                            onChange={(e) => updateAttendanceRange(index, 'elEarned', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Description
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={range.description}
                                                            onChange={(e) => updateAttendanceRange(index, 'description', e.target.value)}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded">
                                                    {String(range.minDays).padStart(2, '0')}-{range.maxDays} days = {range.elEarned} EL
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                        </>
                        )}
                    </section>
                </div>

                {/* ——— Right column: Carry Forward, Annual CL Reset, Auto Update ——— */}
                <div className="space-y-6 min-w-0">
                    {/* 3. Carry Forward */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                            <RefreshCw className="w-4 h-4 text-indigo-600" />
                            Carry Forward
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">CL, EL & CCL carry forward and expiry.</p>
                        <div className="grid grid-cols-1 gap-6">
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">Casual Leave (CL)</h4>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={settings.carryForward.casualLeave.enabled}
                                        onChange={(e) => updateSettings('carryForward.casualLeave.enabled', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable carry forward</span>
                                </label>
                                {settings.carryForward.casualLeave.enabled && (
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div className="space-y-1">
                                            <label className="block text-xs text-gray-500 dark:text-gray-400">Max months</label>
                                            <input type="number" min="1" max="12" value={settings.carryForward.casualLeave.maxMonths}
                                                onChange={(e) => updateSettings('carryForward.casualLeave.maxMonths', '', parseInt(e.target.value))}
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs text-gray-500 dark:text-gray-400">Expiry months</label>
                                            <input type="number" min="1" max="12" value={settings.carryForward.casualLeave.expiryMonths}
                                                onChange={(e) => updateSettings('carryForward.casualLeave.expiryMonths', '', parseInt(e.target.value))}
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">Earned Leave (EL)</h4>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={settings.carryForward.earnedLeave.enabled}
                                        onChange={(e) => updateSettings('carryForward.earnedLeave.enabled', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable carry forward</span>
                                </label>
                                {settings.carryForward.earnedLeave.enabled && (
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div className="space-y-1">
                                            <label className="block text-xs text-gray-500 dark:text-gray-400">Max months</label>
                                            <input type="number" min="1" max="12" value={settings.carryForward.earnedLeave.maxMonths}
                                                onChange={(e) => updateSettings('carryForward.earnedLeave.maxMonths', '', parseInt(e.target.value))}
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs text-gray-500 dark:text-gray-400">Expiry months</label>
                                            <input type="number" min="1" max="12" value={settings.carryForward.earnedLeave.expiryMonths}
                                                onChange={(e) => updateSettings('carryForward.earnedLeave.expiryMonths', '', parseInt(e.target.value))}
                                                className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">Compensatory Off (CCL)</h4>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={settings.carryForward.compensatoryOff.enabled}
                                        onChange={(e) => updateSettings('carryForward.compensatoryOff.enabled', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable carry forward</span>
                                </label>
                                {settings.carryForward.compensatoryOff.enabled && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3 pt-1">
                                            <div className="space-y-1">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400">Max months</label>
                                                <input type="number" min="1" max="12" value={settings.carryForward.compensatoryOff.maxMonths}
                                                    onChange={(e) => updateSettings('carryForward.compensatoryOff.maxMonths', '', parseInt(e.target.value))}
                                                    className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400">Expiry months</label>
                                                <input type="number" min="1" max="12" value={settings.carryForward.compensatoryOff.expiryMonths}
                                                    onChange={(e) => updateSettings('carryForward.compensatoryOff.expiryMonths', '', parseInt(e.target.value))}
                                                    className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm" />
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer pt-1">
                                            <input type="checkbox" checked={settings.carryForward.compensatoryOff.carryForwardToNextYear}
                                                onChange={(e) => updateSettings('carryForward.compensatoryOff.carryForwardToNextYear', '', e.target.checked)}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Carry to next year</span>
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* 4. Annual CL Reset */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-indigo-600" />
                            Annual CL Reset
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Reset CL balance once per year; optional carry.</p>
                        <label className="flex items-center gap-2 cursor-pointer mb-4">
                            <input type="checkbox" checked={settings.annualCLReset.enabled}
                                onChange={(e) => updateSettings('annualCLReset.enabled', '', e.target.checked)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Enable annual reset</span>
                        </label>
                        {settings.annualCLReset.enabled && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Reset to balance</label>
                                        <input type="number" min="0" max="30" value={settings.annualCLReset.resetToBalance}
                                            onChange={(e) => updateSettings('annualCLReset.resetToBalance', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Reset month</label>
                                        <select value={settings.annualCLReset.resetMonth}
                                            onChange={(e) => updateSettings('annualCLReset.resetMonth', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500">
                                            {[...Array(12)].map((_, i) => (
                                                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Reset day</label>
                                        <input type="number" min="1" max="31" value={settings.annualCLReset.resetDay}
                                            onChange={(e) => updateSettings('annualCLReset.resetDay', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={settings.annualCLReset.addCarryForward}
                                        onChange={(e) => updateSettings('annualCLReset.addCarryForward', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Add carried CL to reset balance</span>
                                </label>
                                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-800 dark:text-amber-200">Affects all employees. Use preview before running.</p>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* 5. Auto Update */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                            <Clock className="w-4 h-4 text-indigo-600" />
                            Auto Update
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Schedule automatic balance updates.</p>
                        <label className="flex items-center gap-2 cursor-pointer mb-4">
                            <input type="checkbox" checked={settings.autoUpdate.enabled}
                                onChange={(e) => updateSettings('autoUpdate.enabled', '', e.target.checked)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Enable auto update</span>
                        </label>
                        {settings.autoUpdate.enabled && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Frequency</label>
                                    <select value={settings.autoUpdate.updateFrequency}
                                        onChange={(e) => updateSettings('autoUpdate.updateFrequency', '', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500">
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Update day</label>
                                    <input type="number" min="1" max="31" value={settings.autoUpdate.updateDay}
                                        onChange={(e) => updateSettings('autoUpdate.updateDay', '', parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500" />
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* Save — full width */}
            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800 mt-6">
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm"
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
            </div>
        );
};

export default LeavePolicySettings;
