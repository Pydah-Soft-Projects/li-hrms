'use client';

import React from 'react';
import { Calendar, AlertCircle, Clock } from 'lucide-react';
import { SettingsSectionCard } from '../SettingsPageShell';
import {
    settingsFieldHelpClass,
    settingsInputClass,
    settingsInputStyle,
    settingsLedgerBorder,
    settingsToggleThumbClass,
    settingsToggleTrackClass,
} from '@/lib/settingsUi';

interface LeavePolicyProps {
    settings: any;
    onChange: (settings: any) => void;
}

const LeavePolicy = ({ settings, onChange }: LeavePolicyProps) => {
    const s = settings?.settings || {};
    const inputClass = settingsInputClass();
    const inputStyle = settingsInputStyle();

    const update = (key: string, value: any) => {
        onChange({
            ...settings,
            settings: { ...s, [key]: value }
        });
    };

    return (
        <div className="space-y-6">
            <SettingsSectionCard title="Backdated leave" description="Allow employees to apply for past dates.">
                <div className="flex items-center justify-between gap-4 border p-4" style={settingsLedgerBorder}>
                    <div className="flex items-center gap-3">
                        <div
                            className="flex h-10 w-10 items-center justify-center border text-[color:var(--ps-accent)]"
                            style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}
                        >
                            <Clock className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">Allow backdated applications</span>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={s.allowBackdated}
                        onClick={() => update('allowBackdated', !s.allowBackdated)}
                        className={settingsToggleTrackClass(!!s.allowBackdated)}
                    >
                        <span className={settingsToggleThumbClass(!!s.allowBackdated)} />
                    </button>
                </div>
                {s.allowBackdated && (
                    <div className="mt-4 space-y-2">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Max backdated days</label>
                        <input
                            type="number"
                            value={s.maxBackdatedDays || 0}
                            onChange={(e) => update('maxBackdatedDays', Number(e.target.value))}
                            className={inputClass}
                            style={inputStyle}
                        />
                    </div>
                )}
            </SettingsSectionCard>

            <SettingsSectionCard title="Future dated" description="Allow employees to apply for future dates.">
                <div className="flex items-center justify-between gap-4 border p-4" style={settingsLedgerBorder}>
                    <div className="flex items-center gap-3">
                        <div
                            className="flex h-10 w-10 items-center justify-center border text-[color:var(--ps-accent)]"
                            style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}
                        >
                            <Calendar className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">Allow future-dated applications</span>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={s.allowFutureDated}
                        onClick={() => update('allowFutureDated', !s.allowFutureDated)}
                        className={settingsToggleTrackClass(!!s.allowFutureDated)}
                    >
                        <span className={settingsToggleThumbClass(!!s.allowFutureDated)} />
                    </button>
                </div>
                {s.allowFutureDated && (
                    <div className="mt-4 space-y-2">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Max advance days</label>
                        <input
                            type="number"
                            value={s.maxAdvanceDays || 0}
                            onChange={(e) => update('maxAdvanceDays', Number(e.target.value))}
                            className={inputClass}
                            style={inputStyle}
                        />
                    </div>
                )}
            </SettingsSectionCard>

            <div className="flex items-start gap-3 border p-4" style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}>
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className={`text-xs leading-relaxed text-amber-900 dark:text-amber-200 ${settingsFieldHelpClass}`}>
                    <strong>Tip:</strong> Restricting backdated applications helps in timely attendance processing. For major leaves, we recommend a max backdated period of 3–7 days.
                </p>
            </div>
        </div>
    );
};

export default LeavePolicy;
