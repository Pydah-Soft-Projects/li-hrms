'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

export type PaysheetEditContext = {
  payrollRecordId: string;
  columnHeader: string;
  fieldPath: string;
  currentValue: number;
  employeeLabel?: string;
};

type Props = {
  open: boolean;
  context: PaysheetEditContext | null;
  onClose: () => void;
  onSubmit: (proposedValue: number, reason: string) => Promise<void>;
};

export default function PaysheetAdjustmentEditModal({
  open,
  context,
  onClose,
  onSubmit,
}: Props) {
  const [proposedValue, setProposedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && context) {
      setProposedValue(String(context.currentValue));
      setReason('');
    }
  }, [open, context]);

  if (!open || !context) return null;

  const maxVal = context.currentValue;
  const parsed = Number(proposedValue);
  const valid =
    reason.trim().length > 0 &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= maxVal + 0.001;

  const handleSubmit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await onSubmit(parsed, reason.trim());
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to submit request';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Request paysheet change</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {context.columnHeader}
              {context.employeeLabel ? ` · ${context.employeeLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Calculated amount: </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {maxVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              New amount (0 to {maxVal.toLocaleString('en-IN')})
            </label>
            <input
              type="number"
              min={0}
              max={maxVal}
              step="0.01"
              value={proposedValue}
              onChange={(e) => setProposedValue(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Reason (required)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Emergency — reduce EMI for this month"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm resize-none"
            />
          </div>
          <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 rounded-lg px-3 py-2">
            This creates a pending request. A superadmin must approve before the paysheet and payroll record are
            updated. Pending cells are highlighted in purple; approved changes in orange.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit request
          </button>
        </div>
      </div>
    </div>
  );
}
