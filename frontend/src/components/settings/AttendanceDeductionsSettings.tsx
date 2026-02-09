'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, AlertTriangle, Clock, Calculator, Plus, Trash2, ArrowRight } from 'lucide-react';

const AttendanceDeductionsSettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rules, setRules] = useState({
        combinedCountThreshold: null as number | null,
        deductionType: null as 'half_day' | 'full_day' | 'custom_amount' | null,
        deductionAmount: null as number | null,
        minimumDuration: null as number | null,
        calculationMode: null as 'proportional' | 'floor' | null,
    });
    const [earlyOut, setEarlyOut] = useState({
        isEnabled: false,
        allowedDurationMinutes: 0,
        minimumDuration: 0,
        deductionRanges: [] as any[],
    });
    const [newRange, setNewRange] = useState({
        minMinutes: '',
        maxMinutes: '',
        deductionType: 'quarter_day' as any,
        deductionAmount: '',
        description: '',
    });

    const loadSettings = async () => {
        try {
            setLoading(true);
            const [resRules, resEarly] = await Promise.all([
                api.getAttendanceDeductionSettings(),
                api.getEarlyOutSettings()
            ]);
            if (resRules.success && resRules.data) setRules(resRules.data.deductionRules || rules);
            if (resEarly.success && resEarly.data) setEarlyOut(resEarly.data);
        } catch (err) {
            console.error('Error loading deduction settings:', err);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSaveRules = async () => {
        try {
            setSaving(true);
            const res = await api.saveAttendanceDeductionSettings({ deductionRules: rules });
            if (res.success) toast.success('Deduction rules saved');
            else toast.error('Failed to save rules');
        } catch (err) {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEarlyOut = async () => {
        try {
            setSaving(true);
            const res = await api.saveEarlyOutSettings(earlyOut);
            if (res.success) toast.success('Early-out settings saved');
            else toast.error('Failed to save');
        } catch (err) {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const addRange = () => {
        if (!newRange.minMinutes || !newRange.maxMinutes) return;
        setEarlyOut({
            ...earlyOut,
            deductionRanges: [...earlyOut.deductionRanges, { ...newRange, _id: Date.now().toString() }]
        });
        setNewRange({ minMinutes: '', maxMinutes: '', deductionType: 'quarter_day', deductionAmount: '', description: '' });
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Attendance Deductions</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure LOP rules for late-ins, early-outs, and combined thresholds.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Combined Threshold Rules */}
                <div className="p-8 rounded-3xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Combined Penalty Rules</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Late-in and Early-out combined threshold LOP.</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-4 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl">
                            <label className="block text-[10px] font-bold text-red-700 dark:text-red-400 uppercase mb-2">Total Occurrences Allowed</label>
                            <input
                                type="number"
                                value={rules.combinedCountThreshold || ''}
                                onChange={(e) => setRules({ ...rules, combinedCountThreshold: e.target.value ? Number(e.target.value) : null })}
                                className="w-full bg-white dark:bg-gray-900 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500"
                                placeholder="e.g. 3"
                            />
                            <p className="mt-2 text-[10px] text-red-600/70">Deduction triggers after this count is reached in a payroll month.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'half_day', label: 'Half Day LOP' },
                                { id: 'full_day', label: 'Full Day LOP' },
                                { id: 'custom_amount', label: 'Fixed Amount' }
                            ].map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setRules({ ...rules, deductionType: type.id as any })}
                                    className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-semibold transition ${rules.deductionType === type.id
                                            ? 'border-red-500 bg-white text-red-700 shadow-sm'
                                            : 'border-transparent bg-gray-50 dark:bg-gray-900/50 text-gray-500'
                                        }`}
                                >
                                    {type.label}
                                    {rules.deductionType === type.id && <div className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleSaveRules}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-white py-3.5 text-sm font-semibold hover:bg-indigo-700 transition shadow-xl shadow-indigo-500/10"
                        >
                            {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                            Save Combined Rules
                        </button>
                    </div>
                </div>

                {/* Early-Out Graduated Deductions */}
                <div className="p-8 rounded-3xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                                <Clock className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Graduated Early-Out</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Time-based penalties for leaving early.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setEarlyOut({ ...earlyOut, isEnabled: !earlyOut.isEnabled })}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${earlyOut.isEnabled ? 'bg-amber-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${earlyOut.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {earlyOut.isEnabled && (
                            <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Monthly Allowed (Min)</label>
                                        <input type="number" value={earlyOut.allowedDurationMinutes} onChange={(e) => setEarlyOut({ ...earlyOut, allowedDurationMinutes: Number(e.target.value) })} className="w-full bg-transparent border-none p-0 text-sm mt-1 focus:ring-0" />
                                    </div>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Per Instance Min (Min)</label>
                                        <input type="number" value={earlyOut.minimumDuration} onChange={(e) => setEarlyOut({ ...earlyOut, minimumDuration: Number(e.target.value) })} className="w-full bg-transparent border-none p-0 text-sm mt-1 focus:ring-0" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Penalty Ranges</p>
                                    {earlyOut.deductionRanges.map((range, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-xs shadow-sm">
                                            <div className="flex-1 font-semibold">{range.minMinutes} - {range.maxMinutes} min</div>
                                            <ArrowRight className="h-3 w-3 text-gray-300" />
                                            <div className="px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg font-bold capitalize">{range.deductionType.replace('_', ' ')}</div>
                                            <button onClick={() => setEarlyOut({ ...earlyOut, deductionRanges: earlyOut.deductionRanges.filter((_, i) => i !== idx) })} className="text-red-300 hover:text-red-500 px-2"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </div>
                                    ))}
                                    <div className="grid grid-cols-11 gap-2 p-3 rounded-2xl bg-amber-50/30 dark:bg-amber-900/10 border-2 border-dashed border-amber-100 dark:border-amber-900/20">
                                        <input type="number" placeholder="Min" value={newRange.minMinutes} onChange={(e) => setNewRange({ ...newRange, minMinutes: e.target.value })} className="col-span-3 bg-white dark:bg-gray-900 border-none rounded-lg p-2 text-xs" />
                                        <input type="number" placeholder="Max" value={newRange.maxMinutes} onChange={(e) => setNewRange({ ...newRange, maxMinutes: e.target.value })} className="col-span-3 bg-white dark:bg-gray-900 border-none rounded-lg p-2 text-xs" />
                                        <select value={newRange.deductionType} onChange={(e) => setNewRange({ ...newRange, deductionType: e.target.value })} className="col-span-4 bg-white dark:bg-gray-900 border-none rounded-lg p-2 text-xs">
                                            <option value="quarter_day">0.25 Day</option>
                                            <option value="half_day">0.5 Day</option>
                                            <option value="full_day">1 Day</option>
                                        </select>
                                        <button onClick={addRange} className="col-span-1 flex items-center justify-center bg-amber-500 text-white rounded-lg"><Plus className="h-4 w-4" /></button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleSaveEarlyOut}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-600 text-white py-3.5 text-sm font-semibold hover:bg-amber-700 transition"
                        >
                            Update Early-Out Rules
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AttendanceDeductionsSettings;
