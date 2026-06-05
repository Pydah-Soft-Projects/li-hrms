/**
 * Audit AttendanceDaily late-in / early-out against configured grace periods.
 * Interactive: pick department (or division) → payroll month → audit or fix.
 *
 * Usage (from backend folder):
 *   node scripts/audit_fix_grace_late_early_scope.js
 *   node scripts/audit_fix_grace_late_early_scope.js --month=2026-05 --division-indexes=1 --department-indexes=2
 *   node scripts/audit_fix_grace_late_early_scope.js --month=2026-05 --division-indexes=1 --fix
 *   DRY_RUN=1 node scripts/audit_fix_grace_late_early_scope.js --month=2026-05 --all
 *
 * Flags:
 *   --month=YYYY-MM     Payroll month (required unless MONTH env set)
 *   --pick              Force interactive scope selection
 *   --division-indexes=1,2
 *   --department-indexes=3
 *   --all               All employees in month
 *   --emp=101,102       Specific employee numbers
 *   --fix               Reprocess mismatched days (default: audit only)
 *   --dry-run           Alias for audit-only (no fix even if --fix)
 *   --limit=N           Max mismatched days to fix (0 = unlimited)
 *   --help
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Shift = require('../shifts/model/Shift');
const Settings = require('../settings/model/Settings');

const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');
const {
  calculateLateIn,
  calculateEarlyOut,
} = require('../shifts/services/shiftDetectionService');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');

function parseArgs() {
  const out = {
    month: process.env.MONTH || null,
    pick: false,
    all: false,
    fix: false,
    dryRun: process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true',
    empCsv: process.env.EMP_LIST || '',
    divisionIndexes: '',
    departmentIndexes: '',
    limit: 0,
    help: false,
  };
  for (const raw of process.argv.slice(2)) {
    if (raw === '--help' || raw === '-h') out.help = true;
    else if (raw === '--pick') out.pick = true;
    else if (raw === '--all') out.all = true;
    else if (raw === '--fix') out.fix = true;
    else if (raw === '--dry-run') out.dryRun = true;
    else if (raw.startsWith('--month=')) out.month = raw.slice('--month='.length);
    else if (raw.startsWith('--emp=')) out.empCsv = raw.slice('--emp='.length);
    else if (raw.startsWith('--division-indexes=')) out.divisionIndexes = raw.slice('--division-indexes='.length);
    else if (raw.startsWith('--department-indexes=')) out.departmentIndexes = raw.slice('--department-indexes='.length);
    else if (raw.startsWith('--limit=')) out.limit = parseInt(raw.slice('--limit='.length), 10) || 0;
  }
  return out;
}

function normEmp(v) {
  return String(v || '').trim().toUpperCase();
}

function parseCsvInts(s) {
  if (!s) return [];
  return String(s)
    .split(/[,;\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
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

async function askChoice(rl, prompt, max, { allowEmpty = false, emptyLabel = 'skip' } = {}) {
  const hint = allowEmpty ? `1–${max}, or Enter to ${emptyLabel}` : `1–${max}`;
  for (;;) {
    const raw = (await ask(rl, `${prompt} [${hint}]: `)).trim();
    if (!raw && allowEmpty) return null;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= max) return n;
    console.log(`  Enter a number ${allowEmpty ? `or press Enter to ${emptyLabel}` : ''}.`);
  }
}

function fmtTime(d) {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt);
}

function numOrZero(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function minutesDiffer(stored, expected, tolerance = 0.5) {
  return Math.abs(numOrZero(stored) - numOrZero(expected)) > tolerance;
}

function boolDiffer(stored, expected) {
  return Boolean(stored) !== Boolean(expected);
}

function sortShifts(shifts) {
  return [...(shifts || [])].sort((a, b) => {
    const n = (a.shiftNumber || 0) - (b.shiftNumber || 0);
    if (n !== 0) return n;
    return new Date(a.inTime || 0) - new Date(b.inTime || 0);
  });
}

/**
 * Expected late/early using same helpers as shift detection (global grace > shift grace > 15).
 * Split segments after the first use synthetic IN at shift boundary — no late-in penalty.
 */
