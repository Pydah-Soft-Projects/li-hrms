'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Clock, ChevronRight, Percent } from 'lucide-react';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';

const OTSettings = () => {
    const [otSettings, setOTSettings] = useState<{
        payPerHour: number;
        multiplier: number;
        minOTHours: number;
        roundingMinutes: number;
        workflow: WorkflowData;
    }>({
        payPerHour: 0,
        multiplier: 1.5,
        minOTHours: 0,
        roundingMinutes: 15,
        workflow: {
            isEnabled: true,
            steps: [],
            finalAuthority: { role: 'admin', anyHRCanApprove: false }
        }
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                setLoading(true);
                const res = await api.getOvertimeSettings();
                if (res.success && res.data) {
                    setOTSettings(res.data);
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
                workflow: otSettings.workflow
            });
            toast.success('OT parameters updated');
        } catch {
            toast.error('Failed to save parameters');
        } finally {
            setSaving(false);
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure multiplier rates and approval gates.</p>
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
        </div>
    );
};

export default OTSettings;
