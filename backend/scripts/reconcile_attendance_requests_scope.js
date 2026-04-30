/**
 * Backfill attendance-request reconciliation (leave + OD) and monthly summary recalculation.
 *
 * Supports:
 * - All employees in payroll month window
 * - Specific employees via --emp=2237,119
 * - Division-wise selection by index (interactive or --division-indexes=1,3)
 * - Department selection within selected divisions (interactive or --department-indexes=2,5)
 *
 * Usage examples:
 *   node scripts/reconcile_attendance_requests_scope.js --month=2026-04 --all
 *   node scripts/reconcile_attendance_requests_scope.js --month=2026-04 --emp=2237,119
 *   node scripts/reconcile_attendance_requests_scope.js --month=2026-04 --division-indexes=1
 *   node scripts/reconcile_attendance_requests_scope.js --month=2026-04 --division-indexes=1 --department-indexes=2,4
 *   node scripts/reconcile_attendance_requests_scope.js --month=2026-04 --pick
 *   node scripts/reconcile_attendance_requests_scope.js --month=2026-04 --all --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const readline = require('readline');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');

function parseArgs() {
  const out = {
    month: process.env.MONTH || null,
    all: false,
    dryRun: false,
    pick: false,
    empCsv: process.env.EMP_LIST || '',
    divisionIndexes: '',
    departmentIndexes: '',
  };
  for (const raw of process.argv.slice(2)) {
    if (raw === '--all') out.all = true;
    else if (raw === '--dry-run') out.dryRun = true;
    else if (raw === '--pick') out.pick = true;
    else if (raw.startsWith('--month=')) out.month = raw.slice('--month='.length);
    else if (raw.startsWith('--emp=')) out.empCsv = raw.slice('--emp='.length);
    else if (raw.startsWith('--division-indexes=')) out.divisionIndexes = raw.slice('--division-indexes='.length);
    else if (raw.startsWith('--department-indexes=')) out.departmentIndexes = raw.slice('--department-indexes='.length);
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

async function chooseByIndexInteractive({ divisions, departmentsByDiv }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nSelect scope by number:');
    console.log('  1) All employees');
    console.log('  2) Specific employee numbers');
    console.log('  3) Division-wise');
    console.log('  4) Department-wise (within selected divisions)');
    const mode = (await ask(rl, 'Enter option [1-4]: ')).trim();

    if (mode === '1') return { mode: 'all', empNos: [], divIds: [], deptIds: [] };
    if (mode === '2') {
      const empCsv = await ask(rl, 'Enter employee numbers (comma separated): ');
      return { mode: 'emp', empNos: parseEmpCsv(empCsv), divIds: [], deptIds: [] };
    }

    console.log('\nDivisions:');
    divisions.forEach((d, i) => console.log(`  ${i + 1}) ${d.name || d.division_name || d._id}`));
    const divInput = await ask(rl, 'Enter division indexes (comma separated): ');
    const divIdx = parseCsvInts(divInput);
    const selectedDivs = divIdx
      .map((i) => divisions[i - 1])
      .filter(Boolean);
    const divIds = selectedDivs.map((d) => String(d._id));

    if (mode === '3') return { mode: 'division', empNos: [], divIds, deptIds: [] };

    const deptRows = [];
    selectedDivs.forEach((d) => {
      const arr = departmentsByDiv.get(String(d._id)) || [];
      arr.forEach((dep) => deptRows.push(dep));
    });
    console.log('\nDepartments in selected divisions:');
    deptRows.forEach((dep, i) => console.log(`  ${i + 1}) ${dep.name || dep.department_name || dep._id}`));
    const depInput = await ask(rl, 'Enter department indexes (comma separated): ');
    const depIdx = parseCsvInts(depInput);
    const deptIds = depIdx
      .map((i) => deptRows[i - 1])
      .filter(Boolean)
      .map((d) => String(d._id));
    return { mode: 'department', empNos: [], divIds, deptIds };
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  if (!args.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
    console.error('Pass --month=YYYY-MM (or MONTH env)');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  delete process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION;

  const [year, monthNumber] = args.month.split('-').map(Number);
  const mid = createISTDate(`${year}-${String(monthNumber).padStart(2, '0')}-15`);
  const periodInfo = await dateCycleService.getPeriodInfo(mid);
  const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;
  const periodDates = new Set(getAllDatesInRange(startDateStr, endDateStr));

  const divisions = await Division.find({}).select('_id name division_name').sort({ name: 1, division_name: 1 }).lean();
  const departments = await Department.find({}).select('_id name department_name division_id').sort({ name: 1, department_name: 1 }).lean();
  const departmentsByDiv = new Map();
  for (const dep of departments) {
    const key = String(dep.division_id || '');
    const arr = departmentsByDiv.get(key) || [];
    arr.push(dep);
    departmentsByDiv.set(key, arr);
  }

  let scope = { mode: 'all', empNos: [], divIds: [], deptIds: [] };
  const directEmp = parseEmpCsv(args.empCsv);
  if (directEmp.length > 0) {
    scope = { mode: 'emp', empNos: directEmp, divIds: [], deptIds: [] };
  } else if (args.pick) {
    scope = await chooseByIndexInteractive({ divisions, departmentsByDiv });
  } else if (args.divisionIndexes || args.departmentIndexes) {
    const divIdx = parseCsvInts(args.divisionIndexes);
    const divIds = divIdx.map((i) => divisions[i - 1]).filter(Boolean).map((d) => String(d._id));
    const deptPool = [];
    divIds.forEach((did) => (departmentsByDiv.get(did) || []).forEach((d) => deptPool.push(d)));
    const depIdx = parseCsvInts(args.departmentIndexes);
    const deptIds = depIdx.map((i) => deptPool[i - 1]).filter(Boolean).map((d) => String(d._id));
    scope =
      deptIds.length > 0
        ? { mode: 'department', empNos: [], divIds, deptIds }
        : { mode: 'division', empNos: [], divIds, deptIds: [] };
  } else if (args.all) {
    scope = { mode: 'all', empNos: [], divIds: [], deptIds: [] };
  }

  let targetEmpNos = [];
  if (scope.mode === 'emp') {
    targetEmpNos = scope.empNos;
  } else {
    const q = {};
    if (scope.mode === 'division') {
      q.division_id = { $in: scope.divIds };
    } else if (scope.mode === 'department') {
      q.division_id = { $in: scope.divIds };
      q.department_id = { $in: scope.deptIds };
    }
    const rows = await Employee.find(q).select('emp_no').lean();
    targetEmpNos = rows.map((r) => normEmp(r.emp_no)).filter(Boolean);
  }
  targetEmpNos = Array.from(new Set(targetEmpNos));

  const dailyQuery = {
    date: { $gte: startDateStr, $lte: endDateStr },
    employeeNumber: { $in: targetEmpNos },
  };
  const rows = await AttendanceDaily.find(dailyQuery)
    .select('employeeNumber date')
    .sort({ employeeNumber: 1, date: 1 })
    .lean();

  console.log('\n=== Reconciliation Backfill Scope ===');
  console.log('Month:', args.month, '| Payroll window:', startDateStr, '..', endDateStr, `(${periodDates.size} days)`);
  console.log('Mode:', scope.mode);
  console.log('Target employees:', targetEmpNos.length);
  console.log('AttendanceDaily rows to process:', rows.length);
  if (scope.mode === 'division' || scope.mode === 'department') {
    console.log('Selected divisions:', scope.divIds.length);
  }
  if (scope.mode === 'department') {
    console.log('Selected departments:', scope.deptIds.length);
  }

  if (args.dryRun) {
    console.log('\nDry run only. No recalculation executed.');
    await mongoose.disconnect();
    return;
  }

  let done = 0;
  for (const row of rows) {
    try {
      await recalculateOnAttendanceUpdate(normEmp(row.employeeNumber), row.date);
    } catch (e) {
      console.error('Error processing', row.employeeNumber, row.date, e?.message || e);
    }
    done += 1;
    if (done % 50 === 0 || done === rows.length) {
      console.log('Progress:', done, '/', rows.length);
    }
  }

  console.log('\nDone. Processed rows:', done);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

