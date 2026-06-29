'use client';

import { AlertCircle, ArrowDown, CheckCircle2, Info } from 'lucide-react';
import {
  getApplyDateCheckBannerState,
  halfDayLabel,
  type ApprovedRecordsPayload,
} from '@/lib/leaveApplyApprovedRecords';
import { getHoursOdAttendanceSuggestion } from '@/lib/hoursOdAttendanceSuggestion';

type Props = {
  info: ApprovedRecordsPayload | null | undefined;
  applyType: 'leave' | 'od';
  isHalfDay: boolean;
  halfDayType: 'first_half' | 'second_half' | null;
  odType_extended?: 'full_day' | 'half_day' | 'hours' | null;
  odStartTime?: string;
  odEndTime?: string;
  className?: string;
  /** Apply recommended Half day + half selection in the parent form */
  onApplyHalfDaySuggestion?: (half: 'first_half' | 'second_half') => void;
  /** Scroll/focus the half-day controls in the apply form */
  onFocusHalfDayControls?: () => void;
  /** Fill hour-based OD window from a suggested gap */
  onApplyHoursOdSuggestion?: (start: string, end: string) => void;
};

const variantStyles = {
  error: {
    wrap: 'border-rose-200 bg-rose-50/95 dark:border-rose-900/50 dark:bg-rose-950/35',
    icon: 'text-rose-600 dark:text-rose-400',
    title: 'text-rose-900 dark:text-rose-100',
    body: 'text-rose-800/90 dark:text-rose-200/90',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
    action: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/25',
    actionOutline: 'border-rose-300 text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-950/50',
    highlight: 'bg-rose-200/80 text-rose-950 ring-1 ring-rose-300 dark:bg-rose-900/60 dark:text-rose-50 dark:ring-rose-700',
    Icon: AlertCircle,
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50/95 dark:border-amber-900/50 dark:bg-amber-950/35',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-900 dark:text-amber-100',
    body: 'text-amber-800/90 dark:text-amber-200/90',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    action: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/25',
    actionOutline: 'border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-950/50',
    highlight: 'bg-amber-200/80 text-amber-950 ring-1 ring-amber-300 dark:bg-amber-900/60 dark:text-amber-50 dark:ring-amber-700',
    Icon: AlertCircle,
  },
  info: {
    wrap: 'border-sky-200 bg-sky-50/95 dark:border-sky-900/50 dark:bg-sky-950/35',
    icon: 'text-sky-600 dark:text-sky-400',
    title: 'text-sky-900 dark:text-sky-100',
    body: 'text-sky-800/90 dark:text-sky-200/90',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    action: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-500/25',
    actionOutline: 'border-sky-300 text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-100 dark:hover:bg-sky-950/50',
    highlight: 'bg-sky-200/80 text-sky-950 ring-1 ring-sky-300 dark:bg-sky-900/60 dark:text-sky-50 dark:ring-sky-700',
    Icon: Info,
  },
  complete: {
    wrap: 'border-emerald-200 bg-emerald-50/95 dark:border-emerald-900/50 dark:bg-emerald-950/35',
    icon: 'text-emerald-600 dark:text-emerald-400',
    title: 'text-emerald-900 dark:text-emerald-100',
    body: 'text-emerald-800/90 dark:text-emerald-200/90',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    action: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    actionOutline: 'border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200',
    highlight: 'bg-emerald-200/80 text-emerald-950 ring-1 ring-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-50 dark:ring-emerald-700',
    Icon: CheckCircle2,
  },
} as const;

const HIGHLIGHT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bHalf day\b/gi, label: 'Half day' },
  { pattern: /\bFirst half\b/gi, label: 'First half' },
  { pattern: /\bSecond half\b/gi, label: 'Second half' },
  { pattern: /\bFull day\b/gi, label: 'Full day' },
];

function HighlightedGuidanceText({
  text,
  highlightClass,
}: {
  text: string;
  highlightClass: string;
}) {
  const parts: Array<{ type: 'text' | 'highlight'; value: string }> = [];
  let remaining = text;
  let guard = 0;
  while (remaining.length > 0 && guard < 50) {
    guard += 1;
    let earliest: { index: number; length: number; value: string } | null = null;
    for (const { pattern } of HIGHLIGHT_PATTERNS) {
      pattern.lastIndex = 0;
      const m = pattern.exec(remaining);
      if (m && m.index !== undefined && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, length: m[0].length, value: m[0] };
      }
    }
    if (!earliest) {
      parts.push({ type: 'text', value: remaining });
      break;
    }
    if (earliest.index > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, earliest.index) });
    }
    parts.push({ type: 'highlight', value: earliest.value });
    remaining = remaining.slice(earliest.index + earliest.length);
  }
  return (
    <p className="text-xs leading-relaxed">
      {parts.map((p, i) =>
        p.type === 'highlight' ? (
          <mark
            key={`${i}-${p.value}`}
            className={`mx-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-bold not-italic ${highlightClass}`}
          >
            {p.value}
          </mark>
        ) : (
          <span key={`${i}-t`}>{p.value}</span>
        )
      )}
    </p>
  );
}

