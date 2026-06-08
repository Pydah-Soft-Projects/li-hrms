/**
 * Leave split simulation — mirrors frontend list → backend validate-splits flow.
 * Shows old (buggy) vs new (IST) date matching under different server timezones.
 *
 * Usage:
 *   node scripts/test_leave_split_simulation.js
 *   node scripts/test_leave_split_simulation.js --db          # also scan real approved leaves in MongoDB
 *   TZ=UTC node scripts/test_leave_split_simulation.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const { expandLeaveToDailySegments, istDateStr } = require('../shared/utils/leaveDayRangeUtils');
const { getDateRange, normalizeSplitDateStr } = require('../leaves/services/leaveSplitService');

const USE_DB = process.argv.includes('--db');

function hr(char = '─', n = 72) {
  return char.repeat(n);
}

/** Frontend buildDateRange → split payload (YYYY-MM-DD strings). */
function frontendSplitPayload(leave) {
  const fromStr = istDateStr(leave.fromDate);
  const toStr = istDateStr(leave.toDate || leave.fromDate);
  const segments = expandLeaveToDailySegments({
    fromDate: fromStr,
    toDate: toStr,
    isHalfDay: leave.isHalfDay,
    halfDayType: leave.halfDayType,
    fromIsHalfDay: leave.fromIsHalfDay,
    fromHalfDayType: leave.fromHalfDayType,
    toIsHalfDay: leave.toIsHalfDay,
    toHalfDayType: leave.toHalfDayType,
  });
  return segments.map((seg) => ({
    date: seg.dateStr,
    leaveType: leave.leaveType || 'CL',
    status: 'approved',
    isHalfDay: seg.isHalfDay,
    halfDayType: seg.halfDayType,
    numberOfDays: seg.numberOfDays,
  }));
}

/** OLD backend check (local setHours) — caused false "outside range" on UTC servers. */
function legacyValidateSplitDates(leave, splits) {
  const originalDates = getDateRange(
    leave.fromDate,
    leave.toDate,
    leave.isHalfDay,
    leave.halfDayType,
    leave
  );
  const errors = [];
  for (const split of splits) {
    const splitDate = new Date(split.date);
    splitDate.setHours(0, 0, 0, 0);
    const isInRange = originalDates.some((od) => {
      const odDate = new Date(od.date);
      odDate.setHours(0, 0, 0, 0);
      return odDate.getTime() === splitDate.getTime();
    });
    if (!isInRange) {
      const fromUtc = leave.fromDate.toISOString().split('T')[0];
      const toUtc = (leave.toDate || leave.fromDate).toISOString().split('T')[0];
      errors.push(
        `Split date ${split.date} is outside original leave range (${fromUtc} to ${toUtc}) [LEGACY]`
      );
    }
  }
  return errors;
}

/** NEW backend check (IST calendar strings). */
function newValidateSplitDates(leave, splits) {
  const originalDates = getDateRange(
    leave.fromDate,
    leave.toDate,
    leave.isHalfDay,
    leave.halfDayType,
    leave
  );
  const validDateStrs = new Set(originalDates.map((od) => od.dateStr || istDateStr(od.date)));
  const leaveFromStr = istDateStr(leave.fromDate);
  const leaveToStr = istDateStr(leave.toDate || leave.fromDate);
  const errors = [];
  for (const split of splits) {
    const splitDateStr = normalizeSplitDateStr(split.date);
    if (!validDateStrs.has(splitDateStr)) {
      errors.push(
        `Split date ${splitDateStr} is outside original leave range (${leaveFromStr} to ${leaveToStr}) [NEW]`
      );
    }
  }
  return errors;
}

function simulateScenario(label, leaveDoc) {
  const splits = frontendSplitPayload(leaveDoc);
  const legacyErrors = legacyValidateSplitDates(leaveDoc, splits);
  const newErrors = newValidateSplitDates(leaveDoc, splits);

  const fromIst = istDateStr(leaveDoc.fromDate);
  const toIst = istDateStr(leaveDoc.toDate || leaveDoc.fromDate);

  console.log(`\n${hr()}`);
  console.log(`Scenario: ${label}`);
  console.log(`Server TZ offset (min): ${new Date().getTimezoneOffset()}  (${process.env.TZ || 'system default'})`);
  console.log(`Leave IST range: ${fromIst} → ${toIst}  (${leaveDoc.numberOfDays ?? '?'} days)`);
  console.log(`Frontend split list (${splits.length} rows):`);
  splits.forEach((s, i) => {
    const half = s.isHalfDay ? ` [${s.halfDayType}]` : '';
    console.log(`  ${i + 1}. ${s.date}${half}  ${s.leaveType}  ${s.status}`);
  });

  const legacyOk = legacyErrors.length === 0;
  const newOk = newErrors.length === 0;

  console.log(`\nLegacy validation: ${legacyOk ? '✅ PASS' : '❌ FAIL'}`);
  if (!legacyOk) legacyErrors.forEach((e) => console.log(`  • ${e}`));

  console.log(`New IST validation: ${newOk ? '✅ PASS' : '❌ FAIL'}`);
  if (!newOk) newErrors.forEach((e) => console.log(`  • ${e}`));

  if (!legacyOk && newOk) {
    console.log('\n⚠️  This is the bug you were seeing: UI list looks correct, legacy backend rejects it.');
  }

  return { label, legacyOk, newOk, splitCount: splits.length };
}

