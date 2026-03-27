'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { alertConfirm } from '@/lib/customSwal';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Calculator, RefreshCw, Save, AlertTriangle, Calendar, ChevronRight, Clock } from 'lucide-react';

interface LeavePolicySettings {
    financialYear: {
        startMonth: number;
        startDay: number;
        useCalendarYear: boolean;
    };
    earnedLeave: {
        enabled: boolean;
        earningType: 'attendance_based' | 'fixed';
        useAsPaidInPayroll?: boolean;
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
            /** When true, unused scheduled CL for a payroll month stays in balance; when false, forfeited at cycle end */
            carryMonthlyClCreditToNextPayrollMonth: boolean;
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
        /** Experience-based CL tiers (optional). First matching tier by years of service wins. */
        casualLeaveByExperience: Array<{
            minYears: number;
            maxYears: number;
            casualLeave: number;
            monthlyClCredits?: number[];
            description?: string;
        }>;
        addCarryForward: boolean;
        /** Max CL days carried into new year (capped by unused balance); applied to first payroll month in register. */
        maxCarryForwardCl: number;
        /** When true, reset date = start of first payroll period (e.g. 26 Dec when payroll is 26th–25th). */
        usePayrollCycleForReset: boolean;
        resetMonth: number;
        resetDay: number;
    };
    autoUpdate: {
        enabled: boolean;
        updateFrequency: 'daily' | 'weekly' | 'monthly';
        updateDay: number;
    };
    /** Combined CL + CCL (+ EL when configured) application limit per payroll period */
    monthlyLeaveApplicationCap: {
        enabled: boolean;
        maxDays: number;
        maxDaysByType: {
            CL: number;
            CCL: number;
            EL: number;
        };
        includeEL: boolean;
    };
    leaveRegisterMonthSlotEdit: {
        defaults: {
            allowEditClCredits: boolean;
            allowEditCclCredits: boolean;
            allowEditElCredits: boolean;
            allowEditPolicyLock: boolean;
            allowEditUsedCl: boolean;
            allowEditUsedCcl: boolean;
            allowEditUsedEl: boolean;
            allowCarryUnusedToNextMonth: boolean;
        };
        byPayrollMonthIndex?: Record<string, Partial<LeavePolicySettings['leaveRegisterMonthSlotEdit']['defaults']>>;
    };
}

interface InitialSyncMonthBreakdownRow {
    payrollMonthIndex: number;
    label: string;
    payPeriodStart?: string | Date | null;
    payPeriodEnd?: string | Date | null;
    policyCellOriginal: number;
    clearedPast: boolean;
    carryAddedHere: number;
    clCreditsApplied: number;
}

interface InitialSyncPreviewRow {
    employeeId: string;
    empNo: string;
    employeeName: string;
    designation?: string;
    department?: string;
    division?: string;
    /** Remaining FY grid after past payroll slots are zeroed (IST); excludes carry (carry is its own column). */
    policyClScheduled?: number;
    /** Unused CL on LeaveRegisterYear ledger only, capped by policy max. */
    carryForwardInTarget?: number;
    monthlyClBreakdown?: InitialSyncMonthBreakdownRow[];
    clCalculation?: {
        entitlement: number;
        entitlementFullYear?: number;
        policyRemainingGridOnly?: number;
        pastClearedCreditsTotal?: number;
        defaultPoolBalance?: number;
        ledgerClForCarry?: number;
        carryForward: number;
        maxCarryForward: number;
        addCarryForward: boolean;
        proration?: Record<string, unknown>;
    };
    currentBalances: { CL: number; EL: number; CCL: number };
    proposedBalances: { CL: number; EL: number; CCL: number };
}

/** Twelve payroll months of CL for annual reset (leave-year order). */
function defaultMonthlyClGrid(annualDays: number): number[] {
    const a = Math.max(0, Number(annualDays) || 0);
    const base = Math.round((a / 12) * 100) / 100;
    return Array.from({ length: 12 }, () => base);
}

function normalizeExperienceTiers(tiers: unknown): LeavePolicySettings['annualCLReset']['casualLeaveByExperience'] {
    if (!Array.isArray(tiers)) return [];
    return tiers.map((t: Record<string, unknown>) => {
        const cl = Math.max(0, Number(t.casualLeave) || 12);
        let m = t.monthlyClCredits;
        if (!Array.isArray(m) || m.length !== 12) {
            m = defaultMonthlyClGrid(cl);
        } else {
            m = m.map((x) => Math.max(0, Number(x) || 0));
        }
        return {
            minYears: Number(t.minYears) || 0,
            maxYears: Number.isFinite(Number(t.maxYears)) ? Number(t.maxYears) : 999,
            casualLeave: cl,
            monthlyClCredits: m as number[],
            description: typeof t.description === 'string' ? t.description : ''
        };
    });
}

function sumMonthlyClCredits(tier: { monthlyClCredits?: number[] }): number {
    const m = tier.monthlyClCredits;
    if (!Array.isArray(m)) return 0;
    return m.reduce((s, n) => s + (Number(n) || 0), 0);
}

function getPayrollMonthDisplayNames(startMonth: number): string[] {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const s = Math.min(12, Math.max(1, Number(startMonth) || 1));
    return Array.from({ length: 12 }, (_, i) => names[(s - 1 + i) % 12]);
}

const LeavePolicySettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
    const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
    const [syncPreviewRows, setSyncPreviewRows] = useState<InitialSyncPreviewRow[]>([]);
    const [initialSyncExpandedEmployeeId, setInitialSyncExpandedEmployeeId] = useState<string | null>(null);
    const [syncPreviewSearch, setSyncPreviewSearch] = useState('');
    const [syncApplyReason, setSyncApplyReason] = useState('');
    const [slotEditMonthIndex, setSlotEditMonthIndex] = useState<number>(1);

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
            useAsPaidInPayroll: true,
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
                carryMonthlyClCreditToNextPayrollMonth: true
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
            casualLeaveByExperience: [],
            addCarryForward: true,
            maxCarryForwardCl: 12,
            usePayrollCycleForReset: false,
            resetMonth: 4,
            resetDay: 1
        },
        autoUpdate: {
            enabled: true,
            updateFrequency: 'monthly',
            updateDay: 1
        },
        monthlyLeaveApplicationCap: {
            enabled: false,
            maxDays: 4,
            maxDaysByType: {
                CL: 0,
                CCL: 0,
                EL: 0,
            },
            includeEL: false
        },
        leaveRegisterMonthSlotEdit: {
            defaults: {
                allowEditClCredits: true,
                allowEditCclCredits: true,
                allowEditElCredits: true,
                allowEditPolicyLock: true,
                allowEditUsedCl: true,
                allowEditUsedCcl: true,
                allowEditUsedEl: true,
                allowCarryUnusedToNextMonth: true,
            },
            byPayrollMonthIndex: {},
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
                        useAsPaidInPayroll: data.earnedLeave?.useAsPaidInPayroll ?? defaults.earnedLeave.useAsPaidInPayroll,
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
                    annualCLReset: {
                        ...defaults.annualCLReset,
                        ...data.annualCLReset,
                        maxCarryForwardCl:
                            data.annualCLReset?.maxCarryForwardCl != null && Number.isFinite(Number(data.annualCLReset.maxCarryForwardCl))
                                ? Number(data.annualCLReset.maxCarryForwardCl)
                                : defaults.annualCLReset.maxCarryForwardCl,
                        casualLeaveByExperience: normalizeExperienceTiers(
                            data.annualCLReset?.casualLeaveByExperience ?? defaults.annualCLReset.casualLeaveByExperience
                        )
                    },
                    autoUpdate: { ...defaults.autoUpdate, ...data.autoUpdate },
                    monthlyLeaveApplicationCap: {
                        ...defaults.monthlyLeaveApplicationCap,
                        ...(data.monthlyLeaveApplicationCap || {}),
                        maxDaysByType: {
                            ...defaults.monthlyLeaveApplicationCap.maxDaysByType,
                            ...(data.monthlyLeaveApplicationCap?.maxDaysByType || {}),
                            CL: Math.max(0, Number(data.monthlyLeaveApplicationCap?.maxDaysByType?.CL) || 0),
                            CCL: Math.max(0, Number(data.monthlyLeaveApplicationCap?.maxDaysByType?.CCL) || 0),
                            EL: Math.max(0, Number(data.monthlyLeaveApplicationCap?.maxDaysByType?.EL) || 0),
                        },
                        maxDays:
                            data.monthlyLeaveApplicationCap != null &&
                            data.monthlyLeaveApplicationCap.maxDays != null
                                ? Math.max(0, Number(data.monthlyLeaveApplicationCap.maxDays) || 0)
                                : defaults.monthlyLeaveApplicationCap.maxDays
                    },
                    leaveRegisterMonthSlotEdit: {
                        defaults: {
                            ...defaults.leaveRegisterMonthSlotEdit.defaults,
                            ...(data.leaveRegisterMonthSlotEdit?.defaults || data.leaveRegisterMonthSlotEdit || {}),
                        },
                        byPayrollMonthIndex:
                            data.leaveRegisterMonthSlotEdit?.byPayrollMonthIndex &&
                            typeof data.leaveRegisterMonthSlotEdit.byPayrollMonthIndex === 'object'
                                ? data.leaveRegisterMonthSlotEdit.byPayrollMonthIndex
                                : {},
                    }
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

    const closeInitialSyncPreview = () => {
        setSyncPreviewOpen(false);
        setSyncPreviewRows([]);
        setSyncPreviewSearch('');
        setSyncApplyReason('');
        setInitialSyncExpandedEmployeeId(null);
    };

    const openInitialSyncPreview = async () => {
        try {
            setSyncPreviewLoading(true);
            const res = await api.previewInitialCLSync({ page: 1, limit: 1000 });
            if (!res?.success) {
                toast.error(res?.message || 'Failed to load initial sync preview');
                return;
            }
            const rows = (res?.data?.employees || []) as InitialSyncPreviewRow[];
            setSyncPreviewRows(
                rows.map((r) => ({
                    ...r,
                    proposedBalances: {
                        CL: Number(r?.proposedBalances?.CL ?? r?.clCalculation?.defaultPoolBalance ?? 0),
                        EL: Number(r?.proposedBalances?.EL ?? r?.currentBalances?.EL ?? 0),
                        CCL: Number(r?.proposedBalances?.CCL ?? r?.currentBalances?.CCL ?? 0),
                    },
                }))
            );
            setSyncPreviewSearch('');
            setSyncApplyReason('');
            setSyncPreviewOpen(true);
        } catch (e: any) {
            const msg = String(e?.message || '');
            if (msg.toLowerCase().includes('not found')) {
                toast.error('Preview API not available yet. Please restart backend and try again.');
            } else {
                toast.error(msg || 'Failed to load preview');
            }
        } finally {
            setSyncPreviewLoading(false);
        }
    };

    const getFilteredInitialSyncPreviewRows = () => {
        const t = syncPreviewSearch.toLowerCase().trim();
        if (!t) return syncPreviewRows;
        return syncPreviewRows.filter((r) => {
            return (
                (r.employeeName || '').toLowerCase().includes(t) ||
                (r.empNo || '').toLowerCase().includes(t) ||
                (r.department || '').toLowerCase().includes(t)
            );
        });
    };

    const applyInitialSyncToFilteredList = async () => {
        const rows = getFilteredInitialSyncPreviewRows();
        if (rows.length === 0) {
            toast.info('No employees match the current filter');
            return;
        }
        const { isConfirmed } = await alertConfirm(
            'Apply initial sync to the filtered list only?',
            `CL will use the policy month grid (pro-rata by join) plus carry rules, and your target EL/CCL for ${rows.length} employee(s). Employees not in this list are unchanged.`,
            'Apply filtered'
        );
        if (!isConfirmed) return;

        try {
            setSaving(true);
            const res = await api.applyInitialCLSync({
                confirm: true,
                scope: 'listed',
                reason: syncApplyReason?.trim() || undefined,
                employees: rows.map((r) => ({
                    employeeId: r.employeeId,
                    targetCL: Number(r.proposedBalances.CL ?? 0),
                    targetEL: Number(r.proposedBalances.EL ?? 0),
                    targetCCL: Number(r.proposedBalances.CCL ?? 0),
                })),
            });
            if (res?.success) {
                toast.success(res?.message || 'Initial sync applied successfully.');
                setSyncPreviewOpen(false);
            } else {
                toast.error(res?.message || 'Initial sync apply failed.');
            }
        } catch (e: any) {
            toast.error(e?.message || 'Initial sync apply failed.');
        } finally {
            setSaving(false);
        }
    };

    const applyInitialSyncToAllActive = async () => {
        const { isConfirmed } = await alertConfirm(
            'Apply initial sync to all active employees?',
            'The server will run policy-based CL (monthly grid, join pro-rata, carry) for every active employee and rebuild their leave register year for the current FY. EL and CCL balances are not changed. This ignores the table filter.',
            'Apply to all'
        );
        if (!isConfirmed) return;

        try {
            setSaving(true);
            const res = await api.applyInitialCLSync({
                confirm: true,
                scope: 'all',
                reason: syncApplyReason?.trim() || undefined,
            });
            if (res?.success) {
                toast.success(res?.message || 'Initial sync applied to all active employees.');
                closeInitialSyncPreview();
            } else {
                toast.error(res?.message || 'Initial sync apply failed.');
            }
        } catch (e: any) {
            toast.error(e?.message || 'Initial sync apply failed.');
        } finally {
            setSaving(false);
        }
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
        <div className="w-full max-w-full space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-10 flex items-end justify-between flex-wrap gap-4 border-b border-gray-200 dark:border-gray-800 pb-8">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600 dark:text-indigo-400">Leave Policy</span>
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Leave Policy Configuration</h2>
                    <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Configure financial year, earned leave rules, carry forward, and annual CL reset.
                    </p>
                </div>
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium shadow-sm"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 w-full">
                {/* ——— Left column: Financial Year + EL Earning Rules ——— */}
                <div className="space-y-8 min-w-0">
                    {/* 1. Financial Year */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <Calendar className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Financial Year</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Leave cycles and annual reset.</p>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8 space-y-6">

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
                                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
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
                                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    />
                                </div>
                            </div>
                        )}
                        </div>
                    </section>

                    {/* Leave register month-slot manual edit controls */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                                Leave register month edit controls
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Configure default edit permissions, then override them for a specific payroll month (1–12).
                            </p>
                        </div>
                        {(() => {
                            const defs = settings.leaveRegisterMonthSlotEdit?.defaults || {};
                            const fyStartMonth = Number(settings?.financialYear?.startMonth) || 1;
                            const monthNames = getPayrollMonthDisplayNames(fyStartMonth);
                            const monthKey = String(slotEditMonthIndex);
                            const byMonth = settings.leaveRegisterMonthSlotEdit?.byPayrollMonthIndex || {};
                            const overrideObj = (byMonth[monthKey] && typeof byMonth[monthKey] === 'object')
                                ? byMonth[monthKey]
                                : {};
                            const hasOverride = Object.keys(overrideObj).length > 0;
                            const keys: Array<[keyof LeavePolicySettings['leaveRegisterMonthSlotEdit']['defaults'], string]> = [
                                ['allowEditClCredits', 'Allow edit: Scheduled CL (clCredits)'],
                                ['allowEditCclCredits', 'Allow edit: Scheduled CCL (compensatoryOffs)'],
                                ['allowEditElCredits', 'Allow edit: Scheduled EL (elCredits)'],
                                ['allowEditPolicyLock', 'Allow edit: Policy lock (lockedCredits)'],
                                ['allowEditUsedCl', 'Allow edit: Used CL override (usedCl)'],
                                ['allowEditUsedCcl', 'Allow edit: Used CCL override (usedCcl)'],
                                ['allowEditUsedEl', 'Allow edit: Used EL override (usedEl)'],
                                ['allowCarryUnusedToNextMonth', 'Allow action: Carry unused to next month'],
                            ];

                            const toggleDefault = (k: keyof LeavePolicySettings['leaveRegisterMonthSlotEdit']['defaults']) => {
                                updateSettings(
                                    `leaveRegisterMonthSlotEdit.defaults.${String(k)}`,
                                    '',
                                    !(defs?.[k] !== false)
                                );
                            };

                            const toggleOverride = (k: keyof LeavePolicySettings['leaveRegisterMonthSlotEdit']['defaults']) => {
                                const current = overrideObj?.[k];
                                const nextVal = !(current != null ? current !== false : defs?.[k] !== false);
                                setSettings((prev: any) => {
                                    const prevByMonth = prev?.leaveRegisterMonthSlotEdit?.byPayrollMonthIndex || {};
                                    const nextMonth = { ...(prevByMonth[monthKey] || {}), [k]: nextVal };
                                    return {
                                        ...prev,
                                        leaveRegisterMonthSlotEdit: {
                                            ...(prev.leaveRegisterMonthSlotEdit || {}),
                                            byPayrollMonthIndex: {
                                                ...prevByMonth,
                                                [monthKey]: nextMonth,
                                            },
                                        },
                                    };
                                });
                            };

                            return (
                                <div className="p-6 sm:p-8 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                                                Override payroll month
                                            </label>
                                            <select
                                                value={slotEditMonthIndex}
                                                onChange={(e) => setSlotEditMonthIndex(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white"
                                            >
                                                {Array.from({ length: 12 }).map((_, i) => (
                                                    <option key={i + 1} value={i + 1}>
                                                        {monthNames[i]} (Month {i + 1})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!hasOverride) return;
                                                    setSettings((prev: any) => {
                                                        const prevByMonth = { ...(prev?.leaveRegisterMonthSlotEdit?.byPayrollMonthIndex || {}) };
                                                        delete prevByMonth[monthKey];
                                                        return {
                                                            ...prev,
                                                            leaveRegisterMonthSlotEdit: {
                                                                ...(prev.leaveRegisterMonthSlotEdit || {}),
                                                                byPayrollMonthIndex: prevByMonth,
                                                            },
                                                        };
                                                    });
                                                }}
                                                disabled={!hasOverride}
                                                className="w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                                            >
                                                Clear override for {monthNames[slotEditMonthIndex - 1]} (Month {slotEditMonthIndex})
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-2">Default (all months)</p>
                                            <div className="space-y-2">
                                                {keys.map(([k, label]) => (
                                                    <div key={`def-${String(k)}`} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50/60 dark:bg-gray-800/30">
                                                        <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                                                        <button type="button" role="switch" aria-checked={defs?.[k] !== false} onClick={() => toggleDefault(k)} className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full ${defs?.[k] !== false ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${defs?.[k] !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-2">
                                                Override: {monthNames[slotEditMonthIndex - 1]} (Month {slotEditMonthIndex})
                                            </p>
                                            <div className="space-y-2">
                                                {keys.map(([k, label]) => {
                                                    const effective = overrideObj?.[k] != null ? overrideObj[k] !== false : defs?.[k] !== false;
                                                    return (
                                                        <div key={`ov-${String(k)}`} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50/60 dark:bg-gray-800/30">
                                                            <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                                                            <button type="button" role="switch" aria-checked={effective} onClick={() => toggleOverride(k)} className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full ${effective ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${effective ? 'translate-x-6' : 'translate-x-1'}`} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </section>

                    {/* Monthly application cap (payroll period) */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <Clock className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Monthly application cap</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Set payroll-period cap per leave type. When enforce cap is ON, <strong>0 means zero allowed</strong>.
                                </p>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8 space-y-4">
                            <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enforce cap</span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={!!settings.monthlyLeaveApplicationCap?.enabled}
                                    onClick={() => updateSettings('monthlyLeaveApplicationCap.enabled', '', !settings.monthlyLeaveApplicationCap?.enabled)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.monthlyLeaveApplicationCap?.enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.monthlyLeaveApplicationCap?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            {settings.monthlyLeaveApplicationCap?.enabled && (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {(['CL', 'CCL', 'EL'] as const).map((lt) => (
                                            <div key={lt} className="space-y-1.5">
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    {lt} cap (0 = zero when enforce cap ON)
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={62}
                                                    value={settings.monthlyLeaveApplicationCap?.maxDaysByType?.[lt] ?? 0}
                                                    onChange={(e) =>
                                                        updateSettings(
                                                            `monthlyLeaveApplicationCap.maxDaysByType.${lt}`,
                                                            '',
                                                            Math.max(0, parseInt(e.target.value, 10) || 0)
                                                        )
                                                    }
                                                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                                        <div>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Include EL in cap</span>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                Applies only when <strong>Use EL as paid days in payroll</strong> is off. When EL is paid in payroll, it never counts toward this cap.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={!!settings.monthlyLeaveApplicationCap?.includeEL}
                                            disabled={settings.earnedLeave?.useAsPaidInPayroll !== false || !settings.earnedLeave?.enabled}
                                            onClick={() => {
                                                if (settings.earnedLeave?.useAsPaidInPayroll !== false || !settings.earnedLeave?.enabled) return;
                                                updateSettings('monthlyLeaveApplicationCap.includeEL', '', !settings.monthlyLeaveApplicationCap?.includeEL);
                                            }}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.monthlyLeaveApplicationCap?.includeEL ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'} ${settings.earnedLeave?.useAsPaidInPayroll !== false || !settings.earnedLeave?.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.monthlyLeaveApplicationCap?.includeEL ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    {/* 2. EL Earning Rules */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <Calculator className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">EL Earning Rules</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enable earned leave and set how EL is accrued (attendance-based or fixed).</p>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8 space-y-6">

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
                        <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 mb-4">
                            <div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Use EL as paid days in payroll</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">When on, EL days availed count as paid (salary). When off, EL is leave-only (no pay for those days).</p>
                            </div>
                            <button type="button" role="switch" aria-checked={settings.earnedLeave.useAsPaidInPayroll !== false}
                                onClick={() => {
                                    if (!settings) return;
                                    const turningOnPaid = settings.earnedLeave.useAsPaidInPayroll === false;
                                    const nextPaid = !(settings.earnedLeave.useAsPaidInPayroll !== false);
                                    setSettings((prev: any) => ({
                                        ...prev,
                                        earnedLeave: { ...prev.earnedLeave, useAsPaidInPayroll: nextPaid },
                                        monthlyLeaveApplicationCap: {
                                            ...prev.monthlyLeaveApplicationCap,
                                            ...(turningOnPaid ? { includeEL: false } : {}),
                                        },
                                    }));
                                }}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.earnedLeave.useAsPaidInPayroll !== false ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.earnedLeave.useAsPaidInPayroll !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Earning type</label>
                                <select
                                    value={settings.earnedLeave.earningType}
                                    onChange={(e) => updateSettings('earnedLeave.earningType', '', e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
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
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Days per EL</label>
                                            <input type="number" min="1" max="31" value={settings.earnedLeave.attendanceRules.daysPerEL}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.daysPerEL', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max EL / month</label>
                                            <input type="number" min="0" max="10" value={settings.earnedLeave.attendanceRules.maxELPerMonth}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerMonth', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max EL / year</label>
                                            <input type="number" min="0" max="50" value={settings.earnedLeave.attendanceRules.maxELPerYear}
                                                onChange={(e) => updateSettings('earnedLeave.attendanceRules.maxELPerYear', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
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
                                            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max EL / year</label>
                                        <input type="number" min="0" max="50" value={settings.earnedLeave.fixedRules.maxELPerYear}
                                            onChange={(e) => updateSettings('earnedLeave.fixedRules.maxELPerYear', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {settings.earnedLeave.earningType === 'attendance_based' && (
                            <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Attendance ranges (cumulative)</h4>
                                    <button type="button" onClick={() => addAttendanceRange()}
                                        className="px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-xs font-medium transition-colors">
                                        Add range
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl mb-4 border border-gray-100 dark:border-gray-700">
                                    Each range adds EL when attendance falls in that band. Example: 25 days → 0+1+1+2 = 4 EL.
                                </p>
                                <div className="grid grid-cols-1 gap-4">
                                        {(settings.earnedLeave?.attendanceRules?.attendanceRanges ?? []).map((range: any, index: number) => (
                                            <div key={index} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Range {index + 1}</h4>
                                                    <button
                                                        onClick={() => removeAttendanceRange(index)}
                                                        className="px-3 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-xs font-medium transition-colors"
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
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20"
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
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20"
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
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20"
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
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                                    {String(range.minDays).padStart(2, '0')}-{range.maxDays} days = {range.elEarned} EL
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                        </>
                        )}
                        </div>
                    </section>
                </div>

                {/* ——— Right column: Carry Forward ——— */}
                <div className="space-y-8 min-w-0">
                    {/* 3. Carry Forward */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <RefreshCw className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Carry Forward</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">CL monthly pool; EL & CCL carry and expiry.</p>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Casual Leave (CL)</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Year-end CL carry and max cap are configured under <strong>Annual CL Reset</strong> (add carry forward + max carry days). This section only controls unused <em>monthly</em> scheduled CL between payroll periods.
                                </p>
                                <div className="pt-1 space-y-2">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">Monthly scheduled CL (policy grid):</span>{' '}
                                        On each payroll cycle end, compare this month’s scheduled CL to CL used in that month. Unused scheduled days can stay in the balance or be removed.
                                    </p>
                                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-white/60 dark:bg-gray-900/30">
                                        <div>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Carry unused monthly CL into later periods</span>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">On = keep unused scheduled CL in the pool. Off = forfeit unused scheduled CL at each payroll month-end (EXPIRY in leave register).</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={settings.carryForward.casualLeave.carryMonthlyClCreditToNextPayrollMonth !== false}
                                            onClick={() =>
                                                updateSettings(
                                                    'carryForward.casualLeave.carryMonthlyClCreditToNextPayrollMonth',
                                                    '',
                                                    !(settings.carryForward.casualLeave.carryMonthlyClCreditToNextPayrollMonth !== false)
                                                )
                                            }
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.carryForward.casualLeave.carryMonthlyClCreditToNextPayrollMonth !== false ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.carryForward.casualLeave.carryMonthlyClCreditToNextPayrollMonth !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Earned Leave (EL)</h4>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={settings.carryForward.earnedLeave.enabled}
                                        onChange={(e) => updateSettings('carryForward.earnedLeave.enabled', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable carry forward</span>
                                </label>
                                {settings.carryForward.earnedLeave.enabled && (
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max months</label>
                                            <input type="number" min="1" max="12" value={settings.carryForward.earnedLeave.maxMonths}
                                                onChange={(e) => updateSettings('carryForward.earnedLeave.maxMonths', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Expiry months</label>
                                            <input type="number" min="1" max="12" value={settings.carryForward.earnedLeave.expiryMonths}
                                                onChange={(e) => updateSettings('carryForward.earnedLeave.expiryMonths', '', parseInt(e.target.value))}
                                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Compensatory Off (CCL)</h4>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={settings.carryForward.compensatoryOff.enabled}
                                        onChange={(e) => updateSettings('carryForward.compensatoryOff.enabled', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable carry forward</span>
                                </label>
                                {settings.carryForward.compensatoryOff.enabled && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3 pt-1">
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max months</label>
                                                <input type="number" min="1" max="12" value={settings.carryForward.compensatoryOff.maxMonths}
                                                    onChange={(e) => updateSettings('carryForward.compensatoryOff.maxMonths', '', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Expiry months</label>
                                                <input type="number" min="1" max="12" value={settings.carryForward.compensatoryOff.expiryMonths}
                                                    onChange={(e) => updateSettings('carryForward.compensatoryOff.expiryMonths', '', parseInt(e.target.value))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
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
                        </div>
                    </section>

                    {/* 4. Annual CL Reset */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Annual CL Reset</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Reset CL at configured date (pay cycle / year). Default entitlement or experience-based tiers; optional carry forward.</p>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8 space-y-6">
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
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Default CL entitlement</label>
                                        <input type="number" min="0" max="365" value={settings.annualCLReset.resetToBalance}
                                            onChange={(e) => updateSettings('annualCLReset.resetToBalance', '', parseInt(e.target.value) || 0)}
                                            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                            title="Used for all employees when experience tiers are empty or no tier matches" />
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Used when no experience tier matches</p>
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer mt-3">
                                    <input type="checkbox" checked={settings.annualCLReset.usePayrollCycleForReset === true}
                                        onChange={(e) => updateSettings('annualCLReset.usePayrollCycleForReset', '', e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Use payroll cycle for reset date</span>
                                </label>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 ml-6">When on: reset = start of first payroll period of the year (e.g. 26 Dec when payroll is 26th–25th). Off = use month/day below.</p>
                                {!settings.annualCLReset.usePayrollCycleForReset && (
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Reset month</label>
                                        <select value={settings.annualCLReset.resetMonth}
                                            onChange={(e) => updateSettings('annualCLReset.resetMonth', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all">
                                            {[...Array(12)].map((_, i) => (
                                                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Reset day</label>
                                        <input type="number" min="1" max="31" value={settings.annualCLReset.resetDay}
                                            onChange={(e) => updateSettings('annualCLReset.resetDay', '', parseInt(e.target.value))}
                                            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                    </div>
                                </div>
                                )}
                                <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={settings.annualCLReset.addCarryForward}
                                            onChange={(e) => updateSettings('annualCLReset.addCarryForward', '', e.target.checked)}
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">Add carried CL to reset balance</span>
                                    </label>
                                    <div className="space-y-1.5 min-w-[200px]">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Max carried CL (days)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={365}
                                            disabled={!settings.annualCLReset.addCarryForward}
                                            value={settings.annualCLReset.maxCarryForwardCl ?? 12}
                                            onChange={(e) => updateSettings('annualCLReset.maxCarryForwardCl', '', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                                        />
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Unused CL above this expires at reset. Carried amount is added to <strong>month 1</strong> CL credits in the yearly register (with the normal month-1 accrual).</p>
                                    </div>
                                </div>
                                <div className="space-y-2 mt-2">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Experience-based CL (optional)</h4>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">By years of service at reset date. First matching tier wins. Empty = use default for all.</p>
                                    {(settings.annualCLReset.casualLeaveByExperience || []).map((tier: any, idx: number) => {
                                        const safeNum = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : '');
                                        const grid = Array.isArray(tier.monthlyClCredits) && tier.monthlyClCredits.length === 12
                                            ? tier.monthlyClCredits
                                            : defaultMonthlyClGrid(Number(tier.casualLeave) || 12);
                                        const gridSum = sumMonthlyClCredits({ monthlyClCredits: grid });
                                        const annual = Number(tier.casualLeave) || 0;
                                        const sumMismatch = Math.abs(gridSum - annual) > 0.02;
                                        return (
                                        <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3 bg-gray-50/50 dark:bg-[#0F172A]/40">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <input type="number" min={0} placeholder="Min years" value={safeNum(tier.minYears)} onChange={(e) => {
                                                    const arr = [...(settings.annualCLReset.casualLeaveByExperience || [])];
                                                    arr[idx] = { ...arr[idx], minYears: parseInt(e.target.value, 10) || 0 };
                                                    updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                                }} className="w-20 px-2.5 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#0F172A] text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20" />
                                                <span className="text-gray-400">–</span>
                                                <input type="number" min={0} placeholder="Max years" value={safeNum(tier.maxYears)} onChange={(e) => {
                                                    const arr = [...(settings.annualCLReset.casualLeaveByExperience || [])];
                                                    const parsed = parseInt(e.target.value, 10);
                                                    arr[idx] = { ...arr[idx], maxYears: Number.isNaN(parsed) ? 999 : parsed };
                                                    updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                                }} className="w-20 px-2.5 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#0F172A] text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20" />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">Annual CL (reference)</span>
                                                <input type="number" min={0} placeholder="CL days" value={safeNum(tier.casualLeave)} onChange={(e) => {
                                                    const arr = [...(settings.annualCLReset.casualLeaveByExperience || [])];
                                                    const cl = parseInt(e.target.value, 10) || 0;
                                                    arr[idx] = { ...arr[idx], casualLeave: cl, monthlyClCredits: defaultMonthlyClGrid(cl) };
                                                    updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                                }} className="w-16 px-2.5 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#0F172A] text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20" />
                                                <button type="button" onClick={() => {
                                                    const arr = [...(settings.annualCLReset.casualLeaveByExperience || [])];
                                                    arr[idx] = { ...arr[idx], monthlyClCredits: defaultMonthlyClGrid(Number(arr[idx].casualLeave) || 12) };
                                                    updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                                }} className="px-2 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg">Even split 12</button>
                                                <button type="button" onClick={() => {
                                                    const arr = (settings.annualCLReset.casualLeaveByExperience || []).filter((_: any, i: number) => i !== idx);
                                                    updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                                }} className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-xs font-medium transition-colors">Remove</button>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Payroll months 1–12 (leave year)</p>
                                                <p className="text-[9px] text-gray-500 dark:text-gray-500 mb-1.5 leading-snug">
                                                    Month 1 = first payroll cycle of the financial year (chronological). Values are stored per period on the leave register and credited as running CL through the year. Mid-cycle join: full credit for that period only if more than half the pay cycle remains from date of joining; otherwise credit starts next period.
                                                </p>
                                                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                                                    {grid.map((cell: number, mi: number) => (
                                                        <div key={mi} className="flex flex-col gap-0.5">
                                                            <label className="text-[9px] text-gray-500 dark:text-gray-500 text-center">{mi + 1}</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step={0.5}
                                                                value={cell}
                                                                onChange={(e) => {
                                                                    const arr = [...(settings.annualCLReset.casualLeaveByExperience || [])];
                                                                    const next = [...(arr[idx].monthlyClCredits || defaultMonthlyClGrid(arr[idx].casualLeave))];
                                                                    next[mi] = Math.max(0, parseFloat(e.target.value) || 0);
                                                                    arr[idx] = { ...arr[idx], monthlyClCredits: next };
                                                                    updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                                                }}
                                                                className="w-full min-w-0 px-1 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#0F172A] text-xs text-center text-gray-900 dark:text-white"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className={`text-[10px] mt-1.5 ${sumMismatch ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-500'}`}>
                                                    Sum of 12 months: <strong>{gridSum.toFixed(2)}</strong>
                                                    {sumMismatch ? ` — does not match annual CL (${annual}); adjust grid or annual field.` : ' — matches annual CL.'}
                                                </p>
                                            </div>
                                        </div>
                                        );
                                    })}
                                    <button type="button" onClick={() => {
                                        const cl = 12;
                                        const arr = [...(settings.annualCLReset.casualLeaveByExperience || []), {
                                            minYears: 0,
                                            maxYears: 2,
                                            casualLeave: cl,
                                            monthlyClCredits: defaultMonthlyClGrid(cl),
                                            description: ''
                                        }];
                                        updateSettings('annualCLReset.casualLeaveByExperience', '', arr);
                                    }} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">+ Add experience tier</button>
                                </div>
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-800 dark:text-amber-200">Reset runs at configured month/day. Entitlement = default or experience tier; then + carry forward if enabled. Use preview before running.</p>
                                </div>
                            </div>
                        )}

                        {/* Initial CL sync (manual) – not annual reset */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Apply policy to all employees (initial sync)</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Sets each employee&apos;s CL to current policy (default or experience-based) + optional carry forward. Creates one ADJUSTMENT transaction per employee. Use after configuring settings or to align balances. This is not the annual reset.</p>
                                <button
                                    type="button"
                                    onClick={openInitialSyncPreview}
                                    disabled={saving || syncPreviewLoading}
                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
                                >
                                    {syncPreviewLoading ? 'Preparing preview...' : 'Apply initial CL from policy'}
                                </button>
                            </div>
                        </div>
                        </div>
                    </section>

                    {/* 5. Auto Update */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                                <Clock className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Auto Update</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Schedule automatic balance updates.</p>
                            </div>
                        </div>
                        <div className="p-6 sm:p-8 space-y-6">
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
                                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all">
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Update day</label>
                                    <input type="number" min="1" max="31" value={settings.autoUpdate.updateDay}
                                        onChange={(e) => updateSettings('autoUpdate.updateDay', '', parseInt(e.target.value))}
                                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm font-medium text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                                </div>
                            </div>
                        )}
                        </div>
                    </section>
                </div>
            </div>

            {syncPreviewOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Initial Sync Preview</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    <strong>Rest of FY grid</strong> = sum of policy CL for payroll periods whose <em>end date</em> (IST) is <em>after</em> the effective day; periods ending on or before that day are cleared to 0 and not credited. <strong>Carry</strong> = unused CL on <strong>LeaveRegisterYear</strong> only (no legacy register / Employee fallback), capped by max carry, folded into the first open month. <strong>Target CL</strong> = rest-of-FY grid + carry; remaining months are credited in one go. Click a row to see the 12-slot breakdown.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeInitialSyncPreview}
                                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Close
                            </button>
                        </div>

                        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                                type="text"
                                value={syncPreviewSearch}
                                onChange={(e) => setSyncPreviewSearch(e.target.value)}
                                placeholder="Search employee / emp no / department"
                                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm"
                            />
                            <input
                                type="text"
                                value={syncApplyReason}
                                onChange={(e) => setSyncApplyReason(e.target.value)}
                                placeholder="Reason (optional)"
                                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#0F172A] text-sm"
                            />
                            <div className="text-xs text-gray-500 dark:text-gray-400 self-center">
                                Rows: {
                                    syncPreviewRows.filter((r) => {
                                        const t = syncPreviewSearch.toLowerCase().trim();
                                        if (!t) return true;
                                        return (
                                            (r.employeeName || '').toLowerCase().includes(t) ||
                                            (r.empNo || '').toLowerCase().includes(t) ||
                                            (r.department || '').toLowerCase().includes(t)
                                        );
                                    }).length
                                }
                            </div>
                        </div>

                        <div className="overflow-auto p-4">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 pr-2">Employee</th>
                                        <th className="py-2 pr-2">Current CL</th>
                                        <th className="py-2 pr-2">Policy CL</th>
                                        <th className="py-2 pr-2">Carry</th>
                                        <th className="py-2 pr-2">Target CL</th>
                                        <th className="py-2 pr-2">Current EL</th>
                                        <th className="py-2 pr-2">Target EL</th>
                                        <th className="py-2 pr-2">Current CCL</th>
                                        <th className="py-2 pr-2">Target CCL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {syncPreviewRows
                                        .filter((r) => {
                                            const t = syncPreviewSearch.toLowerCase().trim();
                                            if (!t) return true;
                                            return (
                                                (r.employeeName || '').toLowerCase().includes(t) ||
                                                (r.empNo || '').toLowerCase().includes(t) ||
                                                (r.department || '').toLowerCase().includes(t)
                                            );
                                        })
                                        .map((row) => (
                                            <React.Fragment key={row.employeeId}>
                                            <tr
                                                className={`border-b border-gray-100 dark:border-gray-800 ${row.monthlyClBreakdown?.length ? 'cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/40' : ''}`}
                                                onClick={() => {
                                                    if (!row.monthlyClBreakdown?.length) return;
                                                    setInitialSyncExpandedEmployeeId((id) =>
                                                        id === row.employeeId ? null : row.employeeId
                                                    );
                                                }}
                                            >
                                                <td className="py-2 pr-2">
                                                    <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                        {row.monthlyClBreakdown?.length ? (
                                                            <span className="text-gray-400 select-none" aria-hidden>
                                                                {initialSyncExpandedEmployeeId === row.employeeId ? '▼' : '▶'}
                                                            </span>
                                                        ) : null}
                                                        {row.employeeName}
                                                    </div>
                                                    <div className="text-xs text-gray-500">{row.empNo} • {row.department || 'N/A'}</div>
                                                </td>
                                                <td className="py-2 pr-2">{Number(row.currentBalances?.CL || 0)}</td>
                                                <td className="py-2 pr-2 font-mono tabular-nums text-gray-700 dark:text-gray-300">
                                                    {Number(
                                                        row.policyClScheduled ??
                                                            row.clCalculation?.policyRemainingGridOnly ??
                                                            0
                                                    )}
                                                </td>
                                                <td className="py-2 pr-2 font-mono tabular-nums text-gray-700 dark:text-gray-300">
                                                    {Number(row.carryForwardInTarget ?? row.clCalculation?.carryForward ?? 0)}
                                                </td>
                                                <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={0.5}
                                                        value={row.proposedBalances.CL}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value || 0);
                                                            setSyncPreviewRows((prev) => {
                                                                return prev.map((p) => p.employeeId === row.employeeId
                                                                    ? { ...p, proposedBalances: { ...p.proposedBalances, CL: v } }
                                                                    : p
                                                                );
                                                            });
                                                        }}
                                                        className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#0F172A]"
                                                    />
                                                </td>
                                                <td className="py-2 pr-2">{Number(row.currentBalances?.EL || 0)}</td>
                                                <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={0.5}
                                                        value={row.proposedBalances.EL}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value || 0);
                                                            setSyncPreviewRows((prev) => {
                                                                return prev.map((p) => p.employeeId === row.employeeId
                                                                    ? { ...p, proposedBalances: { ...p.proposedBalances, EL: v } }
                                                                    : p
                                                                );
                                                            });
                                                        }}
                                                        className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#0F172A]"
                                                    />
                                                </td>
                                                <td className="py-2 pr-2">{Number(row.currentBalances?.CCL || 0)}</td>
                                                <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={0.5}
                                                        value={row.proposedBalances.CCL}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value || 0);
                                                            setSyncPreviewRows((prev) => {
                                                                return prev.map((p) => p.employeeId === row.employeeId
                                                                    ? { ...p, proposedBalances: { ...p.proposedBalances, CCL: v } }
                                                                    : p
                                                                );
                                                            });
                                                        }}
                                                        className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#0F172A]"
                                                    />
                                                </td>
                                            </tr>
                                            {initialSyncExpandedEmployeeId === row.employeeId &&
                                                row.monthlyClBreakdown &&
                                                row.monthlyClBreakdown.length > 0 && (
                                                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50/90 dark:bg-slate-900/50">
                                                        <td colSpan={9} className="px-4 py-3 align-top">
                                                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                                                                CL by payroll month (LeaveRegisterYear slots)
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full max-w-3xl text-xs border border-gray-200 dark:border-gray-600 rounded-lg">
                                                                    <thead>
                                                                        <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-600">
                                                                            <th className="py-1.5 px-2">#</th>
                                                                            <th className="py-1.5 px-2">Period</th>
                                                                            <th className="py-1.5 px-2">Policy cell</th>
                                                                            <th className="py-1.5 px-2">Past (zeroed)</th>
                                                                            <th className="py-1.5 px-2">Carry here</th>
                                                                            <th className="py-1.5 px-2">Applied CL</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {row.monthlyClBreakdown.map((m) => (
                                                                            <tr
                                                                                key={m.payrollMonthIndex}
                                                                                className="border-b border-gray-100 dark:border-gray-800/80"
                                                                            >
                                                                                <td className="py-1.5 px-2 font-mono">{m.payrollMonthIndex}</td>
                                                                                <td className="py-1.5 px-2">{m.label}</td>
                                                                                <td className="py-1.5 px-2 font-mono tabular-nums">{m.policyCellOriginal}</td>
                                                                                <td className="py-1.5 px-2">{m.clearedPast ? 'Yes' : '—'}</td>
                                                                                <td className="py-1.5 px-2 font-mono tabular-nums">
                                                                                    {m.carryAddedHere ? m.carryAddedHere : '—'}
                                                                                </td>
                                                                                <td className="py-1.5 px-2 font-mono tabular-nums font-medium text-gray-900 dark:text-white">
                                                                                    {m.clCreditsApplied}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                        </React.Fragment>
                                        ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeInitialSyncPreview}
                                className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={applyInitialSyncToFilteredList}
                                disabled={saving || getFilteredInitialSyncPreviewRows().length === 0}
                                className="px-4 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                                {saving ? 'Applying...' : `Apply filtered (${getFilteredInitialSyncPreviewRows().length})`}
                            </button>
                            <button
                                type="button"
                                onClick={applyInitialSyncToAllActive}
                                disabled={saving}
                                className="px-4 py-2 text-sm rounded-xl bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white disabled:opacity-50"
                            >
                                {saving ? 'Applying...' : 'Apply all active employees'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Save — full width */}
            <div className="flex justify-end pt-6 border-t border-gray-200 dark:border-gray-800">
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm shadow-sm"
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
            </div>
        );
};

export default LeavePolicySettings;
