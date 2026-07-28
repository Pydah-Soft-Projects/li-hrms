/**
 * Find & reconcile AttendanceDaily rows where present-duration incorrectly
 * counted time AFTER shift end (should be extra/OT only).
 *
 * Fix basis (also applied in shiftPresenceResolutionService / multi-shift):
 *   presentHours = overlap(punch, [shiftStart, shiftEnd])
 *   post-end time → extra only (does not help PRESENT gate)
 *
 * Week-off / holiday:
 *   Day status stays WEEK_OFF / HOLIDAY.
 *   Only shift status is updated for work done that day.
 *
 * Listing: ONLY rows where day status and/or shift status change
 * (clip-only rows are not listed).
 *
 * Apply: full resync affected days, then RECHECK predicted vs actual.
 *
 * Default window: July payroll period (MONTH=2026-07).
 *
 * Usage (from backend/):
 *   node scripts/reconcile_shift_window_present_july.js
 *   node scripts/reconcile_shift_window_present_july.js --all --dry-run
 *   node scripts/reconcile_shift_window_present_july.js --all --apply --yes
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const readline = require('readline');

const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Settings = require('../settings/model/Settings');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const {
  computeClippedPunchHours,
  computeStatusDurationHours,
  resolveShiftPresence,
  loadEffectiveShiftDoc,
} = require('../attendance/services/shiftPresenceResolutionService');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const { isEmployeeNumberDateLocked } = require('../shared/services/payrollPeriodLockService');

const MONTH = process.env.MONTH || '2026-07';

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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function addDaysStr(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + delta);
  return extractISTComponents(d).dateStr;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    all: false,
    pick: false,
    dryRun: true,
    apply: false,
    yes: false,
    skipSummary: false,
    from: null,
    to: null,
    empCsv: '',
    divisionIndexes: '',
    departmentIndexes: '',
    outCsv: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--all') out.all = true;
    else if (raw === '--pick') out.pick = true;
    else if (raw === '--dry-run') {
      out.dryRun = true;
      out.apply = false;
    } else if (raw === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (raw === '--yes' || raw === '-y') out.yes = true;
    else if (raw === '--skip-summary') out.skipSummary = true;
    else if (raw.startsWith('--from=')) out.from = raw.slice('--from='.length);
    else if (raw === '--from' && argv[i + 1]) out.from = argv[++i];
    else if (raw.startsWith('--to=')) out.to = raw.slice('--to='.length);
    else if (raw === '--to' && argv[i + 1]) out.to = argv[++i];
    else if (raw.startsWith('--emp=')) out.empCsv = raw.slice('--emp='.length);
    else if (raw === '--emp' && argv[i + 1]) out.empCsv = argv[++i];
    else if (raw.startsWith('--division-indexes=')) out.divisionIndexes = raw.slice('--division-indexes='.length);
    else if (raw.startsWith('--department-indexes=')) out.departmentIndexes = raw.slice('--department-indexes='.length);
    else if (raw.startsWith('--out=')) out.outCsv = raw.slice('--out='.length);
    else if (raw === '--out' && argv[i + 1]) out.outCsv = argv[++i];
  }

  return out;
}

/** Legacy present clip: start only, OUT uncapped (the bug we are fixing). */
function legacyClippedPunchHours(pShift, dateStr) {
  if (!pShift?.inTime || !pShift?.outTime) return 0;
  const punchIn = pShift.inTime instanceof Date ? pShift.inTime : new Date(pShift.inTime);
  const punchOut = pShift.outTime instanceof Date ? pShift.outTime : new Date(pShift.outTime);
  if (Number.isNaN(punchIn.getTime()) || Number.isNaN(punchOut.getTime())) return 0;
  if (!pShift.shiftStartTime) return Math.max(0, (punchOut - punchIn) / 3600000);

  const shiftStart = createISTDate(dateStr, pShift.shiftStartTime);
  const effectiveIn = new Date(Math.max(punchIn.getTime(), shiftStart.getTime()));
  return Math.max(0, (punchOut - effectiveIn) / 3600000);
}

