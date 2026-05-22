/**
 * Seed AttendanceRawLog punches for a 14-day slice of the pay period using the employee’s
 * resolved shift (roster → org pool), then reprocess each roster date via attendanceSyncService.
 *
 * Usage (from backend/):
 *   # Pay-period days 1–14 (e.g. single-shift test window)
 *   node scripts/seed_payperiod_first14_scenarios.js --emp=OVN001 --from=2026-04-26 --clean
 *
 *   # Pay-period days 15–28 (multi-shift test window — multiple INs ≥60m apart, extra pairs)
 *   node scripts/seed_payperiod_first14_scenarios.js --emp=OVN001 --from=2026-04-26 --segment=2 --clean
 *
 *   node scripts/seed_payperiod_first14_scenarios.js --emp=OVN001 --from=2026-04-26 --start=22:00 --end=06:00
 *
 * --from     = first calendar day of the pay period (e.g. May 26–25 cycle → 2026-04-26).
 * --segment  = 1 (days 1–14, default) or 2 (days 15–28).
 * --clean    = delete this employee’s AttendanceDaily + AttendanceRawLog in the affected window first.
 * --start/--end = optional fixed shift times if getShiftsForEmployee returns no shift.
 * --no-summary  = skip extra monthly summary sweep at the end (post-save hooks still run on each day).
 *
 * Set AttendanceSettings processingMode to multi_shift before running segment 2 if you want
 * multi-shift pairing (otherwise current org mode applies).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { getShiftsForEmployee } = require('../shifts/services/shiftDetectionService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');
const summaryCalculationService = require('../attendance/services/summaryCalculationService');
const dateCycleService = require('../leaves/services/dateCycleService');

function parseArgs(argv) {
  const o = {
    emp: 'OVN001',
    from: null,
    segment: '1',
    clean: false,
    noSummary: false,
    start: null,
    end: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clean') o.clean = true;
    else if (a === '--no-summary') o.noSummary = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        const k = a.slice(2, eq).replace(/-/g, '_');
        o[k] = a.slice(eq + 1);
      } else {
        const k = a.slice(2).replace(/-/g, '_');
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          o[k] = next;
          i++;
        }
      }
    }
  }
  return o;
}

function addDaysIST(dateStr, n) {
  const d = createISTDate(dateStr, '12:00');
  d.setTime(d.getTime() + n * 24 * 60 * 60 * 1000);
  return extractISTComponents(d).dateStr;
}

function addMinutes(d, mins) {
  return new Date(d.getTime() + mins * 60 * 1000);
}

function isOvernightShift(startTime, endTime) {
  const [sh, sm] = (startTime || '09:00').split(':').map(Number);
  const [eh, em] = (endTime || '18:00').split(':').map(Number);
  const smin = sh * 60 + (sm || 0);
  const emin = eh * 60 + (em || 0);
  return emin <= smin || (smin >= 20 * 60 && emin < 12 * 60);
}

function shiftEndDateTime(rosterDate, shift, overnight) {
  if (!overnight) return createISTDate(rosterDate, shift.endTime);
  const next = addDaysIST(rosterDate, 1);
  return createISTDate(next, shift.endTime);
}

function punchDoc(empNo, ts, type) {
  return {
    employeeNumber: String(empNo).toUpperCase(),
    timestamp: ts,
    type,
    source: 'manual',
    date: extractISTComponents(ts).dateStr,
  };
}

/**
 * 14 scenarios — roster day index 0..13 maps to scenario index.
 * Each returns { name, punches } where punches is array of { timestamp, type } for insert.
 */
