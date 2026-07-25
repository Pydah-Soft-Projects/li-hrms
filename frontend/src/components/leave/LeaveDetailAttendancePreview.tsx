'use client';

import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import {
  formatPreviewDate,
  type LeaveAttendancePreview,
  type LeaveAttendancePreviewDay,
} from '@/lib/leaveDetailAttendancePreview';

type Props = {
  preview: LeaveAttendancePreview | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
};

function occupancyStyles(occupancy: LeaveAttendancePreviewDay['occupancy']) {
  if (occupancy === 'occupied') {
    return {
      row: 'border-rose-200 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/30',
      badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
      label: 'Attended',
    };
  }
  if (occupancy === 'partial') {
    return {
      row: 'border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30',
      badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
      label: 'Partial',
    };
  }
  return {
    row: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/25',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    label: 'Free',
  };
}

export default function LeaveDetailAttendancePreview({
  preview,
  loading = false,
  error = null,
  className = '',
}: Props) {
  if (loading) {
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 ${className}`}
      >
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking attendance on leave dates…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100 ${className}`}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Could not load attendance preview: {error}</p>
        </div>
      </div>
    );
  }

  if (!preview || !preview.days?.length) return null;

  const blocked = Boolean(preview.approveBlocked || preview.allOccupied);
  const warn = !blocked && preview.someOccupied;
  const BannerIcon = blocked ? AlertCircle : warn ? Info : CheckCircle2;
  const bannerWrap = blocked
    ? 'border-rose-200 bg-rose-50/95 dark:border-rose-900/50 dark:bg-rose-950/35'
    : warn
      ? 'border-amber-200 bg-amber-50/95 dark:border-amber-900/50 dark:bg-amber-950/35'
      : 'border-emerald-200 bg-emerald-50/95 dark:border-emerald-900/50 dark:bg-emerald-950/35';
  const bannerTitle = blocked
    ? 'text-rose-900 dark:text-rose-100'
    : warn
      ? 'text-amber-900 dark:text-amber-100'
      : 'text-emerald-900 dark:text-emerald-100';
  const bannerBody = blocked
    ? 'text-rose-800/90 dark:text-rose-200/90'
    : warn
      ? 'text-amber-800/90 dark:text-amber-200/90'
      : 'text-emerald-800/90 dark:text-emerald-200/90';
  const iconClass = blocked
    ? 'text-rose-600 dark:text-rose-400'
    : warn
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className={`space-y-3 ${className}`}>
      <div className={`rounded-xl border px-4 py-3 ${bannerWrap}`}>
        <div className="flex items-start gap-2.5">
          <BannerIcon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
          <div className="min-w-0 space-y-1">
            <p className={`text-sm font-semibold ${bannerTitle}`}>
              {blocked
                ? 'Approve disabled — all leave days already have attendance'
                : warn
                  ? 'Some leave days already have attendance'
                  : 'Leave dates are free of attendance'}
            </p>
            <p className={`text-xs leading-relaxed ${bannerBody}`}>{preview.summary}</p>
            <p className={`text-[11px] font-medium ${bannerBody}`}>
              {preview.occupiedDays} attended · {preview.partialDays} partial · {preview.freeDays}{' '}
              free · {preview.totalDays} total
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
        {preview.days.map((day) => {
          const style = occupancyStyles(day.occupancy);
          const punch =
            day.attendance?.punchInTime || day.attendance?.punchOutTime
              ? `${day.attendance.punchInTime || '—'} → ${day.attendance.punchOutTime || '—'}`
              : null;
          return (
            <div
              key={day.date}
              className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${style.row}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {formatPreviewDate(day.date)}
                  </span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                    {style.label}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {day.leaveLabel}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                  {day.note}
                  {punch ? ` · Punches ${punch}` : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