function shiftHasPostEndTime(pShift, dateStr) {
  if (!pShift?.outTime || !pShift.shiftEndTime || !pShift.shiftStartTime) return false;
  const punchOut = pShift.outTime instanceof Date ? pShift.outTime : new Date(pShift.outTime);
  if (Number.isNaN(punchOut.getTime())) return false;

  const [sh, sm] = String(pShift.shiftStartTime).split(':').map(Number);
  const [eh, em] = String(pShift.shiftEndTime).split(':').map(Number);
  const overnight = eh * 60 + em <= sh * 60 + sm;
  let shiftEnd = createISTDate(dateStr, pShift.shiftEndTime);
  if (overnight) shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
  return punchOut.getTime() > shiftEnd.getTime() + 1000; // 1s tolerance
}

function cloneShiftPlain(s) {
  const o = typeof s.toObject === 'function' ? s.toObject() : { ...s };
  return {
    ...o,
    inTime: o.inTime ? new Date(o.inTime) : null,
    outTime: o.outTime ? new Date(o.outTime) : null,
    shiftSegments: Array.isArray(o.shiftSegments)
      ? o.shiftSegments.map((seg) => ({ ...seg }))
      : o.shiftSegments,
  };
}

async function chooseScopeInteractive({ divisions, departmentsByDiv }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nSelect reconcile scope:');
    console.log('  1) All employees (all divisions / all departments)');
    console.log('  2) Single / multiple employees (enter emp numbers)');
    console.log('  3) Division-wise (all departments in selected division(s))');
    console.log('  4) Department-wise (pick dept(s) within selected division(s))');
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
    const divInput = await ask(rl, 'Division index(es), comma separated (or "all"): ');
    let selectedDivs;
    if (String(divInput).trim().toLowerCase() === 'all') {
      selectedDivs = divisions.slice();
    } else {
      selectedDivs = parseCsvInts(divInput)
        .map((i) => divisions[i - 1])
        .filter(Boolean);
    }
    const divIds = selectedDivs.map((d) => String(d._id));

    if (mode === '3') return { mode: 'division', empNos: [], divIds, deptIds: [] };

    const deptRows = [];
    selectedDivs.forEach((d) => {
      (departmentsByDiv.get(String(d._id)) || []).forEach((dep) => {
        if (!deptRows.some((x) => String(x._id) === String(dep._id))) deptRows.push(dep);
      });
    });
    console.log('\nDepartments:');
    deptRows.forEach((dep, i) => {
      console.log(`  ${i + 1}) ${dep.code || '-'} — ${dep.name || dep._id}`);
    });
    const depInput = await ask(rl, 'Department index(es), comma separated (or "all"): ');
    let deptIds;
    if (String(depInput).trim().toLowerCase() === 'all') {
      deptIds = deptRows.map((d) => String(d._id));
    } else {
      deptIds = parseCsvInts(depInput)
        .map((i) => deptRows[i - 1])
        .filter(Boolean)
        .map((d) => String(d._id));
    }

    return { mode: 'department', empNos: [], divIds, deptIds };
  } finally {
    rl.close();
  }
}

async function resolveScope(args, divisions, departmentsByDiv) {
  const hasScope = args.all || args.empCsv || args.divisionIndexes || args.departmentIndexes;

  if (args.pick || !hasScope) {
    return chooseScopeInteractive({ divisions, departmentsByDiv });
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
      (departmentsByDiv.get(divId) || []).forEach((dep) => {
        if (!deptRows.some((x) => String(x._id) === String(dep._id))) deptRows.push(dep);
      });
    });
    const depIdx = parseCsvInts(args.departmentIndexes);
    const deptIds = depIdx.map((i) => deptRows[i - 1]).filter(Boolean).map((d) => String(d._id));
    return { mode: 'department', empNos: [], divIds, deptIds };
  }

  return { mode: 'division', empNos: [], divIds, deptIds: [] };
}

