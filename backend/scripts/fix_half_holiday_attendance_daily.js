/**
 * Fix AttendanceDaily rows that were synced as full ABSENT for half-day roster holidays.
 * Sets PARTIAL + policyMeta.partialDayRule (holiday / absent halves) and keeps roster half flags.
 *
 * Uses updateOne (not save) so post-save setImmediate hooks do not race with mongoose.disconnect().
 * Then recalculates monthly summaries explicitly before exit.
 *
 * Usage:
 *   node scripts/fix_half_holiday_attendance_daily.js [--date=YYYY-MM-DD] [--dry-run] [--no-recalc]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const {
  parseRosterHalfNonWorking,
  buildAttendanceFieldsForNoPunchHalfRoster,
} = require('../shifts/utils/rosterHalfNonWorking');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipRecalc = process.argv.includes('--no-recalc');
  const recalcOnly = process.argv.includes('--recalc-only');
  const dateArg = process.argv.find((a) => a.startsWith('--date='));
  const onlyDate = dateArg ? dateArg.split('=')[1] : null;

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave1');

  const rosterQuery = {
    $or: [
      { firstHalfStatus: { $in: ['HOL', 'WO'] } },
      { secondHalfStatus: { $in: ['HOL', 'WO'] } },
    ],
    status: { $nin: ['HOL', 'WO'] },
  };
  if (onlyDate) rosterQuery.date = onlyDate;

  const rosterRows = await PreScheduledShift.find(rosterQuery)
    .select('employeeNumber date status shiftId firstHalfStatus secondHalfStatus notes')
    .lean();

  const recalcKeys = new Set();
  let updated = 0;
  let skipped = 0;

  for (const row of rosterRows) {
    const parsed = parseRosterHalfNonWorking(row);
    if (parsed.isFullHOL || parsed.isFullWO) continue;
    if (!parsed.firstHOL && !parsed.secondHOL && !parsed.firstWO && !parsed.secondWO) continue;

    const empNo = String(row.employeeNumber || '').toUpperCase();
    const daily = await AttendanceDaily.findOne({
      employeeNumber: empNo,
      date: row.date,
    });

    if (!daily) {
      skipped += 1;
      continue;
    }

    const hasPunches =
      (daily.totalWorkingHours > 0) ||
      (daily.shifts?.length && daily.shifts.some((s) => s?.inTime));

    if (hasPunches) {
      skipped += 1;
      recalcKeys.add(`${empNo}|${row.date}`);
      continue;
    }

    const needsFix =
      daily.status === 'ABSENT' ||
      (daily.status === 'PARTIAL' &&
        !daily.policyMeta?.partialDayRule?.applied &&
        (daily.rosterFirstHalfNonWorking || daily.rosterSecondHalfNonWorking));

    if (!recalcOnly && !needsFix && daily.status === 'PARTIAL') {
      skipped += 1;
      recalcKeys.add(`${empNo}|${row.date}`);
      continue;
    }

    if (!recalcOnly && !needsFix) {
      skipped += 1;
      continue;
    }

    const fields = buildAttendanceFieldsForNoPunchHalfRoster(parsed, daily.notes || row.notes);
    const rule = fields.policyMeta?.partialDayRule;

    if (!recalcOnly) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}${empNo} ${row.date}: ${daily.status} → ${fields.status} ` +
          `(${rule?.firstHalfStatus}/${rule?.secondHalfStatus})`
      );
    }

    if (!dryRun && !recalcOnly) {
      const source = Array.isArray(daily.source) ? [...daily.source] : [];
      if (!source.includes('roster-sync')) source.push('roster-sync');

      await AttendanceDaily.updateOne(
        { _id: daily._id },
        {
          $set: {
            status: fields.status,
            payableShifts: fields.payableShifts,
            shifts: fields.shifts,
            totalWorkingHours: fields.totalWorkingHours,
            totalOTHours: fields.totalOTHours,
            rosterFirstHalfNonWorking: fields.rosterFirstHalfNonWorking,
            rosterSecondHalfNonWorking: fields.rosterSecondHalfNonWorking,
            notes: fields.notes,
            policyMeta: fields.policyMeta,
            source,
          },
        }
      );
      updated += 1;
    } else if (recalcOnly && needsFix) {
      updated += 0;
    }

    recalcKeys.add(`${empNo}|${row.date}`);
  }

  console.log(`Records ${recalcOnly ? 'checked' : 'updated'}: ${updated}, skipped: ${skipped}.`);

  if (!dryRun && !skipRecalc && recalcKeys.size > 0) {
    const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
    console.log(`Recalculating monthly summary for ${recalcKeys.size} employee-date(s)...`);
    let recalcOk = 0;
    let recalcFail = 0;
    for (const key of recalcKeys) {
      const [empNo, date] = key.split('|');
      try {
        await recalculateOnAttendanceUpdate(empNo, date);
        recalcOk += 1;
        console.log(`  ✓ Summary OK: ${empNo} ${date}`);
      } catch (err) {
        recalcFail += 1;
        console.error(`  ✗ Summary failed: ${empNo} ${date}:`, err.message);
      }
    }
    console.log(`Summary recalc finished: ${recalcOk} ok, ${recalcFail} failed.`);
  } else if (skipRecalc) {
    console.log('Skipped summary recalc (--no-recalc).');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
