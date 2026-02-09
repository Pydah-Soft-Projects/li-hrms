'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Database, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

const EmployeeSettings = () => {
    const [employeeDataSource, setEmployeeDataSource] = useState<string>('mongodb');
    const [employeeDeleteTarget, setEmployeeDeleteTarget] = useState<string>('both');
    const [mssqlConnected, setMssqlConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getEmployeeSettings();
            if (res.success && res.data) {
                setEmployeeDataSource(res.data.dataSource || 'mongodb');
                setEmployeeDeleteTarget(res.data.deleteTarget || 'both');
                setMssqlConnected(res.data.mssqlConnected || false);
            }
        } catch (err) {
            console.error('Error loading employee settings:', err);
            toast.error('Failed to load employee settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await api.updateEmployeeSettings({
                dataSource: employeeDataSource,
                deleteTarget: employeeDeleteTarget,
            });

            if (res.success) {
                toast.success('Employee settings saved successfully');
            } else {
                toast.error(res.message || 'Failed to save settings');
            }
        } catch (err) {
            toast.error('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Employee Settings</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure data sources and deletion policies for employee records.</p>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Data Source */}
                <div className="group relative rounded-2xl border border-gray-200 bg-white/50 p-6 backdrop-blur-sm transition-all hover:border-indigo-500/50 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                                <Database className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Employee Data Source</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Choose primary database for employee info.</p>
                            </div>
                        </div>
                        {mssqlConnected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> MSSQL Connected
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                <AlertCircle className="h-3 w-3" /> Local Only
                            </span>
                        )}
                    </div>
                    <select
                        value={employeeDataSource}
                        onChange={(e) => setEmployeeDataSource(e.target.value)}
                        className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                        <option value="mongodb">Internal (MongoDB)</option>
                        <option value="mssql">External (MSSQL Server)</option>
                        <option value="both">Both (Hybrid)</option>
                    </select>
                </div>

                {/* Delete Policy */}
                <div className="group relative rounded-2xl border border-gray-200 bg-white/50 p-6 backdrop-blur-sm transition-all hover:border-red-500/50 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Deletion Policy</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Determine where records are deleted from.</p>
                        </div>
                    </div>
                    <select
                        value={employeeDeleteTarget}
                        onChange={(e) => setEmployeeDeleteTarget(e.target.value)}
                        className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-red-500 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                        <option value="mongodb">Internal Only</option>
                        <option value="mssql">External Only</option>
                        <option value="both">Both Database Targets</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default EmployeeSettings;
