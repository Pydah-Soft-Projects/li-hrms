/**
 * fix_ghost_absent_split_segments.js
 *
 * Two-phase tool:
 *   Phase 1 — AUDIT: find AttendanceDaily records that have a ghost ABSENT
 *             segment (shiftNumber > 1, status ABSENT) produced by the old
 *             iterative-split logic before the fold fix was applied.
 *             Prints employee name, emp_no and affected dates so you can
 *             review before touching anything.
 *
 *   Phase 2 — FIX: after your confirmation, reprocess only those
 *             employee+date pairs through the updated pipeline.
 *
 * Usage (interactive — prompts for scope and dates):
 *   node scripts/fix_ghost_absent_split_segments.js
 *
 * Usage (CLI flags):
 *   node scripts/fix_ghost_absent_split_segments.js --emp EMP001,EMP002 --from 2026-01-01 --to 2026-06-30
 *   node scripts/fix_ghost_absent_split_segments.js --all --from 2026-01-01 --to 2026-06-30
 *   node scripts/fix_ghost_absent_split_segments.js --audit-only --all --from 2026-06-01 --to 2026-06-30
 *   node scripts/fix_ghost_absent_split_segments.js --dry-run --all --from 2026-06-01 --to 2026-06-30
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');

const AttendanceDaily   = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog  = require('../attendance/model/AttendanceRawLog');
const Employee          = require('../employees/model/Employee');
const Division          = require('../departments/model/Division');
const Department        = require('../departments/model/Department');
const Settings          = require('../settings/model/Settings');

const { processMultiShiftAttendance }       = require('../attendance/services/multiShiftProcessingService');
const { recalculateOnAttendanceUpdate }     = require('../attendance/services/summaryCalculationService');
const { isEmployeeNumberDateLocked }        = require('../shared/services/payrollPeriodLockService');
const { extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService                      = require('../leaves/services/dateCycleService');

// ─── helpers ────────────────────────────────────────────────────────────────

function normEmp(v) { return String(v || '').trim().toUpperCase(); }

function parseCsvInts(s) {
  if (!s) return [];
  return String(s).split(/[,;\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0);
}

function parseEmpCsv(s) {
  if (!s) return [];
  return String(s).split(/[,;\s]+/).map(normEmp).filter(Boolean);
}

function addDaysStr(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + delta);
  return extractISTComponents(d).dateStr;
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    positionalEmp: null,
    all: false,
    pick: false,
    auditOnly: false,
    dryRun: false,
    yes: false,
    skipSummary: false,
    from: null,
    to: null,
    empCsv: '',
    divisionIndexes: '',
    departmentIndexes: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === '--all')          out.all = true;
    else if (raw === '--pick')    out.pick = true;
    else if (raw === '--audit-only') out.auditOnly = true;
    else if (raw === '--dry-run') out.dryRun = true;
    else if (raw === '--yes' || raw === '-y') out.yes = true;
    else if (raw === '--skip-summary') out.skipSummary = true;
    else if (raw.startsWith('--from='))  out.from = raw.slice('--from='.length);
    else if (raw === '--from' && argv[i+1]) out.from = argv[++i];
    else if (raw.startsWith('--to='))    out.to = raw.slice('--to='.length);
    else if (raw === '--to' && argv[i+1]) out.to = argv[++i];
    else if (raw.startsWith('--emp='))   out.empCsv = raw.slice('--emp='.length);
    else if (raw.startsWith('--division-indexes='))  out.divisionIndexes  = raw.slice('--division-indexes='.length);
    else if (raw.startsWith('--department-indexes=')) out.departmentIndexes = raw.slice('--department-indexes='.length);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (!out.from) out.from = raw;
      else if (!out.to) out.to = raw;
    } else if (!raw.startsWith('--') && !out.positionalEmp) {
      out.positionalEmp = normEmp(raw);
    }
  }

  if (out.positionalEmp && !out.empCsv) out.empCsv = out.positionalEmp;
  return out;
}

// ─── scope chooser ───────────────────────────────────────────────────────────

async function chooseScopeInteractive({ divisions, departmentsByDiv }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nSelect scope:');
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
    divisions.forEach((d, i) => console.log(`  ${i + 1}) ${d.code || '-'} — ${d.name || d._id}`));
    const divInput = await ask(rl, 'Division index(es), comma separated: ');
    const selectedDivs = parseCsvInts(divInput).map((i) => divisions[i - 1]).filter(Boolean);
    const divIds = selectedDivs.map((d) => String(d._id));

    if (mode === '3') return { mode: 'division', empNos: [], divIds, deptIds: [] };

    const deptRows = [];
    selectedDivs.forEach((d) => {
      (departmentsByDiv.get(String(d._id)) || []).forEach((dep) => deptRows.push(dep));
    });
    console.log('\nDepartments:');
    deptRows.forEach((dep, i) => console.log(`  ${i + 1}) ${dep.code || '-'} — ${dep.name || dep._id}`));
    const depInput = await ask(rl, 'Department index(es), comma separated: ');
    const deptIds = parseCsvInts(depInput).map((i) => deptRows[i - 1]).filter(Boolean).map((d) => String(d._id));

    return { mode: 'department', empNos: [], divIds, deptIds };
  } finally {
    rl.close();
  }
}

async function resolveScope(args, divisions, departmentsByDiv) {
  const hasScope = args.all || args.empCsv || args.divisionIndexes || args.departmentIndexes;
  if (args.pick || !hasScope) return chooseScopeInteractive({ divisions, departmentsByDiv });
  if (args.all) return { mode: 'all', empNos: [], divIds: [], deptIds: [] };
  if (args.empCsv) return { mode: 'emp', empNos: parseEmpCsv(args.empCsv), divIds: [], deptIds: [] };

  const divIdx = parseCsvInts(args.divisionIndexes);
  const divIds = divIdx.map((i) => divisions[i - 1]).filter(Boolean).map((d) => String(d._id));

  if (args.departmentIndexes) {
    const deptRows = [];
    divIds.forEach((divId) => (departmentsByDiv.get(divId) || []).forEach((dep) => deptRows.push(dep)));
    const depIdx = parseCsvInts(args.departmentIndexes);
    const deptIds = depIdx.map((i) => deptRows[i - 1]).filter(Boolean).map((d) => String(d._id));
    return { mode: 'department', empNos: [], divIds, deptIds };
  }

  return { mode: 'division', empNos: [], divIds, deptIds: [] };
}

async function resolveEmployeeNumbers(scope) {
  if (scope.mode === 'emp') {
    const found = await Employee.find({ emp_no: { $in: scope.empNos }, is_active: { $ne: false } })
      .select('emp_no').lean();
    const foundSet = new Set(found.map((e) => e.emp_no));
    const missing = scope.empNos.filter((e) => !foundSet.has(e));
    if (missing.length) console.warn('  Warning: employee(s) not found:', missing.join(', '));
    return [...foundSet];
  }

  const q = { is_active: { $ne: false } };
  if (scope.mode === 'division'   && scope.divIds.length)  q.division_id   = { $in: scope.divIds };
  if (scope.mode === 'department' && scope.divIds.length)  q.division_id   = { $in: scope.divIds };
  if (scope.mode === 'department' && scope.deptIds.length) q.department_id = { $in: scope.deptIds };

  const rows = await Employee.find(q).select('emp_no').sort({ emp_no: 1 }).lean();
  return rows.map((r) => normEmp(r.emp_no)).filter(Boolean);
}

// ─── detect ghost ABSENT segments ────────────────────────────────────────────

/**
 * Returns true if a daily record contains a ghost ABSENT split segment —
 * i.e. any shift at position > 1 (shiftNumber >= 2) with status ABSENT
 * and a real inTime (not a checkout-only partial).
 */
