/**
 * List May pay-period AttendanceDaily rows: IN+OUT, half-day threshold met,
 * half could not be resolved (uses first_half fallback).
 *
 * Usage: node scripts/list_may_partial_inout_half_fallback.js
 *        MONTH=2026-05 EMP_LIST=1715 node scripts/list_may_partial_inout_half_fallback.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const {
  dailyHasShiftLevelIn,
  dailyHasShiftLevelOut,
  pickPrimaryShift,
  getWorkedHalfFromShiftSegments,
  getWorkedHalfFromInThumbOnly,
  tryPartialHalfFromShiftMasterSync,
  partialInOutSatisfiesHalfDay,
  partialSingleShiftHalfCredits,
  resolvePartialWorkedHalfKey,
} = require('../attendance/utils/attendanceHalfPresence');

const MONTH = process.env.MONTH || '2026-05';
const EMP_FILTER = (process.env.EMP_LIST || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

function shiftRowHasDistinctOut(shift) {
  if (!shift?.outTime) return false;
  if (!shift?.inTime) return true;
  return new Date(shift.outTime).getTime() !== new Date(shift.inTime).getTime();
}

function getWorkedHalfFromInThumbOnShiftMaster(shift) {
  const doc = shift?.shiftId && typeof shift.shiftId === 'object' ? shift.shiftId : null;
  if (!doc || !shift?.inTime) return null;
  const start = doc.startTime || shift.shiftStartTime;
  const end = doc.endTime || shift.shiftEndTime;
  if (!start || !end) return null;
  return getWorkedHalfFromInThumbOnly({
    inTime: shift.inTime,
    shiftStartTime: start,
    shiftEndTime: end,
  });
}

/**
 * @returns {null|{ category: string, resolvedHalf: string, detail: string }}
 */
function classifyPartialInOutHalf(daily) {
  const hasIn = dailyHasShiftLevelIn(daily);
  const hasOut = dailyHasShiftLevelOut(daily);
  if (!hasIn || !hasOut) return null;

  const status = String(daily.status || '').toUpperCase();
  if (!['PARTIAL', 'HALF_DAY', 'PRESENT', 'OD'].includes(status)) return null;

  const halfDayMet = partialInOutSatisfiesHalfDay(daily);
  if (!halfDayMet) {
    return {
      category: 'below_half_day',
      resolvedHalf: null,
      detail: 'IN+OUT but payable/hours below half-day threshold',
    };
  }

  const shift = pickPrimaryShift(daily);
  const dateStr = String(daily.date || '').substring(0, 10);

  const fromSegments = shift ? getWorkedHalfFromShiftSegments(shift) : null;
  if (fromSegments === 'first_half' || fromSegments === 'second_half') {
    return {
      category: 'clear_segment',
      resolvedHalf: fromSegments,
      detail: `shiftSegments → ${fromSegments}`,
    };
  }
  if (fromSegments === 'both') {
    return {
      category: 'segment_both',
      resolvedHalf: resolvePartialWorkedHalfKey(daily),
      detail: 'segments marked both; collapsed by IN thumb / first_half fallback',
    };
  }

  const fromMaster = shift && dateStr ? tryPartialHalfFromShiftMasterSync(shift, dateStr) : null;
  if (fromMaster === 'first_half' || fromMaster === 'second_half') {
    return {
      category: 'shift_master_halves',
      resolvedHalf: fromMaster,
      detail: `shift master firstHalf/secondHalf → ${fromMaster}`,
    };
  }
  if (fromMaster === 'both') {
    return {
      category: 'master_both',
      resolvedHalf: resolvePartialWorkedHalfKey(daily),
      detail: 'master segments both; collapsed',
    };
  }

  const inThumb =
    (shift && getWorkedHalfFromInThumbOnly(shift)) ||
    (shift && getWorkedHalfFromInThumbOnShiftMaster(shift));
  if (inThumb === 'first_half' || inThumb === 'second_half') {
    return {
      category: 'shift_midpoint_in_thumb',
      resolvedHalf: inThumb,
      detail: `IN vs shift start/end midpoint → ${inThumb}`,
    };
  }

  return {
    category: 'fallback_first_half',
    resolvedHalf: 'first_half',
    detail: 'No segment / master half / midpoint — default first_half',
  };
}

