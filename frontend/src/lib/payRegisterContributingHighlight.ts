/**
 * Pay register: monthly summary → day-cell highlights (mirror workspace attendance UX).
 */

export type PayRegisterContribKey =
  | 'present'
  | 'leaves'
  | 'ods'
  | 'partial'
  | 'weeklyOffs'
  | 'holidays'
  | 'payableShifts'
  | 'otHours'
  | 'extraHours'
  | 'lateIn'
  | 'earlyOut'
  | 'permissions'
  | 'absent'
  | 'conflicts';

type HalfStatus = string | null | undefined;

/** Minimal daily row — matches pay register + backend contributingDatesService shape. */
export type PayRegisterContribDailyRecord = {
  date: string;
  status?: HalfStatus;
  isSplit?: boolean;
  payableShifts?: number;
  otHours?: number;
  isLate?: boolean;
  isEarlyOut?: boolean;
  leaveNature?: string | null;
  firstHalf?: {
    status?: HalfStatus;
    leaveNature?: string | null;
    otHours?: number;
  };
  secondHalf?: {
    status?: HalfStatus;
    leaveNature?: string | null;
    otHours?: number;
  };
};

function isBlankDayRecord(record: PayRegisterContribDailyRecord): boolean {
  return (
    record.status === 'blank' ||
    (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank')
  );
}

function isPresentOrPartialForLate(record: PayRegisterContribDailyRecord): boolean {
  return (
    record.status === 'present' ||
    record.status === 'partial' ||
    record.status === 'od' ||
    record.firstHalf?.status === 'present' ||
    record.secondHalf?.status === 'present' ||
    record.firstHalf?.status === 'od' ||
    record.secondHalf?.status === 'od'
  );
}

/** Same rules as backend totalsCalculationService.isEarlyOutCountableSecondHalf */
function isEarlyOutCountableSecondHalf(record: PayRegisterContribDailyRecord): boolean {
  const h2 = record.secondHalf && record.secondHalf.status;
  if (h2 === 'present' || h2 === 'od') return true;

  const h1 = record.firstHalf && record.firstHalf.status;
  const looksSplit = record.isSplit === true || !!(h1 && h2 && h1 !== h2);
  if (looksSplit) return false;

  const full = record.status || h1 || h2;
  return full === 'present' || full === 'od' || full === 'partial';
}

/**
 * Port of backend contributingDatesService.rebuildContributingDatesFromDailyRecords.
 * Used when API `contributingDates` is missing so day highlights still match the grid.
 */
export function rebuildContributingDatesFromDailyRecords(
  dailyRecords: PayRegisterContribDailyRecord[] | undefined | null
): Partial<Record<PayRegisterContribKey, Array<{ date: string; value: number; label: string }>>> {
  const KEYS_ALL: PayRegisterContribKey[] = [
    'present',
    'leaves',
    'ods',
    'partial',
    'weeklyOffs',
    'holidays',
    'payableShifts',
    'otHours',
    'extraHours',
    'lateIn',
    'earlyOut',
    'permissions',
    'absent',
    'conflicts',
  ];
  const out = {} as Record<PayRegisterContribKey, Array<{ date: string; value: number; label: string }>>;
  for (const k of KEYS_ALL) out[k] = [];

  if (!Array.isArray(dailyRecords)) return out;

  const oncePerDate = (bucket: PayRegisterContribKey, date: string, value: number, label: string) => {
    if (value <= 0 || !date) return;
    if (out[bucket].some((e) => e.date === date)) return;
    out[bucket].push({
      date,
      value: Math.round(value * 100) / 100,
      label: label || '',
    });
  };

  for (const record of dailyRecords) {
    const date = record.date;
    if (!date || isBlankDayRecord(record)) continue;

    const isHoliday =
      record.status === 'holiday' ||
      record.firstHalf?.status === 'holiday' ||
      record.secondHalf?.status === 'holiday';
    const isWeekOff =
      record.status === 'week_off' ||
      record.firstHalf?.status === 'week_off' ||
      record.secondHalf?.status === 'week_off';

    const h1 = record.firstHalf?.status;
    const h2 = record.secondHalf?.status;
    const split = record.isSplit === true || !!(h1 && h2 && h1 !== h2);

    let woVal = 0;
    let holVal = 0;
    if (split) {
      if (h1 === 'week_off') woVal += 0.5;
      if (h2 === 'week_off') woVal += 0.5;
      if (h1 === 'holiday') holVal += 0.5;
      if (h2 === 'holiday') holVal += 0.5;
    } else {
      if (record.status === 'week_off' || h1 === 'week_off') woVal = 1;
      if (record.status === 'holiday' || h1 === 'holiday') holVal = 1;
    }
    if (woVal > 0) oncePerDate('weeklyOffs', date, woVal, 'WO');
    if (holVal > 0) oncePerDate('holidays', date, holVal, 'HOL');

    if (isHoliday || isWeekOff) {
      const ot = Number(record.otHours) || 0;
      if (ot > 0) oncePerDate('otHours', date, ot, 'OT');
      continue;
    }

    const per = (() => {
      const u = Number(record.payableShifts);
      return Number.isFinite(u) && u > 0 ? u : 1;
    })();

    let leaveVal = 0;
    let odVal = 0;
    let presentVal = 0;
    let absentVal = 0;

    if (!split) {
      const s = record.status || h1 || h2;
      if (s === 'leave') leaveVal = 1;
      else if (s === 'od') odVal = 1;
      else if (s === 'present') presentVal = 1;
      else if (s === 'partial') {
        presentVal = 0.5;
        leaveVal = 0.5;
      } else if (s === 'absent') absentVal = 1;
    } else {
      for (const st of [h1, h2]) {
        if (!st) continue;
        if (st === 'leave') leaveVal += 0.5;
        else if (st === 'od') odVal += 0.5;
        else if (st === 'present') presentVal += 0.5;
        else if (st === 'absent') absentVal += 0.5;
      }
    }

    if (leaveVal > 0) {
      const nature =
        record.leaveNature ||
        record.firstHalf?.leaveNature ||
        record.secondHalf?.leaveNature ||
        'paid';
      oncePerDate('leaves', date, Math.min(1, leaveVal), `Leave (${nature})`);
    }
    if (odVal > 0) oncePerDate('ods', date, Math.min(1, odVal), 'OD');
    if (presentVal > 0) oncePerDate('present', date, Math.min(1, presentVal), 'P');

    const pay = (() => {
      let p = 0;
      if (record.firstHalf && ['present', 'od'].includes(String(record.firstHalf.status))) p += per / 2;
      if (record.secondHalf && ['present', 'od'].includes(String(record.secondHalf.status))) p += per / 2;
      return Math.round(p * 100) / 100;
    })();
    if (pay > 0) oncePerDate('payableShifts', date, Math.min(1, pay), 'Pay');

    if (split && pay > 0 && pay < 1) {
      oncePerDate('partial', date, pay, `PT (${pay})`);
    } else if (record.status === 'partial' && pay > 0) {
      oncePerDate('partial', date, Math.min(1, pay), `PT (${pay})`);
    }

    if (absentVal > 0) oncePerDate('absent', date, Math.min(1, absentVal), '');

    const ot = Number(record.otHours) || 0;
    if (ot > 0) oncePerDate('otHours', date, ot, 'OT');

    const lateOk = !!record.isLate && isPresentOrPartialForLate(record);
    const earlyOk = !!record.isEarlyOut && isEarlyOutCountableSecondHalf(record);
    if (lateOk || earlyOk) {
      let v = 0;
      if (lateOk) v++;
      if (earlyOk) v++;
      const label = v === 2 ? 'L+E' : lateOk ? 'Late' : 'Early';
      oncePerDate('lateIn', date, v, label);
      oncePerDate('earlyOut', date, v, label);
    }
  }

  return out;
}

export function buildPayRegisterContribDateMap(
  contributingDates:
    | Partial<
        Record<
          PayRegisterContribKey,
          Array<string | { date: string; value?: number; label?: string }>
        >
      >
    | undefined,
  keys: readonly PayRegisterContribKey[]
): Map<string, { value: number; label: string }> {
  const map = new Map<string, { value: number; label: string }>();
  if (!contributingDates || !keys.length) return map;
  for (const k of keys) {
    const items = contributingDates[k];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const date = typeof item === 'string' ? item : item?.date;
      if (!date) continue;
      const value =
        typeof item === 'object' &&
        item &&
        'value' in item &&
        item.value != null &&
        Number.isFinite(Number(item.value))
          ? Number(item.value)
          : 1;
      const label = typeof item === 'object' && item && 'label' in item ? String(item.label ?? '') : '';
      if (!map.has(date)) map.set(date, { value, label });
    }
  }
  return map;
}

