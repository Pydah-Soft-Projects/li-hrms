'use client';

import React, { useState, useEffect } from 'react';
import { api, apiRequest } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Rocket } from 'lucide-react';
import { IncludeMissingPayrollComponentsCard } from './shared/IncludeMissingPayrollComponentsCard';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsToggleRow,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import { settingsInputClass, settingsInputStyle, settingsFieldHelpClass, settingsLedgerBorder } from '@/lib/settingsUi';

const PayrollSettings = () => {
    const [payslipReleaseRequired, setPayslipReleaseRequired] = useState<boolean>(true);
    const [payslipHistoryMonths, setPayslipHistoryMonths] = useState<number>(6);
    const [payslipDownloadLimit, setPayslipDownloadLimit] = useState<number>(5);
    const [payrollCycleStartDay, setPayrollCycleStartDay] = useState<number>(1);
    const [payrollCycleEndDay, setPayrollCycleEndDay] = useState<number>(31);
    const [includeMissing, setIncludeMissing] = useState<boolean>(true);
    const [enableAbsentDeduction, setEnableAbsentDeduction] = useState<boolean>(false);
    const [lopDaysPerAbsent, setLopDaysPerAbsent] = useState<number>(1);
    const [autoRejectPendingRequestsOnComplete, setAutoRejectPendingRequestsOnComplete] = useState<boolean>(false);
    const [enableSecondSalary, setEnableSecondSalary] = useState<boolean>(true);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [releasing, setReleasing] = useState(false);
    const [releaseMonth, setReleaseMonth] = useState<string>(new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));

    const loadSettings = async () => {
        try {
            setLoading(true);
            const [resRelease, resHistory, resLimit, resStart, resEnd, resMissing, resAbsent, resAutoReject, resSecondSalary] = await Promise.all([
                api.getSetting('payslip_release_required'),
                api.getSetting('payslip_history_months'),
                api.getSetting('payslip_download_limit'),
                api.getSetting('payroll_cycle_start_day'),
                api.getSetting('payroll_cycle_end_day'),
                api.getIncludeMissingSetting(),
                api.getAbsentDeductionSettings(),
                api.getSetting('auto_reject_pending_requests_on_batch_complete'),
                api.getSetting('enable_second_salary'),
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
            if (resAutoReject.success && resAutoReject.data) {
                setAutoRejectPendingRequestsOnComplete(!!resAutoReject.data.value);
            }
            if (resSecondSalary.success && resSecondSalary.data) {
                setEnableSecondSalary(!!resSecondSalary.data.value);
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
                api.upsertSetting({
                    key: 'auto_reject_pending_requests_on_batch_complete',
                    value: autoRejectPendingRequestsOnComplete,
                    category: 'payroll'
                }),
                api.upsertSetting({
                    key: 'enable_second_salary',
                    value: enableSecondSalary,
                    category: 'payroll',
                    description: 'Enable second salary (2nd salary) UI, APIs, and payroll follow-up calculations',
                }),
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
        <SettingsPanel>
            <SettingsPanelHeader
                section="Payroll"
                title="Payroll & Cycle"
                subtitle="Configure financial timelines and disbursement logic."
            />

            <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
                <div className="space-y-8 xl:col-span-2">
                    <SettingsSectionCard title="Privacy & Visibility">
                        <div className="mb-6 flex items-center justify-end">
                            {payslipReleaseRequired ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ps-accent-border)] bg-[var(--ps-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tight text-[color:var(--ps-accent-ink)]">
                                    Manual Release Mandatory
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tight text-emerald-600 dark:border-emerald-900/30 dark:bg-emerald-900/20">
                                    Auto-Release Enabled
                                </span>
                            )}
                        </div>

                        <div className="space-y-8">
                            <SettingsToggleRow
                                id="payslip-release-required"
                                label="Enforce Manual Release"
                                description="Payslips must be explicitly released before they appear on employee dashboards."
                                checked={payslipReleaseRequired}
                                onChange={setPayslipReleaseRequired}
                            />

                            <div className="grid grid-cols-1 gap-8 border-t pt-8 md:grid-cols-2" style={{ borderColor: 'var(--ps-accent-border)' }}>
                                <SettingsField
                                    label="History Retention (Mos)"
                                    help="Number of previous months visible to staff."
                                >
                                    <input
                                        type="number"
                                        value={payslipHistoryMonths ?? ''}
                                        onChange={(e) => setPayslipHistoryMonths(Number(e.target.value))}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                    />
                                </SettingsField>
                                <SettingsField
                                    label="Download Quota"
                                    help="Max PDF generations per session per user."
                                >
                                    <input
                                        type="number"
                                        value={payslipDownloadLimit ?? ''}
                                        onChange={(e) => setPayslipDownloadLimit(Number(e.target.value))}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                    />
                                </SettingsField>
                            </div>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard title="Payroll Cycle">
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                <SettingsField label="Cycle Commencement (Day)">
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={payrollCycleStartDay ?? ''}
                                        onChange={(e) => setPayrollCycleStartDay(Number(e.target.value))}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                    />
                                </SettingsField>
                                <SettingsField label="Cycle Conclusion (Day)">
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={payrollCycleEndDay ?? ''}
                                        onChange={(e) => setPayrollCycleEndDay(Number(e.target.value))}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                    />
                                </SettingsField>
                            </div>

                            <div className="grid grid-cols-1 gap-3 border-t pt-8 lg:grid-cols-3" style={settingsLedgerBorder}>
                                <SettingsToggleRow
                                    id="auto-reject-pending-requests"
                                    label="Auto-Reject In-Period Requests On Batch Complete"
                                    checked={autoRejectPendingRequestsOnComplete}
                                    onChange={setAutoRejectPendingRequestsOnComplete}
                                />

                                <IncludeMissingPayrollComponentsCard
                                    checked={includeMissing}
                                    onChange={setIncludeMissing}
                                    showDescription={false}
                                />

                                <SettingsToggleRow
                                    id="enable-second-salary"
                                    label="Second salary (2nd salary)"
                                    checked={enableSecondSalary}
                                    onChange={setEnableSecondSalary}
                                />
                            </div>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard title="Attendance Deductions">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <SettingsToggleRow
                                id="enable-absent-deduction"
                                label="Enable Absent Deduction"
                                checked={enableAbsentDeduction}
                                onChange={setEnableAbsentDeduction}
                            />

                            <SettingsField
                                label="LOP Days per Absent"
                                help="Number of days to deduct for each unverified absent record."
                            >
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={lopDaysPerAbsent ?? ''}
                                    onChange={(e) => setLopDaysPerAbsent(Number(e.target.value))}
                                    disabled={!enableAbsentDeduction}
                                    className={settingsInputClass()}
                                    style={settingsInputStyle()}
                                />
                            </SettingsField>
                        </div>
                    </SettingsSectionCard>
                </div>

                <div className="space-y-8">
                    <SettingsSectionCard title="Batch Operations" accent>
                        <div className="space-y-4">
                            <SettingsField label="Release Target Month">
                                <input
                                    type="text"
                                    value={releaseMonth}
                                    onChange={(e) => setReleaseMonth(e.target.value)}
                                    placeholder="e.g. February 2026"
                                    className={settingsInputClass()}
                                    style={settingsInputStyle()}
                                />
                            </SettingsField>
                            <button
                                onClick={handleBulkRelease}
                                disabled={releasing}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {releasing ? 'Releasing...' : 'Broadcast Payslips'}
                                <Rocket className="h-3.5 w-3.5" />
                            </button>
                            <p className={`${settingsFieldHelpClass} text-center uppercase`}>This triggers mobile notifications to all staff.</p>
                        </div>
                    </SettingsSectionCard>
                </div>
            </div>

            <SettingsSaveBar onSave={handleSave} saving={saving} label="Commit Changes" />
        </SettingsPanel>
    );
};

export default PayrollSettings;
