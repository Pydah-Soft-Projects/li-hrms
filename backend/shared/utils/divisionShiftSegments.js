const { isCustomEmployeeGroupingEnabled } = require('./customEmployeeGrouping');
const {
  toIdString,
  hasUsableShiftSegments,
  mergeShiftSegments,
  applyShiftSegmentOverride,
} = require('./shiftSegmentOverrides');

function normalizeGender(value) {
  const v = String(value || '').trim();
  return v || 'All';
}

const divisionShiftsCache = new Map();
const DIVISION_SHIFTS_CACHE_MS = 30 * 1000;

function pickDivisionShiftConfigSync({
  division,
  shiftId,
  employeeGender = null,
  employeeGroupId = null,
  groupingEnabled = false,
}) {
  if (!division || !Array.isArray(division.shifts) || !shiftId) return null;

  const targetShiftId = toIdString(shiftId);
  const gender = normalizeGender(employeeGender);
  const empGroup = toIdString(employeeGroupId);

  const rows = division.shifts.filter((r) => toIdString(r?.shiftId) === targetShiftId);
  if (!rows.length) return null;

  let pool = rows;
  if (groupingEnabled && empGroup) {
    const groupMatched = rows.filter((r) => toIdString(r?.employee_group_id) === empGroup);
    if (groupMatched.length) pool = groupMatched;
  } else if (groupingEnabled) {
    const noGroup = rows.filter((r) => !toIdString(r?.employee_group_id));
    if (noGroup.length) pool = noGroup;
  }

  const exactGender = pool.filter((r) => normalizeGender(r?.gender) !== 'All' && normalizeGender(r?.gender).toLowerCase() === gender.toLowerCase());
  if (exactGender.length) return exactGender[0];

  const allGender = pool.filter((r) => normalizeGender(r?.gender) === 'All');
  if (allGender.length) return allGender[0];

  return pool[0] || rows[0] || null;
}

/**
 * Pick the best matching Division.shifts[] config row for a given shiftId.
 * Prefers strict employee_group match (when enabled), then exact gender match, then gender All.
 *
 * Note: If multiple rows exist for the same shiftId, this method ensures we select a single one.
 */
async function pickDivisionShiftConfig({
  division,
  shiftId,
  employeeGender = null,
  employeeGroupId = null,
  groupingEnabled,
}) {
  if (!division || !Array.isArray(division.shifts) || !shiftId) return null;

  const grouping = groupingEnabled !== undefined
    ? Boolean(groupingEnabled)
    : await isCustomEmployeeGroupingEnabled();

  return pickDivisionShiftConfigSync({
    division,
    shiftId,
    employeeGender,
    employeeGroupId,
    groupingEnabled: grouping,
  });
}

function hasAnyDivisionSegments(row) {
  return hasUsableShiftSegments(row);
}

/**
 * Return a "segment-effective" shift object:
 * - keep base shift fields (startTime/endTime/gracePeriod/payableShifts/etc.)
 * - source segment windows from Division.shifts[] when they have actual times
 * - if the assignment row is missing / all-null, keep shift master halves
 * - never mutate original shift doc
 */
function applyDivisionSegmentsToShift(shiftDoc, divisionShiftRow) {
  const base = shiftDoc?.toObject ? shiftDoc.toObject() : { ...(shiftDoc || {}) };
  if (!base) return base;
  return mergeShiftSegments(base, divisionShiftRow);
}

async function loadDivisionShiftsDoc(divisionId) {
  const id = toIdString(divisionId);
  if (!id) return null;

  const hit = divisionShiftsCache.get(id);
  if (hit && Date.now() - hit.at < DIVISION_SHIFTS_CACHE_MS) {
    return hit.doc;
  }

  const Division = require('../../departments/model/Division');
  const doc = await Division.findById(id).select('shifts').lean();
  divisionShiftsCache.set(id, { at: Date.now(), doc: doc || null });
  return doc || null;
}

/**
 * Resolve firstHalf / break / secondHalf for attendance and payroll:
 * 1. Division.shifts[] row for this shift (when it has times)
 * 2. Shift.segmentOverrides for this division (when it has times)
 * 3. Shift master halves
 *
 * Null assignment windows no longer wipe the master.
 */
async function resolveEffectiveShiftDoc(shiftDoc, opts = {}) {
  const base = shiftDoc?.toObject ? shiftDoc.toObject() : { ...(shiftDoc || {}) };
  if (!base) return base;

  let division = opts.division && Array.isArray(opts.division.shifts) ? opts.division : null;
  const divisionId = toIdString(opts.divisionId) || toIdString(division?._id) || toIdString(division);
  const shiftId = opts.shiftId || base._id || base.id;

  if (!division && divisionId) {
    division = await loadDivisionShiftsDoc(divisionId);
  }

  // Master, then shift.segmentOverrides (if they have times), then Division.shifts[] (if they have times).
  let effective = applyShiftSegmentOverride(base, divisionId);
  if (division && Array.isArray(division.shifts) && shiftId) {
    const row = await pickDivisionShiftConfig({
      division,
      shiftId,
      employeeGender: opts.employeeGender || null,
      employeeGroupId: opts.employeeGroupId || null,
      groupingEnabled: opts.groupingEnabled,
    });
    effective = applyDivisionSegmentsToShift(effective, row);
  }
  return effective;
}

module.exports = {
  pickDivisionShiftConfig,
  pickDivisionShiftConfigSync,
  applyDivisionSegmentsToShift,
  resolveEffectiveShiftDoc,
  hasAnyDivisionSegments,
  toIdString,
};