async function resolveEmployees(scope) {
  if (scope.mode === 'emp') {
    const found = await Employee.find({ emp_no: { $in: scope.empNos } })
      .select('emp_no employee_name division_id department_id')
      .lean();
    const foundSet = new Set(found.map((e) => normEmp(e.emp_no)));
    const missing = scope.empNos.filter((e) => !foundSet.has(e));
    if (missing.length) console.warn('  Warning: employee(s) not found:', missing.join(', '));
    return found;
  }

  const q = {};
  if (scope.mode === 'division' && scope.divIds.length) {
    q.division_id = { $in: scope.divIds };
  } else if (scope.mode === 'department') {
    if (scope.divIds.length) q.division_id = { $in: scope.divIds };
    if (scope.deptIds.length) q.department_id = { $in: scope.deptIds };
  }

  return Employee.find(q)
    .select('emp_no employee_name division_id department_id')
    .sort({ emp_no: 1 })
    .lean();
}

function dailyPayable(shifts) {
  return round2((shifts || []).reduce((s, x) => s + (Number(x.payableShift) || 0), 0));
}

function predictDailyStatus(shifts, payable) {
  const hasPresent = (shifts || []).some(
    (s) => s.status === 'PRESENT' || s.status === 'complete' || (Number(s.payableShift) || 0) >= 1
  );
  if (hasPresent || payable >= 0.95) return 'PRESENT';
  if (payable >= 0.45 || (shifts || []).some((s) => s.status === 'HALF_DAY')) return 'HALF_DAY';
  const hasIncomplete = (shifts || []).some((s) => !s.outTime);
  return hasIncomplete ? 'PARTIAL' : 'ABSENT';
}

function isNonWorkingDayStatus(status) {
  const st = String(status || '').toUpperCase();
  return st === 'WEEK_OFF' || st === 'HOLIDAY';
}

/**
 * Re-resolve each shift with window-clipped present duration; compare to stored.
 * WEEK_OFF / HOLIDAY day status is preserved — only shift rows reflect work done.
 */
