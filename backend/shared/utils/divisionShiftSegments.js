const { isCustomEmployeeGroupingEnabled } = require('./customEmployeeGrouping');

function normalizeGender(value) {
  const v = String(value || '').trim();
  return v || 'All';
}

function toIdString(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v._id) return String(v._id);
  try {
    return String(v);
  } catch {
    return null;
  }
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
}) {
  if (!division || !Array.isArray(division.shifts) || !shiftId) return null;

  const groupingEnabled = await isCustomEmployeeGroupingEnabled();
  const targetShiftId = toIdString(shiftId);
  const gender = normalizeGender(employeeGender);
  const empGroup = toIdString(employeeGroupId);

  const rows = division.shifts.filter((r) => toIdString(r?.shiftId) === targetShiftId);
  if (!rows.length) return null;

  // If grouping enabled and employee has group, prefer exact group match.
  let pool = rows;
  if (groupingEnabled && empGroup) {
    const groupMatched = rows.filter((r) => toIdString(r?.employee_group_id) === empGroup);
    if (groupMatched.length) pool = groupMatched;
  } else if (groupingEnabled) {
    // No employee group: only rows without group should match (strict)
    const noGroup = rows.filter((r) => !toIdString(r?.employee_group_id));
    if (noGroup.length) pool = noGroup;
  }

  // Gender preference: exact match then All.
  const exactGender = pool.filter((r) => normalizeGender(r?.gender) !== 'All' && normalizeGender(r?.gender).toLowerCase() === gender.toLowerCase());
  if (exactGender.length) return exactGender[0];

  const allGender = pool.filter((r) => normalizeGender(r?.gender) === 'All');
  if (allGender.length) return allGender[0];

  // If configs are malformed (no gender), return first.
  return pool[0] || rows[0] || null;
}

function hasAnyDivisionSegments(row) {
  if (!row) return false;
  const fh = row.firstHalf;
  const br = row.break;
  const sh = row.secondHalf;
  const hasHalf = (seg) => seg && (seg.startTime || seg.endTime);
  const hasBreak = (seg) => seg && (seg.startTime || seg.endTime);
  return hasHalf(fh) || hasBreak(br) || hasHalf(sh);
}

/**
 * Return a "segment-effective" shift object:
 * - keep base shift fields (startTime/endTime/gracePeriod/payableShifts/etc.)
 * - source segment windows from Division.shifts[] config when present
 * - never mutate original shift doc
 */
function applyDivisionSegmentsToShift(shiftDoc, divisionShiftRow) {
  const base = shiftDoc?.toObject ? shiftDoc.toObject() : { ...(shiftDoc || {}) };
  if (!base) return base;
  if (!divisionShiftRow || !hasAnyDivisionSegments(divisionShiftRow)) {
    // Explicitly clear halves if shift master still has them; division is source of truth.
    return {
      ...base,
      firstHalf: null,
      break: null,
      secondHalf: null,
    };
  }

  return {
    ...base,
    firstHalf: divisionShiftRow.firstHalf || null,
    break: divisionShiftRow.break || null,
    secondHalf: divisionShiftRow.secondHalf || null,
  };
}

module.exports = {
  pickDivisionShiftConfig,
  applyDivisionSegmentsToShift,
  toIdString,
};

