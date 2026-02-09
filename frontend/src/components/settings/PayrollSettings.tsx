'use client';

import React, { useState, useEffect } from 'react';
import { api, apiRequest } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Receipt, Calendar, Download, Rocket, Info } from 'lucide-react';

const PayrollSettings = () => {
    const [payslipReleaseRequired, setPayslipReleaseRequired] = useState<boolean>(true);
    const [payslipHistoryMonths, setPayslipHistoryMonths] = useState<number>(6);
    const [payslipDownloadLimit, setPayslipDownloadLimit] = useState<number>(5);
    const [payrollCycleStartDay, setPayrollCycleStartDay] = useState<number>(1);
    const [payrollCycleEndDay, setPayrollCycleEndDay] = useState<number>(31);
    const [includeMissing, setIncludeMissing] = useState<boolean>(true);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [releasing, setReleasing] = useState(false);
    const [releaseMonth, setReleaseMonth] = useState<string>(new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));

    const loadSettings = async () => {
        try {
            setLoading(true);
            const [resRelease, resHistory, resLimit, resStart, resEnd, resMissing] = await Promise.all([
                api.getSetting('payslip_release_required'),
                api.getSetting('payslip_history_months'),
                api.getSetting('payslip_download_limit'),
                api.getSetting('payroll_cycle_start_day'),
                api.getSetting('payroll_cycle_end_day'),
                api.getIncludeMissingSetting()
            ]);

            if (resRelease.success && resRelease.data) setPayslipReleaseRequired(!!resRelease.data.value);
            if (resHistory.success && resHistory.data) setPayslipHistoryMonths(Number(resHistory.data.value));
            if (resLimit.success && resLimit.data) setPayslipDownloadLimit(Number(resLimit.data.value));
            if (resStart.success && resStart.data) setPayrollCycleStartDay(Number(resStart.data.value));
            if (resEnd.success && resEnd.data) setPayrollCycleEndDay(Number(resEnd.data.value));
            if (resMissing.success && resMissing.data) setIncludeMissing(!!resMissing.data.value);
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
                api.saveIncludeMissingSetting(includeMissing)
            ]);
            toast.success('Payroll settings saved successfully');
        } catch (err) {
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
            const response = await apiRequest<any>('/payroll/release', {
                method: 'PUT',
                body: JSON.stringify({ month: releaseMonth })
            });
            if (response.success) {
                toast.success(`Successfully released ${response.count} payslips for ${releaseMonth}`);
            } else {
                toast.error(response.message || 'Failed to release payslips');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error releasing payslips');
        } finally {
            setReleasing(false);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Payroll & Payslip Settings</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Manage payroll cycles, payslip visibility, and release controls.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                    {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                    Save Changes
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Release & Visibility */}
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-6">
                            <Receipt className="h-4 w-4 text-indigo-500" />
                            Visibility & Control
                        </h3>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Mandatory Release</p>
                                    <p className="text-xs text-gray-500">Payslips must be released before employees can see them.</p>
                                </div>
                                <button
                                    onClick={() => setPayslipReleaseRequired(!payslipReleaseRequired)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${payslipReleaseRequired ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${payslipReleaseRequired ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">History (Months)</label>
                                    <input
                                        type="number"
                                        value={payslipHistoryMonths}
                                        onChange={(e) => setPayslipHistoryMonths(Number(e.target.value))}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Download Limit</label>
                                    <input
                                        type="number"
                                        value={payslipDownloadLimit}
                                        onChange={(e) => setPayslipDownloadLimit(Number(e.target.value))}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-6">
                            <Rocket className="h-4 w-4 text-emerald-500" />
                            Bulk Release Payslips
                        </h3>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg flex gap-2">
                                <Info className="h-4 w-4 flex-shrink-0" />
                                Select a month to release all processed payslips to employee dashboards.
                            </p>
                            <div className="flex gap-4">
                                <input
                                    type="text"
                                    value={releaseMonth}
                                    onChange={(e) => setReleaseMonth(e.target.value)}
                                    placeholder="e.g. January 2026"
                                    className="flex-1 rounded-xl border-gray-200 bg-gray-50 px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                                <button
                                    onClick={handleBulkRelease}
                                    disabled={releasing}
                                    className="px-6 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                >
                                    {releasing ? 'Releasing...' : 'Release Now'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cycle & Calculation */}
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-6">
                            <Calendar className="h-4 w-4 text-amber-500" />
                            Payroll Cycle
                        </h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Cycle Start Day</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={payrollCycleStartDay}
                                    onChange={(e) => setPayrollCycleStartDay(Number(e.target.value))}
                                    className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Cycle End Day</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={payrollCycleEndDay}
                                    onChange={(e) => setPayrollCycleEndDay(Number(e.target.value))}
                                    className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-blue-200 bg-blue-50/50 backdrop-blur-sm dark:border-blue-900/50 dark:bg-blue-900/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Calculation Inclusions</h3>
                                <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mt-1">Include employees with missing attendance data in payroll runs.</p>
                            </div>
                            <button
                                onClick={() => setIncludeMissing(!includeMissing)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${includeMissing ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${includeMissing ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PayrollSettings;