function buildScenario(index, rosterDate, shift, overnight, grace) {
  const st = shift.startTime || '09:00';
  const en = shift.endTime || '18:00';
  const g = Number(grace) || 15;
  const dayStart = createISTDate(rosterDate, st);
  const dayEnd = shiftEndDateTime(rosterDate, shift, overnight);

  const names = [
    '01_full_on_time',
    '02_late_within_grace',
    '03_late_beyond_grace',
    '04_early_out_heavy',
    '05_in_only_no_out',
    '06_absent_no_punches',
    '07_lunch_gap_two_pairs',
    '08_short_work_window',
    '09_two_shift_segments_wide_gap',
    '10_punctual_edges',
    '11_mid_shift_partial',
    '12_double_in_spaced_then_out',
    '13_overnight_or_second_segment_split',
    '14_full_day_repeat',
  ];

  const name = names[index] || `extra_${index}`;

  // Default: full day
  const full = () => [
    punchDoc(shift.empNo, addMinutes(dayStart, 5), 'IN'),
    punchDoc(shift.empNo, dayEnd, 'OUT'),
  ];

  switch (index) {
    case 0:
      return { name, punches: full() };
    case 1:
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, Math.min(10, g - 1)), 'IN'),
          punchDoc(shift.empNo, dayEnd, 'OUT'),
        ],
      };
    case 2:
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, g + 25), 'IN'),
          punchDoc(shift.empNo, dayEnd, 'OUT'),
        ],
      };
    case 3:
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 5), 'IN'),
          punchDoc(shift.empNo, addMinutes(dayEnd, -50), 'OUT'),
        ],
      };
    case 4:
      return { name, punches: [punchDoc(shift.empNo, addMinutes(dayStart, 12), 'IN')] };
    case 5:
      return { name, punches: [] };
    case 6: {
      const out1 = addMinutes(dayStart, 3 * 60);
      const in2 = addMinutes(out1, 60 + 15);
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 2), 'IN'),
          punchDoc(shift.empNo, out1, 'OUT'),
          punchDoc(shift.empNo, in2, 'IN'),
          punchDoc(shift.empNo, addMinutes(dayEnd, -5), 'OUT'),
        ],
      };
    }
    case 7:
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 10), 'IN'),
          punchDoc(shift.empNo, addMinutes(dayStart, 10 + 120), 'OUT'),
        ],
      };
    case 8: {
      const outA = addMinutes(dayStart, 2 * 60);
      const inB = addMinutes(outA, 5 * 60);
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 3), 'IN'),
          punchDoc(shift.empNo, outA, 'OUT'),
          punchDoc(shift.empNo, inB, 'IN'),
          punchDoc(shift.empNo, addMinutes(dayEnd, -3), 'OUT'),
        ],
      };
    }
    case 9:
      return {
        name,
        punches: [punchDoc(shift.empNo, dayStart, 'IN'), punchDoc(shift.empNo, dayEnd, 'OUT')],
      };
    case 10:
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 4 * 60), 'IN'),
          punchDoc(shift.empNo, addMinutes(dayStart, 6 * 60), 'OUT'),
        ],
      };
    case 11:
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 2), 'IN'),
          punchDoc(shift.empNo, addMinutes(dayStart, 2 + 8), 'IN'),
          punchDoc(shift.empNo, dayEnd, 'OUT'),
        ],
      };
    case 12: {
      if (overnight) {
        const mid = addDaysIST(rosterDate, 1);
        return {
          name,
          punches: [
            punchDoc(shift.empNo, addMinutes(dayStart, 5), 'IN'),
            punchDoc(shift.empNo, createISTDate(mid, '02:00'), 'OUT'),
            punchDoc(shift.empNo, createISTDate(mid, '03:05'), 'IN'),
            punchDoc(shift.empNo, createISTDate(mid, en), 'OUT'),
          ],
        };
      }
      return {
        name,
        punches: [
          punchDoc(shift.empNo, addMinutes(dayStart, 30), 'IN'),
          punchDoc(shift.empNo, addMinutes(dayStart, 5 * 60), 'OUT'),
          punchDoc(shift.empNo, addMinutes(dayStart, 6 * 60), 'IN'),
          punchDoc(shift.empNo, addMinutes(dayEnd, -20), 'OUT'),
        ],
      };
    }
    case 13:
      return { name, punches: full() };
    default:
      return { name, punches: full() };
  }
}

/**
 * Scenarios tuned for multi_shift: multiple IN punches on the same roster date must be ≥60 minutes
 * apart (see multiShiftDetectionService.filterDuplicateIns). Uses explicit IN/OUT types.
 */
