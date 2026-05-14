/**
 * Admission Cell employees (all divisions): list AttendanceDaily rows in a date range,
 * compare single-shift partial half helpers + reconciliation half-credits with MonthlyAttendanceSummary
 * contributingDates after optionally running the real services.
 *
 * Usage:
 *   node scripts/verify_admission_cell_attendance_partial_and_summary.js --from=2026-04-01 --to=2026-04-30
 *   node scripts/verify_admission_cell_attendance_partial_and_summary.js --from=2026-04-01 --to=2026-04-30 --apply
 *   node scripts/verify_admission_cell_attendance_partial_and_summary.js --group="Admission Cell" --from=... --to=... --apply --limit=10
 *
 * Flags:
 *   --from=YYYY-MM-DD   (required)
 *   --to=YYYY-MM-DD     (required)
 *   --group=NAME        default Admission Cell (EmployeeGroup.name match, case-insensitive substring)
 *   --apply             run leave/OD reconciliation per day + calculateMonthlySummary per affected payroll month (writes DB)
 *   --limit=N           max employees (default 200)
 *   --emp-no=XXX        restrict to one employee number (optional)
 *   --out=FILE.json     write full JSON report (totals + all rows)
 *
 * Without --apply: read-only — prints helper/recon halves vs existing summary (may be stale).
 */

'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const EmployeeGroup = require('../employees/model/EmployeeGroup');
const Employee = require('../employees/model/Employee');
require('../departments/model/Division');
require('../departments/model/Department');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const OD = require('../leaves/model/OD');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, getAllDatesInRange } = require('../shared/utils/dateUtils');
const { getSingleShiftPartialPunchHalves } = require('../shared/utils/singleShiftPartialHalves');
const {
  computeRawAttendanceHalfCredits,
  runLeaveAttendanceReconciliation,
} = require('../leaves/services/leaveAttendanceReconciliationService');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

