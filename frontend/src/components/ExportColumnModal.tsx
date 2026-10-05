'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckSquare, Square, RotateCcw, Download, FileSpreadsheet, FileText, Search, Check } from 'lucide-react';

export interface ColumnOption {
  key: string;
  label: string;
  defaultChecked?: boolean;
  isNecessary?: boolean;
  getValue?: (row: any, index?: number) => any;
}

interface ExportColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  reportName?: string;
  exportFormat?: 'excel' | 'pdf' | 'both';
  columns: ColumnOption[];
  onConfirmExport: (selectedKeys: string[], format: 'excel' | 'pdf') => Promise<void> | void;
  loading?: boolean;
}

export default function ExportColumnModal({
  isOpen,
  onClose,
  title,
  reportName = 'Report',
  exportFormat = 'both',
  columns,
  onConfirmExport,
  loading = false,
}: ExportColumnModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<'excel' | 'pdf'>(
    exportFormat === 'pdf' ? 'pdf' : 'excel'
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync format when prop changes
  useEffect(() => {
    if (exportFormat === 'pdf') setSelectedFormat('pdf');
    else if (exportFormat === 'excel') setSelectedFormat('excel');
  }, [exportFormat]);

  // Reset selected columns to defaults ONLY when modal opens
  useEffect(() => {
    if (isOpen && columns.length > 0) {
      const defaultChecked = columns
        .filter((col) => col.defaultChecked !== false)
        .map((col) => col.key);
      setSelectedKeys(defaultChecked);
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns;
    const q = searchQuery.toLowerCase();
    return columns.filter(
      (col) => col.label.toLowerCase().includes(q) || col.key.toLowerCase().includes(q)
    );
  }, [columns, searchQuery]);

  if (!isOpen) return null;

  const toggleColumn = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    const allKeys = columns.map((col) => col.key);
    setSelectedKeys(allKeys);
  };

  const handleDeselectAll = () => {
    setSelectedKeys([]);
  };

  const handleResetDefault = () => {
    const defaultChecked = columns
      .filter((col) => col.defaultChecked !== false)
      .map((col) => col.key);
    setSelectedKeys(defaultChecked);
  };

  const handleDownload = () => {
    if (selectedKeys.length === 0) return;
    onConfirmExport(selectedKeys, selectedFormat);
  };

  const selectedCount = selectedKeys.length;
  const totalCount = columns.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                {selectedFormat === 'excel' ? (
                  <FileSpreadsheet className="w-5 h-5" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {title || `Export ${reportName}`}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select the necessary columns to include in your export
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector if 'both' */}
        {exportFormat === 'both' && (
          <div className="px-6 pt-4 pb-2 bg-slate-50/30 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800/50">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 block">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedFormat('excel')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedFormat === 'excel'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setSelectedFormat('pdf')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedFormat === 'pdf'
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                PDF Document (.pdf)
              </button>
            </div>
          </div>
        )}

        {/* Controls Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 font-medium transition-colors"
            >
              Select All
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
            >
              Deselect All
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              onClick={handleResetDefault}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
              title="Reset to default necessary columns"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>

        {/* Column List */}
        <div className="p-6 overflow-y-auto flex-1 min-h-[220px] max-h-[360px] custom-scrollbar">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Select Columns ({selectedCount} of {totalCount} selected)
            </span>
            {selectedCount === 0 && (
              <span className="text-xs text-rose-500 font-medium">
                Please select at least one column
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredColumns.map((col) => {
              const isChecked = selectedKeys.includes(col.key);
              return (
                <label
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900/60 shadow-2xs'
                      : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-850/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                        isChecked
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`text-xs font-medium truncate ${
                        isChecked
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {col.label}
                    </span>
                  </div>

                  {col.isNecessary !== false && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-100/60 dark:bg-indigo-950/80 rounded-md shrink-0">
                      Default
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {filteredColumns.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-xs">
              No columns match "{searchQuery}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedCount} {selectedCount === 1 ? 'column' : 'columns'} ready to export
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading || selectedCount === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download {selectedFormat.toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
