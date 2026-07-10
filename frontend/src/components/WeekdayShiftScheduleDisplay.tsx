'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  WEEKDAY_LABELS,
  type WeekdayShiftDay,
  type WeekdayShiftSchedule,
  hasConfiguredWeekdaySchedule,
  normalizeWeekdaySchedule,
  resolveWeekdayShiftScheduleFromFormData,
} from '@/lib/weekdayShiftSchedule';

type Shift = { _id: string; name: string; startTime?: string; endTime?: string };

type WeekdayShiftScheduleDisplayProps = {
  weekdayShiftSchedule?: WeekdayShiftSchedule | null;
  /** Employee/application record — resolves canonical + legacy dynamicFields. */
  source?: Record<string, unknown> | null;
  shifts?: Shift[];
  title?: string;
  emptyMessage?: string;
};

export default function WeekdayShiftScheduleDisplay({
  weekdayShiftSchedule,
  source,
  shifts: shiftsProp,
  title = 'Weekday Shift Schedule',
  emptyMessage = 'No weekday shift pattern configured.',
}: WeekdayShiftScheduleDisplayProps) {
  const [shifts, setShifts] = useState<Shift[]>(shiftsProp || []);

  useEffect(() => {
    if (shiftsProp && shiftsProp.length > 0) {
      setShifts(shiftsProp);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await api.getShifts(true);
        if (!cancelled && response.success && Array.isArray(response.data)) {
          setShifts(response.data);
        }
      } catch {
        // Display shift IDs if names cannot be loaded
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shiftsProp]);

  const resolvedSchedule = useMemo(() => {
    if (weekdayShiftSchedule?.schedule?.length) return weekdayShiftSchedule;
    if (source) return resolveWeekdayShiftScheduleFromFormData(source);
    return weekdayShiftSchedule ?? null;
  }, [weekdayShiftSchedule, source]);

  const schedule = useMemo(() => {
    const raw = resolvedSchedule?.schedule || [];
    return normalizeWeekdaySchedule(raw);
  }, [resolvedSchedule]);

  if (!hasConfiguredWeekdaySchedule(schedule)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h3>
        <p className="text-sm italic text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  const shiftNameById = new Map(shifts.map((s) => [String(s._id), s]));

  const labelForDay = (entry: WeekdayShiftDay) => {
    if (entry.isWeekOff) return 'Week Off';
    if (!entry.shiftId) return 'Not set';
    const shift = shiftNameById.get(String(entry.shiftId));
    if (!shift) return String(entry.shiftId);
    return shift.startTime && shift.endTime
      ? `${shift.name} (${shift.startTime}–${shift.endTime})`
      : shift.name;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="space-y-2">
        {schedule.map((entry) => (
          <div
            key={entry.weekday}
            className="grid grid-cols-[120px_1fr_auto] items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {WEEKDAY_LABELS[entry.weekday]}
            </span>
            <span className="text-sm text-slate-800 dark:text-slate-100">{labelForDay(entry)}</span>
            <span
              className={`w-20 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-medium ${
                entry.isWeekOff
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : entry.shiftId
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {entry.isWeekOff ? 'Week Off' : entry.shiftId ? 'Assigned' : 'Not set'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