export function resolvePayRegisterContribMap(
  pr:
    | {
        contributingDates?: Partial<
          Record<PayRegisterContribKey, Array<string | { date: string; value?: number; label?: string }>>
        >;
        dailyRecords?: PayRegisterContribDailyRecord[] | null;
      }
    | null
    | undefined,
  keys: readonly PayRegisterContribKey[]
): { map: Map<string, { value: number; label: string }>; usedDailyGridFallback: boolean } {
  const fromApi = buildPayRegisterContribDateMap(pr?.contributingDates, keys);
  if (fromApi.size > 0) {
    return { map: fromApi, usedDailyGridFallback: false };
  }
  const daily = pr?.dailyRecords ?? [];
  const rebuilt = rebuildContributingDatesFromDailyRecords(daily);
  return {
    map: buildPayRegisterContribDateMap(rebuilt, keys),
    usedDailyGridFallback: daily.length > 0,
  };
}

export function payRegisterContribSelectionActive(
  active: { prId: string; keys: readonly PayRegisterContribKey[]; title: string } | null,
  prId: string,
  keys: readonly PayRegisterContribKey[],
  title: string
): boolean {
  if (!active || active.prId !== prId || active.title !== title) return false;
  if (active.keys.length !== keys.length) return false;
  return keys.every((k, i) => k === active.keys[i]);
}