function hasGhostAbsentSegment(dailyRecord) {
  if (!Array.isArray(dailyRecord.shifts) || dailyRecord.shifts.length < 2) return false;
  return dailyRecord.shifts.some(
    (s) => s.shiftNumber >= 2 && s.status === 'ABSENT' && s.inTime
  );
}

// ─── raw log loader (same window as resync script) ───────────────────────────

async function loadRawLogsForWindow(empNo, from, to) {
  const windowStart = new Date(`${addDaysStr(from, -1)}T00:00:00+05:30`);
  const windowEnd   = new Date(`${addDaysStr(to,   1)}T23:59:59.999+05:30`);

  const logs = await AttendanceRawLog.find({
    employeeNumber: empNo,
    timestamp: { $gte: windowStart, $lte: windowEnd },
  }).sort({ timestamp: 1 }).lean();

  return logs.map((log) => ({
    _id: log._id,
    id:  log._id,
    employeeNumber: log.employeeNumber,
    timestamp: log.timestamp,
    type: log.type || (
      log.punch_state === 0 || log.punch_state === '0' ? 'IN' :
      log.punch_state === 1 || log.punch_state === '1' ? 'OUT' : null
    ),
    punch_state: log.punch_state,
    source: log.source,
    date: log.date,
  }));
}

