/**
 * Sync AttendanceDaily from roster entries (full/half HOL/WO, shift days).
 * Used by roster sync worker and holiday apply (create/update/delete).
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const { isEmployeeNumberDateLocked } = require('../../shared/services/payrollPeriodLockService');
const { reprocessAttendanceForEmployeeDate } = require('./attendanceSyncService');
const {
  parseRosterHalfNonWorking,
  buildAttendanceFieldsForNoPunchHalfRoster,
} = require('../../shifts/utils/rosterHalfNonWorking');

function normalizeHalfFlag(v) {
  const s = String(v || '').toUpperCase();
  return s === 'HOL' || s === 'WO' ? s : null;
}

function hasHalfRosterFlags(entry) {
  return !!(
    normalizeHalfFlag(entry.firstHalfStatus) ||
    normalizeHalfFlag(entry.secondHalfStatus)
  );
}

function dailyHasPunches(dailyRecord) {
  if (!dailyRecord) return false;
  return !!(
    (dailyRecord.totalWorkingHours > 0) ||
    (dailyRecord.shifts &&
      dailyRecord.shifts.length > 0 &&
      dailyRecord.shifts.some((s) => s && s.inTime))
  );
}

function appendSource(dailyRecord) {
  if (!dailyRecord.source) dailyRecord.source = [];
  if (!dailyRecord.source.includes('roster-sync')) {
    dailyRecord.source.push('roster-sync');
  }
}

/**
 * @param {object} entry Roster apply payload (employeeNumber, date, status, shiftId, half flags, notes)
 * @returns {Promise<'synced'|'reprocessed'|'removed'|'skipped'|'locked'>}
 */
async function syncOneRosterEntryToAttendance(entry) {
  if (!entry?.date) return 'skipped';

  const empNo = String(entry.employeeNumber || '').toUpperCase();
  const locked = await isEmployeeNumberDateLocked(empNo, entry.date);
  if (locked) return 'locked';

  const halfRoster = hasHalfRosterFlags(entry);

  if (entry.status === 'WO' || entry.status === 'HOL') {
    let dailyRecord = await AttendanceDaily.findOne({
      employeeNumber: empNo,
      date: entry.date,
    });

    if (dailyHasPunches(dailyRecord)) {
      await reprocessAttendanceForEmployeeDate(empNo, entry.date);
      return 'reprocessed';
    }

    const updateFields = {
      status: entry.status === 'WO' ? 'WEEK_OFF' : 'HOLIDAY',
      shifts: [],
      totalWorkingHours: 0,
      totalOTHours: 0,
      payableShifts: 0,
      rosterFirstHalfNonWorking: entry.status,
      rosterSecondHalfNonWorking: entry.status,
      notes: entry.notes || (entry.status === 'WO' ? 'Week Off' : 'Holiday'),
    };

    if (!dailyRecord) {
      dailyRecord = new AttendanceDaily({
        employeeNumber: empNo,
        date: entry.date,
        ...updateFields,
        source: ['roster-sync'],
      });
    } else {
      Object.assign(dailyRecord, updateFields);
      appendSource(dailyRecord);
    }

    await dailyRecord.save();
    return 'synced';
  }

  if (entry.shiftId || halfRoster) {
    const existing = await AttendanceDaily.findOne({
      employeeNumber: empNo,
      date: entry.date,
    });

    if (existing && (existing.status === 'WEEK_OFF' || existing.status === 'HOLIDAY') && !dailyHasPunches(existing)) {
      await AttendanceDaily.deleteOne({ _id: existing._id });
    }

    const firstNW = normalizeHalfFlag(entry.firstHalfStatus);
    const secondNW = normalizeHalfFlag(entry.secondHalfStatus);
    const parsedHalf = parseRosterHalfNonWorking({
      status: null,
      shiftId: entry.shiftId,
      firstHalfStatus: firstNW,
      secondHalfStatus: secondNW,
    });

    if (halfRoster && !dailyHasPunches(existing)) {
      const bothHalvesSame =
        firstNW &&
        secondNW &&
        firstNW === secondNW &&
        (firstNW === 'HOL' || firstNW === 'WO');

      let dailyRecord = existing;
      if (bothHalvesSame && firstNW === 'HOL') {
        const updateFields = {
          status: 'HOLIDAY',
          shifts: [],
          totalWorkingHours: 0,
          totalOTHours: 0,
          payableShifts: 0,
          rosterFirstHalfNonWorking: 'HOL',
          rosterSecondHalfNonWorking: 'HOL',
          notes: entry.notes || 'Holiday',
        };
        if (!dailyRecord || dailyRecord.status === 'WEEK_OFF' || dailyRecord.status === 'HOLIDAY') {
          dailyRecord = dailyRecord || new AttendanceDaily({
            employeeNumber: empNo,
            date: entry.date,
            source: ['roster-sync'],
          });
          Object.assign(dailyRecord, updateFields);
          appendSource(dailyRecord);
          await dailyRecord.save();
          return 'synced';
        }
      }

      if (bothHalvesSame && firstNW === 'WO') {
        const updateFields = {
          status: 'WEEK_OFF',
          shifts: [],
          totalWorkingHours: 0,
          totalOTHours: 0,
          payableShifts: 0,
          rosterFirstHalfNonWorking: 'WO',
          rosterSecondHalfNonWorking: 'WO',
          notes: entry.notes || 'Week Off',
        };
        dailyRecord = dailyRecord || new AttendanceDaily({
          employeeNumber: empNo,
          date: entry.date,
          source: ['roster-sync'],
        });
        Object.assign(dailyRecord, updateFields);
        appendSource(dailyRecord);
        await dailyRecord.save();
        return 'synced';
      }

      const updateFields = buildAttendanceFieldsForNoPunchHalfRoster(
        parsedHalf,
        entry.notes
      );

      dailyRecord = dailyRecord || new AttendanceDaily({
        employeeNumber: empNo,
        date: entry.date,
        source: ['roster-sync'],
      });
      Object.assign(dailyRecord, updateFields);
      appendSource(dailyRecord);
      await dailyRecord.save();
      return 'synced';
    }

    await reprocessAttendanceForEmployeeDate(empNo, entry.date);
    return 'reprocessed';
  }

  return 'skipped';
}

/**
 * @param {object[]} entries
 */
async function syncRosterEntriesToAttendance(entries) {
  const stats = { synced: 0, reprocessed: 0, removed: 0, skipped: 0, locked: 0, errors: 0 };
  for (const entry of entries || []) {
    try {
      const result = await syncOneRosterEntryToAttendance(entry);
      if (stats[result] !== undefined) stats[result] += 1;
      else stats.skipped += 1;
    } catch (err) {
      stats.errors += 1;
      console.error(
        `[RosterAttendanceSync] ${entry.employeeNumber} ${entry.date}:`,
        err.message
      );
    }
  }
  return stats;
}

module.exports = {
  syncOneRosterEntryToAttendance,
  syncRosterEntriesToAttendance,
  hasHalfRosterFlags,
};