function buildMultishiftScenario(index, rosterDate, shift, overnight, empNo) {
  const st = shift.startTime || '09:00';
  const en = shift.endTime || '18:00';
  const dayStart = createISTDate(rosterDate, st);
  const dayEnd = shiftEndDateTime(rosterDate, shift, overnight);

  const names = [
    'MS01_two_evening_segments',
    'MS02_two_segments_tight_first',
    'MS03_three_INs_chain_OUTs',
    'MS04_single_full_shift',
    'MS05_absent',
    'MS06_IN_OUT_IN_no_final_OUT',
    'MS07_four_pulses_INOUTINOUT',
    'MS08_duplicate_IN_filtered_then_valid_IN',
    'MS09_wide_middle_gap_two_pairs',
    'MS10_short_first_long_second',
    'MS11_two_segment_alt',
    'MS12_IN_only_twice_spaced',
    'MS13_full_repeat_two_segment',
    'MS14_full_single_segment',
  ];
  const name = names[index] || `MS_extra_${index}`;

  const p = (ts, t) => punchDoc(empNo, ts, t);

  if (!overnight) {
    const open = (h, m) => createISTDate(rosterDate, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    const close = (h, m) => createISTDate(rosterDate, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    switch (index) {
      case 0:
        return {
          name,
          punches: [p(open(9, 5), 'IN'), p(close(12, 0), 'OUT'), p(open(14, 0), 'IN'), p(close(17, 55), 'OUT')],
        };
      case 1:
        return {
          name,
          punches: [p(open(9, 2), 'IN'), p(close(10, 30), 'OUT'), p(open(11, 45), 'IN'), p(close(18, 0), 'OUT')],
        };
      case 2:
        return {
          name,
          punches: [
            p(open(9, 0), 'IN'),
            p(close(11, 0), 'OUT'),
            p(open(12, 15), 'IN'),
            p(close(14, 0), 'OUT'),
            p(open(15, 30), 'IN'),
            p(close(18, 5), 'OUT'),
          ],
        };
      case 3:
        return { name, punches: [p(open(9, 5), 'IN'), p(close(18, 0), 'OUT')] };
      case 4:
        return { name, punches: [] };
      case 5:
        return { name, punches: [p(open(9, 0), 'IN'), p(close(12, 0), 'OUT'), p(open(13, 10), 'IN')] };
      case 6:
        return {
          name,
          punches: [
            p(open(9, 0), 'IN'),
            p(close(10, 30), 'OUT'),
            p(open(11, 45), 'IN'),
            p(close(13, 0), 'OUT'),
            p(open(14, 10), 'IN'),
            p(close(17, 0), 'OUT'),
          ],
        };
      case 7:
        return {
          name,
          punches: [
            p(open(9, 0), 'IN'),
            p(open(9, 20), 'IN'),
            p(open(10, 25), 'IN'),
            p(close(18, 0), 'OUT'),
          ],
        };
      case 8:
        return {
          name,
          punches: [p(open(9, 0), 'IN'), p(close(11, 0), 'OUT'), p(open(15, 0), 'IN'), p(close(18, 0), 'OUT')],
        };
      case 9:
        return {
          name,
          punches: [p(open(9, 0), 'IN'), p(close(10, 0), 'OUT'), p(open(11, 30), 'IN'), p(close(18, 0), 'OUT')],
        };
      case 10:
        return {
          name,
          punches: [
            p(open(9, 0), 'IN'),
            p(close(10, 30), 'OUT'),
            p(open(12, 0), 'IN'),
            p(close(14, 0), 'OUT'),
            p(open(15, 15), 'IN'),
            p(close(18, 0), 'OUT'),
          ],
        };
      case 11:
        return { name, punches: [p(open(10, 0), 'IN'), p(open(11, 30), 'IN')] };
      case 12:
        return {
          name,
          punches: [p(open(9, 5), 'IN'), p(close(12, 0), 'OUT'), p(open(13, 20), 'IN'), p(close(18, 0), 'OUT')],
        };
      default:
        return { name, punches: [p(open(9, 0), 'IN'), p(close(18, 0), 'OUT')] };
    }
  }

  // Overnight: keep additional INs on the roster calendar date before midnight (IST).
  const in1 = addMinutes(dayStart, 5);
  const out1 = addMinutes(dayStart, 95);
  const in2 = addMinutes(in1, 70);
  const out2 = addMinutes(dayEnd, -8);

  switch (index) {
    case 0:
      return { name, punches: [p(in1, 'IN'), p(out1, 'OUT'), p(in2, 'IN'), p(out2, 'OUT')] };
    case 1:
      return {
        name,
        punches: [
          p(addMinutes(dayStart, 8), 'IN'),
          p(addMinutes(dayStart, 55), 'OUT'),
          p(addMinutes(in1, 85), 'IN'),
          p(out2, 'OUT'),
        ],
      };
    case 2: {
      const i1 = addMinutes(dayStart, 3);
      const o1 = addMinutes(i1, 55);
      const i2 = addMinutes(i1, 70);
      const o2 = addMinutes(i2, 60);
      const i3 = addMinutes(i2, 70);
      const o3 = addMinutes(dayEnd, -5);
      return { name, punches: [p(i1, 'IN'), p(o1, 'OUT'), p(i2, 'IN'), p(o2, 'OUT'), p(i3, 'IN'), p(o3, 'OUT')] };
    }
    case 3:
      return { name, punches: [p(in1, 'IN'), p(out2, 'OUT')] };
    case 4:
      return { name, punches: [] };
    case 5:
      return { name, punches: [p(in1, 'IN'), p(out1, 'OUT'), p(in2, 'IN')] };
    case 6: {
      const a1 = addMinutes(dayStart, 3);
      const b1 = addMinutes(a1, 47);
      const a2 = addMinutes(a1, 72);
      const b2 = addMinutes(a2, 40);
      const a3 = addMinutes(a2, 75);
      return { name, punches: [p(a1, 'IN'), p(b1, 'OUT'), p(a2, 'IN'), p(b2, 'OUT'), p(a3, 'IN'), p(out2, 'OUT')] };
    }
    case 7:
      return {
        name,
        punches: [
          p(addMinutes(dayStart, 2), 'IN'),
          p(addMinutes(dayStart, 18), 'IN'),
          p(addMinutes(dayStart, 85), 'IN'),
          p(out2, 'OUT'),
        ],
      };
    case 8:
      return {
        name,
        punches: [
          p(addMinutes(dayStart, 5), 'IN'),
          p(addMinutes(dayStart, 65), 'OUT'),
          p(addMinutes(dayStart, 150), 'IN'),
          p(out2, 'OUT'),
        ],
      };
    case 9:
      return {
        name,
        punches: [
          p(addMinutes(dayStart, 6), 'IN'),
          p(addMinutes(dayStart, 45), 'OUT'),
          p(addMinutes(dayStart, 130), 'IN'),
          p(out2, 'OUT'),
        ],
      };
    case 10:
      return {
        name,
        punches: [
          p(addMinutes(dayStart, 5), 'IN'),
          p(addMinutes(dayStart, 95), 'OUT'),
          p(addMinutes(dayStart, 170), 'IN'),
          p(out2, 'OUT'),
        ],
      };
    case 11:
      return {
        name,
        punches: [p(addMinutes(dayStart, 10), 'IN'), p(addMinutes(dayStart, 90), 'IN')],
      };
    case 12:
      return { name, punches: [p(in1, 'IN'), p(out1, 'OUT'), p(in2, 'IN'), p(out2, 'OUT')] };
    case 13:
      return { name, punches: [p(addMinutes(dayStart, 2), 'IN'), p(out2, 'OUT')] };
    default:
      return { name, punches: [p(in1, 'IN'), p(out2, 'OUT')] };
  }
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
  const args = parseArgs(process.argv);
  if (!args.from || !/^\d{4}-\d{2}-\d{2}$/.test(args.from)) {
    console.error('Required: --from=YYYY-MM-DD (first day of pay period, e.g. 2026-04-26 for May 26–25 cycle)');
    process.exit(1);
  }

  const segmentNum = Math.min(2, Math.max(1, parseInt(String(args.segment || '1'), 10) || 1));
  const startDayIndex = (segmentNum - 1) * 14;

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/li-hrms';
  await mongoose.connect(uri);
  const empNo = String(args.emp).toUpperCase();

  const emp = await Employee.findOne({ emp_no: empNo });
  if (!emp) {
    console.error(`Employee not found: ${empNo}`);
    process.exit(1);
  }

  const periodStart = args.from;
  const rosterStart = addDaysIST(periodStart, startDayIndex);
  const rosterEnd = addDaysIST(periodStart, startDayIndex + 13);
  const rawLogMin = addDaysIST(rosterStart, -1);
  const rawLogMax = addDaysIST(rosterEnd, 16);

  if (args.clean) {
    const dr = await AttendanceDaily.deleteMany({
      employeeNumber: empNo,
      date: { $gte: rosterStart, $lte: rosterEnd },
    });
    const rr = await AttendanceRawLog.deleteMany({
      employeeNumber: empNo,
      date: { $gte: rawLogMin, $lte: rawLogMax },
    });
    console.log(`[clean] segment=${segmentNum} AttendanceDaily removed: ${dr.deletedCount}, AttendanceRawLog removed: ${rr.deletedCount}`);
  }

  let fallbackShift = null;
  if (args.start && args.end) {
    fallbackShift = {
      startTime: args.start,
      endTime: args.end,
      duration: 8,
      gracePeriod: 15,
    };
  }

  const dayLabel = segmentNum === 1 ? '1–14' : '15–28';
  console.log(`\n=== Seeding pay-period days ${dayLabel} (segment ${segmentNum}) for ${empNo} ===`);
  console.log(`Roster dates: ${rosterStart} .. ${rosterEnd}\n`);

  const inserted = [];
  for (let i = 0; i < 14; i++) {
    const rosterDate = addDaysIST(periodStart, startDayIndex + i);
    const { shifts, source } = await getShiftsForEmployee(empNo, rosterDate, {});
    let shift = shifts && shifts[0];
    if (!shift) {
      shift = fallbackShift;
    }
    if (!shift || !shift.startTime || !shift.endTime) {
      console.error(
        `No shift for ${empNo} on ${rosterDate} (source=${source}). Pass --start=HH:mm --end=HH:mm or assign roster/org shift.`
      );
      process.exit(1);
    }
    shift = {
      startTime: shift.startTime,
      endTime: shift.endTime,
      gracePeriod: shift.gracePeriod ?? 15,
      empNo,
    };
    const overnight = isOvernightShift(shift.startTime, shift.endTime);
    const { name, punches } =
      segmentNum === 2
        ? buildMultishiftScenario(i, rosterDate, shift, overnight, empNo)
        : buildScenario(i, rosterDate, shift, overnight, shift.gracePeriod);

    const payDay = startDayIndex + i + 1;
    console.log(
      `Pay day ${payDay} (${rosterDate}) | ${name} | shift ${shift.startTime}-${shift.endTime} overnight=${overnight} | punches=${punches.length}`
    );

    for (const punch of punches) {
      const ok = await insertPunch(punch);
      if (ok) inserted.push(`${extractISTComponents(punch.timestamp).dateStr} ${punch.type}`);
    }
  }

  console.log(`\nInserted ${inserted.length} raw log row(s) (duplicates skipped if any).\n=== Reprocessing each roster date ===\n`);

  for (let i = 0; i < 14; i++) {
    const rosterDate = addDaysIST(periodStart, startDayIndex + i);
    try {
      const result = await reprocessAttendanceForEmployeeDate(empNo, rosterDate);
      const rec = result?.dailyRecord || result?.attendanceRecord || {};
      console.log(
        `  ${rosterDate} -> success=${result?.success} status=${rec.status} payable=${rec.payableShifts} lateIn=${rec.totalLateInMinutes ?? ''} earlyOut=${rec.totalEarlyOutMinutes ?? ''} | ${result?.reason || result?.error || ''}`
      );
    } catch (e) {
      console.error(`  ${rosterDate} ERROR: ${e.message}`);
    }
  }

  if (!args.no_summary) {
    const seen = new Set();
    for (let i = 0; i < 14; i++) {
      const rosterDate = addDaysIST(periodStart, startDayIndex + i);
      const periodInfo = await dateCycleService.getPeriodInfo(new Date(`${rosterDate}T12:00:00+05:30`));
      const pc = periodInfo.payrollCycle;
      const key = `${pc.year}-${pc.month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`\n[summary] recalculateOnAttendanceUpdate ${empNo} (cycle ${key}, sample ${rosterDate})`);
      await summaryCalculationService.recalculateOnAttendanceUpdate(empNo, rosterDate);
    }
  }

  console.log('\nDone. Inspect AttendanceDaily in UI or Mongo for these dates.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
