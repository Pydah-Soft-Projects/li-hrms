'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Wallet, Receipt, ChevronRight } from 'lucide-react';
import { SettingsSkeleton } from './SettingsSkeleton';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';

const LoanSettings = ({ type = 'loan' }: { type?: 'loan' | 'salary_advance' }) => {
    const [loanSettings, setLoanSettings] = useState({
        maxAmount: 50000,
        interestRate: 0,
        isInterestApplicable: false,
        maxTenure: 12,
        allowMultiple: false,
    });
    const [workflow, setWorkflow] = useState<WorkflowData>({
        isEnabled: true,
        steps: [],
        finalAuthority: { role: 'admin', anyHRCanApprove: false }
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                setLoading(true);
                const res = await api.getLoanSettings(type);

                if (res.success && res.data) {
                    if (res.data.settings) setLoanSettings(res.data.settings);
                    if (res.data.workflow) setWorkflow(res.data.workflow);
                }
            } catch (err) {
                console.error('Failed to load settings', err);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, [type]);

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.saveLoanSettings(type, {
                settings: loanSettings,
                workflow: { ...workflow, isEnabled: true }
            });
            toast.success('Settings updated successfully');
        } catch {
            toast.error('Failed to save settings');
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
                        <span className="text-indigo-600">{type.replace('_', ' ')}</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Capital Disbursement</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure loan/advance parameters and authorization gates.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
                <div className="xl:col-span-1 space-y-8">
                    {/* Financial Caps */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
                        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
                            <Wallet className="h-5 w-5 text-indigo-600" />
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">Financial Caps</h3>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest pl-1">Maximum Amount</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">₹</div>
                                    <input
                                        type="number"
                                        value={loanSettings.maxAmount ?? ''}
                                        onChange={(e) => setLoanSettings({ ...loanSettings, maxAmount: parseInt(e.target.value) })}
                                        className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl pl-8 pr-4 py-3.5 text-sm font-black text-indigo-600 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest pl-1">Max Tenure (Months)</label>
                                <input
                                    type="number"
                                    value={loanSettings.maxTenure ?? ''}
                                    onChange={(e) => setLoanSettings({ ...loanSettings, maxTenure: parseInt(e.target.value) })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3.5 text-sm font-black text-indigo-600 outline-none"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Recovery Logic */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
                        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
                            <Receipt className="h-5 w-5 text-indigo-600" />
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">Recovery Logic</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-black/10 rounded-xl border border-gray-100 dark:border-gray-800/50 group hover:border-indigo-500/30 transition-all">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Apply Interest</label>
                                    <p className="text-[10px] text-gray-500">Enable interest calculation for this type.</p>
                                </div>
                                <div
                                    onClick={() => setLoanSettings({ ...loanSettings, isInterestApplicable: !loanSettings.isInterestApplicable })}
                                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${loanSettings.isInterestApplicable ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-800'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${loanSettings.isInterestApplicable ? 'translate-x-6' : 'translate-x-0'}`} />
                                </div>
                            </div>

                            <div className={`space-y-1 transition-opacity duration-300 ${!loanSettings.isInterestApplicable ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest pl-1">Interest Rate (%)</label>
                                <input
                                    type="number"
                                    disabled={!loanSettings.isInterestApplicable}
                                    value={loanSettings.interestRate ?? ''}
                                    onChange={(e) => setLoanSettings({ ...loanSettings, interestRate: parseFloat(e.target.value) })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3.5 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-4 text-xs font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
                            >
                                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                Commit Settings
                            </button>
                        </div>
                    </section>
                </div>

                {/* Workflow Column */}
                <div className="xl:col-span-2">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
                        <WorkflowManager
                            workflow={workflow}
                            onChange={(newWorkflow: WorkflowData) => setWorkflow(newWorkflow)}
                            title="Multi-Level Approval"
                            description="Workflow Engine for capital disbursement."
                            addStepLabel="Append Authorization Level"
                        />

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white py-4 text-xs font-bold hover:bg-purple-700 transition-all shadow-xl shadow-purple-500/20 active:scale-95 disabled:opacity-50"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Commit Authorization Chain
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default LoanSettings;