export default function LeaveApplyDateCheckBanner({
  info,
  applyType,
  isHalfDay,
  halfDayType,
  odType_extended,
  odStartTime,
  odEndTime,
  className = '',
  onApplyHalfDaySuggestion,
  onFocusHalfDayControls,
  onApplyHoursOdSuggestion,
}: Props) {
  const state = getApplyDateCheckBannerState(info, {
    applyType,
    isHalfDay,
    halfDayType,
    odType_extended,
    odStartTime,
    odEndTime,
  });
  if (!state) return null;

  const hoursGapSuggestion =
    applyType === 'od' &&
    odType_extended === 'hours' &&
    odStartTime &&
    odEndTime
      ? getHoursOdAttendanceSuggestion(info?.attendanceInfo, odStartTime, odEndTime)
      : null;

  const s = variantStyles[state.variant];
  const Icon = s.Icon;
  const action = state.halfDayAction;
  const showHalfDayCta =
    !state.dateFullyCovered && action && !action.matchesRecommendation && onApplyHalfDaySuggestion;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${s.wrap} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${s.icon}`} aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <p className={`text-sm font-bold leading-snug ${s.title}`}>{state.headline}</p>
          <HighlightedGuidanceText text={state.body} highlightClass={s.highlight} />

          {state.dateFullyCovered && state.coverage && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`rounded-lg px-2.5 py-2 ${s.chip}`}>
                <p className="font-bold uppercase tracking-wide opacity-70">First half</p>
                <p className="mt-0.5 font-semibold capitalize">{state.coverage.first}</p>
              </div>
              <div className={`rounded-lg px-2.5 py-2 ${s.chip}`}>
                <p className="font-bold uppercase tracking-wide opacity-70">Second half</p>
                <p className="mt-0.5 font-semibold capitalize">{state.coverage.second}</p>
              </div>
            </div>
          )}

          {action && (
            <div
              className={`rounded-xl border p-3 space-y-2.5 ${s.chip} border-current/20 bg-white/50 dark:bg-slate-900/30`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">
                What to do in the form
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs font-medium">
                {(action.recommendEnableHalfDay || !action.currentIsHalfDay) && (
                  <li>
                    Enable the{' '}
                    <mark className={`rounded px-1 py-0.5 font-bold not-italic ${s.highlight}`}>
                      Half day
                    </mark>{' '}
                    checkbox below
                  </li>
                )}
                <li>
                  Select{' '}
                  <mark className={`rounded px-1 py-0.5 font-bold not-italic ${s.highlight}`}>
                    {halfDayLabel(action.recommendHalf)}
                  </mark>{' '}
                  in the half-day dropdown
                </li>
              </ol>

              {showHalfDayCta && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onApplyHalfDaySuggestion(action.recommendHalf)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold shadow-sm transition-colors ${s.action}`}
                  >
                    Use Half day → {halfDayLabel(action.recommendHalf)}
                  </button>
                  {onFocusHalfDayControls && (
                    <button
                      type="button"
                      onClick={onFocusHalfDayControls}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${s.actionOutline}`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      Jump to half-day fields
                    </button>
                  )}
                </div>
              )}

              {action.matchesRecommendation && (
                <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  Half day and {halfDayLabel(action.recommendHalf)} are already selected.
                </p>
              )}
            </div>
          )}

          {hoursGapSuggestion?.suggestWindow && onApplyHoursOdSuggestion && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  onApplyHoursOdSuggestion(
                    hoursGapSuggestion.suggestWindow!.odStartTime,
                    hoursGapSuggestion.suggestWindow!.odEndTime
                  )
                }
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold shadow-sm transition-colors ${s.action}`}
              >
                Use suggested gap: {hoursGapSuggestion.suggestWindow.label}
              </button>
            </div>
          )}

          <ul className="space-y-1.5">
            {state.attendanceLabel && (
              <li className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-md px-2 py-0.5 font-semibold uppercase tracking-wide ${s.chip}`}>
                  Attendance
                </span>
                <span className="text-slate-700 dark:text-slate-300">{state.attendanceLabel}</span>
              </li>
            )}
            {state.leaveLine && (
              <li className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-md px-2 py-0.5 font-semibold uppercase tracking-wide ${s.chip}`}>
                  Leave
                </span>
                <span className="text-slate-700 dark:text-slate-300">{state.leaveLine}</span>
              </li>
            )}
            {state.odLine && (
              <li className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-md px-2 py-0.5 font-semibold uppercase tracking-wide ${s.chip}`}>
                  OD
                </span>
                <span className="text-slate-700 dark:text-slate-300">{state.odLine}</span>
              </li>
            )}
          </ul>

          {state.showOppositeHalfNote && !action && (
            <p className="flex items-start gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Opposite half can be selected automatically in the form below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
