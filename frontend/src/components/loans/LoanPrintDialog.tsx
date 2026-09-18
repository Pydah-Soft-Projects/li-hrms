'use client';

import React from 'react';
import { FileText, FileSpreadsheet, X, Printer, CheckCircle2 } from 'lucide-react';

interface LoanPrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (format: 'simple' | 'detailed') => void;
  isPrinting?: boolean;
}

export default function LoanPrintDialog({
  isOpen,
  onClose,
  onConfirm,
  isPrinting = false,
}: LoanPrintDialogProps) {
  const [selectedFormat, setSelectedFormat] = React.useState<'simple' | 'detailed'>('simple');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Print Loan Application
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose your preferred print layout format
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPrinting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options */}
        <div className="my-5 space-y-3">
          {/* Simple Format (A5) */}
          <div
            onClick={() => setSelectedFormat('simple')}
            className={`relative flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all ${
              selectedFormat === 'simple'
                ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30 ring-1 ring-blue-600/20'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40'
            }`}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Simple View (A5 Format)
                </span>
                {selectedFormat === 'simple' && (
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Compact A5 slip with basic employee details, loan terms, official sanction summary, and <strong>all existing borrower loans</strong>.
              </p>
            </div>
          </div>

          {/* Detailed Format (A4) */}
          <div
            onClick={() => setSelectedFormat('detailed')}
            className={`relative flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all ${
              selectedFormat === 'detailed'
                ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30 ring-1 ring-blue-600/20'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40'
            }`}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              <FileSpreadsheet className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Detailed View (A4 Format)
                </span>
                {selectedFormat === 'detailed' && (
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Full multi-page A4 application form with attendance summary, surety details, RTGS transfer slip, and ledger history.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isPrinting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedFormat)}
            disabled={isPrinting}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-xs transition-all disabled:opacity-50"
          >
            {isPrinting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating PDF...
              </>
            ) : (
              <>
                <Printer className="h-3.5 w-3.5" />
                Generate & Print
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
