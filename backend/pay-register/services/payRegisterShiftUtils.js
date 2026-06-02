const Shift = require('../../shifts/model/Shift');
const mongoose = require('mongoose');

const MAX_SHIFTS_PER_DAY = 3;

/**
 * Normalize shift id list (unique, max 3, valid ObjectIds).
 * @param {Array<string|import('mongoose').Types.ObjectId>} raw
 * @returns {import('mongoose').Types.ObjectId[]}
 */
function normalizeShiftIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    if (id == null || id === '') continue;
    const s = String(id);
    if (!mongoose.Types.ObjectId.isValid(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(new mongoose.Types.ObjectId(s));
    if (out.length >= MAX_SHIFTS_PER_DAY) break;
  }
  return out;
}

/**
 * @param {Array<{ shiftId: *, isHalf?: boolean, payableUnits?: number|null }>} raw
 * @returns {Array<{ shiftId: import('mongoose').Types.ObjectId, isHalf: boolean, payableUnits: number|null }>}
 */
function normalizeShiftSelections(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row?.shiftId) continue;
    const s = String(row.shiftId);
    if (!mongoose.Types.ObjectId.isValid(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    const payableUnits =
      row.payableUnits != null && row.payableUnits !== '' && Number.isFinite(Number(row.payableUnits))
        ? Math.max(0, Number(row.payableUnits))
        : null;
    out.push({
      shiftId: new mongoose.Types.ObjectId(s),
      isHalf: Boolean(row.isHalf),
      payableUnits,
    });
    if (out.length >= MAX_SHIFTS_PER_DAY) break;
  }
  return out;
}

/**
 * Payable units for one shift selection.
 * @param {{ isHalf?: boolean, payableUnits?: number|null }} sel
 * @param {{ payableShifts?: number, name?: string }|undefined} shiftDef
 */
function payableUnitsForSelection(sel, shiftDef) {
  if (sel.payableUnits != null && Number.isFinite(Number(sel.payableUnits))) {
    return Math.max(0, Number(sel.payableUnits));
  }
  const base = Number(shiftDef?.payableShifts) || 1;
  return sel.isHalf ? base * 0.5 : base;
}

/**
 * @param {Array<{ shiftId: *, isHalf?: boolean, payableUnits?: number|null }>} selections
 * @param {Map<string, { name?: string, payableShifts?: number }>} shiftById
 */
function computePayableFromSelections(selections, shiftById) {
  let payableShifts = 0;
  const shiftNames = [];
  for (const sel of selections) {
    const sh = shiftById.get(String(sel.shiftId));
    const units = payableUnitsForSelection(sel, sh);
    payableShifts += units;
    if (sh?.name) {
      const label = sel.isHalf && sel.payableUnits == null ? `${sh.name} (½)` : sh.name;
      shiftNames.push(label);
    }
  }
  return {
    payableShifts: Math.max(0, Math.round(payableShifts * 100) / 100),
    shiftNames,
  };
}

/**
 * Sum payableShifts from Shift definitions for the given ids (all full days).
 * @param {Array<string|import('mongoose').Types.ObjectId>} shiftIds
 */
async function sumPayableShiftsForShiftIds(shiftIds) {
  const ids = normalizeShiftIds(shiftIds);
  if (ids.length === 0) {
    return { payableShifts: 1, shiftNames: [] };
  }
  const selections = ids.map((shiftId) => ({ shiftId, isHalf: false, payableUnits: null }));
  const shifts = await Shift.find({ _id: { $in: ids } })
    .select('name payableShifts')
    .lean();
  const byId = new Map(shifts.map((s) => [String(s._id), s]));
  return computePayableFromSelections(selections, byId);
}

/**
 * Build shift fields from attendance multi-shift segments (sync path).
 * @param {Object|null} attendance - AttendanceDaily document
 */
function extractMultiShiftFromAttendance(attendance) {
  if (!attendance?.shifts?.length) return null;
  const shiftSelections = [];
  let payableShifts = 0;
  const names = [];
  for (const seg of attendance.shifts) {
    if (!seg?.shiftId) continue;
    const sid = seg.shiftId._id || seg.shiftId;
    const sidStr = String(sid);
    if (shiftSelections.some((x) => String(x.shiftId) === sidStr)) continue;

    const base = Number(seg.shiftId?.payableShifts) || Number(seg.basePayable) || 1;
    let segPay =
      seg.payableShift != null && seg.payableShift !== ''
        ? Number(seg.payableShift)
        : null;
    if (segPay == null || !Number.isFinite(segPay)) {
      if (seg.status === 'HALF_DAY') segPay = base * 0.5;
      else if (seg.status === 'PRESENT' || seg.status === 'complete') segPay = base;
      else segPay = 0;
    }

    const isHalf =
      seg.status === 'HALF_DAY' ||
      (segPay > 0 && base > 0 && segPay < base * 0.75);

    shiftSelections.push({
      shiftId: sid,
      isHalf,
      payableUnits: segPay > 0 ? segPay : null,
    });
    payableShifts += segPay > 0 ? segPay : 0;
    const nm = seg.shiftName || seg.shiftId?.name || 'Shift';
    names.push(isHalf ? `${nm} (½)` : nm);
  }
  if (shiftSelections.length === 0) return null;
  if (Number(attendance.payableShifts) > payableShifts) {
    payableShifts = Number(attendance.payableShifts);
  }
  const shiftIds = shiftSelections.map((s) => s.shiftId);
  return {
    shiftIds,
    shiftSelections,
    payableShifts: Math.max(0, Math.round(payableShifts * 100) / 100),
    shiftId: shiftIds[0],
    shiftName: names.join(' + '),
  };
}