function parseArgs(argv) {
  const out = { help: false, apply: false };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') out.help = true;
    if (raw === '--apply') out.apply = true;
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findApprovedOdsForDate(employeeId, dateStr) {
  const start = createISTDate(dateStr, '00:00');
  const end = createISTDate(dateStr, '23:59');
  return OD.find({
    employeeId,
    status: 'approved',
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('isHalfDay halfDayType odType_extended fromDate toDate')
    .lean();
}

function pickContributingForDate(summaryDoc, dateStr) {
  const cd = summaryDoc?.contributingDates;
  if (!cd) return {};
  const pick = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && x.date === dateStr) : []);
  return {
    present: pick(cd.present),
    partial: pick(cd.partial),
    payableShifts: pick(cd.payableShifts),
    leaves: pick(cd.leaves),
    paidLeaves: pick(cd.paidLeaves),
    lopLeaves: pick(cd.lopLeaves),
    ods: pick(cd.ods),
    absent: pick(cd.absent),
  };
}

async function loadSummary(employeeId, year, monthNumber) {
  const monthStr = `${year}-${String(monthNumber).padStart(2, '0')}`;
  return MonthlyAttendanceSummary.findOne({ employeeId, month: monthStr }).lean();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 26).join('\n'));
    process.exit(0);
  }

  const from = args.from;
  const to = args.to;
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('Required: --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exit(1);
  }
  if (from > to) {
    console.error('Invalid range: from > to');
    process.exit(1);
  }

  const groupName = (args.group && String(args.group).trim()) || 'Admission Cell';
  const limit = Math.min(500, Math.max(1, parseInt(args.limit, 10) || 200));
  const empNoFilter = args['emp-no'] ? String(args['emp-no']).trim().toUpperCase() : null;

  await mongoose.connect(MONGODB_URI);
  console.log('Connected. group=', groupName, 'range=', from, '..', to, 'apply=', !!args.apply, 'limit=', limit);

  const groups = await EmployeeGroup.find({
    name: new RegExp(escapeRegex(groupName), 'i'),
    isActive: { $ne: false },
  })
    .select('_id name')
    .lean();

  if (!groups.length) {
    console.error('No EmployeeGroup matched:', groupName);
    await mongoose.disconnect();
    process.exit(2);
  }
  console.log('Matched groups:', groups.map((g) => `${g.name} (${g._id})`).join(', '));

  const groupIds = groups.map((g) => g._id);
  const empQuery = { employee_group_id: { $in: groupIds }, is_active: { $ne: false } };
  if (empNoFilter) empQuery.emp_no = empNoFilter;

  const employees = await Employee.find(empQuery)
    .select('_id emp_no employee_name division_id department_id employee_group_id')
    .populate('division_id', 'name')
    .populate('department_id', 'name')
    .populate('employee_group_id', 'name')
    .limit(limit)
    .lean();

  if (!employees.length) {
    console.error('No active employees for those groups' + (empNoFilter ? ` (emp_no=${empNoFilter})` : ''));
    await mongoose.disconnect();
    process.exit(3);
  }
  console.log('Employees:', employees.length);

  const settingsDoc = await AttendanceSettings.getSettings().catch(() => null);
  const pm = AttendanceSettings.getProcessingMode(settingsDoc);
  const singleShiftMode = pm.mode === 'single_shift';
  console.log('Attendance processingMode:', pm.mode, '| singleShiftMode for helpers:', singleShiftMode);
  if (!singleShiftMode) {
    console.warn('WARNING: partial IN/OUT half credits are designed for single_shift.');
  }

  const dates = getAllDatesInRange(from, to);
  const outPath = args.out ? path.resolve(process.cwd(), String(args.out)) : null;
  /** @type {Array<object>} */
  const reportRows = [];
  let reconErrors = 0;
  let summaryErrors = 0;

  for (const emp of employees) {
    const empNo = String(emp.emp_no || '').trim().toUpperCase();
    if (!empNo) continue;

    const monthKeys = new Set();

    for (const dateStr of dates) {
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr }).lean();
      if (!daily) continue;

      const ods = await findApprovedOdsForDate(emp._id, dateStr);
      const partialHalves = getSingleShiftPartialPunchHalves(daily);
      const reconHalves = computeRawAttendanceHalfCredits(daily, ods, { singleShiftMode });

      const helperReconOk =
        String(daily.status || '').toUpperCase() !== 'PARTIAL' ||
        (partialHalves.attFirst === reconHalves.attFirst && partialHalves.attSecond === reconHalves.attSecond);

      const periodInfo = await dateCycleService.getPeriodInfo(createISTDate(dateStr));
      const { year, month: monthNumber } = periodInfo.payrollCycle;
      const payrollMonth = `${year}-${String(monthNumber).padStart(2, '0')}`;
      monthKeys.add(`${year}|${monthNumber}`);

      if (args.apply) {
        try {
          const dailyDoc = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr });
          if (dailyDoc) {
            await runLeaveAttendanceReconciliation(emp, dateStr, dailyDoc);
          }
        } catch (e) {
          reconErrors += 1;
          console.error('[recon]', empNo, dateStr, e.message);
        }
      }

      const flags = [];
      if (!helperReconOk) flags.push('HELPER_RECON_MISMATCH');
      if (String(daily.status || '').toUpperCase() === 'PARTIAL' && singleShiftMode) {
        if (partialHalves.workedHalf && reconHalves.attFirst + reconHalves.attSecond < 0.5 - 1e-6) {
          flags.push('PARTIAL_EXPECTED_HALF_MISSING_IN_RECON');
        }
      }

      reportRows.push({
        employeeId: String(emp._id),
        emp_no: empNo,
        name: emp.employee_name,
        division: emp.division_id?.name || '',
        department: emp.department_id?.name || '',
        group: emp.employee_group_id?.name || '',
        date: dateStr,
        payrollMonth,
        payrollYear: year,
        payrollMonthNumber: monthNumber,
        dailyStatus: daily.status,
        payableShifts: daily.payableShifts,
        partialHalves,
        reconHalves,
        helperReconOk,
      });
      if (flags.length) {
        reportRows[reportRows.length - 1].flags = flags;
      }
    }

    if (args.apply) {
      for (const mk of monthKeys) {
        const [y, m] = mk.split('|').map(Number);
        try {
          await calculateMonthlySummary(emp._id, empNo, y, m);
        } catch (e) {
          summaryErrors += 1;
          console.error('[summary]', empNo, y, m, e.message);
        }
      }
    }

    const empIdStr = String(emp._id);
    for (const row of reportRows) {
      if (row.employeeId !== empIdStr) continue;
      const s = await loadSummary(emp._id, row.payrollYear, row.payrollMonthNumber);
      row.contributingDates = pickContributingForDate(s, row.date);
      if (!s) row.flags = [...(row.flags || []), 'NO_SUMMARY_DOC'];
    }
  }

  const partialRows = reportRows.filter((r) => String(r.dailyStatus || '').toUpperCase() === 'PARTIAL');
  const flagged = reportRows.filter((r) => r.flags && r.flags.length);

  const totals = {
    dailiesInRange: reportRows.length,
    partialStatusDays: partialRows.length,
    rowsWithFlags: flagged.length,
    reconErrors,
    summaryErrors,
    groupName,
    from,
    to,
    apply: !!args.apply,
    limit,
    singleShiftMode,
  };

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ totals, rows: reportRows }, null, 2), 'utf8');
    console.log('\nWrote report file:', outPath);
  }

  console.log('\n=== Totals ===');
  console.log(totals);

  console.log('\n=== Sample (up to 25 rows: PARTIAL first, then flagged, then any) ===');
  const seen = new Set();
  const sample = [];
  for (const r of partialRows) {
    const k = `${r.emp_no}|${r.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    sample.push(r);
    if (sample.length >= 25) break;
  }
  for (const r of flagged) {
    const k = `${r.emp_no}|${r.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    sample.push(r);
    if (sample.length >= 25) break;
  }
  for (const r of reportRows) {
    if (sample.length >= 25) break;
    const k = `${r.emp_no}|${r.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    sample.push(r);
  }
  for (const r of sample) {
    console.log(JSON.stringify(r, null, 2));
  }

  await mongoose.disconnect();
  console.log('\nDone.');
  if (!args.apply && flagged.length) {
    console.log('Note: run with --apply to run reconciliation + refresh monthly summary, then re-check flags.');
  }
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