function mapLog(log) {
  let type = log.type;
  if (!type && log.punch_state != null) {
    type = log.punch_state === 0 || log.punch_state === '0' ? 'IN' : 'OUT';
  }
  return {
    _id: log._id, id: log._id,
    timestamp: log.timestamp,
    type,
    punch_state: type === 'IN' ? 0 : type === 'OUT' ? 1 : log.punch_state,
    source: log.source,
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // Date range
  let from = args.from;
  let to   = args.to;
  if (!from || !to) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!from) from = (await ask(rl, 'From date (YYYY-MM-DD): ')).trim();
      if (!to)   to   = (await ask(rl, 'To date   (YYYY-MM-DD): ')).trim();
    } finally { rl.close(); }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('Invalid date range. Use YYYY-MM-DD.'); process.exit(1);
  }
  if (from > to) { console.error('--from must be <= --to'); process.exit(1); }

  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/:[^:@]+@/, ':***@'));

  // Load org structure for scope picker
  const divisions   = await Division.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const departments = await Department.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const departmentsByDiv = new Map();
  for (const dep of departments) {
    const divIds = new Set();
    if (dep.division_id) divIds.add(String(dep.division_id));
    (dep.divisionDefaults || []).forEach((row) => { if (row?.division) divIds.add(String(row.division)); });
    divIds.forEach((divId) => {
      if (!departmentsByDiv.has(divId)) departmentsByDiv.set(divId, []);
      departmentsByDiv.get(divId).push(dep);
    });
  }

  const scope  = await resolveScope(args, divisions, departmentsByDiv);
  const empNos = await resolveEmployeeNumbers(scope);

  if (!empNos.length) {
    console.error('No employees matched the selected scope.');
    await mongoose.disconnect(); process.exit(1);
  }

  console.log(`\nScope: ${scope.mode} | Dates: ${from} → ${to} | Employees: ${empNos.length}`);

  // ── Phase 1: AUDIT ────────────────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────────');
  console.log('Phase 1: Scanning for ghost ABSENT segments…');
  console.log('─────────────────────────────────────────────');

  // Fetch employee names in one shot
  const empDocs = await Employee.find({ emp_no: { $in: empNos } })
    .select('emp_no employee_name department_id division_id')
    .populate({ path: 'division_id',   select: 'name' })
    .populate({ path: 'department_id', select: 'name' })
    .lean();
  const empMap = new Map(empDocs.map((e) => [e.emp_no, e]));

  // Find all daily records in range that have ≥ 2 shifts
  const affectedRecords = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: from, $lte: to },
    'shifts.1': { $exists: true },  // at least 2 shifts
  }).select('employeeNumber date shifts').lean();

  // Filter to only those with a ghost ABSENT segment
  const ghostRecords = affectedRecords.filter(hasGhostAbsentSegment);

  // Group by employee
  const byEmployee = new Map();
  for (const rec of ghostRecords) {
    const empNo = rec.employeeNumber;
    if (!byEmployee.has(empNo)) byEmployee.set(empNo, []);
    byEmployee.get(empNo).push(rec.date);
  }

  if (byEmployee.size === 0) {
    console.log('\n✅  No ghost ABSENT segments found in the given scope and date range.');
    console.log('   Nothing to fix — all records are already clean.');
    await mongoose.disconnect();
    return;
  }

  // Print audit table
  console.log(`\nFound ${ghostRecords.length} record(s) across ${byEmployee.size} employee(s):\n`);
  console.log(
    'Emp No'.padEnd(14) +
    'Name'.padEnd(30) +
    'Division'.padEnd(20) +
    'Department'.padEnd(20) +
    'Affected Dates'
  );
  console.log('─'.repeat(110));

  const sortedEmpNos = [...byEmployee.keys()].sort();
  for (const empNo of sortedEmpNos) {
    const dates = byEmployee.get(empNo).sort();
    const emp   = empMap.get(empNo);
    const name  = emp?.employee_name || '—';
    const div   = (emp?.division_id?.name  || '—').slice(0, 18);
    const dept  = (emp?.department_id?.name || '—').slice(0, 18);
    console.log(
      empNo.padEnd(14) +
      name.slice(0, 28).padEnd(30) +
      div.padEnd(20) +
      dept.padEnd(20) +
      dates.join(', ')
    );
  }

  console.log('\n' + '─'.repeat(110));
  console.log(`Total: ${ghostRecords.length} day(s) to fix across ${byEmployee.size} employee(s)`);

  if (args.auditOnly) {
    console.log('\n--audit-only flag set. Stopping here — no changes made.');
    await mongoose.disconnect();
    return;
  }

  // ── Phase 2: FIX ─────────────────────────────────────────────────────────

  if (args.dryRun) {
    console.log('\n--dry-run flag set. Would reprocess the above records — no changes made.');
    await mongoose.disconnect();
    return;
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = (await ask(rl, `\nProceed with reprocessing ${ghostRecords.length} record(s)? [y/N]: `)).trim().toLowerCase();
    rl.close();
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('Cancelled — no changes made.');
      await mongoose.disconnect();
      return;
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('Phase 2: Reprocessing affected records…');
  console.log('─────────────────────────────────────────────\n');

  const generalConfig = await Settings.getSettingsByCategory('general');

  const stats = {
    attempted: ghostRecords.length,
    fixed: 0,
    skippedLocked: 0,
    skippedPayroll: 0,
    failed: 0,
    errors: [],
  };

  const summaryEmployees = new Set();

  for (const empNo of sortedEmpNos) {
    const dates  = byEmployee.get(empNo).sort();
    const allLogs = await loadRawLogsForWindow(empNo, dates[0], dates[dates.length - 1]);
    const mappedLogs = allLogs.map(mapLog);

    for (const date of dates) {
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date }).select('locked').lean();

      if (daily?.locked) {
        console.log(`  SKIP (daily locked)  ${empNo}  ${date}`);
        stats.skippedLocked++;
        continue;
      }

      if (await isEmployeeNumberDateLocked(empNo, date)) {
        console.log(`  SKIP (payroll lock)  ${empNo}  ${date}`);
        stats.skippedPayroll++;
        continue;
      }

      try {
        const result = await processMultiShiftAttendance(empNo, date, mappedLogs, generalConfig);
        if (result?.skippedImmutable) {
          console.log(`  SKIP (immutable)     ${empNo}  ${date}`);
          stats.skippedLocked++;
          continue;
        }
        if (!result?.success) {
          const msg = result?.error || result?.reason || 'unknown';
          console.log(`  FAIL                 ${empNo}  ${date}  — ${msg}`);
          stats.failed++;
          stats.errors.push(`${empNo} ${date}: ${msg}`);
          continue;
        }

        // Verify the fix actually removed the ghost segment
        const after = await AttendanceDaily.findOne({ employeeNumber: empNo, date }).select('shifts').lean();
        const stillGhost = after ? hasGhostAbsentSegment(after) : false;
        const marker = stillGhost ? '⚠ ghost remains' : '✓';
        console.log(`  ${marker.padEnd(18)} ${empNo}  ${date}  shifts=${after?.shifts?.length ?? '?'}`);

        stats.fixed++;
        summaryEmployees.add(empNo);
      } catch (err) {
        console.log(`  FAIL                 ${empNo}  ${date}  — ${err.message}`);
        stats.failed++;
        stats.errors.push(`${empNo} ${date}: ${err.message}`);
      }
    }
  }

  // Refresh monthly summaries
  if (!args.skipSummary && summaryEmployees.size > 0) {
    console.log('\nRefreshing monthly summaries…');
    const rangeDates = getAllDatesInRange(from, to);
    for (const empNo of summaryEmployees) {
      const seenCycleKeys = new Set();
      for (const d of rangeDates) {
        const periodInfo = await dateCycleService.getPeriodInfo(new Date(`${d}T12:00:00+05:30`));
        const pc  = periodInfo.payrollCycle;
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

  console.log('\n═══════════════════════════════════════════════');
  console.log('Summary');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Records attempted  : ${stats.attempted}`);
  console.log(`  Fixed              : ${stats.fixed}`);
  console.log(`  Skipped (locked)   : ${stats.skippedLocked}`);
  console.log(`  Skipped (payroll)  : ${stats.skippedPayroll}`);
  console.log(`  Failed             : ${stats.failed}`);
  if (stats.errors.length) {
    console.log('\nErrors:');
    stats.errors.slice(0, 20).forEach((e) => console.log('  -', e));
    if (stats.errors.length > 20) console.log(`  … and ${stats.errors.length - 20} more`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
