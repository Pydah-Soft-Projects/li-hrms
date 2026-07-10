/**
 * Normalize weekday shift pattern to the canonical employee.weekdayShiftSchedule shape.
 * Legacy data may live in dynamicFields (e.g. weekday_shift_pattern).
 */

'use strict';

const LEGACY_DYNAMIC_KEYS = ['weekday_shift_pattern', 'weekdayShiftPattern', 'weekday_shift_schedule'];

function isLegacyWeekdayShiftKey(key) {
  const k = String(key || '').toLowerCase();
  return k.includes('weekday') && k.includes('shift');
}

function coerceScheduleArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.schedule)) return value.schedule;
  return [];
}

function normalizeScheduleEntries(rawSchedule) {
  const schedule = coerceScheduleArray(rawSchedule);
  if (schedule.length === 0) return null;

  const byWeekday = new Map();
  for (const entry of schedule) {
    const wd = Number(entry?.weekday);
    if (Number.isNaN(wd) || wd < 0 || wd > 6) continue;
    byWeekday.set(wd, {
      weekday: wd,
      shiftId: entry.shiftId || null,
      isWeekOff: !!entry.isWeekOff,
    });
  }

  if (byWeekday.size === 0) return null;

  return {
    schedule: [...byWeekday.values()].sort((a, b) => a.weekday - b.weekday),
  };
}

/**
 * Resolve canonical weekdayShiftSchedule from a document or form payload.
 */
function resolveWeekdayShiftSchedule(source = {}) {
  const top = normalizeScheduleEntries(source.weekdayShiftSchedule);
  if (top) return top;

  const dynamicFields = source.dynamicFields || {};
  for (const key of LEGACY_DYNAMIC_KEYS) {
    const normalized = normalizeScheduleEntries(dynamicFields[key]);
    if (normalized) return normalized;
  }

  for (const key of Object.keys(dynamicFields)) {
    if (!isLegacyWeekdayShiftKey(key)) continue;
    const normalized = normalizeScheduleEntries(dynamicFields[key]);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Strip legacy weekday keys from dynamicFields after promoting to weekdayShiftSchedule.
 */
function stripLegacyWeekdayFromDynamicFields(dynamicFields = {}) {
  if (!dynamicFields || typeof dynamicFields !== 'object') return {};

  const next = { ...dynamicFields };
  for (const key of Object.keys(next)) {
    if (LEGACY_DYNAMIC_KEYS.includes(key) || isLegacyWeekdayShiftKey(key)) {
      delete next[key];
    }
  }
  return next;
}

/**
 * Promote weekday pattern into permanentFields and remove legacy dynamic keys.
 */
function applyWeekdayShiftScheduleToPayload(permanentFields = {}, dynamicFields = {}, rawFormData = {}) {
  const resolved =
    resolveWeekdayShiftSchedule({
      weekdayShiftSchedule: permanentFields.weekdayShiftSchedule ?? rawFormData.weekdayShiftSchedule,
      dynamicFields: {
        ...(dynamicFields || {}),
        ...(rawFormData.dynamicFields || {}),
      },
    }) ||
    resolveWeekdayShiftSchedule(rawFormData);

  let nextPermanent = { ...permanentFields };
  let nextDynamic = stripLegacyWeekdayFromDynamicFields(dynamicFields);

  if (resolved) {
    nextPermanent.weekdayShiftSchedule = resolved;
  } else {
    delete nextPermanent.weekdayShiftSchedule;
  }

  return { permanentFields: nextPermanent, dynamicFields: nextDynamic };
}

function hasConfiguredWeekdaySchedule(weekdayShiftSchedule) {
  const schedule = weekdayShiftSchedule?.schedule;
  return Array.isArray(schedule) && schedule.some((s) => s?.isWeekOff || s?.shiftId);
}

module.exports = {
  LEGACY_DYNAMIC_KEYS,
  normalizeScheduleEntries,
  resolveWeekdayShiftSchedule,
  stripLegacyWeekdayFromDynamicFields,
  applyWeekdayShiftScheduleToPayload,
  hasConfiguredWeekdaySchedule,
};