async function scanRealLeaves() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('\n[--db] MONGODB_URI not set — skipping real leave scan.');
    return [];
  }

  const Leave = require('../leaves/model/Leave');
  await mongoose.connect(uri);
  console.log(`\n${hr('=')}`);
  console.log('REAL DATABASE SCAN — approved multi-day leaves (sample)');
  console.log(hr('='));

  const leaves = await Leave.find({
    status: { $in: ['approved', 'hr_approved', 'principal_approved', 'hod_approved'] },
    numberOfDays: { $gte: 1 },
  })
    .sort({ createdAt: -1 })
    .limit(15)
    .select('fromDate toDate isHalfDay halfDayType fromIsHalfDay toIsHalfDay numberOfDays leaveType emp_no status splitStatus')
    .lean();

  console.log(`Found ${leaves.length} recent approved leave(s) to simulate.\n`);

  const results = [];
  for (const row of leaves) {
    const label = `DB leave ${row.emp_no || '?'}  ${istDateStr(row.fromDate)}→${istDateStr(row.toDate)}  (${row.numberOfDays}d, ${row.leaveType})`;
    const r = simulateScenario(label, row);
    results.push(r);
  }

  await mongoose.disconnect();
  return results;
}

async function main() {
  console.log(hr('='));
  console.log('LEAVE SPLIT SIMULATION');
  console.log('Mirrors: frontend split list → backend validate-splits');
  console.log(hr('='));

  const scenarios = [
    {
      label: '3-day full leave (Jun 10–12)',
      leave: {
        fromDate: createISTDate('2025-06-10', '00:00'),
        toDate: createISTDate('2025-06-12', '23:59'),
        isHalfDay: false,
        numberOfDays: 3,
        leaveType: 'CL',
      },
    },
    {
      label: 'Multi-day with boundary halves (Jun 10–12, start/end half)',
      leave: {
        fromDate: createISTDate('2025-06-10', '00:00'),
        toDate: createISTDate('2025-06-12', '23:59'),
        fromIsHalfDay: true,
        toIsHalfDay: true,
        isHalfDay: false,
        numberOfDays: 2,
        leaveType: 'CL',
      },
    },
    {
      label: 'Single half-day leave (Jun 10, second half)',
      leave: {
        fromDate: createISTDate('2025-06-10', '00:00'),
        toDate: createISTDate('2025-06-10', '23:59'),
        isHalfDay: true,
        halfDayType: 'second_half',
        numberOfDays: 0.5,
        leaveType: 'CL',
      },
    },
    {
      label: '5-day leave crossing month boundary (Jun 28 – Jul 2)',
      leave: {
        fromDate: createISTDate('2025-06-28', '00:00'),
        toDate: createISTDate('2025-07-02', '23:59'),
        isHalfDay: false,
        numberOfDays: 5,
        leaveType: 'EL',
      },
    },
  ];

  const results = [];
  for (const s of scenarios) {
    results.push(simulateScenario(s.label, s.leave));
  }

  // Run same 3-day scenario under forced UTC to show the classic failure
  const prevTz = process.env.TZ;
  process.env.TZ = 'UTC';
  console.log(`\n${hr('=')}`);
  console.log('FORCED UTC TIMEZONE — reproduces production server bug');
  console.log(hr('='));
  const utcResult = simulateScenario('3-day leave under TZ=UTC', scenarios[0].leave);
  results.push(utcResult);
  process.env.TZ = prevTz;

  let dbResults = [];
  if (USE_DB) {
    dbResults = await scanRealLeaves();
    results.push(...dbResults);
  } else {
    console.log(`\n${hr()}`);
    console.log('Tip: run with --db to simulate against real approved leaves in MongoDB:');
    console.log('  node scripts/test_leave_split_simulation.js --db');
  }

  console.log(`\n${hr('=')}`);
  console.log('SUMMARY');
  console.log(hr('='));

  const legacyFails = results.filter((r) => !r.legacyOk);
  const newFails = results.filter((r) => !r.newOk);
  const fixedByNew = results.filter((r) => !r.legacyOk && r.newOk);

  console.log(`Total scenarios: ${results.length}`);
  console.log(`Legacy failures: ${legacyFails.length}`);
  console.log(`New IST failures: ${newFails.length}`);
  console.log(`Fixed by new logic (legacy fail → new pass): ${fixedByNew.length}`);

  if (fixedByNew.length > 0) {
    console.log('\nScenarios fixed by IST validation:');
    fixedByNew.forEach((r) => console.log(`  • ${r.label}`));
  }

  if (newFails.length > 0) {
    console.log('\nStill failing with new logic (investigate):');
    newFails.forEach((r) => console.log(`  • ${r.label}`));
    process.exit(1);
  }

  console.log('\n✅ All scenarios pass with new IST validation.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation error:', err);
  process.exit(1);
});
