'use client';

import React, { useState, useEffect } from 'react';
import { api, apiRequest } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Rocket, Info, Save, ChevronRight } from 'lucide-react';

const PayrollSettings = () => {
    const [payslipReleaseRequired, setPayslipReleaseRequired] = useState<boolean>(true);
    const [payslipHistoryMonths, setPayslipHistoryMonths] = useState<number>(6);
    const [payslipDownloadLimit, setPayslipDownloadLimit] = useState<number>(5);
    const [payrollCycleStartDay, setPayrollCycleStartDay] = useState<number>(1);
    const [payrollCycleEndDay, setPayrollCycleEndDay] = useState<number>(31);
    const [includeMissing, setIncludeMissing] = useState<boolean>(true);
    const [enableAbsentDeduction, setEnableAbsentDeduction] = useState<boolean>(false);
    const [lopDaysPerAbsent, setLopDaysPerAbsent] = useState<number>(1);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [releasing, setReleasing] = useState(false);
    const [releaseMonth, setReleaseMonth] = useState<string>(new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));

    const loadSettings = async () => {
        try {
            setLoading(true);
            const [resRelease, resHistory, resLimit, resStart, resEnd, resMissing, resAbsent] = await Promise.all([
                api.getSetting('payslip_release_required'),
                api.getSetting('payslip_history_months'),
                api.getSetting('payslip_download_limit'),
                api.getSetting('payroll_cycle_start_day'),
                api.getSetting('payroll_cycle_end_day'),
                api.getIncludeMissingSetting(),
                api.getAbsentDeductionSettings()
            ]);

            if (resRelease.success && resRelease.data) setPayslipReleaseRequired(!!resRelease.data.value);
            if (resHistory.success && resHistory.data) setPayslipHistoryMonths(Number(resHistory.data.value));
            if (resLimit.success && resLimit.data) setPayslipDownloadLimit(Number(resLimit.data.value));
            if (resStart.success && resStart.data) setPayrollCycleStartDay(Number(resStart.data.value));
            if (resEnd.success && resEnd.data) setPayrollCycleEndDay(Number(resEnd.data.value));
            if (resMissing.success && resMissing.data) setIncludeMissing(!!resMissing.data.value);
            if (resAbsent.enable !== undefined) {
                setEnableAbsentDeduction(resAbsent.enable);
                setLopDaysPerAbsent(resAbsent.lopDays);
            }
        } catch (err) {
            console.error('Failed to load payroll settings', err);
            toast.error('Failed to load payroll settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async () => {
        try {
            setSaving(true);
            await Promise.all([
                api.upsertSetting({ key: 'payslip_release_required', value: payslipReleaseRequired, category: 'payroll' }),
                api.upsertSetting({ key: 'payslip_history_months', value: payslipHistoryMonths, category: 'payroll' }),
                api.upsertSetting({ key: 'payslip_download_limit', value: payslipDownloadLimit, category: 'payroll' }),
                api.upsertSetting({ key: 'payroll_cycle_start_day', value: payrollCycleStartDay, category: 'payroll' }),
                api.upsertSetting({ key: 'payroll_cycle_end_day', value: payrollCycleEndDay, category: 'payroll' }),
                api.saveIncludeMissingSetting(includeMissing),
                api.saveAbsentDeductionSettings(enableAbsentDeduction, lopDaysPerAbsent)
            ]);
            toast.success('Payroll settings saved successfully');
        } catch {
            toast.error('Failed to save payroll settings');
        } finally {
            setSaving(false);
        }
    };

    const handleBulkRelease = async () => {
        if (!releaseMonth) {
            toast.error('Please select a month for release');
            return;
        }
        try {
            setReleasing(true);
            const response = await apiRequest<{ success: boolean; count?: number; message?: string }>('/payroll/release', {
                method: 'PUT',
                body: JSON.stringify({ month: releaseMonth })
            });
            if (response.success) {
                toast.success(`Successfully released ${response.count} payslips for ${releaseMonth}`);
            } else {
                toast.error(response.message || 'Failed to release payslips');
            }
        } catch (err: unknown) {
            const error = err as { message?: string };
            toast.error(error.message || 'Error releasing payslips');
        } finally {
            setReleasing(false);
        }
    };

    if (loading) return <SettingsSkeleton />;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-10 flex items-end justify-between border-b border-gray-200 pb-8 dark:border-gray-800">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600">Payroll</span>
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Payroll & Cycle</h2>
                    <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Configure financial timelines and disbursement logic.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className="xl:col-span-2 space-y-8">
                    {/* Visibility & Control Section */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Privacy & Visibility</h3>
                            <div className="flex items-center gap-2">
                                {payslipReleaseRequired ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-900/30 uppercase tracking-tight">
                                        Manual Release Mandatory
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 uppercase tracking-tight">
                                        Auto-Release Enabled
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Enforce Manual Release</p>
                                    <p className="text-xs text-gray-500">Payslips must be explicitly released before they appear on employee dashboards.</p>
                                </div>
                                <button
                                    onClick={() => setPayslipReleaseRequired(!payslipReleaseRequired)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${payslipReleaseRequired ? 'bg-indigo-600 shadow-[0_0_12px_rgba(79,70,229,0.3)]' : 'bg-gray-200 dark:bg-gray-800'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${payslipReleaseRequired ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gray-50 dark:border-gray-800/50">
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">History Retention (Mos)</label>
                                    <input
                                        type="number"
                                        value={payslipHistoryMonths ?? ''}
                                        onChange={(e) => setPayslipHistoryMonths(Number(e.target.value))}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                    />
                                    <p className="text-[10px] text-gray-400">Number of previous months visible to staff.</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Download Quota</label>
                                    <input
                                        type="number"
                                        value={payslipDownloadLimit ?? ''}
                                        onChange={(e) => setPayslipDownloadLimit(Number(e.target.value))}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                    />
                                    <p className="text-[10px] text-gray-400">Max PDF generations per session per user.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Payroll Cycle Section */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Payroll Cycle</h3>
                        </div>
                        <div className="p-8 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Cycle Commencement (Day)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={payrollCycleStartDay ?? ''}
                                        onChange={(e) => setPayrollCycleStartDay(Number(e.target.value))}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Cycle Conclusion (Day)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={payrollCycleEndDay ?? ''}
                                        onChange={(e) => setPayrollCycleEndDay(Number(e.target.value))}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="p-6 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#1E293B] shadow-sm border border-blue-100/50 dark:border-blue-800">
                                        <Info className="h-4 w-4 text-blue-500" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Include Missing Components</p>
                                        <p className="text-[10px] text-blue-700 dark:text-blue-400/80">Include standard allowances/deductions even if employee has no overrides.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIncludeMissing(!includeMissing)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${includeMissing ? 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.3)]' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${includeMissing ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Absent Deduction Section */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Attendance Deductions</h3>
                        </div>
                        <div className="p-8 space-y-8">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Enable Absent Deduction</p>
                                    <p className="text-xs text-gray-500">Automatically apply Loss of Pay (LOP) for unexcused absences.</p>
                                </div>
                                <button
                                    onClick={() => setEnableAbsentDeduction(!enableAbsentDeduction)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${enableAbsentDeduction ? 'bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.3)]' : 'bg-gray-200 dark:bg-gray-800'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${enableAbsentDeduction ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {enableAbsentDeduction && (
                                <div className="pt-8 border-t border-gray-50 dark:border-gray-800/50 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="max-w-xs space-y-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">LOP Days per Absent</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={lopDaysPerAbsent ?? ''}
                                            onChange={(e) => setLopDaysPerAbsent(Number(e.target.value))}
                                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                        />
                                        <p className="text-[10px] text-gray-400">Number of days to deduct for each unverified absent record.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="space-y-8">
                    {/* Bulk Release Card */}
                    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-emerald-50/30 dark:bg-emerald-900/5">
                            <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Batch Operations</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Release Target Month</label>
                                <input
                                    type="text"
                                    value={releaseMonth}
                                    onChange={(e) => setReleaseMonth(e.target.value)}
                                    placeholder="e.g. February 2026"
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold dark:border-gray-700 dark:bg-[#0F172A] dark:text-white"
                                />
                            </div>
                            <button
                                onClick={handleBulkRelease}
                                disabled={releasing}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-500/10 active:scale-95"
                            >
                                {releasing ? 'Releasing...' : 'Broadcast Payslips'}
                                <Rocket className="h-3.5 w-3.5" />
                            </button>
                            <p className="text-[9px] text-center text-gray-400 font-bold uppercase">This triggers mobile notifications to all staff.</p>
                        </div>
                    </div>

                    {/* Global Save Action */}
                    <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-500/20">
                        <h3 className="text-lg font-bold mb-2">Save Settings</h3>
                        <p className="text-xs opacity-80 leading-relaxed mb-6">
                            Updates to payroll cycles will take effect from the next generation period.
                        </p>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full py-3 bg-white text-indigo-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Commit Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PayrollSettings;
