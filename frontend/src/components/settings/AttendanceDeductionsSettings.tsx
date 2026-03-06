'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, AlertTriangle, Clock, Calculator, Plus, Trash2, ArrowRight, ChevronRight } from 'lucide-react';
import { useCallback } from 'react';

const AttendanceDeductionsSettings = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rules, setRules] = useState({
        freeAllowedPerMonth: null as number | null,
        combinedCountThreshold: null as number | null,
        deductionType: null as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' | null,
        deductionDays: null as number | null,
        deductionAmount: null as number | null,
        minimumDuration: null as number | null,
        calculationMode: null as 'proportional' | 'floor' | null,
    });
    const [earlyOut, setEarlyOut] = useState<{
        isEnabled: boolean;
        allowedDurationMinutes: number;
        minimumDuration: number;
        deductionRanges: { _id: string; minMinutes: string | number; maxMinutes: string | number; deductionType: 'quarter_day' | 'half_day' | 'full_day'; deductionAmount: string | number; description: string }[];
    }>({
        isEnabled: false,
        allowedDurationMinutes: 0,
        minimumDuration: 0,
        deductionRanges: [],
    });
    const [newRange, setNewRange] = useState({
        minMinutes: '',
        maxMinutes: '',
        deductionType: 'quarter_day' as 'quarter_day' | 'half_day' | 'full_day',
        deductionAmount: '',
        description: '',
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const [resRules, resEarly] = await Promise.all([
                api.getAttendanceDeductionSettings(),
                api.getEarlyOutSettings()
            ]);
            if (resRules.success && resRules.data && resRules.data.deductionRules) setRules(resRules.data.deductionRules);
            if (resEarly.success && resEarly.data) setEarlyOut(resEarly.data);
        } catch (err) {
            console.error('Error loading deduction settings:', err);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSaveRules = async () => {
        try {
            setSaving(true);
            const res = await api.saveAttendanceDeductionSettings({ deductionRules: rules });
            if (res.success) toast.success('Deduction rules saved');
            else toast.error('Failed to save rules');
        } catch {
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
        } catch {
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

    if (loading) return <SettingsSkeleton />;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    <span>Settings</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-indigo-600">Deductions</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Logic & Penalties</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure automated Loss-of-Pay (LOP) triggers for attendance irregularities and threshold breaches.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {/* Combined Threshold Rules */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
                    <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 bg-red-50/10 dark:bg-red-900/5">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100/50 text-red-600 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900/50">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Combined Multi-Count Penalties</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">Late-In & Early-Out Aggregation</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        <div className="space-y-3">
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest text-center">Free Allowed (Monthly)</label>
                            <div className="relative max-w-[120px] mx-auto">
                                <input
                                    type="number"
                                    min={0}
                                    value={rules.freeAllowedPerMonth ?? ''}
                                    onChange={(e) => setRules({ ...rules, freeAllowedPerMonth: e.target.value !== '' ? Number(e.target.value) : null })}
                                    className="w-full bg-slate-50 dark:bg-[#0F172A] border-2 border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-4 text-2xl font-black text-center focus:border-red-500 focus:ring-0 transition-all dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <p className="text-[10px] text-center text-gray-400 font-medium">First N late-ins + early-outs per month are free; only count above this is used for deduction.</p>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest text-center">Every N (Above Free) = 1 Unit</label>
                            <div className="relative max-w-[120px] mx-auto">
                                <input
                                    type="number"
                                    min={1}
                                    value={rules.combinedCountThreshold ?? ''}
                                    onChange={(e) => setRules({ ...rules, combinedCountThreshold: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-slate-50 dark:bg-[#0F172A] border-2 border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-4 text-2xl font-black text-center focus:border-red-500 focus:ring-0 transition-all dark:text-white"
                                    placeholder="e.g. 3"
                                />
                                <div className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white dark:border-[#1E293B]">#</div>
                            </div>
                            <p className="text-[10px] text-center text-gray-400 font-medium">Deduction applies for every N occurrences above the free limit (e.g. every 3 = 1 unit).</p>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Calculation Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'floor', label: 'Floor (full units only)' },
                                    { id: 'proportional', label: 'Proportional (partial allowed)' },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setRules({ ...rules, calculationMode: mode.id as 'floor' | 'proportional' })}
                                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all border ${rules.calculationMode === mode.id ? 'border-red-500 bg-red-50/30 dark:bg-red-950/20 text-red-700 dark:text-red-400' : 'border-gray-100 dark:border-gray-800 text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'}`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Select Penalty Magnitude</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { id: 'half_day', label: '0.5 Day LOP' },
                                    { id: 'full_day', label: '1.0 Day LOP' },
                                    { id: 'custom_days', label: 'Custom days' },
                                    { id: 'custom_amount', label: 'Fixed Fee (₹)' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setRules({ ...rules, deductionType: type.id as 'half_day' | 'full_day' | 'custom_days' | 'custom_amount' })}
                                        className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-2xl border-2 transition-all group ${rules.deductionType === type.id
                                            ? 'border-red-500 bg-red-50/30 dark:bg-red-950/20 text-red-700 dark:text-red-400 scale-[1.05] shadow-lg shadow-red-500/10'
                                            : 'border-gray-100 dark:border-gray-800 bg-transparent text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                                            }`}
                                    >
                                        <div className={`h-2 w-2 rounded-full transition-all ${rules.deductionType === type.id ? 'bg-red-500 scale-125' : 'bg-gray-200 dark:bg-gray-800'}`} />
                                        <span className="text-[11px] font-black uppercase tracking-tight">{type.label}</span>
                                    </button>
                                ))}
                            </div>
                            {rules.deductionType === 'custom_days' && (
                                <div className="mt-3">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Deduction days per unit (e.g. 1.5, 2, 3.25)</label>
                                    <input
                                        type="number"
                                        step={0.25}
                                        min={0}
                                        value={rules.deductionDays ?? ''}
                                        onChange={(e) => setRules({ ...rules, deductionDays: e.target.value !== '' ? Number(e.target.value) : null })}
                                        className="w-full max-w-[140px] bg-slate-50 dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2 text-sm font-bold dark:text-white"
                                        placeholder="e.g. 1.5"
                                    />
                                </div>
                            )}
                            {rules.deductionType === 'custom_amount' && (
                                <div className="mt-3">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Amount (₹) per unit</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={rules.deductionAmount ?? ''}
                                        onChange={(e) => setRules({ ...rules, deductionAmount: e.target.value !== '' ? Number(e.target.value) : null })}
                                        className="w-full max-w-[140px] bg-slate-50 dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2 text-sm font-bold dark:text-white"
                                        placeholder="e.g. 500"
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleSaveRules}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-4 text-xs font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                            Commit Combined Protocols
                        </button>
                    </div>
                </section>

                {/* Early-Out Graduated Deductions */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
                    <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 bg-amber-50/10 dark:bg-amber-900/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100/50 text-amber-600 dark:bg-amber-950 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
                                <Clock className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Time-Sectored Early-Out</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">Duration-Based Scalar Penalties</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setEarlyOut({ ...earlyOut, isEnabled: !earlyOut.isEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${earlyOut.isEnabled ? 'bg-amber-600 shadow-[0_0_12px_rgba(217,119,6,0.3)]' : 'bg-gray-200 dark:bg-gray-800'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${earlyOut.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="p-8 space-y-8">
                        {earlyOut.isEnabled ? (
                            <div className="animate-in slide-in-from-top-2 duration-500 space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Monthly Grace (Min)</label>
                                        <div className="relative">
                                            <input type="number" value={earlyOut.allowedDurationMinutes} onChange={(e) => setEarlyOut({ ...earlyOut, allowedDurationMinutes: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 p-4 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-500/20 dark:text-white" />
                                            <Calculator className="absolute right-4 top-4 h-4 w-4 text-gray-300" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hard Minimum (Min)</label>
                                        <div className="relative">
                                            <input type="number" value={earlyOut.minimumDuration} onChange={(e) => setEarlyOut({ ...earlyOut, minimumDuration: Number(e.target.value) })} className="w-full bg-slate-50 dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 p-4 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-500/20 dark:text-white" />
                                            <Clock className="absolute right-4 top-4 h-4 w-4 text-gray-300" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Graduated Penalty Matrix</label>
                                    <div className="space-y-3">
                                        {earlyOut.deductionRanges.map((range, idx) => (
                                            <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-gray-100 dark:border-gray-800 shadow-sm hover:border-amber-200 transition-colors group">
                                                <div className="flex-1 flex items-center gap-3">
                                                    <span className="text-xs font-black text-gray-900 dark:text-white">{range.minMinutes}</span>
                                                    <div className="flex-1 h-px bg-gray-50 dark:bg-gray-800 relative">
                                                        <ArrowRight className="absolute left-1/2 -ml-2 -top-1.5 h-3 w-3 text-gray-200" />
                                                    </div>
                                                    <span className="text-xs font-black text-gray-900 dark:text-white">{range.maxMinutes} <span className="text-[10px] text-gray-400 font-medium ml-1 uppercase">min</span></span>
                                                </div>
                                                <div className="px-3 py-1.5 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-100/50 dark:border-amber-900/50">
                                                    {range.deductionType.replace('_', ' ')}
                                                </div>
                                                <button onClick={() => setEarlyOut({ ...earlyOut, deductionRanges: earlyOut.deductionRanges.filter((_, i) => i !== idx) })} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50/50 dark:bg-[#0F172A]/50 border-2 border-dashed border-gray-100 dark:border-gray-800">
                                            <input type="number" placeholder="Min (m)" value={newRange.minMinutes} onChange={(e) => setNewRange({ ...newRange, minMinutes: e.target.value })} className="bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs font-bold dark:text-white" />
                                            <input type="number" placeholder="Max (m)" value={newRange.maxMinutes} onChange={(e) => setNewRange({ ...newRange, maxMinutes: e.target.value })} className="bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs font-bold dark:text-white" />
                                            <select value={newRange.deductionType} onChange={(e) => setNewRange({ ...newRange, deductionType: e.target.value as 'quarter_day' | 'half_day' | 'full_day' })} className="bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-[10px] font-black uppercase dark:text-amber-400 text-amber-600">
                                                <option value="quarter_day">0.25 Day</option>
                                                <option value="half_day">0.5 Day</option>
                                                <option value="full_day">1 Day</option>
                                            </select>
                                            <button onClick={addRange} className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all">
                                                <Plus className="h-4 w-4" /> Add
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSaveEarlyOut}
                                    disabled={saving}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 text-white py-4 text-xs font-bold hover:bg-amber-700 transition-all shadow-xl shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                                    Deploy Scalar Rules
                                </button>
                            </div>
                        ) : (
                            <div className="py-24 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl bg-gray-50/20 flex flex-col items-center gap-4">
                                <div className="h-16 w-16 bg-white dark:bg-[#0F172A] rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-center shadow-sm">
                                    <Clock className="h-8 w-8 text-gray-200" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Scalar Inactive</h4>
                                    <p className="text-[10px] text-gray-400 max-w-xs mx-auto font-medium mt-1">Enable to activate graduated penalties based on precise exit duration.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AttendanceDeductionsSettings;
