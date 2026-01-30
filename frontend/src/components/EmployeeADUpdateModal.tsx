'use client';

import { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, Download } from 'lucide-react';
import { api } from '@/lib/api';

interface EmployeeADUpdateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmployeeADUpdateModal({ onClose, onSuccess }: EmployeeADUpdateModalProps) {
  const [step, setStep] = useState<'download' | 'upload'>('download');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState<{ total: number; updated: number; failed: number; errors?: any[] } | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.downloadEmployeeADUpdateTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee_ad_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStep('upload');
      setError('');
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

      const res = await api.updateEmployeeADBulk(formData);

      if (res.success) {
        setSuccess(res.message || 'Update successful');
        setStats(res.data);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setError(res.message || 'Failed to update employee allowances/deductions');
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
      <div className="relative z-50 flex w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bulk A&amp;D Update</h2>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Employee Allowances &amp; Deductions</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {step === 'download' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800">
                <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-2">Step 1: Download Current A&amp;D Sheet</h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Download the Excel which includes all active employees and all existing Allowance/Deduction masters.
                  Deductions are shown as negative values.
                </p>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-700"
              >
                <Download className="h-4 w-4" />
                Download Template
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-indigo-50 p-4 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800">
                <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-2">Step 2: Upload Updated Sheet</h3>
                <ul className="list-disc list-inside text-xs text-indigo-700 dark:text-indigo-400 space-y-1">
                  <li>Keep the header names unchanged.</li>
                  <li>Blank a cell to remove that employee override for the component.</li>
                  <li>Deductions can be entered as negative or positive (we store as deduction).</li>
                </ul>
              </div>

              <div className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition-all ${file ? 'border-emerald-500 bg-emerald-50/30 dark:border-emerald-500/50 dark:bg-emerald-900/10' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-indigo-500/50 dark:hover:bg-slate-800'
                }`}>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-800">
                  <FileSpreadsheet className={`h-8 w-8 ${file ? 'text-emerald-500' : 'text-slate-400'}`} />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {file ? file.name : 'Drop the filled template here'}
                </p>
                {!file && <p className="text-xs text-slate-500 mt-1">Supports Excel (.xlsx) files</p>}
              </div>

              {stats && (
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">Process Summary</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <div className="text-xl font-bold text-slate-700 dark:text-slate-300">{stats.total}</div>
                      <div className="text-[10px] text-slate-500">Rows</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.updated}</div>
                      <div className="text-[10px] text-emerald-600/70">Success</div>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20">
                      <div className="text-xl font-bold text-rose-600 dark:text-rose-400">{stats.failed}</div>
                      <div className="text-[10px] text-rose-600/70">Failed</div>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className={`w-full rounded-2xl py-3 text-sm font-bold text-white shadow-lg transition-all ${!file ? 'bg-slate-300' : 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700'
                  }`}
              >
                {uploading ? 'Processing...' : 'Run A&D Update'}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              <span className="text-xs font-bold">✓</span>
              {success}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