async function analyzeDaily(daily, empMeta, graceOpts) {
  const dateStr = daily.date;
  const shifts = Array.isArray(daily.shifts) ? daily.shifts : [];
  const candidates = shifts.filter((s) => s?.inTime && s?.outTime && s.shiftStartTime && s.shiftEndTime);
  if (!candidates.length) return null;

  const hasPostEnd = candidates.some((s) => shiftHasPostEndTime(s, dateStr));
  if (!hasPostEnd) return null;

  const beforeShifts = candidates.map((s) => ({
    shiftNumber: s.shiftNumber,
    status: s.status,
    payableShift: Number(s.payableShift) || 0,
    legacyClippedHrs: round2(legacyClippedPunchHours(s, dateStr)),
    windowClippedHrs: round2(computeClippedPunchHours(s, dateStr)),
    statusDurationNew: round2(computeStatusDurationHours(s, dateStr)),
    extraHours: Number(s.extraHours) || 0,
    path: s.presenceResolutionPath || null,
  }));

  const afterShifts = [];
  for (const s of candidates) {
    const clone = cloneShiftPlain(s);
    delete clone.presenceResolutionPath;
    const shiftDoc = await loadEffectiveShiftDoc(clone, empMeta.division_id || null);
    await resolveShiftPresence({
      pShift: clone,
      dateStr,
      employeeNumber: daily.employeeNumber,
      graceOpts,
      shiftDoc,
      divisionId: empMeta.division_id || null,
      applyEdgePermissions: false,
    });
    afterShifts.push({
      shiftNumber: clone.shiftNumber,
      status: clone.status,
      payableShift: Number(clone.payableShift) || 0,
      windowClippedHrs: round2(computeClippedPunchHours(clone, dateStr)),
      path: clone.presenceResolutionPath || null,
      extraHours: Number(clone.extraHours) || 0,
    });
  }

  const afterByNum = new Map(afterShifts.map((s) => [s.shiftNumber, s]));
  const mergedAfter = shifts.map((s) => {
    const a = afterByNum.get(s.shiftNumber);
    if (!a) return s;
    return { ...s, status: a.status, payableShift: a.payableShift };
  });

  const beforePayable = Number(daily.payableShifts) || dailyPayable(shifts);
  const afterPayable = dailyPayable(mergedAfter);
  const beforeStatus = daily.status;

  // Working days: day status follows shift presence.
  // Week-off / holiday: day stays WEEK_OFF / HOLIDAY; only shift status updates.
  let afterStatus = predictDailyStatus(mergedAfter, afterPayable);
  if (isNonWorkingDayStatus(beforeStatus)) {
    afterStatus = beforeStatus;
  }

  const shiftStatusChanges = beforeShifts
    .map((b) => {
      const a = afterByNum.get(b.shiftNumber);
      if (!a) return null;
      if (String(b.status) !== String(a.status)) return { before: b, after: a };
      return null;
    })
    .filter(Boolean);

  // Keep clip/payable detail for rows we do report (status changes)
  const shiftChanges = beforeShifts
    .map((b) => {
      const a = afterByNum.get(b.shiftNumber);
      if (!a) return null;
      const changed =
        String(b.status) !== String(a.status)
        || round2(b.payableShift) !== round2(a.payableShift)
        || round2(b.legacyClippedHrs) !== round2(b.windowClippedHrs);
      if (!changed) return null;
      return { before: b, after: a };
    })
    .filter(Boolean);

  const dayStatusChanged = String(beforeStatus) !== String(afterStatus);
  const shiftStatusChanged = shiftStatusChanges.length > 0;

  // Only report when day status and/or shift status actually change
  if (!dayStatusChanged && !shiftStatusChanged) return null;

  return {
    employeeNumber: daily.employeeNumber,
    employeeName: empMeta.employee_name || '',
    date: dateStr,
    locked: Boolean(daily.locked),
    isNonWorkingDay: isNonWorkingDayStatus(beforeStatus),
    before: {
      status: beforeStatus,
      payableShifts: round2(beforePayable),
      shifts: beforeShifts,
    },
    after: {
      status: afterStatus,
      payableShifts: round2(afterPayable),
      shifts: afterShifts,
    },
    shiftChanges,
    shiftStatusChanges,
    dayStatusChanged,
    shiftStatusChanged,
    needsReconcile: true,
    clipDiffOnly: false,
  };
}

function formatChangeRow(r) {
  const parts = (r.shiftStatusChanges || r.shiftChanges || []).map((c) => {
    const b = c.before;
    const a = c.after;
    return (
      `S${b.shiftNumber}: ${b.status}/${b.payableShift}`
      + ` (legacy ${b.legacyClippedHrs}h → window ${b.windowClippedHrs}h)`
      + ` ⇒ ${a.status}/${a.payableShift}`
    );
  });
  if (parts.length) return parts.join(' | ');
  return `day ${r.before.status}/${r.before.payableShifts} ⇒ ${r.after.status}/${r.after.payableShifts}`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowFlag(r) {
  if (r.dayStatusChanged && r.shiftStatusChanged) return 'DAY+SHIFT_STATUS';
  if (r.dayStatusChanged) return 'DAY_STATUS';
  if (r.shiftStatusChanged) {
    return r.isNonWorkingDay ? 'SHIFT_STATUS_ON_WO_HOL' : 'SHIFT_STATUS';
  }
  return 'OTHER';
}

function writeCsv(filePath, rows) {
  const header = [
    'employeeNumber',
    'employeeName',
    'date',
    'isNonWorkingDay',
    'dayStatusChanged',
    'shiftStatusChanged',
    'beforeStatus',
    'afterStatus',
    'beforePayable',
    'afterPayable',
    'locked',
    'flag',
    'detail',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.employeeNumber,
        r.employeeName,
        r.date,
        Boolean(r.isNonWorkingDay),
        Boolean(r.dayStatusChanged),
        Boolean(r.shiftStatusChanged),
        r.before.status,
        r.after.status,
        r.before.payableShifts,
        r.after.payableShifts,
        r.locked,
        rowFlag(r),
        formatChangeRow(r),
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
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
    type:
      log.type
      || (log.punch_state === 0 || log.punch_state === '0'
        ? 'IN'
        : log.punch_state === 1 || log.punch_state === '1'
          ? 'OUT'
          : null),
    punch_state: log.punch_state,
    source: log.source,
    date: log.date,
  }));
}

