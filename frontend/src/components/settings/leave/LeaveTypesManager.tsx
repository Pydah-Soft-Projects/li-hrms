'use client';

import React from 'react';
import { Plus, Trash2, Palette, DollarSign } from 'lucide-react';
import {
    settingsFieldHelpClass,
    settingsInputClass,
    settingsInputStyle,
    settingsLedgerBorder,
    settingsPrimaryButtonClass,
    settingsPrimaryButtonStyle,
    settingsToggleThumbClass,
    settingsToggleTrackClass,
} from '@/lib/settingsUi';
import { leaveSettingsLabels, type LeaveSettingsKind } from './leaveSettingsLabels';

interface LeaveTypesManagerProps {
    kind?: LeaveSettingsKind;
    types: any[];
    onChange: (types: any[]) => void;
}

const LeaveTypesManager = ({ kind = 'leave', types, onChange }: LeaveTypesManagerProps) => {
    const copy = leaveSettingsLabels(kind);
    const showPaid = kind === 'leave';
    const inputClass = settingsInputClass();
    const inputStyle = settingsInputStyle();
    const fieldLabelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400';

    const addType = () => {
        const base = { code: '', name: '', color: '#4F46E5', isActive: true };
        onChange([...types, showPaid ? { ...base, isPaid: true } : base]);
    };

    const removeType = (idx: number) => {
        onChange(types.filter((_, i) => i !== idx));
    };

    const updateType = (idx: number, field: string, value: any) => {
        const next = [...types];
        next[idx] = { ...next[idx], [field]: value };
        onChange(next);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4" style={settingsLedgerBorder}>
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-stone-900 dark:text-stone-100">{copy.typesTitle}</h3>
                    <p className={`mt-1 ${settingsFieldHelpClass}`}>{copy.typesDescription}</p>
                </div>
                <button
                    type="button"
                    onClick={addType}
                    className={`inline-flex items-center gap-2 ${settingsPrimaryButtonClass()}`}
                    style={settingsPrimaryButtonStyle()}
                >
                    <Plus className="h-3.5 w-3.5" /> Add type
                </button>
            </div>

            <div className="space-y-4">
                {types.map((leaveType, idx) => {
                    const code = String(leaveType.code ?? '').toUpperCase();
                    const name = String(leaveType.name ?? leaveType.label ?? '');
                    const isPaid = leaveType.isPaid !== false;

                    return (
                        <div
                            key={leaveType._id || `${code || 'type'}-${idx}`}
                            className="group relative border p-4 transition-all hover:border-[color:var(--ps-accent-border)] sm:p-5"
                            style={settingsLedgerBorder}
                        >
                            <div className="flex items-start gap-4">
                                <div className="relative shrink-0">
                                    <div
                                        className="flex h-12 w-12 items-center justify-center overflow-hidden border"
                                        style={{ ...settingsLedgerBorder, backgroundColor: leaveType.color || '#4F46E5' }}
                                    >
                                        <Palette className="h-5 w-5 text-white/50" />
                                    </div>
                                    <input
                                        type="color"
                                        value={leaveType.color || '#4F46E5'}
                                        onChange={(e) => updateType(idx, 'color', e.target.value)}
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                    />
                                </div>

                                <div className="min-w-0 flex-1 space-y-3">
                                    {kind === 'od' ? (
                                        <div className="flex items-end gap-2">
                                            <div className="w-28 shrink-0">
                                                <label className={fieldLabelClass}>Code</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. OW"
                                                    value={code}
                                                    onChange={(e) => updateType(idx, 'code', e.target.value.toUpperCase())}
                                                    className={`w-full ${inputClass} py-1.5 text-xs font-bold uppercase`}
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <label className={fieldLabelClass}>Name</label>
                                                <input
                                                    type="text"
                                                    placeholder={copy.namePlaceholder}
                                                    value={name}
                                                    onChange={(e) => updateType(idx, 'name', e.target.value)}
                                                    className={`w-full ${inputClass} py-1.5 text-xs`}
                                                    style={inputStyle}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-end gap-2">
                                                <div className="w-28 shrink-0">
                                                    <label className={fieldLabelClass}>Code</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. SL"
                                                        value={code}
                                                        onChange={(e) => updateType(idx, 'code', e.target.value.toUpperCase())}
                                                        className={`w-full ${inputClass} py-1.5 text-xs font-bold uppercase`}
                                                        style={inputStyle}
                                                    />
                                                </div>

                                                {showPaid ? (
                                                    <div
                                                        className="flex min-w-0 flex-1 items-center gap-3 border px-3 py-2"
                                                        style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(var(--ps-accent-rgb), 0.02)' }}
                                                    >
                                                        <DollarSign className={`h-4 w-4 shrink-0 ${isPaid ? 'text-emerald-600' : 'text-rose-600'}`} />
                                                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-700 dark:text-stone-300">
                                                            {isPaid ? copy.paidLabel : copy.unpaidLabel}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateType(idx, 'isPaid', !isPaid)}
                                                            className={settingsToggleTrackClass(isPaid)}
                                                        >
                                                            <span className={settingsToggleThumbClass(isPaid)} />
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div>
                                                <label className={fieldLabelClass}>Name</label>
                                                <input
                                                    type="text"
                                                    placeholder={copy.namePlaceholder}
                                                    value={name}
                                                    onChange={(e) => updateType(idx, 'name', e.target.value)}
                                                    className={`w-full ${inputClass} py-1.5 text-xs`}
                                                    style={inputStyle}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => removeType(idx)}
                                    className="shrink-0 p-2 text-stone-300 transition group-hover:text-rose-500"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    );
                })}
                {types.length === 0 && (
                    <div className="border border-dashed py-12 text-center text-stone-400" style={settingsLedgerBorder}>
                        {copy.typesEmpty}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeaveTypesManager;
