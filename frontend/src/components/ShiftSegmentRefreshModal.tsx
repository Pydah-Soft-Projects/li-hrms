'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { alertError, alertLoading, alertSuccess, closeAlert } from '@/lib/customSwal';
import { format } from 'date-fns';
import { XCircle, Layers } from 'lucide-react';

interface ShiftSegmentRefreshModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentStartDate: string;
  currentEndDate: string;
  divisionId?: string;
  departmentId?: string;
  designationId?: string;
  searchQuery?: string;
}

export function ShiftSegmentRefreshModal({
  open,
  onClose,
  onSuccess,
  currentStartDate,
  currentEndDate,
  divisionId,
  departmentId,
  designationId,
  searchQuery,
}: ShiftSegmentRefreshModalProps) {
  const [usePayPeriod, setUsePayPeriod] = useState(true);
  const [startDate, setStartDate] = useState(currentStartDate);
  const [endDate, setEndDate] = useState(currentEndDate);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsePayPeriod(true);
    setStartDate(currentStartDate);
    setEndDate(currentEndDate);
  }, [open, currentStartDate, currentEndDate]);

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      return alertError('Invalid date range', 'Please select both start and end dates.');
    }
    if (startDate > endDate) {
      return alertError('Invalid dates', 'Start date must be before or equal to end date.');
    }

    setSubmitting(true);
    alertLoading('Refreshing shift half-segments', 'This may take a few moments.');

    try {
      const response = await api.refreshAttendanceShiftSegments({
        startDate,
        endDate,
        divisionId,
        departmentId,
        designationId,
        search: searchQuery,
      });

      closeAlert();
      setSubmitting(false);

      if (!response || !response.success) {
        return alertError('Refresh failed', response?.message || 'Please try again later.');
      }

      const updated = response.data?.updated ?? 0;
      const processed = response.data?.processed ?? 0;

      alertSuccess(
        'Half-segments refreshed',
        `Processed ${processed} attendance record(s). Updated ${updated} row(s) with current shift definitions.`
      );
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      closeAlert();
      setSubmitting(false);
      console.error('Shift segment refresh failed:', error);
      alertError('Refresh failed', error instanceof Error ? error.message : 'Please try again later.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <Layers className="h-5 w-5" />
              Refresh shift half-segments
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Recompute first half / second half presence and payable totals from the current shift master for each
              attendance row in the range. Uses the same filters as the attendance list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={usePayPeriod}
              onChange={(e) => setUsePayPeriod(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Use current pay period dates
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={usePayPeriod}
                className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={usePayPeriod}
                className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4 text-sm text-slate-700 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-100">
            <div className="font-semibold">Current pay period</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {format(new Date(currentStartDate), 'dd MMM yyyy')} to {format(new Date(currentEndDate), 'dd MMM yyyy')}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div className="font-semibold">Applied attendance filters</div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Division: {divisionId || 'All'}, Department: {departmentId || 'All'}, Designation: {designationId || 'All'},
              Search: {searchQuery || 'None'}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center justify-center rounded-2xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={submitting}
          >
            {submitting ? 'Refreshing...' : 'Refresh segments'}
          </button>
        </div>
      </div>
    </div>
  );
}
