/**
 * Re-process attendance from raw punches using current pipeline logic
 * (shift-level 75% gate → edge permissions → half-segments).
 *
 * Scope: all | division | department | single employee (CLI or interactive).
 *
 * Examples:
 *   node scripts/resync_attendance_interactive.js SIMPRS001 --from 2026-06-01 --to 2026-06-30
 *   node scripts/resync_attendance_interactive.js --emp 2237,119 --from 2026-06-01 --to 2026-06-30
 *   node scripts/resync_attendance_interactive.js --all --from 2026-06-01 --to 2026-06-30 --yes
 *   node scripts/resync_attendance_interactive.js --division-indexes=1 --from 2026-06-01 --to 2026-06-30
 *   node scripts/resync_attendance_interactive.js --pick --from 2026-06-01 --to 2026-06-30
 *   node scripts/resync_attendance_interactive.js --dry-run --all --from 2026-06-01 --to 2026-06-30
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Settings = require('../settings/model/Settings');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const { isEmployeeNumberDateLocked } = require('../shared/services/payrollPeriodLockService');
const { extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');

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

function addDaysStr(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + delta);
  return extractISTComponents(d).dateStr;
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    positionalEmp: null,
    all: false,
    pick: false,
    dryRun: false,
    yes: false,
    skipSummary: false,
    skipLeaveRecon: false,
    from: null,
    to: null,
    empCsv: '',
    divisionIndexes: '',
    departmentIndexes: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--all') out.all = true;
    else if (raw === '--pick') out.pick = true;
    else if (raw === '--dry-run') out.dryRun = true;
    else if (raw === '--yes' || raw === '-y') out.yes = true;
    else if (raw === '--skip-summary') out.skipSummary = true;
    else if (raw === '--skip-leave-recon') out.skipLeaveRecon = true;
    else if (raw.startsWith('--from=')) out.from = raw.slice('--from='.length);
    else if (raw === '--from' && argv[i + 1]) out.from = argv[++i];
    else if (raw.startsWith('--to=')) out.to = raw.slice('--to='.length);
    else if (raw === '--to' && argv[i + 1]) out.to = argv[++i];
    else if (raw.startsWith('--emp=')) out.empCsv = raw.slice('--emp='.length);
    else if (raw.startsWith('--division-indexes=')) out.divisionIndexes = raw.slice('--division-indexes='.length);
    else if (raw.startsWith('--department-indexes=')) out.departmentIndexes = raw.slice('--department-indexes='.length);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (!out.from) out.from = raw;
      else if (!out.to) out.to = raw;
    } else if (!raw.startsWith('--') && !out.positionalEmp) {
      out.positionalEmp = normEmp(raw);
    }
  }

  if (out.positionalEmp && !out.empCsv) {
    out.empCsv = out.positionalEmp;
  }

  return out;
}

async function chooseScopeInteractive({ divisions, departmentsByDiv }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nSelect resync scope:');
    console.log('  1) All employees');
    console.log('  2) Single / multiple employees (enter emp numbers)');
    console.log('  3) Division-wise');
    console.log('  4) Department-wise (within selected divisions)');
    const mode = (await ask(rl, 'Enter option [1-4]: ')).trim();

    if (mode === '1') return { mode: 'all', empNos: [], divIds: [], deptIds: [] };

    if (mode === '2') {
      const empCsv = await ask(rl, 'Employee number(s), comma separated: ');
      return { mode: 'emp', empNos: parseEmpCsv(empCsv), divIds: [], deptIds: [] };
    }

    console.log('\nDivisions:');
    divisions.forEach((d, i) => {
      console.log(`  ${i + 1}) ${d.code || '-'} — ${d.name || d._id}`);
    });
    const divInput = await ask(rl, 'Division index(es), comma separated: ');
    const selectedDivs = parseCsvInts(divInput)
      .map((i) => divisions[i - 1])
      .filter(Boolean);
    const divIds = selectedDivs.map((d) => String(d._id));

    if (mode === '3') return { mode: 'division', empNos: [], divIds, deptIds: [] };

    const deptRows = [];
    selectedDivs.forEach((d) => {
      (departmentsByDiv.get(String(d._id)) || []).forEach((dep) => deptRows.push(dep));
    });
    console.log('\nDepartments:');
    deptRows.forEach((dep, i) => {
      console.log(`  ${i + 1}) ${dep.code || '-'} — ${dep.name || dep._id}`);
    });
    const depInput = await ask(rl, 'Department index(es), comma separated: ');
    const deptIds = parseCsvInts(depInput)
      .map((i) => deptRows[i - 1])
      .filter(Boolean)
      .map((d) => String(d._id));

    return { mode: 'department', empNos: [], divIds, deptIds };
  } finally {
    rl.close();
  }
}

async function promptDateRangeInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const from = (await ask(rl, 'From date (YYYY-MM-DD): ')).trim();
    const to = (await ask(rl, 'To date   (YYYY-MM-DD): ')).trim();
    return { from, to };
  } finally {
    rl.close();
  }
}

async function resolveScope(args, divisions, departmentsByDiv) {
  const hasScope = args.all
    || args.empCsv
    || args.divisionIndexes
    || args.departmentIndexes;

  if (args.pick || !hasScope) {
    const picked = await chooseScopeInteractive({ divisions, departmentsByDiv });
    return picked;
  }

  if (args.all) return { mode: 'all', empNos: [], divIds: [], deptIds: [] };

  if (args.empCsv) {
    return { mode: 'emp', empNos: parseEmpCsv(args.empCsv), divIds: [], deptIds: [] };
  }

  const divIdx = parseCsvInts(args.divisionIndexes);
  const divIds = divIdx.map((i) => divisions[i - 1]).filter(Boolean).map((d) => String(d._id));

  if (args.departmentIndexes) {
    const deptRows = [];
    divIds.forEach((divId) => {
      (departmentsByDiv.get(divId) || []).forEach((dep) => deptRows.push(dep));
    });
    const depIdx = parseCsvInts(args.departmentIndexes);
    const deptIds = depIdx.map((i) => deptRows[i - 1]).filter(Boolean).map((d) => String(d._id));
    return { mode: 'department', empNos: [], divIds, deptIds };
  }

  return { mode: 'division', empNos: [], divIds, deptIds: [] };
}

async function resolveEmployeeNumbers(scope) {
  if (scope.mode === 'emp') {
    const found = await Employee.find({ emp_no: { $in: scope.empNos }, is_active: { $ne: false } })
      .select('emp_no')
      .lean();
    const foundSet = new Set(found.map((e) => e.emp_no));
    const missing = scope.empNos.filter((e) => !foundSet.has(e));
    if (missing.length) console.warn('  Warning: employee(s) not found:', missing.join(', '));
    return [...foundSet];
  }

  const q = { is_active: { $ne: false } };
  if (scope.mode === 'division' && scope.divIds.length) {
    q.division_id = { $in: scope.divIds };
  } else if (scope.mode === 'department') {
    if (scope.divIds.length) q.division_id = { $in: scope.divIds };
    if (scope.deptIds.length) q.department_id = { $in: scope.deptIds };
  }

  const rows = await Employee.find(q).select('emp_no').sort({ emp_no: 1 }).lean();
  return rows.map((r) => normEmp(r.emp_no)).filter(Boolean);
}

async function loadRawLogsForWindow(empNo, from, to) {
  const windowStart = new Date(`${addDaysStr(from, -1)}T00:00:00+05:30`);
  const windowEnd = new Date(`${addDaysStr(to, 1)}T23:59:59.999+05:30`);

  const logs = await AttendanceRawLog.find({
    employeeNumber: empNo,
    timestamp: { $gte: windowStart, $lte: windowEnd },
  })
    .sort({ timestamp: 1 })
    .lean();

  return logs.map((log) => ({
    _id: log._id,
    id: log._id,
    employeeNumber: log.employeeNumber,
    timestamp: log.timestamp,
    type: log.type || (log.punch_state === 0 || log.punch_state === '0' ? 'IN' : log.punch_state === 1 || log.punch_state === '1' ? 'OUT' : null),
    punch_state: log.punch_state,
    source: log.source,
    date: log.date,
  }));
}

async function collectDatesForEmployee(empNo, from, to) {
  const dailyDates = await AttendanceDaily.distinct('date', {
    employeeNumber: empNo,
    date: { $gte: from, $lte: to },
  });

  const punchDates = await AttendanceRawLog.distinct('date', {
    employeeNumber: empNo,
    date: { $gte: from, $lte: to },
  });

  const set = new Set([...dailyDates, ...punchDates]);
  return [...set].filter((d) => d >= from && d <= to).sort();
}

function mapLogToProcessingFormat(log) {
  let type = log.type;
  if (!type && log.punch_state != null) {
    type = log.punch_state === 0 || log.punch_state === '0' ? 'IN' : 'OUT';
  }
  return {
    _id: log._id,
    id: log._id,
    timestamp: log.timestamp,
    type,
    punch_state: type === 'IN' ? 0 : type === 'OUT' ? 1 : log.punch_state,
    source: log.source,
  };
}

async function main() {
  const args = parseArgs();

  let from = args.from;
  let to = args.to;
  if (!from || !to) {
    const interactiveDates = await promptDateRangeInteractive();
    from = from || interactiveDates.from;
    to = to || interactiveDates.to;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('Invalid date range. Use YYYY-MM-DD for --from and --to.');
    process.exit(1);
  }
  if (from > to) {
    console.error('--from must be <= --to');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/:[^:@]+@/, ':***@'));

  const { getOrgAttendanceContext, getProcessingModeForEmployeeNumber } = require('../attendance/services/processingModeResolutionService');
  const { processingMode: orgPm } = await getOrgAttendanceContext();
  console.log(`Organization attendance processing mode: ${orgPm.mode} (per-employee division overrides apply during resync)`);

  const divisions = await Division.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const departments = await Department.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const departmentsByDiv = new Map();
  for (const dep of departments) {
    const divIds = new Set();
    if (dep.division_id) divIds.add(String(dep.division_id));
    (dep.divisionDefaults || []).forEach((row) => {
      if (row?.division) divIds.add(String(row.division));
    });
    divIds.forEach((divId) => {
      if (!departmentsByDiv.has(divId)) departmentsByDiv.set(divId, []);
      departmentsByDiv.get(divId).push(dep);
    });
  }

  const scope = await resolveScope(args, divisions, departmentsByDiv);
  const empNos = await resolveEmployeeNumbers(scope);

  console.log('\n--- Resync plan ---');
  console.log('  Scope:', scope.mode);
  console.log('  Dates:', from, '→', to);
  console.log('  Employees:', empNos.length);
  console.log('  Dry run:', args.dryRun);

  if (empNos.length === 0) {
    console.error('No employees matched the selected scope.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if ((scope.mode === 'division' || scope.mode === 'department') && scope.divIds.length === 0) {
    console.error('No divisions selected. Use valid --division-indexes or interactive picker.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (scope.mode === 'department' && scope.deptIds.length === 0) {
    console.error('No departments selected. Use valid --department-indexes or interactive picker.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!args.yes && !args.dryRun) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = (await ask(rl, `\nProceed with resync for ${empNos.length} employee(s)? [y/N]: `)).trim().toLowerCase();
    rl.close();
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('Cancelled.');
      await mongoose.disconnect();
      return;
    }
  }

  if (args.skipLeaveRecon) {
    process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION = '1';
  }

  const generalConfig = await Settings.getSettingsByCategory('general');
  const stats = {
    employees: empNos.length,
    daysAttempted: 0,
    daysProcessed: 0,
    daysSkippedLocked: 0,
    daysSkippedPayroll: 0,
    daysSkippedNoPunches: 0,
    daysFailed: 0,
    errors: [],
  };

  const summaryEmployees = new Set();

  for (const empNo of empNos) {
    const dates = await collectDatesForEmployee(empNo, from, to);
    if (dates.length === 0) continue;

    const allLogs = await loadRawLogsForWindow(empNo, from, to);
    const mappedLogs = allLogs.map(mapLogToProcessingFormat);

    for (const date of dates) {
      stats.daysAttempted += 1;

      const hasPunchOnDate = mappedLogs.some((l) => extractISTComponents(l.timestamp).dateStr === date);
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date })
        .select('locked')
        .lean();

      if (daily?.locked) {
        stats.daysSkippedLocked += 1;
        continue;
      }

      if (await isEmployeeNumberDateLocked(empNo, date)) {
        stats.daysSkippedPayroll += 1;
        continue;
      }

      if (!hasPunchOnDate && !daily) {
        stats.daysSkippedNoPunches += 1;
        continue;
      }

      if (args.dryRun) {
        stats.daysProcessed += 1;
        continue;
      }

      try {
        const result = await processMultiShiftAttendance(empNo, date, mappedLogs, generalConfig);
        if (result?.skippedImmutable) {
          stats.daysSkippedLocked += 1;
          continue;
        }
        if (!result?.success) {
          stats.daysFailed += 1;
          stats.errors.push(`${empNo} ${date}: ${result?.error || result?.reason || 'unknown'}`);
          continue;
        }

        stats.daysProcessed += 1;
        summaryEmployees.add(empNo);
      } catch (err) {
        stats.daysFailed += 1;
        stats.errors.push(`${empNo} ${date}: ${err.message}`);
      }
    }

    console.log(`  Employee ${empNo}: ${dates.length} day(s) in range`);
  }

  if (!args.dryRun && !args.skipSummary && summaryEmployees.size > 0) {
    console.log('\nRefreshing monthly summaries…');
    const rangeDates = getAllDatesInRange(from, to);
    for (const empNo of summaryEmployees) {
      const seenCycleKeys = new Set();
      for (const d of rangeDates) {
        const periodInfo = await dateCycleService.getPeriodInfo(new Date(`${d}T12:00:00+05:30`));
        const pc = periodInfo.payrollCycle;
        const key = `${pc.year}-${pc.month}`;
        if (seenCycleKeys.has(key)) continue;
        seenCycleKeys.add(key);
        try {
          await recalculateOnAttendanceUpdate(empNo, d);
        } catch (err) {
          stats.errors.push(`${empNo} summary (${key}): ${err.message}`);
        }
      }
    }
  }

  console.log('\n=== Resync complete ===');
  console.log('  Employees in scope:', stats.employees);
  console.log('  Days attempted:', stats.daysAttempted);
  console.log('  Days processed:', stats.daysProcessed);
  console.log('  Skipped (daily locked):', stats.daysSkippedLocked);
  console.log('  Skipped (payroll lock):', stats.daysSkippedPayroll);
  console.log('  Skipped (no punches):', stats.daysSkippedNoPunches);
  console.log('  Failed:', stats.daysFailed);
  if (stats.errors.length) {
    console.log('\nFirst errors:');
    stats.errors.slice(0, 20).forEach((e) => console.log('  -', e));
    if (stats.errors.length > 20) console.log(`  … and ${stats.errors.length - 20} more`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
