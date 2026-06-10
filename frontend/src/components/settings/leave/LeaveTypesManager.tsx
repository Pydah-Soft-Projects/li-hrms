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

interface LeaveTypesManagerProps {
    types: any[];
    onChange: (types: any[]) => void;
}

const LeaveTypesManager = ({ types, onChange }: LeaveTypesManagerProps) => {
    const inputClass = settingsInputClass();
    const inputStyle = settingsInputStyle();

    const addType = () => {
        onChange([...types, { code: '', name: '', color: '#4F46E5', isPaid: true, isActive: true }]);
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
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-stone-900 dark:text-stone-100">Available leave types</h3>
                    <p className={`mt-1 ${settingsFieldHelpClass}`}>Define codes, names, and nature for supported leave categories.</p>
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
                {types.map((type, idx) => (
                    <div
                        key={idx}
                        className="group relative border p-5 transition-all hover:border-[color:var(--ps-accent-border)]"
                        style={settingsLedgerBorder}
                    >
                        <div className="flex items-start gap-4">
                            <div className="relative">
                                <div className="flex h-12 w-12 items-center justify-center overflow-hidden border" style={{ ...settingsLedgerBorder, backgroundColor: type.color }}>
                                    <Palette className="h-5 w-5 text-white/50" />
                                </div>
                                <input
                                    type="color"
                                    value={type.color}
                                    onChange={(e) => updateType(idx, 'color', e.target.value)}
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                />
                            </div>
                            <div className="flex-1 space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="CODE (e.g. SL)"
                                        value={type.code}
                                        onChange={(e) => updateType(idx, 'code', e.target.value)}
                                        className={`w-24 ${inputClass} py-1.5 text-xs font-bold uppercase`}
                                        style={inputStyle}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Full Name (e.g. Sick Leave)"
                                        value={type.name}
                                        onChange={(e) => updateType(idx, 'name', e.target.value)}
                                        className={`flex-1 ${inputClass} py-1.5 text-xs`}
                                        style={inputStyle}
                                    />
                                </div>

                                <div className="flex items-center gap-3 border px-3 py-2" style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(var(--ps-accent-rgb), 0.02)' }}>
                                    <DollarSign className={`h-4 w-4 ${type.isPaid !== false ? 'text-emerald-600' : 'text-rose-600'}`} />
                                    <span className="flex-1 text-xs font-medium text-stone-700 dark:text-stone-300">
                                        {type.isPaid !== false ? 'Paid Leave' : 'Loss of Pay (LOP)'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => updateType(idx, 'isPaid', !(type.isPaid !== false))}
                                        className={settingsToggleTrackClass(type.isPaid !== false)}
                                    >
                                        <span className={settingsToggleThumbClass(type.isPaid !== false)} />
                                    </button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => removeType(idx)}
                                className="p-2 text-stone-300 transition group-hover:text-rose-500"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
                {types.length === 0 && (
                    <div className="border border-dashed py-12 text-center text-stone-400" style={settingsLedgerBorder}>
                        No leave types defined. Click &quot;Add type&quot; to start.
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeaveTypesManager;