function computeExpectedGrace(shift, dateStr, generalConfig, splitIdx, shiftGraceById) {
  const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
  const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

  const shiftId = shift.shiftId?._id || shift.shiftId;
  const shiftGrace =
    shift.shiftId?.gracePeriod ??
    (shiftId ? shiftGraceById.get(String(shiftId)) : null) ??
    15;

  const startTime = shift.shiftStartTime;
  const endTime = shift.shiftEndTime;

  let expectedLateInMinutes = null;
  let expectedIsLateIn = false;

  if (shift.inTime && startTime && splitIdx === 0) {
    const late = calculateLateIn(
      shift.inTime,
      startTime,
      shiftGrace,
      dateStr,
      globalLateInGrace
    );
    if (late > 0) {
      expectedLateInMinutes = late;
      expectedIsLateIn = true;
    }
  }

  let expectedEarlyOutMinutes = null;
  let expectedIsEarlyOut = false;

  const status = String(shift.status || '').toUpperCase();
  if (shift.outTime && endTime && startTime && status !== 'HALF_DAY') {
    const early = calculateEarlyOut(
      shift.outTime,
      endTime,
      startTime,
      dateStr,
      globalEarlyOutGrace,
      shiftGrace
    );
    if (early != null && early > 0) {
      expectedEarlyOutMinutes = early;
      expectedIsEarlyOut = true;
    }
  }

  return {
    expectedLateInMinutes,
    expectedIsLateIn,
    expectedEarlyOutMinutes,
    expectedIsEarlyOut,
    shiftGrace,
    globalLateInGrace,
    globalEarlyOutGrace,
  };
}

function auditDailyRecord(daily, generalConfig, shiftGraceById) {
  const issues = [];
  const sorted = sortShifts(daily.shifts);

  sorted.forEach((shift, splitIdx) => {
    if (!shift.inTime && !shift.outTime) return;
    if (!shift.shiftStartTime || !shift.shiftEndTime) return;

    const exp = computeExpectedGrace(shift, daily.date, generalConfig, splitIdx, shiftGraceById);

    const lateMinBad = minutesDiffer(shift.lateInMinutes, exp.expectedLateInMinutes);
    const lateFlagBad = boolDiffer(shift.isLateIn, exp.expectedIsLateIn);
    const earlyMinBad = minutesDiffer(shift.earlyOutMinutes, exp.expectedEarlyOutMinutes);
    const earlyFlagBad = boolDiffer(shift.isEarlyOut, exp.expectedIsEarlyOut);

    if (lateMinBad || lateFlagBad || earlyMinBad || earlyFlagBad) {
      issues.push({
        shiftNumber: shift.shiftNumber || splitIdx + 1,
        shiftName: shift.shiftName || '-',
        inTime: shift.inTime,
        outTime: shift.outTime,
        shiftStartTime: shift.shiftStartTime,
        shiftEndTime: shift.shiftEndTime,
        splitIdx,
        stored: {
          isLateIn: shift.isLateIn,
          lateInMinutes: shift.lateInMinutes,
          isEarlyOut: shift.isEarlyOut,
          earlyOutMinutes: shift.earlyOutMinutes,
        },
        expected: {
          isLateIn: exp.expectedIsLateIn,
          lateInMinutes: exp.expectedLateInMinutes,
          isEarlyOut: exp.expectedIsEarlyOut,
          earlyOutMinutes: exp.expectedEarlyOutMinutes,
        },
        grace: {
          shiftGrace: exp.shiftGrace,
          globalLateInGrace: exp.globalLateInGrace,
          globalEarlyOutGrace: exp.globalEarlyOutGrace,
        },
      });
    }
  });

  return issues;
}

