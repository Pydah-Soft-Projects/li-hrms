'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, RefreshCw, Upload, Smartphone, Server, MapPin } from 'lucide-react';

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

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Attendance Configuration</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Manage device sync, mobile tracking, and manual data imports.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                    {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                    Save Changes
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Sync & Connectivity */}
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                                <RefreshCw className="h-4 w-4 text-indigo-500" />
                                Biometric Sync
                            </h3>
                            <button
                                onClick={handleManualSync}
                                disabled={syncing}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
                            >
                                {syncing ? 'Syncing...' : 'Manual Sync Now'}
                                <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <Server className="h-5 w-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-sync Attendance</p>
                                        <p className="text-xs text-gray-500">Automatically pull logs from connected devices.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setAttendanceSettings({ ...attendanceSettings, autoSync: !attendanceSettings.autoSync })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${attendanceSettings.autoSync ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${attendanceSettings.autoSync ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="h-5 w-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sync Frequency (Minutes)</p>
                                        <p className="text-xs text-gray-500">Interval between automatic synchronization.</p>
                                    </div>
                                </div>
                                <input
                                    type="number"
                                    value={attendanceSettings.syncInterval || 15}
                                    onChange={(e) => setAttendanceSettings({ ...attendanceSettings, syncInterval: Number(e.target.value) })}
                                    className="w-20 rounded-lg border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-6">
                            <Smartphone className="h-4 w-4 text-emerald-500" />
                            Mobile Attendance
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable App Check-In</p>
                                    <p className="text-xs text-gray-500">Allow employees to mark attendance via mobile app.</p>
                                </div>
                                <button
                                    onClick={() => setAttendanceSettings({ ...attendanceSettings, mobileAppEnabled: !attendanceSettings.mobileAppEnabled })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${attendanceSettings.mobileAppEnabled ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${attendanceSettings.mobileAppEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {attendanceSettings.mobileAppEnabled && (
                                <div className="animate-in slide-in-from-top-2 duration-300 p-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <MapPin className="h-4 w-4 text-emerald-500" />
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Require GPS Location</p>
                                    </div>
                                    <button
                                        onClick={() => setAttendanceSettings({ ...attendanceSettings, requireGPS: !attendanceSettings.requireGPS })}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${attendanceSettings.requireGPS ? 'bg-emerald-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${attendanceSettings.requireGPS ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Upload Log */}
                <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-6">
                        <Upload className="h-4 w-4 text-amber-500" />
                        Manual Attendance Import
                    </h3>
                    <form onSubmit={handleFileUpload} className="space-y-6">
                        <div className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition-all ${uploadFile ? 'border-amber-500 bg-amber-50/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                            <Upload className={`h-10 w-10 mb-4 ${uploadFile ? 'text-amber-500' : 'text-gray-400'}`} />
                            {uploadFile ? (
                                <div className="text-center">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{uploadFile.name}</p>
                                    <p className="text-xs text-gray-500 mt-1">Ready to upload</p>
                                    <button
                                        type="button"
                                        onClick={() => setUploadFile(null)}
                                        className="mt-3 text-xs text-red-500 hover:underline"
                                    >
                                        Remove file
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">Click to select attendance log</p>
                                    <p className="text-xs text-gray-500 mt-1">Supports .csv, .xlsx, and .dat files</p>
                                </div>
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
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50 shadow-lg shadow-amber-500/20"
                        >
                            {uploading ? 'Uploading...' : 'Upload Log File'}
                            {!uploading && <Upload className="h-4 w-4" />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AttendanceSettings;
