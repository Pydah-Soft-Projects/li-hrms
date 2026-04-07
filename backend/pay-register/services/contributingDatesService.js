'use strict';

const { isEarlyOutCountableSecondHalf } = require('./totalsCalculationService');

const KEYS = [
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

function createEmptyContributingDates() {
  const o = {};
  for (const k of KEYS) o[k] = [];
  return o;
}

function isBlankDayRecord(record) {
  return (
    record.status === 'blank' ||
    (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank')
  );
}

function isPresentOrPartialForLate(record) {
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

function cloneContributingDatesFromSummaryPlain(summary) {
  const empty = createEmptyContributingDates();
  if (!summary || !summary.contributingDates) return empty;
  const src = summary.contributingDates;
  for (const key of KEYS) {
    const arr = src[key];
    empty[key] = Array.isArray(arr) ? arr.map((e) => ({ ...e })) : [];
  }
  return empty;
}

/**
 * @param {import('mongoose').Document} payRegister
 * @param {Object|null} summary - MonthlyAttendanceSummary plain object or doc
 */
function applyContributingDatesFromMonthlySummary(payRegister, summary) {
  if (!payRegister || !summary) return;
  payRegister.contributingDates = cloneContributingDatesFromSummaryPlain(summary);
  payRegister.contributingDatesUpdatedAt = new Date();
  payRegister.contributingDatesDerivedFrom = 'monthly_summary';
  payRegister.markModified('contributingDates');
}

/**
 * Rebuild contributingDates from pay register daily grid (after manual edit or when no MAS).
 * Mirrors calculateTotals week_off/holiday gating: days with any WO/HOL only get WO/HOL + OT buckets.
 * @param {Array<Object>} dailyRecords
 * @returns {Object}
 */
function rebuildContributingDatesFromDailyRecords(dailyRecords) {
  const out = createEmptyContributingDates();
  if (!Array.isArray(dailyRecords)) return out;

  const oncePerDate = (bucket, date, value, label) => {
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
    const split = record.isSplit === true || (h1 && h2 && h1 !== h2);

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
      if (record.firstHalf && ['present', 'od'].includes(record.firstHalf.status)) p += per / 2;
      if (record.secondHalf && ['present', 'od'].includes(record.secondHalf.status)) p += per / 2;
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

    const lateOk = record.isLate && isPresentOrPartialForLate(record);
    const earlyOk = record.isEarlyOut && isEarlyOutCountableSecondHalf(record);
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

/**
 * @param {import('mongoose').Document} payRegister
 */
function applyContributingDatesFromDailyGrid(payRegister) {
  if (!payRegister) return;
  payRegister.contributingDates = rebuildContributingDatesFromDailyRecords(payRegister.dailyRecords || []);
  payRegister.contributingDatesUpdatedAt = new Date();
  payRegister.contributingDatesDerivedFrom = 'daily_grid';
  payRegister.markModified('contributingDates');
}

module.exports = {
  KEYS,
  createEmptyContributingDates,
  cloneContributingDatesFromSummaryPlain,
  rebuildContributingDatesFromDailyRecords,
  applyContributingDatesFromMonthlySummary,
  applyContributingDatesFromDailyGrid,
  isPresentOrPartialForLate,
};
