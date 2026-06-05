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
 * - if a division override exists, replace firstHalf/break/secondHalf with override
 */
function applyShiftSegmentOverride(shiftDoc, divisionId) {
  const base = shiftDoc?.toObject ? shiftDoc.toObject() : { ...(shiftDoc || {}) };
  if (!base) return base;
  const row = pickShiftSegmentOverride(base, divisionId);
  if (!row) return base;
  return {
    ...base,
    firstHalf: row.firstHalf || null,
    break: row.break || null,
    secondHalf: row.secondHalf || null,
  };
}

module.exports = {
  toIdString,
  pickShiftSegmentOverride,
  applyShiftSegmentOverride,
};

