'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, RefreshCw, Upload, Smartphone, Server, MapPin, ChevronRight } from 'lucide-react';

const AttendanceSettings = () => {
    const [attendanceSettings, setAttendanceSettings] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getAttendanceSettings();
            if (res.success && res.data) {
                setAttendanceSettings(res.data);
            }
        } catch (err) {
            console.error('Error loading attendance settings:', err);
            toast.error('Failed to load attendance settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async () => {
        if (!attendanceSettings) return;
        try {
            setSaving(true);
            const res = await api.updateAttendanceSettings(attendanceSettings);
            if (res.success) {
                toast.success('Attendance settings saved successfully');
            } else {
                toast.error(res.message || 'Failed to save settings');
            }
        } catch (err) {
            toast.error('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    const handleManualSync = async () => {
        try {
            setSyncing(true);
            const res = await api.manualSyncAttendance();
            if (res.success) {
                toast.success(res.message || 'Sync completed successfully');
            } else {
                toast.error(res.message || 'Sync failed');
            }
        } catch (err) {
            toast.error('An error occurred during sync');
        } finally {
            setSyncing(false);
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) return;
        try {
            setUploading(true);
            const res = await api.uploadAttendanceExcel(uploadFile);
            if (res.success) {
                toast.success('Attendance log uploaded successfully');
                setUploadFile(null);
            } else {
                toast.error(res.message || 'Upload failed');
            }
        } catch (err) {
            toast.error('An error occurred during upload');
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
    if (!attendanceSettings) return <div className="text-center py-10 text-gray-500">Settings not found.</div>;

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
    if (!attendanceSettings) return <div className="text-center py-10 text-gray-500">Settings not found.</div>;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    <span>Settings</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-indigo-600">Attendance</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Configuration</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage device sync, mobile tracking, and manual data imports.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className="xl:col-span-2 space-y-8">
                    {/* Biometric Sync Section */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Device Connectivity</h3>
                            <div className="flex items-center gap-2">
                                {attendanceSettings.autoSync ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-900/30 uppercase tracking-tight">
                                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                        Auto-Sync Enabled
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-400 border border-gray-100 uppercase tracking-tight text-opacity-70">
                                        <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                                        Manual Sync Only
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 dark:bg-black/10 border border-gray-100 dark:border-gray-800">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">Real-time Pull</p>
                                        <p className="text-[10px] text-gray-400">Fetch logs automatically.</p>
                                    </div>
                                    <button
                                        onClick={() => setAttendanceSettings({ ...attendanceSettings, autoSync: !attendanceSettings.autoSync })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${attendanceSettings.autoSync ? 'bg-indigo-600 shadow-[0_0_12px_rgba(79,70,229,0.3)]' : 'bg-gray-200 dark:bg-gray-800'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${attendanceSettings.autoSync ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 dark:bg-black/10 border border-gray-100 dark:border-gray-800">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">Sync Interval</p>
                                        <p className="text-[10px] text-gray-400">Minutes between cycles.</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={attendanceSettings.syncInterval || 15}
                                            onChange={(e) => setAttendanceSettings({ ...attendanceSettings, syncInterval: Number(e.target.value) })}
                                            className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold dark:border-gray-700 dark:bg-[#0F172A] dark:text-white text-center"
                                        />
                                        <span className="absolute -right-1 translate-x-full top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400 uppercase ml-1">Min</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-black/20 rounded-xl p-6 border border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center gap-3 text-center">
                                <div className={`p-4 rounded-full ${syncing ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-400 shadow-sm border border-gray-100 dark:border-gray-700'}`}>
                                    <RefreshCw className={`h-6 w-6 ${syncing ? 'animate-spin' : ''}`} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Manual Force Sync</h4>
                                    <p className="text-[10px] text-gray-400">Trigger an immediate check of all devices.</p>
                                </div>
                                <button
                                    onClick={handleManualSync}
                                    disabled={syncing}
                                    className="mt-2 w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-md shadow-indigo-500/10 disabled:opacity-50"
                                >
                                    {syncing ? 'Syncing...' : 'Start Manual Sync'}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Mobile Attendance Section */}
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Mobile Tracking</h3>
                            <div className="flex items-center gap-2">
                                {attendanceSettings.mobileAppEnabled ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 uppercase tracking-tight">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Mobile Ready
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-400 border border-gray-100 uppercase tracking-tight">
                                        Inactive
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Enable App Tracking</p>
                                    <p className="text-xs text-gray-500">Allow employees to mark attendance via the mobile suite.</p>
                                </div>
                                <button
                                    onClick={() => setAttendanceSettings({ ...attendanceSettings, mobileAppEnabled: !attendanceSettings.mobileAppEnabled })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${attendanceSettings.mobileAppEnabled ? 'bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-gray-200 dark:bg-gray-800'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${attendanceSettings.mobileAppEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {attendanceSettings.mobileAppEnabled && (
                                <div className="animate-in slide-in-from-top-2 duration-400 p-6 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#1E293B] shadow-sm border border-emerald-100/50 dark:border-emerald-800">
                                            <MapPin className="h-4 w-4 text-emerald-500" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Require GPS Validation</p>
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-400/80">Employees must be within range of tagged locations.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setAttendanceSettings({ ...attendanceSettings, requireGPS: !attendanceSettings.requireGPS })}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ${attendanceSettings.requireGPS ? 'bg-emerald-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ${attendanceSettings.requireGPS ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="space-y-8">
                    {/* Manual Import Card */}
                    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-amber-50/30 dark:bg-amber-900/5">
                            <h3 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Manual Data Import</h3>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleFileUpload} className="space-y-4">
                                <div className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all p-6 ${uploadFile ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-900/10' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}>
                                    <Upload className={`h-8 w-8 mb-2 ${uploadFile ? 'text-amber-500' : 'text-gray-300'}`} />
                                    {uploadFile ? (
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold text-gray-900 dark:text-white truncate max-w-[150px]">{uploadFile.name}</p>
                                            <button type="button" onClick={() => setUploadFile(null)} className="text-[9px] text-red-500 font-bold uppercase mt-1">Remove</button>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-gray-400 font-bold uppercase text-center">Drop log file here</p>
                                    )}
                                    <input
                                        type="file"
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!uploadFile || uploading}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50 shadow-lg shadow-amber-500/10 active:scale-95"
                                >
                                    {uploading ? 'Processing...' : 'Upload Log'}
                                    {!uploading && <Upload className="h-3.5 w-3.5" />}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Global Save Action */}
                    <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-500/20">
                        <h3 className="text-lg font-bold mb-2">Save Changes</h3>
                        <p className="text-xs opacity-80 leading-relaxed mb-6">
                            Apply these configuration changes across all biometric devices and tracking systems.
                        </p>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full py-3 bg-white text-indigo-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
                        >
                            {saving ? 'Applying...' : 'Save Settings Now'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AttendanceSettings;
