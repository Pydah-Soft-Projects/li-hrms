'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, ChevronRight } from 'lucide-react';
import { SettingsSkeleton } from './SettingsSkeleton';

import LeaveTypesManager from './leave/LeaveTypesManager';
import LeavePolicy from './leave/LeavePolicy';
import LeaveWorkflow from './leave/LeaveWorkflow';

const LeaveSettings = ({ type = 'leave' }: { type?: 'leave' | 'od' }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [settings, setSettings] = useState<{
        type: string;
        types: { _id: string; name: string; code: string; isPaid: boolean; gender?: string[]; minServiceDays: number }[];
        statuses: { id: string; label: string; color: string }[];
        workflow: {
            isEnabled: boolean;
            steps: { stepOrder: number; stepName: string; approverRole: string; isActive: boolean }[];
            finalAuthority: { role: string; anyHRCanApprove: boolean };
        };
        settings: {
            allowBackdated: boolean;
            maxBackdatedDays: number;
            allowFutureDated: boolean;
            maxAdvanceDays: number;
        };
    }>({
        type,
        types: [],
        statuses: [],
        workflow: { isEnabled: false, steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
        settings: {
            allowBackdated: false,
            maxBackdatedDays: 0,
            allowFutureDated: false,
            maxAdvanceDays: 0,
        }
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.getLeaveSettings(type);
            if (res.success && res.data) setSettings(res.data);
        } catch (err) {
            console.error(`Error loading leave settings:`, err);
            toast.error('Failed to load leave settings');
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await api.saveLeaveSettings(type, settings);
            if (res.success) toast.success(`${type.toUpperCase()} settings updated successfully`);
            else toast.error(res.message || 'Failed to save settings');
        } catch {
            toast.error('An error occurred during save');
        } finally {
            setSaving(false);
        }
    };

    // Auto-save when settings change
    const handleSettingsChange = async (newSettings: typeof settings) => {
        setSettings(newSettings);
        try {
            await api.saveLeaveSettings(type, newSettings);
            toast.success('Settings updated');
        } catch {
            toast.error('Failed to update settings');
        }
    };

    if (loading) return <SettingsSkeleton />;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600">{type.toUpperCase()}</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white capitalize">
                        {type === 'leave' ? 'Leave Management' : 'On Duty (OD)'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Configure {type} categories, eligibility policies, and approval workflows.
                    </p>
                </div>
            </div>

            {/* Two-Column Kanban Layout - Responsive */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 items-start">
                {/* Left Column - Types & Policy */}
                <div className="space-y-6 md:space-y-8">
                    {/* Leave Types */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-6 md:p-8">
                        <LeaveTypesManager
                            types={settings.types || []}
                            onChange={(ts) => setSettings({ ...settings, types: ts })}
                        />

                        {/* Save Button for Types */}
                        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-4 text-xs font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
                            >
                                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                Save Leave Types
                            </button>
                        </div>
                    </section>

                    {/* Policy - No wrapper, auto-save */}
                    <LeavePolicy
                        settings={settings}
                        onChange={handleSettingsChange}
                    />
                </div>

                {/* Right Column - Workflow */}
                <div>
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
                        <LeaveWorkflow
                            workflow={settings.workflow}
                            onChange={(wf) => setSettings({ ...settings, workflow: wf })}
                        />

                        {/* Save Button for Workflow */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white py-4 text-xs font-bold hover:bg-purple-700 transition-all shadow-xl shadow-purple-500/20 active:scale-95 disabled:opacity-50"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Save Workflow
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default LeaveSettings;
