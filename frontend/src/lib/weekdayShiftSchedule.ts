export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type WeekdayShiftDay = {
  weekday: number;
  shiftId: string | null;
  isWeekOff: boolean;
};

export type WeekdayShiftSchedule = {
  schedule: WeekdayShiftDay[];
};

export function isLegacyWeekdayShiftFieldId(fieldId: string): boolean {
  const id = String(fieldId || '').toLowerCase();
  return id.includes('weekday') && id.includes('shift') && id !== 'weekdayshiftschedule';
}

function coerceScheduleArray(value: unknown): WeekdayShiftDay[] {
  if (Array.isArray(value)) return value as WeekdayShiftDay[];
  if (value && typeof value === 'object' && Array.isArray((value as { schedule?: unknown }).schedule)) {
    return (value as { schedule: WeekdayShiftDay[] }).schedule;
  }
  return [];
}

export function normalizeWeekdaySchedule(rawSchedule: WeekdayShiftDay[]): WeekdayShiftDay[] {
  return WEEKDAY_LABELS.map((_, dayIndex) => {
    const existing = rawSchedule.find((s) => Number(s.weekday) === dayIndex);
    return existing
      ? {
          weekday: dayIndex,
          shiftId: existing.shiftId ? String(existing.shiftId) : null,
          isWeekOff: !!existing.isWeekOff,
        }
      : { weekday: dayIndex, shiftId: null, isWeekOff: false };
  });
}

/** Read canonical weekdayShiftSchedule; fall back to legacy dynamicFields only for display during migration. */
export function resolveWeekdayShiftScheduleFromFormData(formData: Record<string, unknown>): WeekdayShiftSchedule | null {
  const canonical = coerceScheduleArray(formData?.weekdayShiftSchedule);
  if (canonical.length > 0) {
    return { schedule: normalizeWeekdaySchedule(canonical) };
  }

  const dynamicFields = (formData?.dynamicFields || {}) as Record<string, unknown>;
  for (const key of Object.keys(dynamicFields)) {
    if (!isLegacyWeekdayShiftFieldId(key)) continue;
    const legacy = coerceScheduleArray(dynamicFields[key]);
    if (legacy.length > 0) {
      return { schedule: normalizeWeekdaySchedule(legacy) };
    }
  }

  return null;
}

export function hasConfiguredWeekdaySchedule(schedule: WeekdayShiftDay[] | undefined): boolean {
  return Array.isArray(schedule) && schedule.some((day) => day.isWeekOff || day.shiftId);
}

/** Promote legacy dynamicFields pattern onto weekdayShiftSchedule for forms / view. */
export function promoteWeekdayShiftScheduleOnRecord<T extends Record<string, unknown>>(record: T): T {
  const resolved = resolveWeekdayShiftScheduleFromFormData(record);
  if (!resolved) return record;
  return { ...record, weekdayShiftSchedule: resolved };
}

export function shouldShowWeekdayShiftSection(
  formSettings: { weekdayShiftSchedule?: { isEnabled?: boolean } } | null | undefined,
  record: Record<string, unknown> | null | undefined
): boolean {
  if (formSettings?.weekdayShiftSchedule?.isEnabled) return true;
  const resolved = record ? resolveWeekdayShiftScheduleFromFormData(record) : null;
  return hasConfiguredWeekdaySchedule(resolved?.schedule);
}
