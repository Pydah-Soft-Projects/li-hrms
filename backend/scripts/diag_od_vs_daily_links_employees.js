/**
 * Diagnose OD vs AttendanceDaily linkage for selected employees in a payroll month.
 *
 * Usage:
 *   node scripts/diag_od_vs_daily_links_employees.js
 *   node scripts/diag_od_vs_daily_links_employees.js --month 2026-04 --emps 2213,1592,2212
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const OD = require('../leaves/model/OD');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !String(process.argv[i + 1]).startsWith('--')) return process.argv[i + 1];
  return null;
}

async function monthToWindow(monthStr) {
  const periodInfo = await dateCycleService.getPeriodInfo(createISTDate(`${monthStr}-15`));
  return {
    start: extractISTComponents(periodInfo.payrollCycle.startDate).dateStr,
    end: extractISTComponents(periodInfo.payrollCycle.endDate).dateStr,
  };
}

function odShape(od) {
  return {
    odId: String(od._id),
    emp_no: od.emp_no,
    status: od.status,
    fromDateIST: extractISTComponents(od.fromDate).dateStr,
    toDateIST: extractISTComponents(od.toDate).dateStr,
    odType_extended: od.odType_extended || null,
    isHalfDay: !!od.isHalfDay,
    halfDayType: od.halfDayType || null,
    durationHours: od.durationHours ?? null,
    odStartTime: od.odStartTime || null,
    odEndTime: od.odEndTime || null,
    isCOEligible: od.isCOEligible === true,
  };
}

function dailyShape(d) {
  return {
    dailyId: String(d._id),
    date: d.date,
    status: d.status,
    payableShifts: d.payableShifts,
    odHours: d.odHours ?? 0,
    odDetails: d.odDetails
      ? {
          odId: d.odDetails.odId ? String(d.odDetails.odId) : null,
          odType: d.odDetails.odType || null,
          durationHours: d.odDetails.durationHours ?? null,
          odStartTime: d.odDetails.odStartTime || null,
          odEndTime: d.odDetails.odEndTime || null,
        }
      : null,
  };
}

function looselyMatches(od, d) {
  if (!d?.odDetails) return false;
  const typeA = String(od.odType_extended || '').toLowerCase();
  const typeB = String(d.odDetails.odType || '').toLowerCase();
  if (typeA && typeB && typeA !== typeB) return false;
  const dhA = Number(od.durationHours) || 0;
  const dhB = Number(d.odDetails.durationHours) || 0;
  if (dhA > 0 && dhB > 0 && Math.abs(dhA - dhB) > 0.01) return false;
  if (od.odStartTime && d.odDetails.odStartTime && od.odStartTime !== d.odDetails.odStartTime) return false;
  if (od.odEndTime && d.odDetails.odEndTime && od.odEndTime !== d.odDetails.odEndTime) return false;
  return true;
}

async function main() {
  const month = getArg('--month') || '2026-04';
  const empsRaw = getArg('--emps') || '2213,1592,2212';
  const emps = empsRaw
    .split(/[,;]\s*|\s+/)
    .map((x) => String(x || '').trim().toUpperCase())
    .filter(Boolean);

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI);

  const win = await monthToWindow(month);
  console.log(JSON.stringify({ month, payroll_window: `${win.start}..${win.end}`, employees: emps }, null, 2));

  for (const empNo of emps) {
    const emp = await Employee.findOne({ emp_no: empNo }).select('_id emp_no employee_name').lean();
    console.log('\n==================================================');
    console.log(`Employee ${empNo} ${emp?.employee_name || '(not found in employee master)'}`);
    if (!emp) continue;

    const approvedOds = await OD.find({
      employeeId: emp._id,
      status: 'approved',
      isActive: true,
      fromDate: { $lte: createISTDate(win.end, '23:59') },
      toDate: { $gte: createISTDate(win.start, '00:00') },
    })
      .sort({ fromDate: 1 })
      .lean();

    console.log('\nApproved ODs overlapping period:');
    for (const od of approvedOds) {
      console.log(JSON.stringify(odShape(od)));
    }

    const allDaily = await AttendanceDaily.find({
      employeeNumber: empNo,
      date: { $gte: win.start, $lte: win.end },
    })
      .sort({ date: 1 })
      .lean();

    const odRelevantDailies = allDaily.filter(
      (d) => !!d.odDetails || (Number(d.odHours) || 0) > 0 || ['OD', 'WEEK_OFF', 'HOLIDAY'].includes(String(d.status || '').toUpperCase())
    );
    console.log('\nAttendance dailies (OD/HOL/WO relevant):');
    for (const d of odRelevantDailies) {
      console.log(JSON.stringify(dailyShape(d)));
    }

    console.log('\nPer-OD link check (exact + previous-day heuristic):');
    const dailyByDate = new Map(allDaily.map((d) => [d.date, d]));
    for (const od of approvedOds) {
      const days = getAllDatesInRange(extractISTComponents(od.fromDate).dateStr, extractISTComponents(od.toDate).dateStr)
        .filter((d) => d >= win.start && d <= win.end);
      for (const day of days) {
        const exact = dailyByDate.get(day);
        const prevDate = extractISTComponents(new Date(`${day}T12:00:00+05:30`)).dateStr;
        const prevObj = new Date(`${prevDate}T12:00:00+05:30`);
        prevObj.setDate(prevObj.getDate() - 1);
        const prev = dailyByDate.get(extractISTComponents(prevObj).dateStr);
        const exactHasOdId = !!(exact?.odDetails?.odId && String(exact.odDetails.odId) === String(od._id));
        const exactLoose = looselyMatches(od, exact);
        const prevHasOdId = !!(prev?.odDetails?.odId && String(prev.odDetails.odId) === String(od._id));
        const prevLoose = looselyMatches(od, prev);
        console.log(
          JSON.stringify({
            odId: String(od._id),
            expectedDate: day,
            exactDate: exact ? { date: exact.date, odDetails: dailyShape(exact).odDetails, status: exact.status } : null,
            previousDate: prev ? { date: prev.date, odDetails: dailyShape(prev).odDetails, status: prev.status } : null,
            exactHasOdId,
            exactLooseMatch: exactLoose,
            previousHasOdId: prevHasOdId,
            previousLooseMatch: prevLoose,
          })
        );
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

