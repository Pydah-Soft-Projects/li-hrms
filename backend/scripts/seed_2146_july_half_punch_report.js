/**
 * Seed random first-half / second-half punch scenarios for employee 2146 (Pydahsoft shift)
 * from 2026-07-01 through today, reprocess attendance, and report which half gets credits.
 *
 * Usage:
 *   node scripts/seed_2146_july_half_punch_report.js
 *   node scripts/seed_2146_july_half_punch_report.js --clean
 *   node scripts/seed_2146_july_half_punch_report.js --from=2026-07-01 --to=2026-07-10
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');
const { computeRawAttendanceHalfCreditsSync } = require('../attendance/utils/attendanceHalfPresence');
const { getProcessingModeForEmployeeNumber } = require('../attendance/services/processingModeResolutionService');

const EMP_NO = '2146';
const SHIFT_NAME = 'Pydahsoft';

/** Pydahsoft 09:00–18:00 with break 13:00–14:00 */
const HALF_WINDOWS = {
  first: { in: '09:05', out: '12:55' },
  second: { in: '14:05', out: '17:55' },
  full: { in: '09:05', out: '17:55' },
  firstShort: { in: '09:05', out: '10:30' },
  secondShort: { in: '14:05', out: '15:00' },
  lateFirst: { in: '12:30', out: '12:55' },
  earlySecond: { in: '14:05', out: '14:45' },
};

const SCENARIOS = [
  { key: 'FULL_DAY', label: 'Full day (09:05–17:55)', build: (d) => pair(d, HALF_WINDOWS.full.in, HALF_WINDOWS.full.out) },
  {
    key: 'FIRST_HALF',
    label: 'First half only (09:05–12:55)',
    build: (d) => pair(d, HALF_WINDOWS.first.in, HALF_WINDOWS.first.out),
  },
  {
    key: 'SECOND_HALF',
    label: 'Second half only (14:05–17:55)',
    build: (d) => pair(d, HALF_WINDOWS.second.in, HALF_WINDOWS.second.out),
  },
  {
    key: 'LUNCH_SPLIT',
    label: 'Lunch split (first + second halves)',
    build: (d) => [
      ...pair(d, HALF_WINDOWS.first.in, HALF_WINDOWS.first.out),
      ...pair(d, HALF_WINDOWS.second.in, HALF_WINDOWS.second.out),
    ],
  },
  {
    key: 'FIRST_SHORT',
    label: 'Short first half (09:05–10:30, below min)',
    build: (d) => pair(d, HALF_WINDOWS.firstShort.in, HALF_WINDOWS.firstShort.out),
  },
  {
    key: 'SECOND_SHORT',
    label: 'Short second half (14:05–15:00, below min)',
    build: (d) => pair(d, HALF_WINDOWS.secondShort.in, HALF_WINDOWS.secondShort.out),
  },
  { key: 'IN_ONLY_FIRST', label: 'IN only first half (09:05)', build: (d) => [punch(d, HALF_WINDOWS.first.in, 'IN')] },
  { key: 'IN_ONLY_SECOND', label: 'IN only second half (14:05)', build: (d) => [punch(d, HALF_WINDOWS.second.in, 'IN')] },
  { key: 'OUT_ONLY_SECOND', label: 'OUT only second half (17:55)', build: (d) => [punch(d, HALF_WINDOWS.second.out, 'OUT')] },
  { key: 'ABSENT', label: 'No punches', build: () => [] },
  {
    key: 'LATE_FIRST_EDGE',
    label: 'Late edge first half (12:30–12:55)',
    build: (d) => pair(d, HALF_WINDOWS.lateFirst.in, HALF_WINDOWS.lateFirst.out),
  },
  {
    key: 'EARLY_SECOND_EDGE',
    label: 'Early edge second half (14:05–14:45)',
    build: (d) => pair(d, HALF_WINDOWS.earlySecond.in, HALF_WINDOWS.earlySecond.out),
  },
];

function parseArgs() {
  const o = { clean: false, from: '2026-07-01', to: null, seed: 2146 };
  for (const raw of process.argv.slice(2)) {
    if (raw === '--clean') o.clean = true;
    else if (raw.startsWith('--from=')) o.from = raw.slice(7);
    else if (raw.startsWith('--to=')) o.to = raw.slice(5);
    else if (raw.startsWith('--seed=')) o.seed = Number(raw.slice(7)) || 2146;
  }
  if (!o.to) {
    const today = extractISTComponents(new Date()).dateStr;
    o.to = today;
  }
  return o;
}

function punch(dateStr, timeStr, type) {
  const ts = createISTDate(dateStr, timeStr);
  return {
    employeeNumber: EMP_NO,
    timestamp: ts,
    type,
    source: 'manual',
    date: dateStr,
  };
}

