'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Clock, Plus, Trash2, Edit3, CheckCircle2 } from 'lucide-react';

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
        } catch (err) {
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
        } catch (err) {
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
        } catch (err) {
            toast.error('Failed to delete');
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Shift Duration Settings</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Manage available shift lengths and labels for scheduling.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add New Duration */}
                <div className="lg:col-span-1">
                    <div className="p-6 rounded-3xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50 shadow-sm sticky top-6">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Plus className="h-4 w-4 text-indigo-500" />
                            Add Duration
                        </h3>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Duration (Hours)</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    value={newDuration.duration}
                                    onChange={(e) => setNewDuration({ ...newDuration, duration: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. 8"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Display Label (Optional)</label>
                                <input
                                    type="text"
                                    value={newDuration.label}
                                    onChange={(e) => setNewDuration({ ...newDuration, label: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. standard"
                                />
                            </div>
                            <button
                                onClick={handleAddDuration}
                                disabled={saving || !newDuration.duration}
                                className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-sm font-bold shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                                {saving ? <Spinner /> : 'Create Duration'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Duration List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {shiftDurations.map((item) => (
                            <div key={item._id} className={`group p-5 rounded-3xl border transition-all ${item.isActive ? 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700' : 'bg-gray-50/50 border-gray-50 dark:bg-gray-900/30'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-10 flex items-center justify-center rounded-xl ${item.isActive ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30' : 'bg-gray-100 text-gray-400'}`}>
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className={`text-lg font-bold ${item.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{item.duration} Hours</p>
                                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-tighter">{item.label || 'No Label'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => toggleStatus(item)} className={`p-2 rounded-lg transition ${item.isActive ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                                            <CheckCircle2 className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => deleteDuration(item._id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${item.isActive ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-200 text-gray-500'}`}>
                                        {item.isActive ? 'Active' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {shiftDurations.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-[40px] flex flex-col items-center">
                            <Clock className="h-16 w-16 text-gray-100 dark:text-gray-800 mb-4" />
                            <p className="text-sm font-semibold text-gray-400">No shift durations added yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShiftSettings;