function punchSummary(daily) {
  const shift = pickPrimaryShift(daily);
  const shifts = Array.isArray(daily.shifts) ? daily.shifts : [];
  const punchHours = shifts.reduce((a, s) => a + (Number(s?.punchHours) || 0), 0);
  return {
    inTime: shift?.inTime ? new Date(shift.inTime).toISOString() : daily.inTime,
    outTime: shift?.outTime ? new Date(shift.outTime).toISOString() : daily.outTime,
    shiftStart: shift?.shiftStartTime,
    shiftEnd: shift?.shiftEndTime,
    punchHours: Math.round(punchHours * 100) / 100,
    payableShifts: daily.payableShifts,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const [year, monthNumber] = MONTH.split('-').map(Number);
  const anchor = createISTDate(`${MONTH}-15`, '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const startStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endStr = extractISTComponents(payrollCycle.endDate).dateStr;

  console.log(`\nPay period for ${MONTH}: ${startStr} → ${endStr}\n`);
  console.log('Criteria: IN+OUT, half-day threshold MET, half NOT decidable → first_half fallback\n');

  const query = {
    date: { $gte: startStr, $lte: endStr },
    status: { $in: ['PARTIAL', 'HALF_DAY', 'PRESENT', 'OD'] },
  };
  if (EMP_FILTER.length) {
    query.employeeNumber = { $in: EMP_FILTER };
  }

  const dailies = await AttendanceDaily.find(query)
    .select('employeeNumber date status payableShifts shifts inTime outTime totalExpectedHours policyMeta')
    .populate('shifts.shiftId', 'name startTime endTime firstHalf secondHalf')
    .sort({ date: 1, employeeNumber: 1 })
    .lean();

  const fallbackRows = [];
  const belowHalf = [];
  const otherInOut = [];

  for (const daily of dailies) {
    const cls = classifyPartialInOutHalf(daily);
    if (!cls) continue;

    const empNo = String(daily.employeeNumber || '').trim().toUpperCase();
    const credits = partialSingleShiftHalfCredits(daily);
    const row = {
      empNo,
      date: daily.date,
      status: daily.status,
      category: cls.category,
      resolvedHalf: cls.resolvedHalf,
      detail: cls.detail,
      attFirst: credits.attFirst,
      attSecond: credits.attSecond,
      ...punchSummary(daily),
    };

    if (cls.category === 'fallback_first_half') {
      fallbackRows.push(row);
    } else if (cls.category === 'below_half_day') {
      belowHalf.push(row);
    } else if (cls.category === 'segment_both' || cls.category === 'master_both') {
      fallbackRows.push({ ...row, note: 'collapsed from both' });
    } else {
      otherInOut.push(row);
    }
  }

  const nameByEmp = new Map();
  if (fallbackRows.length || belowHalf.length) {
    const empNos = [...new Set([...fallbackRows, ...belowHalf].map((r) => r.empNo))];
    const emps = await Employee.find({ emp_no: { $in: empNos } })
      .select('emp_no employee_name department_id')
      .populate('department_id', 'name')
      .lean();
    for (const e of emps) {
      nameByEmp.set(String(e.emp_no).toUpperCase(), {
        name: e.employee_name,
        dept: e.department_id?.name || '',
      });
    }
  }

  console.log('='.repeat(80));
  console.log(`FALLBACK FIRST HALF (half-day met, could not decide half): ${fallbackRows.length} rows`);
  console.log('='.repeat(80));
  for (const r of fallbackRows) {
    const meta = nameByEmp.get(r.empNo) || {};
    console.log(
      [
        r.date,
        r.empNo,
        meta.name || '?',
        meta.dept || '',
        `status=${r.status}`,
        `payable=${r.payableShifts}`,
        `punchH=${r.punchHours}`,
        `credit=${r.attFirst}+${r.attSecond}`,
        r.note || r.detail,
      ].join(' | ')
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log(`BELOW HALF-DAY (IN+OUT → absent path): ${belowHalf.length} rows`);
  console.log('='.repeat(80));
  for (const r of belowHalf.slice(0, 50)) {
    const meta = nameByEmp.get(r.empNo) || {};
    console.log(
      `${r.date} | ${r.empNo} | ${meta.name || '?'} | status=${r.status} | payable=${r.payableShifts} | punchH=${r.punchHours}`
    );
  }
  if (belowHalf.length > 50) console.log(`... and ${belowHalf.length - 50} more`);

  console.log('\n' + '='.repeat(80));
  console.log(`OTHER IN+OUT (half-day met, half decided clearly): ${otherInOut.length} rows`);
  console.log('='.repeat(80));
  const byCat = {};
  for (const r of otherInOut) {
    byCat[r.category] = (byCat[r.category] || 0) + 1;
  }
  console.log('By resolution:', byCat);

  const summary = {
    payPeriod: `${startStr}..${endStr}`,
    month: MONTH,
    scannedDailies: dailies.length,
    fallbackFirstHalf: fallbackRows.length,
    belowHalfDay: belowHalf.length,
    clearResolution: otherInOut.length,
    byCategory: byCat,
  };
  console.log('\nSummary:', summary);

  const outPath = require('path').join(
    __dirname,
    `may_partial_inout_half_report_${MONTH.replace('-', '_')}.json`
  );
  const fs = require('fs');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        summary,
        fallbackFirstHalf: fallbackRows.map((r) => ({
          ...r,
          employeeName: nameByEmp.get(r.empNo)?.name,
          department: nameByEmp.get(r.empNo)?.dept,
        })),
        belowHalfDay: belowHalf.slice(0, 500).map((r) => ({
          ...r,
          employeeName: nameByEmp.get(r.empNo)?.name,
        })),
      },
      null,
      2
    ),
    'utf8'
  );
  console.log('\nWrote:', outPath);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
