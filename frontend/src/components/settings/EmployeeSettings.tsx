'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Database, Trash2, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';

const EmployeeSettings = () => {
    const [employeeDataSource, setEmployeeDataSource] = useState<string>('mongodb');
    const [employeeDeleteTarget, setEmployeeDeleteTarget] = useState<string>('both');
    const [autoGenerateEmployeeNumber, setAutoGenerateEmployeeNumber] = useState(false);
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
                setAutoGenerateEmployeeNumber(!!res.data.auto_generate_employee_number);
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
                auto_generate_employee_number: autoGenerateEmployeeNumber,
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

    if (loading) return <SettingsSkeleton />;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    <span>Settings</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-indigo-600">Employee</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Employee Setup</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure data sources and deletion policies for employee records.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className="xl:col-span-2 space-y-8">
                    <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Storage Configuration</h3>
                            <div className="flex items-center gap-2">
                                {mssqlConnected ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 uppercase tracking-tight">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        MSSQL Link Active
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-400 border border-gray-100 uppercase tracking-tight">
                                        <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                                        Local Storage Only
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    Primary Data Source <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={employeeDataSource}
                                    onChange={(e) => setEmployeeDataSource(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all appearance-none"
                                >
                                    <option value="mongodb">Internal (MongoDB)</option>
                                    <option value="mssql">External (MSSQL Server)</option>
                                    <option value="both">Both (Hybrid)</option>
                                </select>
                                <p className="text-[10px] text-gray-400">Determines where employee data is primarily fetched from.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    Deletion Policy <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={employeeDeleteTarget}
                                    onChange={(e) => setEmployeeDeleteTarget(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all appearance-none"
                                >
                                    <option value="mongodb">Internal Only</option>
                                    <option value="mssql">External Only</option>
                                    <option value="both">Both Database Targets</option>
                                </select>
                                <p className="text-[10px] text-gray-400">Determines which systems are affected when an employee is deleted.</p>
                            </div>

                            <div className="md:col-span-2 flex items-start gap-4 pt-2">
                                <div className="flex h-10 items-center">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={autoGenerateEmployeeNumber}
                                        onClick={() => setAutoGenerateEmployeeNumber((v) => !v)}
                                        className={`${autoGenerateEmployeeNumber ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-0 transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                                    >
                                        <span className={`${autoGenerateEmployeeNumber ? 'translate-x-5' : 'translate-x-1'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                                    </button>
                                </div>
                                <div className="space-y-0.5">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Auto generate employee number</label>
                                    <p className="text-[10px] text-gray-400">When ON, new employees (and bulk upload rows without a number) get the next number automatically. When OFF, employee number is required.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl p-6 flex items-start gap-4">
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">Critical: Deletion Policy</h4>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                                Setting the deletion policy to &quot;Both&quot; will permanently remove records from both MongoDB and the connected MSSQL server. This action cannot be undone.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-500/20">
                        <h3 className="text-lg font-bold mb-2">Sync Status</h3>
                        <p className="text-xs opacity-80 leading-relaxed mb-6">
                            Configure how the system handles employee records across multiple data sources.
                        </p>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full py-3 bg-white text-indigo-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Settings Now'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeeSettings;
