'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Clock, Trash2, CheckCircle2 } from 'lucide-react';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
} from '@/components/settings/SettingsPageShell';
import {
  settingsInputClass,
  settingsInputStyle,
  settingsLedgerBorder,
  settingsPrimaryButtonClass,
  settingsPrimaryButtonStyle,
} from '@/lib/settingsUi';

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

    if (loading) return <SettingsSkeleton />;

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section="Shifts"
                title="Shift Management"
                subtitle="Manage available shift lengths and labels for scheduling."
            />

            <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
                <div className="xl:col-span-1">
                    <SettingsSectionCard title="Create New Template" className="sticky top-6">
                        <div className="space-y-5">
                            <SettingsField label="Duration (Hrs)" required>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={newDuration.duration}
                                        onChange={(e) => setNewDuration({ ...newDuration, duration: e.target.value })}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                        placeholder="e.g. 8.0"
                                    />
                                    <Clock className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                                </div>
                            </SettingsField>
                            <SettingsField label="Label Alias">
                                <input
                                    type="text"
                                    value={newDuration.label}
                                    onChange={(e) => setNewDuration({ ...newDuration, label: e.target.value })}
                                    className={settingsInputClass()}
                                    style={settingsInputStyle()}
                                    placeholder="e.g. Morning Shift"
                                />
                            </SettingsField>
                            <button
                                type="button"
                                onClick={handleAddDuration}
                                disabled={saving || !newDuration.duration}
                                className={`inline-flex w-full items-center justify-center gap-2 ${settingsPrimaryButtonClass()}`}
                                style={settingsPrimaryButtonStyle()}
                            >
                                {saving ? <Spinner className="h-3.5 w-3.5" /> : 'Register Duration'}
                            </button>
                        </div>
                    </SettingsSectionCard>
                </div>

                <div className="space-y-6 xl:col-span-2">
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Configured Durations</h3>
                        <span
                            className="px-2 py-0.5 text-[10px] font-semibold text-[color:var(--ps-accent)]"
                            style={{ backgroundColor: 'var(--ps-accent-soft)' }}
                        >
                            {shiftDurations.length} Active Labels
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {shiftDurations.map((item) => (
                            <div
                                key={item._id}
                                className={`group relative border p-6 transition-all duration-300 ${
                                    item.isActive
                                    ? 'bg-white dark:bg-stone-950'
                                    : 'bg-stone-50/50 opacity-70 dark:bg-stone-900/50'
                                }`}
                                style={settingsLedgerBorder}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`flex h-11 w-11 items-center justify-center transition-colors ${
                                                item.isActive
                                                ? 'text-[color:var(--ps-accent)]'
                                                : 'bg-stone-100 text-stone-400'
                                            }`}
                                            style={item.isActive ? { backgroundColor: 'var(--ps-accent-soft)' } : undefined}
                                        >
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className={`text-lg font-semibold ${item.isActive ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400'}`}>
                                                    {item.duration}
                                                    <span className="ml-1 text-xs font-semibold uppercase opacity-60">Hrs</span>
                                                </p>
                                            </div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                                                {item.label || 'Standard Shift'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => toggleStatus(item)}
                                            className={`rounded-lg p-2 transition-all ${item.isActive ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-stone-400 hover:bg-stone-100'}`}
                                            title={item.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteDuration(item._id)}
                                            className="rounded-lg p-2 text-stone-300 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div
                                    className="mt-4 flex items-center justify-between border-t pt-4"
                                    style={settingsLedgerBorder}
                                >
                                    <span
                                        className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                                            item.isActive
                                            ? 'border-emerald-100 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400'
                                            : 'border-stone-200 text-stone-400 dark:border-stone-800'
                                        }`}
                                        style={item.isActive ? { backgroundColor: 'rgba(16,185,129,0.08)' } : undefined}
                                    >
                                        {item.isActive ? 'Operational' : 'Archived'}
                                    </span>
                                    {item.isActive && (
                                        <div className="flex -space-x-1.5 overflow-hidden">
                                            <div className="h-5 w-5 border-2 border-white bg-[color:var(--ps-accent)] dark:border-stone-950" />
                                            <div className="h-5 w-5 border-2 border-white bg-[color:var(--ps-accent)] opacity-80 dark:border-stone-950" />
                                            <div className="h-5 w-5 border-2 border-white bg-[color:var(--ps-accent)] opacity-60 dark:border-stone-950" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {shiftDurations.length === 0 && (
                        <div
                            className="flex flex-col items-center border-2 border-dashed py-20 text-center"
                            style={settingsLedgerBorder}
                        >
                            <Clock className="mb-4 h-12 w-12 text-stone-200 dark:text-stone-800" />
                            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">No shift protocols defined</p>
                        </div>
                    )}
                </div>
            </div>
        </SettingsPanel>
    );
};

export default ShiftSettings;
