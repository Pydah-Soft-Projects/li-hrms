'use client';

import React from 'react';
import { Plus, Trash2, Palette, DollarSign } from 'lucide-react';

interface LeaveTypesManagerProps {
    types: any[];
    onChange: (types: any[]) => void;
}

const LeaveTypesManager = ({ types, onChange }: LeaveTypesManagerProps) => {
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
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Available Leave Types</h3>
                    <p className="text-xs text-gray-500 mt-1">Define codes, names, and nature for supported leave categories.</p>
                </div>
                <button
                    onClick={addType}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition"
                >
                    <Plus className="h-3.5 w-3.5" /> Add Type
                </button>
            </div>


            <div className="space-y-4">
                {types.map((type, idx) => (
                    <div key={idx} className="group relative p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:border-indigo-200 dark:hover:border-indigo-900">
                        <div className="flex items-start gap-4">
                            <div className="relative group/color">
                                <div className="h-12 w-12 rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden" style={{ backgroundColor: type.color }}>
                                    <Palette className="h-5 w-5 text-white/50" />
                                </div>
                                <input
                                    type="color"
                                    value={type.color}
                                    onChange={(e) => updateType(idx, 'color', e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                            </div>
                            <div className="flex-1 space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="CODE (e.g. SL)"
                                        value={type.code}
                                        onChange={(e) => updateType(idx, 'code', e.target.value)}
                                        className="w-24 bg-gray-50 dark:bg-gray-900 border-none rounded-lg px-2 py-1.5 text-xs font-bold uppercase"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Full Name (e.g. Sick Leave)"
                                        value={type.name}
                                        onChange={(e) => updateType(idx, 'name', e.target.value)}
                                        className="flex-1 bg-gray-50 dark:bg-gray-900 border-none rounded-lg px-3 py-1.5 text-xs font-medium"
                                    />
                                </div>

                                {/* isPaid Toggle */}
                                <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                    <DollarSign className={`h-4 w-4 ${type.isPaid !== false ? 'text-green-600' : 'text-red-600'}`} />
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">
                                        {type.isPaid !== false ? 'Paid Leave' : 'Loss of Pay (LOP)'}
                                    </span>
                                    <button
                                        onClick={() => updateType(idx, 'isPaid', !(type.isPaid !== false))}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${type.isPaid !== false ? 'bg-green-600' : 'bg-red-600'
                                            }`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${type.isPaid !== false ? 'translate-x-5' : 'translate-x-1'
                                            }`} />
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => removeType(idx)}
                                className="p-2 text-red-100 group-hover:text-red-400 transition"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
                {types.length === 0 && (
                    <div className="py-12 text-center text-gray-400 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl">
                        No leave types defined. Click &quot;Add Type&quot; to start.
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeaveTypesManager;
