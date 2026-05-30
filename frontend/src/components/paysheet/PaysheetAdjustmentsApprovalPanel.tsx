'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, PaysheetAdjustmentRequest } from '@/lib/api';
import { toast } from 'react-toastify';
import { Check, X, Loader2, ClipboardList } from 'lucide-react';

function empLabel(req: PaysheetAdjustmentRequest) {
  const e = req.employeeId;
  if (!e || typeof e !== 'object') return '—';
  return e.employee_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.emp_no || '—';
}

type Props = {
  month: string;
  open: boolean;
  onClose: () => void;
  onReviewed: () => void;
};

export default function PaysheetAdjustmentsApprovalPanel({ month, open, onClose, onReviewed }: Props) {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<PaysheetAdjustmentRequest[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const res = await api.listPaysheetAdjustments({ month, status: 'pending' });
      setRequests(res?.data ?? []);
    } catch {
      setRequests([]);
      toast.error('Failed to load pending adjustments');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const review = async (id: string, approve: boolean) => {
    setActingId(id);
    try {
      if (approve) {
        await api.approvePaysheetAdjustment(id);
        toast.success('Adjustment approved');
      } else {
        await api.rejectPaysheetAdjustment(id);
        toast.info('Adjustment rejected');
      }
      await load();
      onReviewed();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      toast.error(msg);
    } finally {
      setActingId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[205] flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-violet-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Pending paysheet changes</h2>
              <p className="text-xs text-slate-500">{month}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">No pending requests for this month.</p>
          ) : (
            requests.map((req) => (
              <div
                key={req._id}
                className="rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-2"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{empLabel(req)}</span>
                  <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">Pending</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <strong>{req.columnHeader}</strong>: {req.originalValue.toLocaleString('en-IN')} →{' '}
                  {req.proposedValue.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-slate-500 italic">&quot;{req.reason}&quot;</p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={actingId === req._id}
                    onClick={() => review(req._id, true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {actingId === req._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={actingId === req._id}
                    onClick={() => review(req._id, false)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
