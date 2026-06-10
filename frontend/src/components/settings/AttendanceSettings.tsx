'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
    SUPERADMIN_COMPLETE_AGGREGATE_KEYS,
    SUPERADMIN_COMPLETE_AGGREGATE_LABELS,
    WORKSPACE_COMPLETE_AGGREGATE_KEYS,
    normalizeCompleteSummaryColumns,
    type SuperadminCompleteAggregateKey,
} from '@/lib/attendanceCompleteAggregateColumns';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
    SettingsPanel,
    SettingsPanelHeader,
    SettingsSaveBar,
    SettingsSectionCard,
    SettingsToggleRow,
} from './SettingsPageShell';
import {
    settingsFieldHelpClass,
    settingsInputClass,
    settingsInputStyle,
    settingsLedgerBorder,
    settingsSectionTitleClass,
    settingsToggleThumbClass,
    settingsToggleTrackClass,
} from '@/lib/settingsUi';
import { RefreshCw, Upload, MapPin, Clock } from 'lucide-react';

const PROCESSING_MODE_DEFAULTS = {
    mode: 'multi_shift',
    strictCheckInOutOnly: true,
    continuousSplitThresholdHours: 14,
    splitMinGapHours: 3,
    maxShiftsPerDay: 3,
    rosterStrictWhenPresent: true,
    postShiftOutMarginHours: 4,
};