/** Category string for `highlightBadgeSubtitle` (attendance helper). */
export function payRegisterBadgeCategory(keys: readonly PayRegisterContribKey[]): string {
  if (keys.some((k) => k === 'lateIn' || k === 'earlyOut')) return 'lateIn';
  if (keys.includes('payableShifts')) return 'payableShifts';
  if (keys.includes('partial')) return 'partial';
  const k0 = keys[0];
  if (k0 === 'ods') return 'ods';
  if (k0 === 'weeklyOffs') return 'weeklyOffs';
  if (k0 === 'holidays') return 'holidays';
  if (k0 === 'otHours') return 'otHours';
  if (k0 === 'extraHours') return 'extraHours';
  if (k0 === 'absent') return 'absent';
  return k0 ?? 'present';
}

export function payRegisterContribAccent(keys: readonly PayRegisterContribKey[]): {
  /** Full grid cell highlight (ring + bg). */
  cellHighlight: string;
  badgeBg: string;
  /** Footer / summary total cell when this breakdown is selected. */
  summaryRing: string;
} {
  const lateEarly = keys.some((k) => k === 'lateIn' || k === 'earlyOut');
  if (lateEarly) {
    return {
      cellHighlight:
        'ring-2 ring-rose-400/80 ring-inset z-[2] shadow-[0_0_18px_rgba(244,63,94,0.28)] dark:ring-rose-400/55 rounded-md !bg-rose-50/95 dark:!bg-rose-950/45',
      badgeBg: 'bg-rose-600/95',
      summaryRing: 'ring-2 ring-rose-500 ring-inset shadow-inner dark:ring-rose-400',
    };
  }
  return {
    cellHighlight:
      'ring-2 ring-blue-400/70 ring-inset z-[2] shadow-[0_0_20px_rgba(59,130,246,0.22)] dark:ring-blue-400/50 rounded-md !bg-blue-50/90 dark:!bg-blue-900/55',
    badgeBg: 'bg-blue-600/95',
    summaryRing: 'ring-2 ring-blue-500 ring-inset shadow-inner dark:ring-blue-400',
  };
}

export function formatPayRegisterContribDateLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
}
