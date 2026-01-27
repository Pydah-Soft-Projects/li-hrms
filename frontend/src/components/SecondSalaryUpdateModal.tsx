'use client';

import { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { api } from '@/lib/api';

interface SecondSalaryUpdateModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export default function SecondSalaryUpdateModal({ onClose, onSuccess }: SecondSalaryUpdateModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [stats, setStats] = useState<{ total: number; updated: number; failed: number; errors?: any[] } | null>(null);

    const handleDownloadTemplate = async () => {
        try {
            await api.downloadSecondSalaryTemplate();
        } catch (err: any) {
            setError(err.message || 'Failed to download template');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError('');
            setStats(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Please select a file first');
            return;
        }

        setUploading(true);
        setError('');
        setStats(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.updateSecondSalaryBulk(formData);

            if (res.success) {
                setSuccess(res.message || 'Update successful');
                setStats(res.data);
                setTimeout(() => {
                    onSuccess();
                    // Don't close immediately so user can see stats
                }, 2000);
            } else {
                setError(res.message || 'Failed to update salaries');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during upload');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-50 flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                            <Upload className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Second Salary Update</h2>
                            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Bulk Operation</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-800"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Instructions & Template */}
                    <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-800">
                        <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Instructions</h3>
                        <ul className="list-disc list-inside text-xs text-blue-700 dark:text-blue-400 space-y-1 mb-4">
                            <li>Upload an Excel file (.xlsx) containing updated salary data.</li>
                            <li>Required Columns: <strong>Employee ID</strong>, <strong>Second Salary</strong>.</li>
                        </ul>
                        <button
                            onClick={handleDownloadTemplate}
                            className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                        >
                            <Download className="h-4 w-4" />
                            Download Template File
                        </button>
                    </div>

                    {/* File Upload Area */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Upload Excel File</label>
                        <div className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${file ? 'border-emerald-500 bg-emerald-50/30 dark:border-emerald-500/50 dark:bg-emerald-900/10' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-blue-500/50 dark:hover:bg-slate-800'
                            }`}>
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            />
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-800">
                                {file ? <FileSpreadsheet className="h-6 w-6 text-emerald-500" /> : <Upload className="h-6 w-6 text-slate-400" />}
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {file ? file.name : 'Click to browse or drag file here'}
                            </p>
                            {!file && <p className="text-xs text-slate-500">Supports .xlsx files</p>}
                        </div>
                    </div>

                    {/* Status Messages */}
                    {error && (
                        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            {success}
                        </div>
                    )}

                    {/* Stats */}
                    {stats && (
                        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                            <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">Update Summary</h4>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                                    <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{stats.total}</div>
                                    <div className="text-[10px] text-slate-500">Total</div>
                                </div>
                                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.updated}</div>
                                    <div className="text-[10px] text-emerald-600/70">Updated</div>
                                </div>
                                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                                    <div className="text-lg font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
                                    <div className="text-[10px] text-red-600/70">Failed</div>
                                </div>
                            </div>

                            {stats.errors && stats.errors.length > 0 && (
                                <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
                                    {stats.errors.map((err: any, i: number) => (
                                        <div key={i} className="text-[10px] text-red-500 border-b border-red-100 dark:border-red-900/30 py-1">
                                            Row {err.row?.empno || ''} {err.empNo}: {err.error}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="flex gap-4 p-6 pt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400"
                        disabled={uploading}
                    >
                        Close
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading ? 'Updating...' : 'Update Salaries'}
                    </button>
                </div>
            </div>
        </div>
    );
}
