'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Settings, Calculator, RefreshCw, Save, AlertTriangle, Calendar, ChevronRight } from 'lucide-react';

interface LeavePolicySettings {
    financialYear: {
        startMonth: number;
        startDay: number;
        useCalendarYear: boolean;
    };
    earnedLeave: {
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
    const [activeTab, setActiveTab] = useState<'basic' | 'earning' | 'carryforward' | 'annualreset'>('basic');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getLeavePolicySettings();
            if (res.success && res.data) {
                setSettings(res.data);
            } else {
                // Set default settings if no data exists
                const defaultSettings = {
                    financialYear: {
                        startMonth: 4,
                        startDay: 1,
                        useCalendarYear: false
                    },
                    earnedLeave: {
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
                };
                setSettings(defaultSettings);
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
        
        const updatedRanges = [...(settings.earnedLeave.attendanceRules.attendanceRanges || []), newRange];
        
        updateSettings('earnedLeave.attendanceRules.attendanceRanges', '', updatedRanges);
        toast.success('Attendance range added successfully!');
    };

    const removeAttendanceRange = (index: number) => {
        if (!settings || !settings.earnedLeave.attendanceRules.attendanceRanges) return;
        
        const updatedRanges = settings.earnedLeave.attendanceRules.attendanceRanges.filter((_, i) => i !== index);
        
        updateSettings('earnedLeave.attendanceRules.attendanceRanges', '', updatedRanges);
        toast.success('Attendance range removed successfully!');
    };

    const updateAttendanceRange = (index: number, field: string, value: any) => {
        if (!settings) return;
        
        const updatedRanges = [...settings.earnedLeave.attendanceRules.attendanceRanges];
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
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    <span>Settings</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-indigo-600">Leave Policy</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Leave Policy Configuration</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Configure earned leave calculations, carry forward rules, and annual reset configurations
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className="xl:col-span-2 space-y-8">
                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={saveSettings}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>

                    {/* Main Settings Card */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="p-6 space-y-8">
                            {/* Financial Year Settings */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-indigo-600" />
                                        Financial Year Configuration
                                    </h3>
                                    
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                Start Month
                                            </label>
                                            <select
                                                value={settings.financialYear.startMonth}
                                                onChange={(e) => updateSettings('financialYear.startMonth', '', parseInt(e.target.value))}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                            >
                                                {[...Array(12)].map((_, i) => (
                                                    <option key={i} value={i + 1}>
                                                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                Start Day
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="31"
                                                value={settings.financialYear.startDay}
                                                onChange={(e) => updateSettings('financialYear.startDay', '', parseInt(e.target.value))}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                            />
                                        </div>

                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={settings.financialYear.useCalendarYear}
                                                onChange={(e) => updateSettings('financialYear.useCalendarYear', '', e.target.checked)}
                                                className="mr-2"
                                            />
                                            <label className="text-sm text-gray-700 dark:text-gray-300">
                                                Use Calendar Year (January - December)
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* EL Earning Rules */}
                                <div className="space-y-6">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Calculator className="w-5 h-5 text-indigo-600" />
                                        EL Earning Rules
                                    </h3>
                                    
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                Earning Type <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={settings.earnedLeave.earningType}
                                                onChange={(e) => updateSettings('earnedLeave.earningType', '', e.target.value)}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                            >
                                                <option value="attendance_based">Attendance Based</option>
                                                <option value="fixed">Fixed Amount</option>
                                            </select>
                                        </div>

                                        {/* Attendance Based Rules */}
                                        {settings.earnedLeave.earningType === 'attendance_based' && (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Min Days for First EL
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="31"
                                                            value={settings.earnedLeave.attendanceRules.minDaysForFirstEL}
                                                            onChange={(e) => updateSettings('earnedLeave.attendanceRules.minDaysForFirstEL', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Days Per EL
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="31"
                                                            value={settings.earnedLeave.attendanceRules.daysPerEL}
                                                            onChange={(e) => updateSettings('earnedLeave.attendanceRules.daysPerEL', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Max EL Per Month
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="10"
                                                            value={settings.earnedLeave.attendanceRules.maxELPerMonth}
                                                            onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerMonth', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Max EL Per Year
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="50"
                                                            value={settings.earnedLeave.attendanceRules.maxELPerYear}
                                                            onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerYear', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Fixed Amount Rules */}
                                        {settings.earnedLeave.earningType === 'fixed' && (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            EL Per Month
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="10"
                                                            value={settings.earnedLeave.fixedRules.elPerMonth}
                                                            onChange={(e) => updateSettings('earnedLeave.fixedRules.elPerMonth', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Max EL Per Year
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="50"
                                                            value={settings.earnedLeave.fixedRules.maxELPerYear}
                                                            onChange={(e) => updateSettings('earnedLeave.fixedRules.maxELPerYear', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Attendance Ranges Section */}
                            {settings.earnedLeave.earningType === 'attendance_based' && (
                                <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                            <Calculator className="w-5 h-5 text-indigo-600" />
                                            Attendance Ranges (Cumulative)
                                        </h3>
                                        <button
                                            onClick={() => addAttendanceRange()}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                                        >
                                            Add Range
                                        </button>
                                    </div>

                                    <p className="text-sm text-gray-600 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
                                        <strong>Cumulative Logic:</strong> Each range adds EL if attendance meets that threshold. 
                                        Example: 25 days attendance = 0 (1-10) + 1 (11-20) + 1 (21-25) + 2 (26+) = 4 EL total
                                    </p>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {settings.earnedLeave.attendanceRules.attendanceRanges.map((range: any, index: number) => (
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

                            {/* Carry Forward Settings */}
                            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
                                    <RefreshCw className="w-5 h-5 text-indigo-600" />
                                    Carry Forward Policies
                                </h3>
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Casual Leave Carry Forward */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Casual Leave (CL)</h4>
                                        
                                        <div className="space-y-4">
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.carryForward.casualLeave.enabled}
                                                    onChange={(e) => updateSettings('carryForward.casualLeave.enabled', '', e.target.checked)}
                                                    className="mr-2"
                                                />
                                                <label className="text-sm text-gray-700 dark:text-gray-300">
                                                    Enable Carry Forward
                                                </label>
                                            </div>

                                            {settings.carryForward.casualLeave.enabled && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Max Months
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="12"
                                                            value={settings.carryForward.casualLeave.maxMonths}
                                                            onChange={(e) => updateSettings('carryForward.casualLeave.maxMonths', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Expiry Months
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="12"
                                                            value={settings.carryForward.casualLeave.expiryMonths}
                                                            onChange={(e) => updateSettings('carryForward.casualLeave.expiryMonths', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Earned Leave Carry Forward */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Earned Leave (EL)</h4>
                                        
                                        <div className="space-y-4">
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.carryForward.earnedLeave.enabled}
                                                    onChange={(e) => updateSettings('carryForward.earnedLeave.enabled', '', e.target.checked)}
                                                    className="mr-2"
                                                />
                                                <label className="text-sm text-gray-700 dark:text-gray-300">
                                                    Enable Carry Forward
                                                </label>
                                            </div>

                                            {settings.carryForward.earnedLeave.enabled && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Max Months
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="12"
                                                            value={settings.carryForward.earnedLeave.maxMonths}
                                                            onChange={(e) => updateSettings('carryForward.earnedLeave.maxMonths', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                            Expiry Months
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="12"
                                                            value={settings.carryForward.earnedLeave.expiryMonths}
                                                            onChange={(e) => updateSettings('carryForward.earnedLeave.expiryMonths', '', parseInt(e.target.value))}
                                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Annual CL Reset */}
                            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
                                    <AlertTriangle className="w-5 h-5 text-indigo-600" />
                                    Annual CL Reset Configuration
                                </h3>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={settings.annualCLReset.enabled}
                                            onChange={(e) => updateSettings('annualCLReset.enabled', '', e.target.checked)}
                                            className="mr-2"
                                        />
                                        <label className="text-sm text-gray-700 dark:text-gray-300">
                                            Enable Annual Reset
                                        </label>
                                    </div>

                                    {settings.annualCLReset.enabled && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                        Reset To Balance
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="30"
                                                        value={settings.annualCLReset.resetToBalance}
                                                        onChange={(e) => updateSettings('annualCLReset.resetToBalance', '', parseInt(e.target.value))}
                                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                        Reset Month
                                                    </label>
                                                    <select
                                                        value={settings.annualCLReset.resetMonth}
                                                        onChange={(e) => updateSettings('annualCLReset.resetMonth', '', parseInt(e.target.value))}
                                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                    >
                                                        {[...Array(12)].map((_, i) => (
                                                            <option key={i} value={i + 1}>
                                                                {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                        Reset Day
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="31"
                                                        value={settings.annualCLReset.resetDay}
                                                        onChange={(e) => updateSettings('annualCLReset.resetDay', '', parseInt(e.target.value))}
                                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                        Add Carry Forward
                                                    </label>
                                                    <div className="flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={settings.annualCLReset.addCarryForward}
                                                            onChange={(e) => updateSettings('annualCLReset.addCarryForward', '', e.target.checked)}
                                                            className="mr-2"
                                                        />
                                                        <label className="text-sm text-gray-700 dark:text-gray-300">
                                                            Add carried forward CL to reset balance
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {settings.annualCLReset.enabled && (
                                        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                            <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">⚠️ Important Note</h4>
                                            <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                                Annual CL reset will affect all active employees. This operation cannot be undone. 
                                                Make sure to review settings and use preview feature before executing reset.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>);
};

export default LeavePolicySettings;