const AttendanceSettings = () => {
    const [attendanceSettings, setAttendanceSettings] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getAttendanceSettings();
            if (res.success && res.data) {
                const data = res.data;
                const processingMode = data.processingMode
                    ? { ...PROCESSING_MODE_DEFAULTS, ...data.processingMode }
                    : PROCESSING_MODE_DEFAULTS;
                if (processingMode.mode === 'multi_shift') {
                    processingMode.strictCheckInOutOnly = true;
                }
                const featureFlags = data.featureFlags || {};
                setAttendanceSettings({
                    ...data,
                    processingMode,
                    featureFlags: {
                        allowInTimeEditing: featureFlags.allowInTimeEditing !== false,
                        allowOutTimeEditing: featureFlags.allowOutTimeEditing !== false,
                        allowAttendanceUpload: featureFlags.allowAttendanceUpload !== false,
                        allowShiftChange: featureFlags.allowShiftChange !== false,
                        partialDaysContributeToPayableShifts:
                            featureFlags.partialDaysContributeToPayableShifts === true,
                    },
                    completeSummaryColumns: normalizeCompleteSummaryColumns(data.completeSummaryColumns),
                });
            }
        } catch (err) {
            console.error('Error loading attendance settings:', err);
            toast.error('Failed to load attendance settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async () => {
        if (!attendanceSettings) return;
        try {
            setSaving(true);
            const pm = attendanceSettings.processingMode || PROCESSING_MODE_DEFAULTS;
            const processingMode = { ...pm };
            if (processingMode.mode === 'multi_shift') {
                processingMode.strictCheckInOutOnly = true;
            }
            const featureFlags = {
                ...(attendanceSettings.featureFlags || {
                    allowInTimeEditing: true,
                    allowOutTimeEditing: true,
                    allowAttendanceUpload: true,
                    allowShiftChange: true,
                    partialDaysContributeToPayableShifts: false,
                }),
            };
            if (processingMode.mode !== 'single_shift') {
                featureFlags.partialDaysContributeToPayableShifts = false;
            }
            const payload = {
                ...attendanceSettings,
                processingMode,
                featureFlags,
                completeSummaryColumns: normalizeCompleteSummaryColumns(attendanceSettings.completeSummaryColumns),
            };
            const res = await api.updateAttendanceSettings(payload);
            if (res.success) {
                toast.success('Attendance settings saved successfully');
            } else {
                toast.error(res.message || 'Failed to save settings');
            }
        } catch (err) {
            toast.error('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    const handleManualSync = async () => {
        try {
            setSyncing(true);
            const res = await api.manualSyncAttendance();
            if (res.success) {
                toast.success(res.message || 'Sync completed successfully');
            } else {
                toast.error(res.message || 'Sync failed');
            }
        } catch (err) {
            toast.error('An error occurred during sync');
        } finally {
            setSyncing(false);
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) return;
        try {
            setUploading(true);
            const res = await api.uploadAttendanceExcel(uploadFile);
            if (res.success) {
                toast.success('Attendance log uploaded successfully');
                setUploadFile(null);
            } else {
                toast.error(res.message || 'Upload failed');
            }
        } catch (err) {
            toast.error('An error occurred during upload');
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <SettingsSkeleton />;
    if (!attendanceSettings) return <div className="py-10 text-center text-stone-500">Settings not found.</div>;

    const inputCls = settingsInputClass();
    const inputStyle = settingsInputStyle();

    const pm = attendanceSettings.processingMode || PROCESSING_MODE_DEFAULTS;
    const setProcessingMode = (updates: Partial<typeof pm>) =>
        setAttendanceSettings({ ...attendanceSettings, processingMode: { ...pm, ...updates } });

    const partialPayableToggleEffectiveOn =
        pm.mode === 'single_shift' &&
        attendanceSettings.featureFlags?.partialDaysContributeToPayableShifts === true;

    const completeSummaryCols = normalizeCompleteSummaryColumns(attendanceSettings.completeSummaryColumns);

    const toggleOrgCompleteSummaryColumn = (key: SuperadminCompleteAggregateKey) => {
        setAttendanceSettings((prev: any) => {
            if (!prev) return prev;
            const cols = normalizeCompleteSummaryColumns(prev.completeSummaryColumns);
            const next = { ...cols, [key]: !cols[key] };
            if (!WORKSPACE_COMPLETE_AGGREGATE_KEYS.some((k) => next[k])) return prev;
            if (!SUPERADMIN_COMPLETE_AGGREGATE_KEYS.some((k) => next[k])) return prev;
            return { ...prev, completeSummaryColumns: next };
        });
    };

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section="Attendance"
                title="Attendance Configuration"
                subtitle="Manage device sync, mobile tracking, and manual data imports."
            />

            <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
                <div className="space-y-8 xl:col-span-2">
                    <SettingsSectionCard
                        title="Device Connectivity"
                        description={attendanceSettings.autoSync ? 'Auto-Sync Enabled' : 'Manual Sync Only'}
                        accent
                    >
                        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                            <div className="space-y-4">
                                <SettingsToggleRow
                                    id="attendance-auto-sync"
                                    label="Real-time Pull"
                                    description="Fetch logs automatically."
                                    checked={!!attendanceSettings.autoSync}
                                    onChange={(next) => setAttendanceSettings({ ...attendanceSettings, autoSync: next })}
                                />

                                <div className="flex items-center justify-between border p-4 sm:p-5" style={settingsLedgerBorder}>
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-tight text-stone-900 dark:text-stone-100">Sync Interval</p>
                                        <p className={settingsFieldHelpClass}>Minutes between cycles.</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={attendanceSettings.syncInterval || 15}
                                            onChange={(e) => setAttendanceSettings({ ...attendanceSettings, syncInterval: Number(e.target.value) })}
                                            className={`${inputCls} w-20 text-center text-xs`}
                                            style={inputStyle}
                                        />
                                        <span className="absolute -right-1 top-1/2 ml-1 -translate-y-1/2 translate-x-full text-[9px] font-semibold uppercase text-stone-400">Min</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center gap-3 border p-6 text-center" style={settingsLedgerBorder}>
                                <div
                                    className={`p-4 ${syncing ? 'text-[color:var(--ps-accent)]' : 'text-stone-400'}`}
                                    style={{ ...settingsLedgerBorder, backgroundColor: syncing ? 'var(--ps-accent-soft)' : undefined }}
                                >
                                    <RefreshCw className={`h-6 w-6 ${syncing ? 'animate-spin' : ''}`} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-900 dark:text-stone-100">Manual Force Sync</h4>
                                    <p className={settingsFieldHelpClass}>Trigger an immediate check of all devices.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleManualSync}
                                    disabled={syncing}
                                    className={`${inputCls} mt-2 w-full py-2 text-xs font-semibold disabled:opacity-50`}
                                    style={{ ...inputStyle, backgroundColor: 'var(--ps-accent)', color: 'white', borderColor: 'var(--ps-accent)' }}
                                >
                                    {syncing ? 'Syncing...' : 'Start Manual Sync'}
                                </button>
                            </div>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard
                        title="Processing Mode"
                        description={pm.mode === 'multi_shift' ? 'Multi-Shift (1–3 per day)' : 'Single-Shift (1 per day)'}
                    >
                        <div className="space-y-6">
                            <div className="flex flex-col gap-2">
                                <label className={settingsSectionTitleClass}>Mode</label>
                                <p className={settingsFieldHelpClass}>Multi-shift allows up to 3 segments per day with iterative split (14h+3h rule). Single-shift uses first IN and last OUT only.</p>
                                <select
                                    value={pm.mode || 'multi_shift'}
                                    onChange={(e) => {
                                        const newMode = e.target.value as 'multi_shift' | 'single_shift';
                                        setAttendanceSettings({
                                            ...attendanceSettings,
                                            processingMode: {
                                                ...pm,
                                                mode: newMode,
                                                strictCheckInOutOnly: newMode === 'multi_shift' ? true : pm.strictCheckInOutOnly,
                                            },
                                            featureFlags: {
                                                ...(attendanceSettings.featureFlags || {}),
                                                ...(newMode === 'multi_shift'
                                                    ? { partialDaysContributeToPayableShifts: false }
                                                    : {}),
                                            },
                                        });
                                    }}
                                    className={`${inputCls} max-w-xs text-sm`}
                                    style={inputStyle}
                                >
                                    <option value="multi_shift">Multi-Shift (up to 3 per day)</option>
                                    <option value="single_shift">Single-Shift (1 per day)</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between gap-4 border p-4 sm:p-5" style={settingsLedgerBorder}>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Strict Check-In/Out Only</p>
                                    <p className={settingsFieldHelpClass}>
                                        {pm.mode === 'multi_shift'
                                            ? 'Multi-shift always uses strict mode (CHECK-IN & CHECK-OUT only).'
                                            : 'Use only CHECK-IN & CHECK-OUT for pairing. When OFF, first-IN/last-OUT collapse applies.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={pm.mode === 'multi_shift' || !!pm.strictCheckInOutOnly}
                                    disabled={pm.mode === 'multi_shift'}
                                    onClick={() => pm.mode !== 'multi_shift' && setProcessingMode({ strictCheckInOutOnly: !pm.strictCheckInOutOnly })}
                                    className={`${settingsToggleTrackClass(pm.mode === 'multi_shift' || !!pm.strictCheckInOutOnly)} ${pm.mode === 'multi_shift' ? 'cursor-not-allowed opacity-80' : ''}`}
                                >
                                    <span className={settingsToggleThumbClass(pm.mode === 'multi_shift' || !!pm.strictCheckInOutOnly)} />
                                </button>
                            </div>

                            {pm.mode === 'multi_shift' && (
                                <div className="space-y-4 border p-6" style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}>
                                    <h4 className={`${settingsSectionTitleClass} flex items-center gap-1.5`}>
                                        <Clock className="h-3.5 w-3.5" />
                                        Multi-Shift Split Rules
                                    </h4>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className={settingsSectionTitleClass}>Split threshold (hours)</label>
                                            <input
                                                type="number"
                                                min={10}
                                                max={24}
                                                value={pm.continuousSplitThresholdHours ?? 14}
                                                onChange={(e) => setProcessingMode({ continuousSplitThresholdHours: Number(e.target.value) })}
                                                className={`${inputCls} mt-1 w-full text-sm`}
                                                style={inputStyle}
                                            />
                                            <p className={settingsFieldHelpClass}>Duration ≥ this to consider split (default 14)</p>
                                        </div>
                                        <div>
                                            <label className={settingsSectionTitleClass}>Min gap (hours)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={12}
                                                step={0.5}
                                                value={pm.splitMinGapHours ?? 3}
                                                onChange={(e) => setProcessingMode({ splitMinGapHours: Number(e.target.value) })}
                                                className={`${inputCls} mt-1 w-full text-sm`}
                                                style={inputStyle}
                                            />
                                            <p className={settingsFieldHelpClass}>Gap between shift end and OUT to split</p>
                                        </div>
                                        <div>
                                            <label className={settingsSectionTitleClass}>Max shifts per day</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={3}
                                                value={pm.maxShiftsPerDay ?? 3}
                                                onChange={(e) => setProcessingMode({ maxShiftsPerDay: Number(e.target.value) })}
                                                className={`${inputCls} mt-1 w-full text-sm`}
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label className={settingsSectionTitleClass}>Post-shift OUT margin (hours)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={8}
                                                value={pm.postShiftOutMarginHours ?? 4}
                                                onChange={(e) => setProcessingMode({ postShiftOutMarginHours: Number(e.target.value) })}
                                                className={`${inputCls} mt-1 w-full text-sm`}
                                                style={inputStyle}
                                            />
                                            <p className={settingsFieldHelpClass}>When strict OFF: OT punches up to this many hours after shift end count as this shift&apos;s OUT</p>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <SettingsToggleRow
                                                id="roster-strict-when-present"
                                                label="Roster strict when present"
                                                description="Use only rostered shift when roster exists for employee+date."
                                                checked={!!pm.rosterStrictWhenPresent}
                                                onChange={(next) => setProcessingMode({ rosterStrictWhenPresent: next })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard
                        title="Editing & Upload Controls"
                        description="Enable or disable in-time editing, out-time editing, shift change, and attendance Excel upload on the attendance pages."
                    >
                        <div className="space-y-4">
                            <SettingsToggleRow
                                id="allow-in-time-editing"
                                label="Allow In-Time Editing"
                                description="When ON, users can edit check-in time from the attendance detail panel."
                                checked={attendanceSettings.featureFlags?.allowInTimeEditing !== false}
                                onChange={(next) => setAttendanceSettings({
                                    ...attendanceSettings,
                                    featureFlags: { ...(attendanceSettings.featureFlags || {}), allowInTimeEditing: next },
                                })}
                            />
                            <SettingsToggleRow
                                id="allow-out-time-editing"
                                label="Allow Out-Time Editing"
                                description="When ON, users can edit check-out time (including next-day for overnight shifts)."
                                checked={attendanceSettings.featureFlags?.allowOutTimeEditing !== false}
                                onChange={(next) => setAttendanceSettings({
                                    ...attendanceSettings,
                                    featureFlags: { ...(attendanceSettings.featureFlags || {}), allowOutTimeEditing: next },
                                })}
                            />
                            <SettingsToggleRow
                                id="allow-shift-change"
                                label="Allow Shift Change"
                                description="When ON, users can change the shift from the attendance detail view dialog."
                                checked={attendanceSettings.featureFlags?.allowShiftChange !== false}
                                onChange={(next) => setAttendanceSettings({
                                    ...attendanceSettings,
                                    featureFlags: { ...(attendanceSettings.featureFlags || {}), allowShiftChange: next },
                                })}
                            />
                            <SettingsToggleRow
                                id="allow-attendance-upload"
                                label="Allow Attendance Upload"
                                description="When ON, the Upload Excel button is shown on the attendance page."
                                checked={attendanceSettings.featureFlags?.allowAttendanceUpload !== false}
                                onChange={(next) => setAttendanceSettings({
                                    ...attendanceSettings,
                                    featureFlags: { ...(attendanceSettings.featureFlags || {}), allowAttendanceUpload: next },
                                })}
                            />
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard
                        title="Complete table totals"
                        description="Choose which aggregate columns appear on the monthly Complete attendance grid for everyone (workspace and admin). Users cannot change this on the attendance page."
                    >
                        <div className="space-y-3">
                            <div
                                className={`mb-2 flex items-center justify-between border p-4 ${pm.mode !== 'single_shift' ? 'opacity-80' : ''}`}
                                style={settingsLedgerBorder}
                            >
                                <div className="space-y-1 pr-4">
                                    <p className="text-xs font-semibold uppercase tracking-tight text-stone-900 dark:text-stone-100">
                                        Partial days count toward payable shifts
                                    </p>
                                    <p className={settingsFieldHelpClass}>
                                        {pm.mode === 'single_shift' ? (
                                            <>
                                                When ON, PARTIAL days use at least 0.5 toward monthly payable in the summary (after recalculation). Only available in{' '}
                                                <span className="font-semibold">Single-Shift (1 per day)</span> mode.
                                            </>
                                        ) : (
                                            <>
                                                This option is only available when Processing Mode is{' '}
                                                <span className="font-semibold">Single-Shift (1 per day)</span>. Switch mode above to enable it.
                                            </>
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={pm.mode !== 'single_shift'}
                                    onClick={() => {
                                        if (pm.mode !== 'single_shift') return;
                                        setAttendanceSettings({
                                            ...attendanceSettings,
                                            featureFlags: {
                                                ...(attendanceSettings.featureFlags || {}),
                                                partialDaysContributeToPayableShifts: !(
                                                    attendanceSettings.featureFlags?.partialDaysContributeToPayableShifts === true
                                                ),
                                            },
                                        });
                                    }}
                                    className={`${settingsToggleTrackClass(partialPayableToggleEffectiveOn)} shrink-0 ${pm.mode !== 'single_shift' ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                    <span className={settingsToggleThumbClass(partialPayableToggleEffectiveOn)} />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {SUPERADMIN_COMPLETE_AGGREGATE_KEYS.map((k) => (
                                    <label
                                        key={k}
                                        className="flex cursor-pointer items-center justify-between gap-3 border p-3"
                                        style={settingsLedgerBorder}
                                    >
                                        <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                                            {SUPERADMIN_COMPLETE_AGGREGATE_LABELS[k]}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={completeSummaryCols[k]}
                                            onChange={() => toggleOrgCompleteSummaryColumn(k)}
                                            className="rounded border-stone-300 text-[color:var(--ps-accent)]"
                                        />
                                    </label>
                                ))}
                            </div>
                            <p className={settingsFieldHelpClass}>
                                At least one column must stay enabled for workspace and for the full column set (including Absent on the admin grid).
                            </p>
                            <button
                                type="button"
                                onClick={() =>
                                    setAttendanceSettings({
                                        ...attendanceSettings,
                                        completeSummaryColumns: normalizeCompleteSummaryColumns(
                                            Object.fromEntries(SUPERADMIN_COMPLETE_AGGREGATE_KEYS.map((key) => [key, true])) as Record<
                                                string,
                                                boolean
                                            >
                                        ),
                                    })
                                }
                                className="text-xs font-semibold text-[color:var(--ps-accent)] hover:underline"
                            >
                                Enable all totals
                            </button>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard
                        title="Mobile Tracking"
                        description={attendanceSettings.mobileAppEnabled ? 'Mobile Ready' : 'Inactive'}
                    >
                        <div className="space-y-6">
                            <SettingsToggleRow
                                id="mobile-app-enabled"
                                label="Enable App Tracking"
                                description="Allow employees to mark attendance via the mobile suite."
                                checked={!!attendanceSettings.mobileAppEnabled}
                                onChange={(next) => setAttendanceSettings({ ...attendanceSettings, mobileAppEnabled: next })}
                            />

                            {attendanceSettings.mobileAppEnabled && (
                                <div className="flex items-center justify-between border p-6" style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}>
                                    <div className="flex items-center gap-4">
                                        <div className="border p-2.5" style={settingsLedgerBorder}>
                                            <MapPin className="h-4 w-4 text-[color:var(--ps-accent)]" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Require GPS Validation</p>
                                            <p className={settingsFieldHelpClass}>Employees must be within range of tagged locations.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={!!attendanceSettings.requireGPS}
                                        onClick={() => setAttendanceSettings({ ...attendanceSettings, requireGPS: !attendanceSettings.requireGPS })}
                                        className={settingsToggleTrackClass(!!attendanceSettings.requireGPS)}
                                    >
                                        <span className={settingsToggleThumbClass(!!attendanceSettings.requireGPS)} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </SettingsSectionCard>
                </div>

                <div className="space-y-8">
                    <SettingsSectionCard title="Manual Data Import" accent>
                        <form onSubmit={handleFileUpload} className="space-y-4">
                            <div
                                className={`relative flex flex-col items-center justify-center border-2 border-dashed p-6 transition-all ${uploadFile ? 'border-[color:var(--ps-accent-border)]' : ''}`}
                                style={uploadFile ? { backgroundColor: 'var(--ps-accent-soft)' } : settingsLedgerBorder}
                            >
                                <Upload className={`mb-2 h-8 w-8 ${uploadFile ? 'text-[color:var(--ps-accent)]' : 'text-stone-300'}`} />
                                {uploadFile ? (
                                    <div className="text-center">
                                        <p className="max-w-[150px] truncate text-[10px] font-semibold text-stone-900 dark:text-stone-100">{uploadFile.name}</p>
                                        <button type="button" onClick={() => setUploadFile(null)} className="mt-1 text-[9px] font-semibold uppercase text-rose-500">Remove</button>
                                    </div>
                                ) : (
                                    <p className="text-center text-[10px] font-semibold uppercase text-stone-400">Drop log file here</p>
                                )}
                                <input
                                    type="file"
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!uploadFile || uploading}
                                className={`${inputCls} flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold disabled:opacity-50`}
                                style={{ ...inputStyle, backgroundColor: 'var(--ps-accent)', color: 'white', borderColor: 'var(--ps-accent)' }}
                            >
                                {uploading ? 'Processing...' : 'Upload Log'}
                                {!uploading && <Upload className="h-3.5 w-3.5" />}
                            </button>
                        </form>
                    </SettingsSectionCard>

                    <SettingsSaveBar onSave={handleSave} saving={saving} label="Save Settings Now" />
                </div>
            </div>
        </SettingsPanel>
    );
};

export default AttendanceSettings;