async function chooseScopeInteractive(divisions, departmentsByDiv) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n=== Scope ===');
    console.log('  1) All employees (entire org for selected month)');
    console.log('  2) Department (direct - recommended)');
    console.log('  3) Division only');
    console.log('  4) Division + Department');
    const mode = await askChoice(rl, 'Select scope', 4);

    if (mode === 1) {
      return { mode: 'all', divIds: [], deptIds: [] };
    }

    if (mode === 2) {
      const allDepartments = [];
      for (const arr of departmentsByDiv.values()) {
        for (const dep of arr || []) allDepartments.push(dep);
      }
      allDepartments.sort((a, b) =>
        String(a.name || a.department_name || '').localeCompare(String(b.name || b.department_name || ''), 'en')
      );

      if (!allDepartments.length) {
        console.log('\nNo departments found. Falling back to All employees.');
        return { mode: 'all', divIds: [], deptIds: [] };
      }

      console.log('\nDepartments:');
      allDepartments.forEach((dep, i) => {
        console.log(`  ${i + 1}) ${dep.name || dep.department_name || dep._id}`);
      });
      const depChoice = await askChoice(rl, 'Department', allDepartments.length);
      const deptIds = [String(allDepartments[depChoice - 1]._id)];
      return { mode: 'department_only', divIds: [], deptIds };
    }

    console.log('\nDivisions:');
    divisions.forEach((d, i) => {
      console.log(`  ${i + 1}) ${d.name || d.division_name || d._id}`);
    });
    const divChoice = await askChoice(rl, 'Division', divisions.length);
    const division = divisions[divChoice - 1];
    const divIds = [String(division._id)];

    if (mode === 3) {
      return { mode: 'division', divIds, deptIds: [] };
    }

    const deptList = departmentsByDiv.get(String(division._id)) || [];
    if (!deptList.length) {
      console.log('\nNo departments linked to this division. Using division scope only.');
      return { mode: 'division', divIds, deptIds: [] };
    }

    console.log(`\nDepartments in ${division.name || division.division_name}:`);
    deptList.forEach((dep, i) => {
      console.log(`  ${i + 1}) ${dep.name || dep.department_name || dep._id}`);
    });
    const depChoice = await askChoice(rl, 'Department', deptList.length);
    const deptIds = [String(deptList[depChoice - 1]._id)];

    return { mode: 'department', divIds, deptIds };
  } finally {
    rl.close();
  }
}

async function chooseMonthInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const raw = (await ask(rl, `Payroll month YYYY-MM [${defaultMonth}]: `)).trim();
    const month = raw || defaultMonth;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error(`Invalid month: ${month}`);
    }
    return month;
  } finally {
    rl.close();
  }
}

async function chooseFixModeInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n=== Action ===');
    console.log('  1) Audit only (report mismatches)');
    console.log('  2) Audit + fix (reprocess mismatched days)');
    const choice = await askChoice(rl, 'Action', 2);
    return choice === 2;
  } finally {
    rl.close();
  }
}

