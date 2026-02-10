'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Clock, Trash2, CheckCircle2, ChevronRight } from 'lucide-react';

interface ShiftDuration {
    _id: string;
    duration: number;
    label?: string;
    isActive: boolean;
}

const ShiftSettings = () => {
    const [shiftDurations, setShiftDurations] = useState<ShiftDuration[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newDuration, setNewDuration] = useState({ duration: '', label: '' });

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getShiftDurations();
            if (res.success && res.durations) {
                setShiftDurations(res.durations);
            }
        } catch (err) {
            console.error('Error loading shift durations:', err);
            toast.error('Failed to load shift settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleAddDuration = async () => {
        if (!newDuration.duration) return;
        try {
            setSaving(true);
            const res = await api.createShiftDuration({
                duration: Number(newDuration.duration),
                label: newDuration.label,
            });
            if (res.success) {
                toast.success('Shift duration added');
                setNewDuration({ duration: '', label: '' });
                loadSettings();
            } else {
                toast.error(res.message || 'Failed to add duration');
            }
        } catch {
            toast.error('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (item: ShiftDuration) => {
        try {
            const res = await api.updateShiftDuration(item._id, { isActive: !item.isActive });
            if (res.success) {
                setShiftDurations(shiftDurations.map(d => d._id === item._id ? { ...d, isActive: !d.isActive } : d));
                toast.success('Status updated');
            }
        } catch {
            toast.error('Failed to update status');
        }
    };

    const deleteDuration = async (id: string) => {
        if (!confirm('Are you sure you want to delete this shift duration?')) return;
        try {
            const res = await api.deleteShiftDuration(id);
            if (res.success) {
                setShiftDurations(shiftDurations.filter(d => d._id !== id));
                toast.success('Duration deleted');
            }
        } catch {
            toast.error('Failed to delete');
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    <span>Settings</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-indigo-600">Shifts</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Shift Management</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage available shift lengths and labels for scheduling.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                {/* Add New Duration */}
                <div className="xl:col-span-1">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden sticky top-6">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-indigo-50/30 dark:bg-indigo-900/5">
                            <h3 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Create New Template</h3>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Duration (Hrs) <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={newDuration.duration}
                                        onChange={(e) => setNewDuration({ ...newDuration, duration: e.target.value })}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                        placeholder="e.g. 8.0"
                                    />
                                    <Clock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Label Alias</label>
                                <input
                                    type="text"
                                    value={newDuration.label}
                                    onChange={(e) => setNewDuration({ ...newDuration, label: e.target.value })}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all"
                                    placeholder="e.g. Morning Shift"
                                />
                            </div>
                            <button
                                onClick={handleAddDuration}
                                disabled={saving || !newDuration.duration}
                                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {saving ? <Spinner className="h-3.5 w-3.5 mx-auto" /> : 'Register Duration'}
                            </button>
                        </div>
                    </section>
                </div>

                {/* Duration List */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configured Durations</h3>
                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">{shiftDurations.length} Active Labels</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {shiftDurations.map((item) => (
                            <div key={item._id} className={`group relative p-6 rounded-2xl border transition-all duration-300 ${item.isActive
                                ? 'bg-white border-gray-100 dark:bg-[#1E293B] dark:border-gray-800 shadow-sm hover:shadow-md'
                                : 'bg-gray-50/50 border-gray-50 dark:bg-black/10 dark:border-gray-900 opacity-70'}`}>

                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`h-11 w-11 flex items-center justify-center rounded-xl transition-colors ${item.isActive ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30' : 'bg-gray-100 text-gray-400'}`}>
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className={`text-lg font-bold ${item.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                                    {item.duration}
                                                    <span className="text-xs font-bold ml-1 uppercase opacity-60">Hrs</span>
                                                </p>
                                            </div>
                                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                                                {item.label || 'Standard Shift'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => toggleStatus(item)}
                                            className={`p-2 rounded-lg transition-all ${item.isActive ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-gray-400 hover:bg-gray-100'}`}
                                            title={item.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => deleteDuration(item._id)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-50 dark:border-gray-800/50 flex items-center justify-between">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${item.isActive
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                                        : 'bg-gray-100 text-gray-400 border border-gray-200 dark:bg-black/20 dark:border-gray-800'}`}>
                                        {item.isActive ? 'Operational' : 'Archived'}
                                    </span>
                                    {item.isActive && (
                                        <div className="flex -space-x-1.5 overflow-hidden">
                                            <div className="h-5 w-5 rounded-full bg-indigo-500 border-2 border-white dark:border-[#1E293B]" />
                                            <div className="h-5 w-5 rounded-full bg-indigo-400 border-2 border-white dark:border-[#1E293B]" />
                                            <div className="h-5 w-5 rounded-full bg-indigo-300 border-2 border-white dark:border-[#1E293B]" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {shiftDurations.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl flex flex-col items-center bg-gray-50/30">
                            <Clock className="h-12 w-12 text-gray-200 dark:text-gray-800 mb-4" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No shift protocols defined</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShiftSettings;
