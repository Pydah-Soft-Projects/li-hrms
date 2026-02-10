'use client';

import React from 'react';
import { Calendar, AlertCircle, Clock } from 'lucide-react';

interface LeavePolicyProps {
    settings: any;
    onChange: (settings: any) => void;
}

const LeavePolicy = ({ settings, onChange }: LeavePolicyProps) => {
    const s = settings?.settings || {};

    const update = (key: string, value: any) => {
        onChange({
            ...settings,
            settings: { ...s, [key]: value }
        });
    };

    return (
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-8 space-y-6">
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                {/* Backdated Applications */}
                <div className="p-6 rounded-2xl border border-gray-100 bg-white/50 backdrop-blur-sm dark:bg-gray-800 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                <Clock className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Backdated Leave</h3>
                        </div>
                        <button
                            onClick={() => update('allowBackdated', !s.allowBackdated)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.allowBackdated ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.allowBackdated ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    {s.allowBackdated && (
                        <div className="space-y-3 animate-in slide-in-from-top-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Max Backdated Days</label>
                            <input
                                type="number"
                                value={s.maxBackdatedDays || 0}
                                onChange={(e) => update('maxBackdatedDays', Number(e.target.value))}
                                className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-3 text-sm"
                            />
                        </div>
                    )}
                </div>

                {/* Future Dated Applications */}
                <div className="p-6 rounded-2xl border border-gray-100 bg-white/50 backdrop-blur-sm dark:bg-gray-800 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                                <Calendar className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Future Dated</h3>
                        </div>
                        <button
                            onClick={() => update('allowFutureDated', !s.allowFutureDated)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.allowFutureDated ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.allowFutureDated ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    {s.allowFutureDated && (
                        <div className="space-y-3 animate-in slide-in-from-top-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Max Advance Days</label>
                            <input
                                type="number"
                                value={s.maxAdvanceDays || 0}
                                onChange={(e) => update('maxAdvanceDays', Number(e.target.value))}
                                className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-3 text-sm"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <strong>Tip:</strong> Restricting backdated applications helps in timely attendance processing. For major leaves, we recommend a max backdated period of 3-7 days.
                </p>
            </div>
        </div>
    );
};

export default LeavePolicy;