function printHelp() {
  console.log(`
Audit / fix late-in & early-out grace on AttendanceDaily.

Interactive:
  node scripts/audit_fix_grace_late_early_scope.js

CLI examples:
  node scripts/audit_fix_grace_late_early_scope.js --month=2026-05 --pick
  node scripts/audit_fix_grace_late_early_scope.js --month=2026-05 --division-indexes=1 --department-indexes=2
  node scripts/audit_fix_grace_late_early_scope.js --month=2026-05 --division-indexes=1 --fix
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  let month = args.month;
  if (!month && args.pick) {
    month = await chooseMonthInteractive();
  }
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.error('Pass --month=YYYY-MM or use --pick for interactive month');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const generalConfig = (await Settings.getSettingsByCategory('general')) || {};
  console.log('Grace settings:');
  console.log(`  late_in_grace_time  = ${generalConfig.late_in_grace_time ?? '(shift/default)'}`);
  console.log(`  early_out_grace_time = ${generalConfig.early_out_grace_time ?? '(shift/default)'}`);

  const [year, monthNumber] = month.split('-').map(Number);
  const mid = createISTDate(`${year}-${String(monthNumber).padStart(2, '0')}-15`);
  const periodInfo = await dateCycleService.getPeriodInfo(mid);
  const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;

  const divisions = await Division.find({})
    .select('_id name division_name code')
    .sort({ name: 1, division_name: 1 })
    .lean();

  const departments = await Department.find({})
    .select('_id name department_name division_id')
    .sort({ name: 1, department_name: 1 })
    .lean();

  const departmentsByDiv = new Map();
  for (const dep of departments) {
    const key = String(dep.division_id || '');
    const arr = departmentsByDiv.get(key) || [];
    arr.push(dep);
    departmentsByDiv.set(key, arr);
  }

  let scope = { mode: 'all', divIds: [], deptIds: [] };
  const directEmp = parseEmpCsv(args.empCsv);

  if (directEmp.length > 0) {
    scope = { mode: 'emp', empNos: directEmp };
  } else if (args.pick || (!args.all && !args.divisionIndexes)) {
    scope = await chooseScopeInteractive(divisions, departmentsByDiv);
  } else if (args.divisionIndexes) {
    const divIdx = parseCsvInts(args.divisionIndexes);
    const divIds = divIdx.map((i) => divisions[i - 1]).filter(Boolean).map((d) => String(d._id));
    const deptPool = [];
    divIds.forEach((did) => (departmentsByDiv.get(did) || []).forEach((d) => deptPool.push(d)));
    const depIdx = parseCsvInts(args.departmentIndexes);
    const deptIds = depIdx.map((i) => deptPool[i - 1]).filter(Boolean).map((d) => String(d._id));
    scope =
      deptIds.length > 0
        ? { mode: 'department', divIds, deptIds }
        : { mode: 'division', divIds, deptIds: [] };
  } else if (args.all) {
    scope = { mode: 'all', divIds: [], deptIds: [] };
  }

  let targetEmpNos = [];
  if (scope.mode === 'emp') {
    targetEmpNos = scope.empNos;
  } else {
    const q = { is_active: { $ne: false } };
    if (scope.mode === 'division') {
      q.division_id = { $in: scope.divIds };
    } else if (scope.mode === 'department') {
      q.division_id = { $in: scope.divIds };
      q.department_id = { $in: scope.deptIds };
    } else if (scope.mode === 'department_only') {
      q.department_id = { $in: scope.deptIds };
    }
    const rows = await Employee.find(q).select('emp_no employee_name division_id department_id').lean();
    targetEmpNos = rows.map((r) => normEmp(r.emp_no)).filter(Boolean);
  }
  targetEmpNos = Array.from(new Set(targetEmpNos));

  if (!targetEmpNos.length) {
    console.log('\nNo employees in selected scope.');
    await mongoose.disconnect();
    return;
  }

  let doFix = args.fix && !args.dryRun;
  if (!args.fix && !args.dryRun && (args.pick || (!args.all && !args.divisionIndexes && !directEmp.length))) {
    doFix = await chooseFixModeInteractive();
  }

  const shiftDocs = await Shift.find({}).select('_id gracePeriod name').lean();
  const shiftGraceById = new Map(shiftDocs.map((s) => [String(s._id), s.gracePeriod ?? 15]));

  console.log('\n=== Audit scope ===');
  console.log('Month:', month, `| Payroll window: ${startDateStr} .. ${endDateStr}`);
  console.log('Scope mode:', scope.mode);
  console.log('Employees:', targetEmpNos.length);
  console.log('Action:', doFix ? 'AUDIT + FIX (reprocess)' : 'AUDIT ONLY');

  const dailyRows = await AttendanceDaily.find({
    employeeNumber: { $in: targetEmpNos },
    date: { $gte: startDateStr, $lte: endDateStr },
    'shifts.0': { $exists: true },
  })
    .select('employeeNumber date shifts totalLateInMinutes totalEarlyOutMinutes status locked')
    .sort({ employeeNumber: 1, date: 1 })
    .lean();

  console.log('AttendanceDaily rows with shifts:', dailyRows.length);

  const mismatches = [];
  let shiftIssues = 0;

  for (const daily of dailyRows) {
    const issues = auditDailyRecord(daily, generalConfig, shiftGraceById);
    if (issues.length) {
      shiftIssues += issues.length;
      mismatches.push({ employeeNumber: daily.employeeNumber, date: daily.date, locked: daily.locked, issues });
    }
  }

  console.log('\n=== Audit results ===');
  console.log('Days with grace mismatch:', mismatches.length);
  console.log('Shift rows with mismatch:', shiftIssues);

  const sampleLimit = 30;
  let printed = 0;
  for (const row of mismatches) {
    if (printed >= sampleLimit) {
      console.log(`\n... and ${mismatches.length - sampleLimit} more day(s) (use --fix to repair all)`);
      break;
    }
    console.log(`\n${row.employeeNumber} | ${row.date}${row.locked ? ' [LOCKED]' : ''}`);
    for (const issue of row.issues) {
      console.log(
        `  Shift #${issue.shiftNumber} (${issue.shiftName}) splitIdx=${issue.splitIdx}` +
          ` | IN ${fmtTime(issue.inTime)} OUT ${fmtTime(issue.outTime)}` +
          ` | shift ${issue.shiftStartTime}-${issue.shiftEndTime}`
      );
      console.log(
        `    grace: globalLate=${issue.grace.globalLateInGrace ?? '-'} globalEarly=${issue.grace.globalEarlyOutGrace ?? '-'} shiftGrace=${issue.grace.shiftGrace}`
      );
      console.log(
        `    LATE  stored: isLate=${!!issue.stored.isLateIn} min=${issue.stored.lateInMinutes ?? 0}` +
          ` | expected: isLate=${issue.expected.isLateIn} min=${issue.expected.lateInMinutes ?? 0}`
      );
      console.log(
        `    EARLY stored: isEarly=${!!issue.stored.isEarlyOut} min=${issue.stored.earlyOutMinutes ?? 0}` +
          ` | expected: isEarly=${issue.expected.isEarlyOut} min=${issue.expected.earlyOutMinutes ?? 0}`
      );
    }
    printed += 1;
  }

  if (!doFix) {
    console.log('\nAudit complete. Re-run with --fix to reprocess mismatched days.');
    await mongoose.disconnect();
    return;
  }

  if (!mismatches.length) {
    console.log('\nNothing to fix.');
    await mongoose.disconnect();
    return;
  }

  const toFix = args.limit > 0 ? mismatches.slice(0, args.limit) : mismatches;
  let fixed = 0;
  let skippedLocked = 0;
  let failed = 0;

  console.log(`\n=== Fixing ${toFix.length} day(s) via attendance reprocess ===`);

  for (const row of toFix) {
    if (row.locked) {
      skippedLocked += 1;
      console.log(`SKIP locked: ${row.employeeNumber} ${row.date}`);
      continue;
    }
    try {
      const result = await reprocessAttendanceForEmployeeDate(row.employeeNumber, row.date);
      if (result?.success) {
        const refreshed = await AttendanceDaily.findOne({
          employeeNumber: row.employeeNumber,
          date: row.date,
        })
          .select('shifts')
          .lean();
        const stillBad = auditDailyRecord(refreshed, generalConfig, shiftGraceById);
        if (stillBad.length) {
          failed += 1;
          console.log(`WARN still mismatched after fix: ${row.employeeNumber} ${row.date} (${stillBad.length} shift(s))`);
        } else {
          fixed += 1;
          console.log(`OK ${row.employeeNumber} ${row.date}`);
        }
      } else {
        failed += 1;
        console.log(`FAIL ${row.employeeNumber} ${row.date}: ${result?.error || 'unknown'}`);
      }
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${row.employeeNumber} ${row.date}: ${e.message}`);
    }
  }

  console.log('\n=== Fix summary ===');
  console.log('Fixed OK:', fixed);
  console.log('Skipped (locked):', skippedLocked);
  console.log('Failed / still bad:', failed);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
