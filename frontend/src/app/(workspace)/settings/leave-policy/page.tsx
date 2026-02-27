'use client';

import React, { useState, useEffect } from 'react';
import {
    Settings,
    Calendar,
    Info,
    Calculator,
    RefreshCw,
    Save,
    AlertTriangle
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface LeavePolicySettings {
    financialYear: {
        startMonth: number;
        startDay: number;
        useCalendarYear: boolean;
    };
    earnedLeave: {
        earningType: 'attendance_based' | 'fixed' | 'slab_based';
        attendanceRules: {
            minDaysForFirstEL: number;
            daysPerEL: number;
            maxELPerMonth: number;
            maxELPerYear: number;
            considerPresentDays: boolean;
            considerHolidays: boolean;
        };
        slabRules: Array<{
            minDays: number;
            maxDays: number;
            elEarned: number;
            description: string;
        }>;
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
    encashment: {
        casualLeave: {
            enabled: boolean;
            minDaysForEncashment: number;
            maxEncashmentPerYear: number;
        };
        earnedLeave: {
            enabled: boolean;
            minDaysForEncashment: number;
            maxEncashmentPerYear: number;
        };
    };
    compliance: {
        applicableAct: 'shops_act' | 'factories_act' | 'it_act' | 'custom';
        considerWeeklyOffs: boolean;
        considerPaidHolidays: boolean;
        probationPeriod: {
            months: number;
            elApplicableAfter: boolean;
        };
    };
    annualCLReset?: {
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

export default function LeavePolicySettingsPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<LeavePolicySettings | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'basic' | 'earning' | 'carryforward' | 'annualreset' | 'encashment' | 'compliance'>('basic');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await api.getLeavePolicySettings();
            setSettings(res.data);
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        if (!settings) return;
        
        setSaving(true);
        try {
            await api.updateLeavePolicySettings(settings);
            // Show success message
            alert('Leave policy settings saved successfully!');
        } catch (error) {
            console.error('Error saving settings:', error);
            const message = error instanceof Error ? error.message : String(error);
            alert('Error saving settings: ' + message);
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
        current[keys[keys.length - 1]] = value;
        
        setSettings(updatedSettings);
    };

    const previewELCalculation = async () => {
        const employeeId = user?.employeeId ?? user?.id;
        if (!employeeId) return;
        try {
            const res = await api.previewELCalculation({
                employeeId,
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear()
            });
            setPreviewData(res.data);
        } catch (error) {
            console.error('Error in preview:', error);
            const msg = error instanceof Error ? error.message : String(error);
            alert('Error in EL calculation preview: ' + msg);
        }
    };

    const resetToDefaults = async () => {
        if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
            try {
                await api.resetLeavePolicySettings();
                await loadSettings();
                alert('Settings reset to defaults successfully!');
            } catch (error) {
                console.error('Error resetting settings:', error);
                const msg = error instanceof Error ? error.message : String(error);
                alert('Error resetting settings: ' + msg);
            }
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-red-600">Error loading settings</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 dark:bg-slate-900/50 p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Settings className="w-7 h-7 text-blue-600" />
                        Leave Policy Settings
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Configure earned leave rules, carry forward policies, and compliance settings
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={previewELCalculation}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        <Calculator className="w-4 h-4" />
                        Preview EL
                    </button>
                    <button
                        onClick={resetToDefaults}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reset to Defaults
                    </button>
                    <button
                        onClick={saveSettings}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
                <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-700">
                    {([
                        { id: 'basic', label: 'Financial Year', icon: Calendar },
                        { id: 'earning', label: 'EL Earning Rules', icon: Calculator },
                        { id: 'carryforward', label: 'Carry Forward', icon: RefreshCw },
                        { id: 'annualreset', label: 'Annual CL Reset', icon: AlertTriangle },
                        { id: 'encashment', label: 'Encashment', icon: Settings },
                        { id: 'compliance', label: 'Compliance', icon: AlertTriangle }
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 hover:text-white border-b-2 border-transparent hover:border-slate-300'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                {/* Financial Year Settings */}
                {activeTab === 'basic' && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Financial Year Configuration</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.financialYear.useCalendarYear}
                                        onChange={(e) => updateSettings('financialYear.useCalendarYear', '', e.target.checked)}
                                        className="mr-2"
                                    />
                                    Use Calendar Year (Jan-Dec)
                                </label>
                                <p className="text-xs text-slate-500">Uncheck for custom financial year</p>
                            </div>

                            {!settings.financialYear.useCalendarYear && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Financial Year Start Month
                                        </label>
                                        <select
                                            value={settings.financialYear.startMonth}
                                            onChange={(e) => updateSettings('financialYear.startMonth', '', parseInt(e.target.value))}
                                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                        >
                                            {['January', 'February', 'March', 'April', 'May', 'June',
                                              'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                                                <option key={index + 1} value={index + 1}>{month}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Start Day
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={settings.financialYear.startDay}
                                            onChange={(e) => updateSettings('financialYear.startDay', '', parseInt(e.target.value))}
                                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* EL Earning Rules */}
                {activeTab === 'earning' && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Earned Leave Earning Rules</h3>
                        
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Earning Type
                            </label>
                            <select
                                value={settings.earnedLeave.earningType}
                                onChange={(e) => updateSettings('earnedLeave.earningType', '', e.target.value)}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                            >
                                <option value="attendance_based">Attendance Based</option>
                                <option value="fixed">Fixed Amount</option>
                                <option value="slab_based">Slab Based</option>
                            </select>
                        </div>

                        {settings.earnedLeave.earningType === 'attendance_based' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Minimum Days for First EL
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={settings.earnedLeave.attendanceRules.minDaysForFirstEL}
                                        onChange={(e) => updateSettings('earnedLeave.attendanceRules.minDaysForFirstEL', '', parseInt(e.target.value))}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                    />
                                    <p className="text-xs text-slate-500">Days required to earn first EL</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Days Per EL
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={settings.earnedLeave.attendanceRules.daysPerEL}
                                        onChange={(e) => updateSettings('earnedLeave.attendanceRules.daysPerEL', '', parseInt(e.target.value))}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                    />
                                    <p className="text-xs text-slate-500">Attendance days required for 1 EL (e.g., 20)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Max EL Per Month
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={settings.earnedLeave.attendanceRules.maxELPerMonth}
                                        onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerMonth', '', parseInt(e.target.value))}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Max EL Per Year
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="365"
                                        value={settings.earnedLeave.attendanceRules.maxELPerYear}
                                        onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerYear', '', parseInt(e.target.value))}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Carry Forward Settings */}
                {activeTab === 'carryforward' && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Carry Forward Policies</h3>
                        
                        <div className="space-y-6">
                            {/* Casual Leave */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                                <h4 className="font-medium text-slate-900 dark:text-white mb-4">Casual Leave</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={settings.carryForward.casualLeave.enabled}
                                            onChange={(e) => updateSettings('carryForward.casualLeave.enabled', '', e.target.checked)}
                                        />
                                        Enable Carry Forward
                                    </label>
                                    
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={settings.carryForward.casualLeave.carryForwardToNextYear}
                                            onChange={(e) => updateSettings('carryForward.casualLeave.carryForwardToNextYear', '', e.target.checked)}
                                        />
                                        Carry to Next Year
                                    </label>
                                </div>
                            </div>

                            {/* Earned Leave */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                                <h4 className="font-medium text-slate-900 dark:text-white mb-4">Earned Leave</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={settings.carryForward.earnedLeave.enabled}
                                            onChange={(e) => updateSettings('carryForward.earnedLeave.enabled', '', e.target.checked)}
                                        />
                                        Enable Carry Forward
                                    </label>
                                    
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={settings.carryForward.earnedLeave.carryForwardToNextYear}
                                            onChange={(e) => updateSettings('carryForward.earnedLeave.carryForwardToNextYear', '', e.target.checked)}
                                        />
                                        Carry to Next Year
                                    </label>
                                </div>
                            </div>

                            {/* Compensatory Off */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                                <h4 className="font-medium text-slate-900 dark:text-white mb-4">Compensatory Off</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={settings.carryForward.compensatoryOff.enabled}
                                            onChange={(e) => updateSettings('carryForward.compensatoryOff.enabled', '', e.target.checked)}
                                        />
                                        Enable Carry Forward
                                    </label>
                                    
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={settings.carryForward.compensatoryOff.carryForwardToNextYear}
                                            onChange={(e) => updateSettings('carryForward.compensatoryOff.carryForwardToNextYear', '', e.target.checked)}
                                        />
                                        Carry to Next Year
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Annual CL Reset Settings */}
                {activeTab === 'annualreset' && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Annual CL Reset Settings</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.annualCLReset?.enabled ?? false}
                                        onChange={(e) => updateSettings('annualCLReset.enabled', '', e.target.checked)}
                                        className="mr-2"
                                    />
                                    Enable Annual CL Reset
                                </label>
                                <p className="text-xs text-slate-500">Reset CL balances to defined amount at financial year start</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Reset To Balance (Days)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="365"
                                    value={settings.annualCLReset?.resetToBalance ?? 12}
                                    onChange={(e) => updateSettings('annualCLReset.resetToBalance', '', parseInt(e.target.value))}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                />
                                <p className="text-xs text-slate-500">CL balance to reset to (e.g., 12 days)</p>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.annualCLReset?.addCarryForward ?? false}
                                        onChange={(e) => updateSettings('annualCLReset.addCarryForward', '', e.target.checked)}
                                        className="mr-2"
                                    />
                                    Add Carry Forward
                                </label>
                                <p className="text-xs text-slate-500">Add unused CL carry forward to reset balance</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Reset Month
                                </label>
                                <select
                                    value={settings.annualCLReset?.resetMonth ?? 1}
                                    onChange={(e) => updateSettings('annualCLReset.resetMonth', '', parseInt(e.target.value))}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                >
                                    {['January', 'February', 'March', 'April', 'May', 'June',
                                      'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                                        <option key={index + 1} value={index + 1}>{month}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Reset Day
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={settings.annualCLReset?.resetDay ?? 1}
                                    onChange={(e) => updateSettings('annualCLReset.resetDay', '', parseInt(e.target.value))}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                />
                            </div>
                        </div>

                        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                            <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">⚠️ Important Note</h4>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                Annual CL reset will affect all active employees. This operation cannot be undone. 
                                Make sure to review settings and use the preview feature before executing the reset.
                            </p>
                        </div>
                    </div>
                )}

                {/* Preview Results */}
                {previewData && (
                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">EL Calculation Preview</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <strong>Eligible:</strong> {previewData.eligible ? 'Yes' : 'No'}
                            </div>
                            <div>
                                <strong>Attendance Days:</strong> {previewData.attendanceDays}
                            </div>
                            <div>
                                <strong>EL Earned:</strong> {previewData.elEarned}
                            </div>
                            <div>
                                <strong>Max for Month:</strong> {previewData.maxELForMonth}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