function pair(dateStr, inTime, outTime) {
  return [punch(dateStr, inTime, 'IN'), punch(dateStr, outTime, 'OUT')];
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickScenario(rng, dayIndex) {
  const idx = Math.floor(rng() * SCENARIOS.length);
  return SCENARIOS[idx];
}

function fmtTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function segmentSummary(daily) {
  const shift = daily?.shifts?.[0];
  if (!shift?.shiftSegments?.length) return '-';
  return shift.shiftSegments
    .map((s) => {
      const name = s.segmentName || s.name || '?';
      const present = s.present ? 'P' : 'A';
      const pay = s.payableShifts ?? 0;
      return `${name}:${present}(pay=${pay})`;
    })
    .join(', ');
}

function creditLabel(attFirst, attSecond) {
  if (attFirst >= 0.5 && attSecond >= 0.5) return 'BOTH halves (1.0 day)';
  if (attFirst >= 0.5) return 'FIRST half only (0.5)';
  if (attSecond >= 0.5) return 'SECOND half only (0.5)';
  return 'NO half credit';
}

async function insertPunch(doc) {
  try {
    await AttendanceRawLog.create(doc);
    return true;
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
}

async function main() {
  const args = parseArgs();
  const dates = getAllDatesInRange(args.from, args.to);
  if (!dates.length) {
    console.error('No dates in range', args.from, args.to);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const emp = await Employee.findOne({ emp_no: EMP_NO }).lean();
  if (!emp) {
    console.error(`Employee ${EMP_NO} not found`);
    process.exit(1);
  }

  const processingModeObj = await getProcessingModeForEmployeeNumber(EMP_NO);
  const processingMode = processingModeObj?.mode || 'single_shift';
  const rng = mulberry32(args.seed);

  console.log('\n================================================================');
  console.log(`  ${EMP_NO} ${emp.employee_name} — ${SHIFT_NAME} half-punch test`);
  console.log(`  Dates: ${args.from} → ${args.to} (${dates.length} days)`);
  console.log(`  Shift windows: first 09:00–13:00 | break 13:00–14:00 | second 14:00–18:00`);
  console.log(`  Processing mode: ${processingMode}`);
  console.log('================================================================\n');

  if (args.clean) {
    const dr = await AttendanceDaily.deleteMany({
      employeeNumber: EMP_NO,
      date: { $gte: args.from, $lte: args.to },
    });
    const rr = await AttendanceRawLog.deleteMany({
      employeeNumber: EMP_NO,
      date: { $gte: args.from, $lte: args.to },
    });
    console.log(`[clean] Removed AttendanceDaily=${dr.deletedCount}, AttendanceRawLog=${rr.deletedCount}\n`);
  }

  const plan = [];
  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    const scenario = pickScenario(rng, i);
    const punches = scenario.build(dateStr);
    plan.push({ dateStr, scenario, punches });
  }

  console.log('--- SEEDING PUNCHES ---\n');
  for (const row of plan) {
    const punchTimes = row.punches.map((p) => `${fmtTime(p.timestamp)} ${p.type}`).join(' | ') || '(none)';
    console.log(`${row.dateStr} | ${row.scenario.key.padEnd(16)} | ${row.scenario.label}`);
    console.log(`           punches: ${punchTimes}`);
    for (const p of row.punches) {
      await insertPunch(p);
    }
  }

  console.log('\n--- REPROCESSING & HALF-CREDIT REPORT ---\n');
  console.log(
    'Date       | Scenario         | IN      OUT     | Daily Status | Segments                          | Half Credits'
  );
  console.log(
    '-----------+------------------+---------+--------+--------------+-----------------------------------+------------------'
  );

  const summaryRows = [];

  for (const row of plan) {
    const { dateStr, scenario, punches } = row;
    await reprocessAttendanceForEmployeeDate(EMP_NO, dateStr);

    const daily = await AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: dateStr }).lean();
    const shift = daily?.shifts?.[0];
    const inT = fmtTime(shift?.inTime || daily?.inTime);
    const outT = fmtTime(shift?.outTime || daily?.outTime);
    const status = daily?.status || 'NO_RECORD';
    const segs = segmentSummary(daily);
    const credits = daily
      ? computeRawAttendanceHalfCreditsSync(daily, [], { processingMode, dateStr })
      : { attFirst: 0, attSecond: 0 };
    const creditStr = creditLabel(credits.attFirst, credits.attSecond);

    console.log(
      `${dateStr} | ${scenario.key.padEnd(16)} | ${inT.padEnd(7)} ${outT.padEnd(6)} | ${String(status).padEnd(12)} | ${segs.padEnd(35)} | ${creditStr}`
    );

    summaryRows.push({
      date: dateStr,
      scenario: scenario.key,
      punches: punches.map((p) => `${fmtTime(p.timestamp)} ${p.type}`).join(', ') || 'none',
      status,
      attFirst: credits.attFirst,
      attSecond: credits.attSecond,
      creditStr,
      payable: daily?.payableShifts ?? 0,
      presencePath: shift?.presenceResolutionPath || '-',
    });
  }

  console.log('\n--- CREDIT SUMMARY ---\n');
  const firstOnly = summaryRows.filter((r) => r.attFirst >= 0.5 && r.attSecond < 0.5);
  const secondOnly = summaryRows.filter((r) => r.attSecond >= 0.5 && r.attFirst < 0.5);
  const both = summaryRows.filter((r) => r.attFirst >= 0.5 && r.attSecond >= 0.5);
  const none = summaryRows.filter((r) => r.attFirst < 0.5 && r.attSecond < 0.5);

  console.log(`First half credit:  ${firstOnly.length} day(s) → ${firstOnly.map((r) => r.date).join(', ') || '-'}`);
  console.log(`Second half credit: ${secondOnly.length} day(s) → ${secondOnly.map((r) => r.date).join(', ') || '-'}`);
  console.log(`Both halves credit: ${both.length} day(s) → ${both.map((r) => r.date).join(', ') || '-'}`);
  console.log(`No half credit:     ${none.length} day(s) → ${none.map((r) => r.date).join(', ') || '-'}`);

  console.log('\n--- DETAILED BREAKDOWN ---\n');
  for (const r of summaryRows) {
    console.log(`${r.date} [${r.scenario}]`);
    console.log(`  Punches sent:    ${r.punches}`);
    console.log(`  Daily status:    ${r.status} | payable=${r.payable} | path=${r.presencePath}`);
    console.log(`  Half credits:    first=${r.attFirst} second=${r.attSecond} → ${r.creditStr}`);
    console.log('');
  }

  // Let post-save summary hooks finish before closing Mongo
  await new Promise((r) => setTimeout(r, 8000));

  await mongoose.disconnect();
  console.log('Done.\n');
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