/**
 * Apply shift selection to a daily record (mutates in place).
 * @param {Object} dailyRecord
 * @param {{ shiftSelections?: Array, shiftIds?: Array, shiftId?: *, shiftName?: string }} updateData
 */
async function applyShiftSelectionToDailyRecord(dailyRecord, updateData) {
  if (Array.isArray(updateData.shiftSelections)) {
    const selections = normalizeShiftSelections(updateData.shiftSelections);
    dailyRecord.shiftSelections = selections;
    dailyRecord.shiftIds = selections.map((s) => s.shiftId);
    const shifts = await Shift.find({ _id: { $in: dailyRecord.shiftIds } })
      .select('name payableShifts')
      .lean();
    const byId = new Map(shifts.map((s) => [String(s._id), s]));
    const { payableShifts, shiftNames } = computePayableFromSelections(selections, byId);
    dailyRecord.payableShifts = payableShifts;
    dailyRecord.shiftId = selections[0]?.shiftId || null;
    dailyRecord.shiftName = shiftNames.length ? shiftNames.join(' + ') : null;
    if (dailyRecord.firstHalf) dailyRecord.firstHalf.shiftId = dailyRecord.shiftId;
    if (dailyRecord.secondHalf) dailyRecord.secondHalf.shiftId = dailyRecord.shiftId;
    return;
  }

  if (Array.isArray(updateData.shiftIds)) {
    const ids = normalizeShiftIds(updateData.shiftIds);
    const selections = ids.map((shiftId) => ({ shiftId, isHalf: false, payableUnits: null }));
    dailyRecord.shiftSelections = selections;
    dailyRecord.shiftIds = ids;
    const { payableShifts, shiftNames } = await sumPayableShiftsForShiftIds(ids);
    dailyRecord.payableShifts = payableShifts;
    dailyRecord.shiftId = ids[0] || null;
    dailyRecord.shiftName = shiftNames.length ? shiftNames.join(' + ') : null;
    if (dailyRecord.firstHalf) dailyRecord.firstHalf.shiftId = dailyRecord.shiftId;
    if (dailyRecord.secondHalf) dailyRecord.secondHalf.shiftId = dailyRecord.shiftId;
    return;
  }

  if (updateData.shiftId !== undefined) {
    const id = updateData.shiftId || null;
    dailyRecord.shiftId = id;
    dailyRecord.shiftIds = id ? normalizeShiftIds([id]) : [];
    dailyRecord.shiftSelections = id
      ? [{ shiftId: id, isHalf: Boolean(updateData.shiftIsHalf), payableUnits: null }]
      : [];
    const { payableShifts, shiftNames } = await sumPayableShiftsForShiftIds(dailyRecord.shiftIds);
    if (updateData.shiftIsHalf && dailyRecord.shiftSelections[0]) {
      const shifts = await Shift.find({ _id: id }).select('payableShifts name').lean();
      const base = Number(shifts[0]?.payableShifts) || 1;
      dailyRecord.payableShifts = Math.round(base * 0.5 * 100) / 100;
      dailyRecord.shiftName = shifts[0]?.name ? `${shifts[0].name} (½)` : null;
    } else {
      dailyRecord.payableShifts = payableShifts;
      dailyRecord.shiftName =
        updateData.shiftName != null ? updateData.shiftName : shiftNames[0] || null;
    }
    if (dailyRecord.firstHalf) dailyRecord.firstHalf.shiftId = id;
    if (dailyRecord.secondHalf) dailyRecord.secondHalf.shiftId = id;
  }
}

module.exports = {
  MAX_SHIFTS_PER_DAY,
  normalizeShiftIds,
  normalizeShiftSelections,
  payableUnitsForSelection,
  computePayableFromSelections,
  sumPayableShiftsForShiftIds,
  extractMultiShiftFromAttendance,
  applyShiftSelectionToDailyRecord,
};
