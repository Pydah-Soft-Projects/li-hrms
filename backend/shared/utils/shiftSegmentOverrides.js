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

function hasSegmentTimes(seg) {
  return Boolean(seg && (seg.startTime || seg.endTime));
}

/**
 * True when a config row has at least one usable firstHalf / break / secondHalf window.
 */
function hasUsableShiftSegments(row) {
  if (!row) return false;
  return hasSegmentTimes(row.firstHalf) || hasSegmentTimes(row.break) || hasSegmentTimes(row.secondHalf);
}

function mergeShiftSegments(base, row) {
  if (!base) return base;
  if (!hasUsableShiftSegments(row)) return base;
  return {
    ...base,
    firstHalf: hasSegmentTimes(row.firstHalf) ? row.firstHalf : base.firstHalf,
    break: hasSegmentTimes(row.break) ? row.break : base.break,
    secondHalf: hasSegmentTimes(row.secondHalf) ? row.secondHalf : base.secondHalf,
  };
}

function normalizeOverrideRow(row) {
  if (!row) return null;
  return {
    division: toIdString(row.division),
    firstHalf: row.firstHalf || null,
    break: row.break || null,
    secondHalf: row.secondHalf || null,
  };
}

function pickShiftSegmentOverride(shiftDoc, divisionId) {
  const div = toIdString(divisionId);
  if (!div || !shiftDoc) return null;
  const overrides = Array.isArray(shiftDoc.segmentOverrides) ? shiftDoc.segmentOverrides : [];
  const found = overrides.find((r) => toIdString(r?.division) === div);
  return normalizeOverrideRow(found);
}

/**
 * Return a "segment-effective" shift object:
 * - base shift stays as-is (global segments)
 * - if a division override exists WITH actual times, replace those windows
 * - empty/null override windows do not wipe the shift master
 */
function applyShiftSegmentOverride(shiftDoc, divisionId) {
  const base = shiftDoc?.toObject ? shiftDoc.toObject() : { ...(shiftDoc || {}) };
  if (!base) return base;
  const row = pickShiftSegmentOverride(base, divisionId);
  return mergeShiftSegments(base, row);
}

module.exports = {
  toIdString,
  hasSegmentTimes,
  hasUsableShiftSegments,
  mergeShiftSegments,
  pickShiftSegmentOverride,
  applyShiftSegmentOverride,
};
