/**
 * Helpers for manual IN/OUT attendance edits in multi-shift mode.
 * Resolves shift segments, replaces raw logs safely, and builds reprocess overrides.
 */

const mongoose = require('mongoose');
const AttendanceRawLog = require('../model/AttendanceRawLog');

const TIMESTAMP_TOLERANCE_MS = 2000;

function sortShifts(shifts) {
  return [...(shifts || [])].sort((a, b) => {
    const numDiff = (a.shiftNumber || 0) - (b.shiftNumber || 0);
    if (numDiff !== 0) return numDiff;
    return new Date(a.inTime || 0) - new Date(b.inTime || 0);
  });
}

/**
 * Resolve which shift segment is being edited.
 */
function resolveShiftSegment(attendanceRecord, shiftRecordId) {
  if (!attendanceRecord?.shifts?.length) return null;

  if (shiftRecordId) {
    const segment = attendanceRecord.shifts.id(shiftRecordId);
    return segment || null;
  }

  return (
    attendanceRecord.shifts.find((s) => !s.outTime) ||
    attendanceRecord.shifts[attendanceRecord.shifts.length - 1]
  );
}

function getShiftSegmentIndex(attendanceRecord, shiftSegment) {
  const sorted = sortShifts(attendanceRecord.shifts);
  const targetId = String(shiftSegment._id);
  return sorted.findIndex((s) => String(s._id) === targetId);
}

function isValidObjectId(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value));
}

function timestampsNear(a, b, toleranceMs = TIMESTAMP_TOLERANCE_MS) {
  if (!a || !b) return false;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= toleranceMs;
}

/**
 * Normalize legacy plain-object overrides or structured overrides.
 */
function normalizeManualOverrides(manualOverrides) {
  if (!manualOverrides || typeof manualOverrides !== 'object') {
    return { byInTime: {}, segmentPairs: [], editedSegmentIndex: null, editType: null };
  }

  if (manualOverrides.byInTime || manualOverrides.segmentPairs || manualOverrides.segmentEdit) {
    return {
      byInTime: manualOverrides.byInTime || {},
      segmentPairs: manualOverrides.segmentPairs || [],
      editedSegmentIndex:
        manualOverrides.editedSegmentIndex != null ? manualOverrides.editedSegmentIndex : null,
      editType: manualOverrides.editType || null,
      segmentEdit: manualOverrides.segmentEdit || null,
    };
  }

  return {
    byInTime: manualOverrides,
    segmentPairs: [],
    editedSegmentIndex: null,
    editType: null,
    segmentEdit: null,
  };
}

/**
 * Find override OUT for a given IN timestamp (exact ISO, fuzzy, or segment pair).
 */
function findOverrideOutTime(currentInTime, manualOpts) {
  if (!currentInTime || !manualOpts) return null;

  const inMs = new Date(currentInTime).getTime();
  if (Number.isNaN(inMs)) return null;

  const iso = new Date(currentInTime).toISOString();
  if (manualOpts.byInTime?.[iso]) {
    return manualOpts.byInTime[iso];
  }

  for (const [key, outVal] of Object.entries(manualOpts.byInTime || {})) {
    if (timestampsNear(key, currentInTime)) return outVal;
  }

  for (const pair of manualOpts.segmentPairs || []) {
    if (pair?.inTime && timestampsNear(pair.inTime, currentInTime)) {
      return pair.outTime;
    }
  }

  return null;
}

/**
 * Remove the OUT raw log that previously backed this segment.
 */
async function removeOutLogsForSegment(employeeNumber, shiftSegment, punchDateStr) {
  const empNo = String(employeeNumber || '').toUpperCase();
  if (!empNo || !shiftSegment) return;

  if (isValidObjectId(shiftSegment.outPunchId)) {
    await AttendanceRawLog.deleteOne({ _id: shiftSegment.outPunchId, employeeNumber: empNo });
  }

  if (!shiftSegment.outTime) return;

  const outMs = new Date(shiftSegment.outTime).getTime();

  await AttendanceRawLog.deleteOne({
    employeeNumber: empNo,
    timestamp: new Date(shiftSegment.outTime),
    type: 'OUT',
  });

  await AttendanceRawLog.deleteMany({
    employeeNumber: empNo,
    type: 'OUT',
    source: 'manual',
    timestamp: {
      $gte: new Date(outMs - 120000),
      $lte: new Date(outMs + 120000),
    },
  });
}

/**
 * Remove the IN raw log that previously backed this segment.
 */