async function main() {
  const args = parseArgs();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(MONTH)) {
    console.error('Invalid MONTH. Use YYYY-MM (default 2026-07).');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/:[^:@]+@/, ':***@'));

  const anchor = createISTDate(`${MONTH}-15`, '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  let from = args.from || extractISTComponents(payrollCycle.startDate).dateStr;
  let to = args.to || extractISTComponents(payrollCycle.endDate).dateStr;

  console.log('\n=== Shift-window present reconcile ===');
  console.log(`Payroll month label: ${MONTH}`);
  console.log(`Pay period: ${from} → ${to}`);
  console.log(`Mode: ${args.apply ? 'APPLY (full resync affected days)' : 'DRY-RUN (detect only)'}`);

  const divisions = await Division.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const departments = await Department.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const departmentsByDiv = new Map();
  for (const dep of departments) {
    const divIds = new Set();
    if (dep.division_id) divIds.add(String(dep.division_id));
    (dep.divisionDefaults || []).forEach((row) => {
      if (row?.division) divIds.add(String(row.division));
    });
    // Some schemas use divisions[]
    (dep.divisions || []).forEach((id) => divIds.add(String(id)));
    divIds.forEach((divId) => {
      if (!departmentsByDiv.has(divId)) departmentsByDiv.set(divId, []);
      departmentsByDiv.get(divId).push(dep);
    });
  }

  const scope = await resolveScope(args, divisions, departmentsByDiv);
  const employees = await resolveEmployees(scope);
  const empByNo = new Map(employees.map((e) => [normEmp(e.emp_no), e]));
  const empNos = [...empByNo.keys()];

  console.log('\n--- Scan plan ---');
  console.log('  Scope:', scope.mode);
  console.log('  Employees:', empNos.length);
  console.log('  Dates:', from, '→', to);

  if (!empNos.length) {
    console.error('No employees matched the selected scope.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if ((scope.mode === 'division' || scope.mode === 'department') && !scope.divIds.length) {
    console.error('No divisions selected.');
    await mongoose.disconnect();
    process.exit(1);
  }
  if (scope.mode === 'department' && !scope.deptIds.length) {
    console.error('No departments selected.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const SettingsDoc = await Settings.getSettingsByCategory('general');
  const graceOpts = {
    globalLateInGrace: SettingsDoc?.late_in_grace_time ?? 15,
    globalEarlyOutGrace: SettingsDoc?.early_out_grace_time ?? 15,
  };

  const findings = [];
  let scanned = 0;

  const batchSize = 200;
  for (let i = 0; i < empNos.length; i += batchSize) {
    const batch = empNos.slice(i, i + batchSize);
    const dailies = await AttendanceDaily.find({
      employeeNumber: { $in: batch },
      date: { $gte: from, $lte: to },
      'shifts.0': { $exists: true },
    })
      .select('employeeNumber date status payableShifts locked shifts')
      .lean();

    for (const daily of dailies) {
      scanned += 1;
      const emp = empByNo.get(normEmp(daily.employeeNumber));
      if (!emp) continue;
      const result = await analyzeDaily(daily, emp, graceOpts);
      if (!result) continue;
      findings.push(result);
    }

    process.stdout.write(`  scanned employees ${Math.min(i + batchSize, empNos.length)}/${empNos.length}\r`);
  }
  console.log('');

  // findings already filtered to day-status and/or shift-status changes only
  const dayStatusChanges = findings.filter((f) => f.dayStatusChanged);
  const shiftStatusChanges = findings.filter((f) => f.shiftStatusChanged);
  const woHolShiftOnly = findings.filter((f) => f.isNonWorkingDay && f.shiftStatusChanged && !f.dayStatusChanged);

  console.log('\n=== Metrics ===');
  console.log(`  AttendanceDaily rows scanned: ${scanned}`);
  console.log(`  Rows with DAY and/or SHIFT status change: ${findings.length}`);
  console.log(`  >>> DAY STATUS CHANGES: ${dayStatusChanges.length}`);
  console.log(`  >>> SHIFT STATUS CHANGES: ${shiftStatusChanges.length}`);
  console.log(`  >>> WO/HOL days (day stays WO/HOL, shift status only): ${woHolShiftOnly.length}`);

  const statusTransitions = {};
  for (const f of dayStatusChanges) {
    const key = `${f.before.status} → ${f.after.status}`;
    statusTransitions[key] = (statusTransitions[key] || 0) + 1;
  }
  if (Object.keys(statusTransitions).length) {
    console.log('\n  Day status transition counts:');
    Object.entries(statusTransitions)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`    ${k}: ${n}`));
  }

  // List ONLY status-change rows (logs + CSV)
  console.log('\n=== STATUS CHANGE LIST (day and/or shift) ===');
  if (!findings.length) {
    console.log('  (none)');
  } else {
    console.log(
      '  # | emp_no | name | date | day before → after | payable | flag | shift detail'
    );
    findings.forEach((r, idx) => {
      console.log(
        `  ${idx + 1} | ${r.employeeNumber} | ${r.employeeName || '-'} | ${r.date} | `
          + `${r.before.status} → ${r.after.status} | `
          + `${r.before.payableShifts} → ${r.after.payableShifts} | `
          + `${rowFlag(r)} | `
          + formatChangeRow(r)
      );
    });
  }

  console.log('\n========================================');
  console.log('=== HIGHLIGHT: DAY STATUS CHANGES ===');
  console.log('========================================');
  if (!dayStatusChanges.length) {
    console.log('  (none)');
  } else {
    dayStatusChanges.forEach((r, idx) => {
      console.log(
        `  >>> ${idx + 1}. ${r.employeeNumber} | ${r.employeeName || '-'} | ${r.date}`
      );
      console.log(`      DAY STATUS: ${r.before.status}  >>>  ${r.after.status}`);
      console.log(`      PAYABLE: ${r.before.payableShifts}  >>>  ${r.after.payableShifts}`);
      console.log(`      DETAIL: ${formatChangeRow(r)}`);
    });
  }
  console.log('========================================');

  console.log('\n========================================');
  console.log('=== HIGHLIGHT: SHIFT STATUS CHANGES ===');
  console.log('(includes WO/HOL days — day stays WEEK_OFF/HOLIDAY)');
  console.log('========================================');
  if (!shiftStatusChanges.length) {
    console.log('  (none)');
  } else {
    shiftStatusChanges.forEach((r, idx) => {
      console.log(
        `  >>> ${idx + 1}. ${r.employeeNumber} | ${r.employeeName || '-'} | ${r.date}`
        + (r.isNonWorkingDay ? `  [day stays ${r.before.status}]` : '')
      );
      console.log(`      DAY: ${r.before.status} → ${r.after.status}`);
      (r.shiftStatusChanges || []).forEach((c) => {
        console.log(
          `      SHIFT S${c.before.shiftNumber}: ${c.before.status} >>> ${c.after.status}`
          + ` (legacy ${c.before.legacyClippedHrs}h → window ${c.before.windowClippedHrs}h)`
        );
      });
    });
  }
  console.log('========================================\n');

  const outCsv =
    args.outCsv
    || path.join(
      __dirname,
      `_reconcile_shift_window_present_${MONTH.replace('-', '')}_${Date.now()}.csv`
    );
  writeCsv(outCsv, findings);
  console.log(`CSV written (same rows as STATUS CHANGE LIST): ${outCsv}`);

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply --yes to full-resync affected days, then recheck.');
    await mongoose.disconnect();
    return;
  }

  if (!findings.length) {
    console.log('\nNothing to apply.');
    await mongoose.disconnect();
    return;
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = (
      await ask(rl, `\nApply full attendance resync for ${findings.length} day(s)? [y/N]: `)
    )
      .trim()
      .toLowerCase();
    rl.close();
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('Cancelled.');
      await mongoose.disconnect();
      return;
    }
  }

  const generalConfig = await Settings.getSettingsByCategory('general');
  const byEmp = new Map();
  for (const f of findings) {
    if (!byEmp.has(f.employeeNumber)) byEmp.set(f.employeeNumber, []);
    byEmp.get(f.employeeNumber).push(f);
  }

  const applyStats = {
    attempted: 0,
    processed: 0,
    skippedLocked: 0,
    skippedPayroll: 0,
    failed: 0,
    errors: [],
    afterApply: [],
  };

  for (const [empNo, rows] of byEmp) {
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const logs = await loadRawLogsForWindow(empNo, from, to);

    for (const date of dates) {
      applyStats.attempted += 1;
      const finding = rows.find((r) => r.date === date);

      if (finding?.locked) {
        applyStats.skippedLocked += 1;
        continue;
      }
      if (await isEmployeeNumberDateLocked(empNo, date)) {
        applyStats.skippedPayroll += 1;
        continue;
      }

      try {
        const result = await processMultiShiftAttendance(empNo, date, logs, generalConfig);
        if (result?.skippedImmutable) {
          applyStats.skippedLocked += 1;
          continue;
        }
        if (!result?.success) {
          applyStats.failed += 1;
          applyStats.errors.push(`${empNo} ${date}: ${result?.error || result?.reason || 'unknown'}`);
          continue;
        }

        const updated = await AttendanceDaily.findOne({ employeeNumber: empNo, date })
          .select('status payableShifts shifts')
          .lean();

        applyStats.processed += 1;
        applyStats.afterApply.push({
          finding,
          employeeNumber: empNo,
          employeeName: finding?.employeeName || '',
          date,
          beforeStatus: finding?.before.status,
          beforePayable: finding?.before.payableShifts,
          actualStatus: updated?.status,
          actualPayable: Number(updated?.payableShifts) || 0,
          actualShifts: Array.isArray(updated?.shifts) ? updated.shifts : [],
        });
      } catch (err) {
        applyStats.failed += 1;
        applyStats.errors.push(`${empNo} ${date}: ${err.message}`);
      }
    }
    console.log(`  Applied emp ${empNo}: ${dates.length} day(s)`);
  }

  if (!args.skipSummary && applyStats.processed > 0) {
    console.log('\nRefreshing monthly summaries…');
    const touchedEmps = new Set(applyStats.afterApply.map((r) => r.employeeNumber));
    const rangeDates = getAllDatesInRange(from, to);
    for (const empNo of touchedEmps) {
      const seen = new Set();
      for (const d of rangeDates) {
        const periodInfo = await dateCycleService.getPeriodInfo(new Date(`${d}T12:00:00+05:30`));
        const pc = periodInfo.payrollCycle;
        const key = `${pc.year}-${pc.month}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await recalculateOnAttendanceUpdate(empNo, d);
        } catch (err) {
          applyStats.errors.push(`${empNo} summary (${key}): ${err.message}`);
        }
      }
    }
  }

  console.log('\n=== Apply complete ===');
  console.log(`  Attempted: ${applyStats.attempted}`);
  console.log(`  Processed: ${applyStats.processed}`);
  console.log(`  Skipped (daily locked): ${applyStats.skippedLocked}`);
  console.log(`  Skipped (payroll lock): ${applyStats.skippedPayroll}`);
  console.log(`  Failed: ${applyStats.failed}`);

  // Recheck: predicted after vs actual stored after apply
  console.log('\n========================================');
  console.log('=== RECHECK: predicted vs actual ===');
  console.log('========================================');
  let recheckPass = 0;
  let recheckFail = 0;
  const recheckRows = [];

  for (const row of applyStats.afterApply) {
    const f = row.finding;
    const expectedDay = f?.after?.status;
    const actualDay = row.actualStatus;
    const dayOk = String(expectedDay) === String(actualDay);

    // For WO/HOL: day must remain non-working
    const woHolOk = !f?.isNonWorkingDay || isNonWorkingDayStatus(actualDay);

    const expectedShiftByNum = new Map(
      (f?.after?.shifts || []).map((s) => [s.shiftNumber, s])
    );
    const shiftFails = [];
    for (const ch of f?.shiftStatusChanges || []) {
      const expected = expectedShiftByNum.get(ch.before.shiftNumber);
      const actual = (row.actualShifts || []).find(
        (s) => Number(s.shiftNumber) === Number(ch.before.shiftNumber)
      );
      const expectedSt = expected?.status ?? ch.after.status;
      const actualSt = actual?.status;
      if (String(expectedSt) !== String(actualSt)) {
        shiftFails.push(
          `S${ch.before.shiftNumber}: expected ${expectedSt}, actual ${actualSt}`
        );
      }
    }

    const ok = dayOk && woHolOk && shiftFails.length === 0;
    if (ok) recheckPass += 1;
    else recheckFail += 1;

    const mark = ok ? 'PASS' : 'FAIL';
    console.log(
      `  [${mark}] ${row.employeeNumber} | ${row.employeeName || '-'} | ${row.date}`
    );
    console.log(
      `      day: before ${row.beforeStatus} | expected ${expectedDay} | actual ${actualDay}`
      + (f?.isNonWorkingDay ? ' | (WO/HOL preserved)' : '')
    );
    if (shiftFails.length) {
      shiftFails.forEach((msg) => console.log(`      shift FAIL: ${msg}`));
    } else if ((f?.shiftStatusChanges || []).length) {
      (f.shiftStatusChanges || []).forEach((c) => {
        const actual = (row.actualShifts || []).find(
          (s) => Number(s.shiftNumber) === Number(c.before.shiftNumber)
        );
        console.log(
          `      shift S${c.before.shiftNumber}: ${c.before.status} → ${actual?.status || '?'} (ok)`
        );
      });
    }

    recheckRows.push({
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      date: row.date,
      result: mark,
      beforeStatus: row.beforeStatus,
      expectedStatus: expectedDay,
      actualStatus: actualDay,
      isNonWorkingDay: Boolean(f?.isNonWorkingDay),
      shiftFailDetail: shiftFails.join('; '),
    });
  }

  console.log(`\n  Recheck PASS: ${recheckPass}`);
  console.log(`  Recheck FAIL: ${recheckFail}`);
  console.log('========================================\n');

  if (applyStats.errors.length) {
    console.log('\nErrors:');
    applyStats.errors.slice(0, 30).forEach((e) => console.log('  -', e));
  }

  const applyCsv = outCsv.replace(/\.csv$/i, '_applied_recheck.csv');
  const applyHeader = [
    'employeeNumber',
    'employeeName',
    'date',
    'result',
    'beforeStatus',
    'expectedStatus',
    'actualStatus',
    'isNonWorkingDay',
    'shiftFailDetail',
  ];
  const applyLines = [applyHeader.join(',')];
  for (const r of recheckRows) {
    applyLines.push(
      [
        r.employeeNumber,
        r.employeeName,
        r.date,
        r.result,
        r.beforeStatus,
        r.expectedStatus,
        r.actualStatus,
        r.isNonWorkingDay,
        r.shiftFailDetail,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  fs.writeFileSync(applyCsv, applyLines.join('\n'), 'utf8');
  console.log(`Recheck CSV: ${applyCsv}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
