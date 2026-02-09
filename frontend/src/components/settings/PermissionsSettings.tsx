'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Key, Calculator, ShieldCheck, HelpCircle, ArrowRight } from 'lucide-react';

const PermissionsSettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rules, setRules] = useState({
        countThreshold: null as number | null,
        deductionType: null as 'half_day' | 'full_day' | 'custom_amount' | null,
        deductionAmount: null as number | null,
        minimumDuration: null as number | null,
        calculationMode: null as 'proportional' | 'floor' | null,
    });
    const [workflow, setWorkflow] = useState({
        isEnabled: false,
        steps: [] as any[],
        finalAuthority: { role: 'manager', anyHRCanApprove: false }
    });

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getPermissionDeductionSettings();
            if (res.success && res.data) {
                setRules(res.data.deductionRules || rules);
                setWorkflow(res.data.workflow || workflow);
            }
        } catch (err) {
            console.error('Error loading permission settings:', err);
            toast.error('Failed to load permission settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSaveRules = async () => {
        try {
            setSaving(true);
            const res = await api.savePermissionDeductionSettings({ deductionRules: rules });
            if (res.success) toast.success('Deduction rules saved');
            else toast.error(res.message || 'Failed to save rules');
        } catch (err) {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveWorkflow = async () => {
        try {
            setSaving(true);
            const res = await api.savePermissionDeductionSettings({ workflow });
            if (res.success) toast.success('Worklow configuration saved');
            else toast.error(res.message || 'Failed to save workflow');
        } catch (err) {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Permission & Out-Pass Settings</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure deduction rules and approval flows for short-duration permissions.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Deduction Rules Card */}
                <div className="p-8 rounded-3xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                            <Calculator className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Deduction Rules</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Define when and how much to deduct for permissions.</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Free Occurrences</label>
                                <input
                                    type="number"
                                    value={rules.countThreshold || ''}
                                    onChange={(e) => setRules({ ...rules, countThreshold: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-3 text-sm"
                                    placeholder="e.g. 2"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Min Duration (Min)</label>
                                <input
                                    type="number"
                                    value={rules.minimumDuration || ''}
                                    onChange={(e) => setRules({ ...rules, minimumDuration: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-3 text-sm"
                                    placeholder="e.g. 15"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-3">Deduction Action</label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'half_day', label: 'Half Day LOP' },
                                    { id: 'full_day', label: 'Full Day LOP' },
                                    { id: 'custom_amount', label: 'Fixed Amount' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setRules({ ...rules, deductionType: type.id as any })}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-semibold transition ${rules.deductionType === type.id
                                                ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20'
                                                : 'border-gray-100 bg-gray-50 dark:bg-gray-900/50 dark:border-gray-800 text-gray-500'
                                            }`}
                                    >
                                        {type.label}
                                        {rules.deductionType === type.id && <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {rules.deductionType === 'custom_amount' && (
                            <div className="animate-in slide-in-from-top-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Deduction Amount (INR)</label>
                                <input
                                    type="number"
                                    value={rules.deductionAmount || ''}
                                    onChange={(e) => setRules({ ...rules, deductionAmount: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-3 text-sm"
                                />
                            </div>
                        )}

                        <button
                            onClick={handleSaveRules}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gray-900 text-white py-3.5 text-sm font-semibold hover:bg-black transition-all shadow-xl shadow-gray-200 dark:shadow-none dark:bg-indigo-600 dark:hover:bg-indigo-700 mt-4"
                        >
                            {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                            Save Rules
                        </button>
                    </div>
                </div>

                {/* Workflow Card */}
                <div className="p-8 rounded-3xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Workflow Flow</h3>
                        </div>
                        <button
                            onClick={() => setWorkflow({ ...workflow, isEnabled: !workflow.isEnabled })}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${workflow.isEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${workflow.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {!workflow.isEnabled ? (
                            <div className="py-16 text-center">
                                <div className="h-16 w-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 dark:border-gray-800">
                                    <Key className="h-6 w-6 text-gray-300" />
                                </div>
                                <p className="text-sm text-gray-400">Workflow is disabled. Permissions will be auto-processed based on rules.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-900/20 border-2 border-dashed border-indigo-100 dark:border-indigo-900/30">
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-3 flex items-center gap-2 italic">
                                        <HelpCircle className="h-3.5 w-3.5" /> This workflow is mirrored from general leave patterns.
                                    </p>
                                    <div className="flex items-center gap-3 text-sm text-indigo-900 dark:text-indigo-300 font-semibold bg-white dark:bg-gray-900 px-4 py-3 rounded-xl shadow-sm">
                                        Employee <ArrowRight className="h-3 w-3" /> Dept. Head <ArrowRight className="h-3 w-3" /> HR Final Control
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleSaveWorkflow}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-white py-3.5 text-sm font-semibold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-none"
                        >
                            Update Workflow Config
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PermissionsSettings;