async function removeInLogsForSegment(employeeNumber, shiftSegment, punchDateStr) {
  const empNo = String(employeeNumber || '').toUpperCase();
  if (!empNo || !shiftSegment) return;

  if (isValidObjectId(shiftSegment.inPunchId)) {
    await AttendanceRawLog.deleteOne({ _id: shiftSegment.inPunchId, employeeNumber: empNo });
  }

  if (!shiftSegment.inTime) return;

  const inMs = new Date(shiftSegment.inTime).getTime();

  await AttendanceRawLog.deleteOne({
    employeeNumber: empNo,
    timestamp: new Date(shiftSegment.inTime),
    type: 'IN',
  });

  await AttendanceRawLog.deleteMany({
    employeeNumber: empNo,
    type: 'IN',
    source: 'manual',
    timestamp: {
      $gte: new Date(inMs - 120000),
      $lte: new Date(inMs + 120000),
    },
  });
}

/**
 * Drop stale manual OUT punches after this segment's IN that would steal pairing.
 */
async function cleanupCompetingManualOuts(employeeNumber, segmentInTime, punchDateStr, keepOutTime) {
  const empNo = String(employeeNumber || '').toUpperCase();
  if (!empNo || !segmentInTime || !keepOutTime) return;

  const keepMs = new Date(keepOutTime).getTime();
  const manualOuts = await AttendanceRawLog.find({
    employeeNumber: empNo,
    date: punchDateStr,
    type: 'OUT',
    source: 'manual',
    timestamp: { $gt: new Date(segmentInTime) },
  });

  for (const log of manualOuts) {
    if (!timestampsNear(log.timestamp, keepOutTime)) {
      await AttendanceRawLog.deleteOne({ _id: log._id });
    }
  }
}

/**
 * Build reprocess options for an OUT-time edit (multi-shift aware).
 */
function buildOutTimeReprocessOptions(attendanceRecord, shiftSegment, newOutTime) {
  const sorted = sortShifts(attendanceRecord.shifts);
  const segmentIndex = getShiftSegmentIndex(attendanceRecord, shiftSegment);
  const isLastSegment = segmentIndex === sorted.length - 1;
  const firstShift = sorted[0];

  const byInTime = {};
  const segmentPairs = [];

  if (sorted.length === 1) {
    const inKey = new Date(shiftSegment.inTime).toISOString();
    byInTime[inKey] = newOutTime;
    segmentPairs.push({
      inTime: shiftSegment.inTime,
      outTime: newOutTime,
      segmentIndex,
    });
  } else if (isLastSegment && firstShift?.inTime) {
    // Split or multi-IN day: anchor override on first real IN so iterative split sees new final OUT.
    const anchorKey = new Date(firstShift.inTime).toISOString();
    byInTime[anchorKey] = newOutTime;
    segmentPairs.push({
      inTime: firstShift.inTime,
      outTime: newOutTime,
      segmentIndex,
    });
  } else {
    const inKey = new Date(shiftSegment.inTime).toISOString();
    byInTime[inKey] = newOutTime;
    segmentPairs.push({
      inTime: shiftSegment.inTime,
      outTime: newOutTime,
      segmentIndex,
    });
  }

  return {
    manualOverrides: {
      byInTime,
      segmentPairs,
      editedSegmentIndex: segmentIndex,
      editType: 'OUT',
      segmentEdit: {
        segmentIndex,
        editType: 'OUT',
        newOutTime,
        anchorInTime: sorted.length > 1 && isLastSegment ? firstShift?.inTime : shiftSegment.inTime,
      },
    },
  };
}

/**
 * Build reprocess options for an IN-time edit (multi-shift aware).
 */
function buildInTimeReprocessOptions(attendanceRecord, shiftSegment, newInTime) {
  const segmentIndex = getShiftSegmentIndex(attendanceRecord, shiftSegment);
  const inKey = new Date(newInTime).toISOString();
  const outTime = shiftSegment.outTime || null;

  const byInTime = {};
  if (outTime) {
    byInTime[inKey] = outTime;
  }

  return {
    manualOverrides: {
      byInTime,
      segmentPairs: [
        {
          inTime: newInTime,
          outTime,
          segmentIndex,
        },
      ],
      editedSegmentIndex: segmentIndex,
      editType: 'IN',
      segmentEdit: {
        segmentIndex,
        editType: 'IN',
        newInTime,
        newOutTime: outTime,
      },
    },
  };
}

module.exports = {
  TIMESTAMP_TOLERANCE_MS,
  sortShifts,
  resolveShiftSegment,
  getShiftSegmentIndex,
  normalizeManualOverrides,
  findOverrideOutTime,
  removeOutLogsForSegment,
  removeInLogsForSegment,
  cleanupCompetingManualOuts,
  buildOutTimeReprocessOptions,
  buildInTimeReprocessOptions,
};
