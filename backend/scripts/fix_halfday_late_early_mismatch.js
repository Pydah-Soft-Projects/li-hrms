/**
 * Fix HALF_DAY (optional PARTIAL) rows where stored worked half disagrees with
 * late-in / early-out classification.
 *
 * Updates shiftSegments so the correct half is present (late-in > early-out →
 * second half; early-out > late-in → first half). Skips locked / payroll-locked.
 *
 * Usage (always dry-run first):
 *   node scripts/fix_halfday_late_early_mismatch.js --from 2026-07-01 --to 2026-07-31 --dry-run
 *   node scripts/fix_halfday_late_early_mismatch.js --from 2026-07-01 --to 2026-07-31 --yes
 *   node scripts/fix_halfday_late_early_mismatch.js --from 2026-07-01 --to 2026-07-31 --emp 2181 --yes
 *   node scripts/fix_halfday_late_early_mismatch.js --from 2026-07-01 --to 2026-07-31 --include-partial --yes
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const {
  pickPrimaryShift,
  dailyHasShiftLevelIn,
  dailyHasShiftLevelOut,
  getWorkedHalfFromShiftSegments,
  getWorkedHalfFromLegacyPenalties,
  resolveHalfDayWorkedHalfKey,
} = require('../attendance/utils/attendanceHalfPresence');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const { isEmployeeNumberDateLocked } = require('../shared/services/payrollPeriodLockService');
const { getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');

// attendanceHalfPresence does not export the name helpers — local copies
function isFirstHalfName(name) {
  const n = String(name || '').toLowerCase();
  return n === 'firsthalf' || n === 'first_half';
}
function isSecondHalfName(name) {
  const n = String(name || '').toLowerCase();
  return n === 'secondhalf' || n === 'second_half';
}

function normEmp(v) {
  return String(v || '').trim().toUpperCase();
}

function parseEmpCsv(s) {
  if (!s) return [];
  return String(s)
    .split(/[,;\s]+/)
    .map(normEmp)
    .filter(Boolean);
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    from: process.env.FROM_DATE || null,
    to: process.env.TO_DATE || null,
    empCsv: process.env.EMP_LIST || '',
    includePartial: false,
    dryRun: false,
    yes: false,
    skipSummary: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--dry-run') out.dryRun = true;
    else if (raw === '--yes' || raw === '-y') out.yes = true;
    else if (raw === '--include-partial') out.includePartial = true;
    else if (raw === '--skip-summary') out.skipSummary = true;
    else if (raw.startsWith('--from=')) out.from = raw.slice('--from='.length);
    else if (raw === '--from' && argv[i + 1]) out.from = argv[++i];
    else if (raw.startsWith('--to=')) out.to = raw.slice('--to='.length);
    else if (raw === '--to' && argv[i + 1]) out.to = argv[++i];
    else if (raw.startsWith('--emp=')) out.empCsv = raw.slice('--emp='.length);
    else if (raw === '--emp' && argv[i + 1]) out.empCsv = argv[++i];
    else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (!out.from) out.from = raw;
      else if (!out.to) out.to = raw;
    }
  }

  // Default to dry-run unless --yes
  if (!out.yes && !out.dryRun) out.dryRun = true;
  return out;
}

function timeStrToMins(t) {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatMins(m) {
  const h = Math.floor(m / 60) % 24;
  const mins = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function buildMidpointSegments(shift, targetHalf, lateIn, earlyOut, overlapMinutes) {
  const startStr = shift.shiftStartTime || '09:00';
  const endStr = shift.shiftEndTime || '18:00';
  const startMins = timeStrToMins(startStr);
  const endMins = timeStrToMins(endStr);
  if (startMins == null || endMins == null) return [];

  let shiftEndMins = endMins;
  if (shiftEndMins <= startMins) shiftEndMins += 24 * 60;
  const durationMins = shiftEndMins - startMins;
  const midMins = (startMins + durationMins / 2) % (24 * 60);
  const midTimeStr = formatMins(midMins);
  const graceVal = shift.gracePeriod || 15;
  const halfDur = durationMins / 2 / 60;
  const overlap = Math.max(0, Math.round(Number(overlapMinutes) || 0));

  const make = (name, start, end, present) => ({
    segmentName: name,
    startTime: start,
    endTime: end,
    duration: halfDur,
    minDuration: null,
    gracePeriod: graceVal,
    payableShifts: 0.5,
    present,
    lateInMinutes: present ? lateIn : null,
    earlyOutMinutes: present ? earlyOut : null,
    isLateIn: present && lateIn > 0,
    isEarlyOut: present && earlyOut > 0,
    overlapMinutes: present ? overlap : 0,
  });

  return [
    make('firstHalf', startStr, midTimeStr, targetHalf === 'first_half'),
    make('secondHalf', midTimeStr, endStr, targetHalf === 'second_half'),
  ];
}

function applyExpectedHalfToShift(shift, daily, expectedHalf) {
  const lateIn = Number(daily.totalLateInMinutes) || Number(shift.lateInMinutes) || 0;
  const earlyOut = Number(daily.totalEarlyOutMinutes) || Number(shift.earlyOutMinutes) || 0;

  let segments = Array.isArray(shift.shiftSegments) ? shift.shiftSegments.map((s) => ({ ...s })) : [];
  const hasFirst = segments.some((s) => isFirstHalfName(s.segmentName));
  const hasSecond = segments.some((s) => isSecondHalfName(s.segmentName));

  if (!hasFirst || !hasSecond) {
    const existingOverlap = segments.reduce((a, s) => a + (Number(s.overlapMinutes) || 0), 0);
    let punchOverlap = existingOverlap;
    if (!punchOverlap && shift.inTime && shift.outTime) {
      punchOverlap = Math.round((new Date(shift.outTime) - new Date(shift.inTime)) / 60000);
    }
    segments = buildMidpointSegments(shift, expectedHalf, lateIn, earlyOut, punchOverlap);
  } else {
    for (const seg of segments) {
      const isFirst = isFirstHalfName(seg.segmentName);
      const isSecond = isSecondHalfName(seg.segmentName);
      if (!isFirst && !isSecond) continue;

      const present =
        (expectedHalf === 'first_half' && isFirst) || (expectedHalf === 'second_half' && isSecond);

      seg.present = present;
      if (present) {
        seg.lateInMinutes = lateIn;
        seg.earlyOutMinutes = earlyOut;
        seg.isLateIn = lateIn > 0;
        seg.isEarlyOut = earlyOut > 0;
        if (!(Number(seg.overlapMinutes) > 0) && shift.inTime && shift.outTime) {
          seg.overlapMinutes = Math.round((new Date(shift.outTime) - new Date(shift.inTime)) / 60000);
        }
      } else {
        seg.lateInMinutes = null;
        seg.earlyOutMinutes = null;
        seg.isLateIn = false;
        seg.isEarlyOut = false;
        seg.overlapMinutes = 0;
      }
    }
  }

  shift.shiftSegments = segments;
  shift.segmentTotalPayableShifts = 0.5;
  if (shift.status === 'HALF_DAY' || shift.status === 'PARTIAL' || !shift.status) {
    // keep status; payable already half
  }
  return shift;
}

function findMismatch(daily) {
  if (!dailyHasShiftLevelIn(daily) || !dailyHasShiftLevelOut(daily)) return null;
  const shift = pickPrimaryShift(daily);
  if (!shift?.inTime || !shift?.outTime) return null;

  const expectedHalf = getWorkedHalfFromLegacyPenalties(daily, shift);
  if (!expectedHalf) return null;

  const displayedHalf = resolveHalfDayWorkedHalfKey(daily);
  if (displayedHalf === expectedHalf) return null;

  return {
    expectedHalf,
    displayedHalf,
    segmentHalf: getWorkedHalfFromShiftSegments(shift),
    lateIn: Number(daily.totalLateInMinutes) || Number(shift.lateInMinutes) || 0,
    earlyOut: Number(daily.totalEarlyOutMinutes) || Number(shift.earlyOutMinutes) || 0,
  };
}

async function main() {
  const args = parseArgs();
  if (!args.from || !args.to || !/^\d{4}-\d{2}-\d{2}$/.test(args.from) || !/^\d{4}-\d{2}-\d{2}$/.test(args.to)) {
    console.error('Required: --from YYYY-MM-DD --to YYYY-MM-DD');
    process.exit(1);
  }
  if (args.from > args.to) {
    console.error('--from must be <= --to');
    process.exit(1);
  }

  const empNos = parseEmpCsv(args.empCsv);
  const statuses = args.includePartial ? ['HALF_DAY', 'PARTIAL'] : ['HALF_DAY'];
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/:[^:@]+@/, ':***@'));

  const filter = {
    date: { $gte: args.from, $lte: args.to },
    status: { $in: statuses },
  };
  if (empNos.length) filter.employeeNumber = { $in: empNos };

  const dailies = await AttendanceDaily.find(filter).sort({ date: 1, employeeNumber: 1 });

  const targets = [];
  for (const daily of dailies) {
    const plain = daily.toObject();
    const mismatch = findMismatch(plain);
    if (!mismatch) continue;
    targets.push({ daily, mismatch, plain });
  }

  console.log('\n--- Fix half-day by late-in / early-out ---');
  console.log('  Dates:', args.from, '→', args.to);
  console.log('  Statuses:', statuses.join(', '));
  console.log('  Employee filter:', empNos.length ? empNos.join(', ') : '(all)');
  console.log('  Matches to fix:', targets.length);
  console.log('  Mode:', args.dryRun ? 'DRY-RUN' : 'APPLY');

  if (targets.length === 0) {
    console.log('\nNo mismatches found.');
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const t of targets.slice(0, 40)) {
    const empNo = normEmp(t.plain.employeeNumber);
    console.log(
      `  ${t.plain.date} ${empNo}  ${t.mismatch.displayedHalf} → ${t.mismatch.expectedHalf}  LI=${t.mismatch.lateIn} EO=${t.mismatch.earlyOut}`
    );
  }
  if (targets.length > 40) console.log(`  … and ${targets.length - 40} more`);

  if (args.dryRun) {
    console.log('\nDry-run only. Re-run with --yes to apply.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = (await ask(rl, `\nApply fix to ${targets.length} row(s)? [y/N]: `)).trim().toLowerCase();
    rl.close();
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('Cancelled.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  const stats = {
    updated: 0,
    skippedLocked: 0,
    skippedPayroll: 0,
    failed: 0,
    errors: [],
  };
  const summaryEmployees = new Set();

  for (const { daily, mismatch } of targets) {
    const empNo = normEmp(daily.employeeNumber);
    const date = daily.date;

    if (daily.locked) {
      stats.skippedLocked += 1;
      console.log(`  SKIP locked  ${empNo} ${date}`);
      continue;
    }
    if (await isEmployeeNumberDateLocked(empNo, date)) {
      stats.skippedPayroll += 1;
      console.log(`  SKIP payroll ${empNo} ${date}`);
      continue;
    }

    try {
      const shifts = (daily.shifts || []).map((s) => {
        const plain = typeof s.toObject === 'function' ? s.toObject() : { ...s };
        return plain;
      });

      const primaryIdx = shifts.findIndex(
        (s) => s && s.inTime && s.outTime && new Date(s.outTime).getTime() !== new Date(s.inTime).getTime()
      );
      const idx = primaryIdx >= 0 ? primaryIdx : 0;
      if (!shifts[idx]) {
        stats.failed += 1;
        stats.errors.push(`${empNo} ${date}: no primary shift`);
        continue;
      }

      applyExpectedHalfToShift(shifts[idx], daily.toObject(), mismatch.expectedHalf);
      daily.shifts = shifts;
      daily.markModified('shifts');

      if (!daily.policyMeta) daily.policyMeta = {};
      if (!daily.policyMeta.partialDayRule) daily.policyMeta.partialDayRule = {};
      // Optional audit note — do not force present/lop portions unless already set
      daily.policyMeta.partialDayRule.note = [
        daily.policyMeta.partialDayRule.note,
        `fixed_half_by_late_early:${mismatch.displayedHalf}->${mismatch.expectedHalf}`,
      ]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 500);
      daily.policyMeta.partialDayRule.updatedAt = new Date();
      daily.markModified('policyMeta');

      await daily.save();
      stats.updated += 1;
      summaryEmployees.add(empNo);
      console.log(`  OK   ${empNo} ${date}  ${mismatch.displayedHalf} → ${mismatch.expectedHalf}`);
    } catch (err) {
      stats.failed += 1;
      stats.errors.push(`${empNo} ${date}: ${err.message}`);
      console.log(`  FAIL ${empNo} ${date}: ${err.message}`);
    }
  }

  if (!args.skipSummary && summaryEmployees.size > 0) {
    console.log('\nRefreshing monthly summaries…');
    const rangeDates = getAllDatesInRange(args.from, args.to);
    for (const empNo of summaryEmployees) {
      const seen = new Set();
      for (const d of rangeDates) {
        const periodInfo = await dateCycleService.getPeriodInfo(new Date(`${d}T12:00:00+05:30`));
        const pc = periodInfo.payrollCycle;
        const key = `${pc.year}-${pc.month}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await recalculateOnAttendanceUpdate(empNo, d);
        } catch (err) {
          stats.errors.push(`${empNo} summary (${key}): ${err.message}`);
        }
      }
    }
  }

  console.log('\n=== Fix complete ===');
  console.log('  Updated:', stats.updated);
  console.log('  Skipped (daily locked):', stats.skippedLocked);
  console.log('  Skipped (payroll lock):', stats.skippedPayroll);
  console.log('  Failed:', stats.failed);
  if (stats.errors.length) {
    console.log('\nFirst errors:');
    stats.errors.slice(0, 20).forEach((e) => console.log('  -', e));
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
