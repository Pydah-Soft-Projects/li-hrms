/**
 * End-to-end simulation of org/salary effective timeline on REAL emp 2146.
 * Uses past dates. Restores employee snapshot when done (default).
 *
 * Run: node scripts/simOrgSalaryTimeline2146.js
 * Keep sim history: KEEP_SIM=1 node scripts/simOrgSalaryTimeline2146.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Division = require('../departments/model/Division');
const {
  ensureInitialTimeline,
  applyOrgChange,
  applySalaryChange,
  applyDueTimelineToMaster,
  getOrgAsOfFromEmployee,
  getSalaryAsOfFromEmployee,
  listPayrollSegmentsForRange,
  startOfUtcDay,
  idStr,
} = require('../employees/services/employeeTimelineService');
const { resolveEmployeesForOrgFilter } = require('../attendance/services/attendanceOrgFilterService');
const { planPayrollSegments } = require('../payroll/services/payrollSegmentService');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');

const EMP = '2146';
const KEEP = process.env.KEEP_SIM === '1';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail || '') });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function ymd(d) {
  const x = startOfUtcDay(d);
  return x ? x.toISOString().slice(0, 10) : null;
}

function snapEmployee(emp) {
  return {
    division_id: emp.division_id ? String(emp.division_id) : null,
    department_id: emp.department_id ? String(emp.department_id) : null,
    designation_id: emp.designation_id ? String(emp.designation_id) : null,
    gross_salary: Number(emp.gross_salary) || 0,
    orgHistory: JSON.parse(JSON.stringify(emp.orgHistory || [])),
    salaryHistory: JSON.parse(JSON.stringify(emp.salaryHistory || [])),
  };
}

(async () => {
  console.log('\n=== SIM: Org + Salary Effective Timeline (emp', EMP, ') ===\n');
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const emp = await Employee.findOne({ emp_no: EMP });
  if (!emp) {
    console.error('Employee 2146 not found');
    process.exit(1);
  }

  const snapshot = snapEmployee(emp);
  console.log('BEFORE snapshot:', JSON.stringify({
    name: emp.employee_name,
    emp_no: emp.emp_no,
    division_id: snapshot.division_id,
    department_id: snapshot.department_id,
    designation_id: snapshot.designation_id,
    gross_salary: snapshot.gross_salary,
    orgHistoryLen: snapshot.orgHistory.length,
    salaryHistoryLen: snapshot.salaryHistory.length,
  }, null, 2));

  // Resolve names for readability
  const [curDiv, curDept] = await Promise.all([
    Division.findById(emp.division_id).select('name').lean(),
    Department.findById(emp.department_id).select('name division_id').lean(),
  ]);
  console.log(`Current org: ${curDiv?.name || '?'} / ${curDept?.name || '?'}`);

  // Departments in this DB use `divisions[]` (not division_id). Keep employee division;
  // change department only (classic same-division transfer).
  let altDept = await Department.findOne({
    _id: { $ne: emp.department_id },
    isActive: { $ne: false },
  }).select('name divisions').lean();

  if (!altDept) {
    console.error('No alternate department found for transfer simulation');
    process.exit(1);
  }

  const altDivId = emp.division_id; // keep same division for clean transfer sim
  const altDiv = await Division.findById(altDivId).select('name').lean();
  console.log(`Sim transfer target: ${altDiv?.name || '?'} / ${altDept.name} (${altDept._id})`);

  // Past dates (user can see clearly in DB)
  const TRANSFER_DATE = '2026-03-15'; // mid March 2026
  const SALARY_BUMP_DATE = '2026-03-15'; // same day as transfer (common PT case)
  const FEB_ASOF = '2026-02-15';
  const APR_ASOF = '2026-04-10';
  const PAY_MONTH = '2026-03';

  // --- A1: ensureInitialTimeline ---
  console.log('\n--- A) Timeline write (past-dated transfer + salary) ---');
  ensureInitialTimeline(emp);
  check(
    'A1 ensureInitialTimeline has org+salary history',
    (emp.orgHistory?.length || 0) > 0 && (emp.salaryHistory?.length || 0) > 0,
    `org=${emp.orgHistory.length} salary=${emp.salaryHistory.length}`
  );

  const oldGross = Number(emp.gross_salary) || 0;
  const newGross = oldGross > 0 ? Math.round(oldGross * 1.1) : 25000;

  applyOrgChange(emp, {
    division_id: altDivId,
    department_id: altDept._id,
    designation_id: emp.designation_id,
    effectiveFrom: TRANSFER_DATE,
    source: 'transfer',
    requestId: null,
    applyMaster: true,
  });

  applySalaryChange(emp, {
    gross_salary: newGross,
    effectiveFrom: SALARY_BUMP_DATE,
    source: 'promotion',
    requestId: null,
    applyMaster: true,
  });

  await emp.save();
  console.log('Saved simulated timeline on emp', EMP);

  const after = await Employee.findOne({ emp_no: EMP });
  const orgHist = after.orgHistory || [];
  const salHist = after.salaryHistory || [];

  check(
    'A2 orgHistory has closed old + open new segment',
    orgHist.length >= 2,
    `segments=${orgHist.length} lastFrom=${ymd(orgHist[orgHist.length - 1]?.effectiveFrom)} lastDept=${idStr(orgHist[orgHist.length - 1]?.department_id)}`
  );

  const openOrg = orgHist.find((s) => !s.effectiveTo);
  const closedBefore = orgHist.find(
    (s) => s.effectiveTo && ymd(s.effectiveTo) === '2026-03-14'
  );
  check(
    'A3 old org closed on day before effect (2026-03-14)',
    !!closedBefore,
    closedBefore
      ? `closed dept=${idStr(closedBefore.department_id)} to=${ymd(closedBefore.effectiveTo)}`
      : `openSegTo=${ymd(openOrg?.effectiveTo)} segs=${JSON.stringify(orgHist.map((s) => ({ from: ymd(s.effectiveFrom), to: ymd(s.effectiveTo), dept: idStr(s.department_id) })))}`
  );

  check(
    'A4 new org open from transfer date',
    openOrg && ymd(openOrg.effectiveFrom) === TRANSFER_DATE && idStr(openOrg.department_id) === String(altDept._id),
    `from=${ymd(openOrg?.effectiveFrom)} dept=${idStr(openOrg?.department_id)}`
  );

  check(
    'A5 master cache updated to NEW org (effectDate in past)',
    idStr(after.department_id) === String(altDept._id) && idStr(after.division_id) === String(altDivId),
    `master dept=${idStr(after.department_id)} div=${idStr(after.division_id)}`
  );

  check(
    'A6 master gross updated to NEW salary',
    Number(after.gross_salary) === newGross,
    `gross=${after.gross_salary} expected=${newGross}`
  );

  // --- A7 as-of Feb vs Apr ---
  console.log('\n--- B) As-of resolvers (Feb vs Apr) ---');
  const orgFeb = getOrgAsOfFromEmployee(after, FEB_ASOF);
  const orgApr = getOrgAsOfFromEmployee(after, APR_ASOF);
  const salFeb = getSalaryAsOfFromEmployee(after, FEB_ASOF);
  const salApr = getSalaryAsOfFromEmployee(after, APR_ASOF);

  check(
    'B1 Feb as-of org = OLD department',
    idStr(orgFeb.department_id) === snapshot.department_id,
    `febDept=${idStr(orgFeb.department_id)} old=${snapshot.department_id}`
  );
  check(
    'B2 Apr as-of org = NEW department',
    idStr(orgApr.department_id) === String(altDept._id),
    `aprDept=${idStr(orgApr.department_id)} new=${altDept._id}`
  );
  check(
    'B3 Feb as-of salary = OLD gross',
    Number(salFeb.gross_salary) === oldGross,
    `feb=${salFeb.gross_salary} old=${oldGross}`
  );
  check(
    'B4 Apr as-of salary = NEW gross',
    Number(salApr.gross_salary) === newGross,
    `apr=${salApr.gross_salary} new=${newGross}`
  );

  // --- C attendance filters ---
  console.log('\n--- C) Attendance org filters (real emp inclusion) ---');
  const febOld = await resolveEmployeesForOrgFilter({
    departmentIds: [snapshot.department_id],
    asOf: FEB_ASOF,
    extraFilter: { emp_no: EMP },
  });
  const febNew = await resolveEmployeesForOrgFilter({
    departmentIds: [String(altDept._id)],
    asOf: FEB_ASOF,
    extraFilter: { emp_no: EMP },
  });
  const aprOld = await resolveEmployeesForOrgFilter({
    departmentIds: [snapshot.department_id],
    asOf: APR_ASOF,
    extraFilter: { emp_no: EMP },
  });
  const aprNew = await resolveEmployeesForOrgFilter({
    departmentIds: [String(altDept._id)],
    asOf: APR_ASOF,
    extraFilter: { emp_no: EMP },
  });

  check('C1 Feb filter OLD dept includes 2146', febOld.empNos.includes(EMP), `count=${febOld.empNos.length}`);
  check('C2 Feb filter NEW dept excludes 2146', !febNew.empNos.includes(EMP), `count=${febNew.empNos.length}`);
  check('C3 Apr filter OLD dept excludes 2146', !aprOld.empNos.includes(EMP), `count=${aprOld.empNos.length}`);
  check('C4 Apr filter NEW dept includes 2146', aprNew.empNos.includes(EMP), `count=${aprNew.empNos.length}`);

  // Range overlap: March report filtered by OLD should still include (early March)
  const marRangeOld = await resolveEmployeesForOrgFilter({
    departmentIds: [snapshot.department_id],
    rangeStart: '2026-03-01',
    rangeEnd: '2026-03-31',
    extraFilter: { emp_no: EMP },
  });
  const marRangeNew = await resolveEmployeesForOrgFilter({
    departmentIds: [String(altDept._id)],
    rangeStart: '2026-03-01',
    rangeEnd: '2026-03-31',
    extraFilter: { emp_no: EMP },
  });
  check(
    'C5 March RANGE OLD dept includes 2146 (overlap 1–14)',
    marRangeOld.empNos.includes(EMP),
    `yes=${marRangeOld.empNos.includes(EMP)}`
  );
  check(
    'C6 March RANGE NEW dept includes 2146 (overlap 15–31)',
    marRangeNew.empNos.includes(EMP),
    `yes=${marRangeNew.empNos.includes(EMP)}`
  );

  // --- D payroll segments ---
  console.log('\n--- D) Mid-period payroll segment planning ---');
  const { startDate, endDate } = await getPayrollDateRange(2026, 3);
  console.log(`Payroll period for ${PAY_MONTH}: ${startDate} → ${endDate}`);

  const windows = listPayrollSegmentsForRange(after, startDate, endDate);
  console.log('Windows:', windows.map((w) => ({
    i: w.segmentIndex,
    start: ymd(w.startDate),
    end: ymd(w.endDate),
    dept: idStr(w.department_id),
    gross: w.gross_salary,
  })));

  check(
    'D1 March produces 2+ payroll windows (mid-period change)',
    windows.length >= 2,
    `windows=${windows.length}`
  );

  if (windows.length >= 2) {
    check(
      'D2 segment0 uses OLD dept + OLD gross',
      idStr(windows[0].department_id) === snapshot.department_id &&
        Number(windows[0].gross_salary) === oldGross,
      `dept=${idStr(windows[0].department_id)} gross=${windows[0].gross_salary}`
    );
    check(
      'D3 segment1 uses NEW dept + NEW gross',
      idStr(windows[windows.length - 1].department_id) === String(altDept._id) &&
        Number(windows[windows.length - 1].gross_salary) === newGross,
      `dept=${idStr(windows[windows.length - 1].department_id)} gross=${windows[windows.length - 1].gross_salary}`
    );
    check(
      'D4 segment0 ends day before transfer',
      ymd(windows[0].endDate) === '2026-03-14' || ymd(windows[0].endDate) < TRANSFER_DATE,
      `end=${ymd(windows[0].endDate)}`
    );
    check(
      'D5 segment1 starts on transfer date',
      ymd(windows[1].startDate) === TRANSFER_DATE,
      `start=${ymd(windows[1].startDate)}`
    );
  } else {
    check('D2 segment0 OLD', false, 'skipped — only 1 window');
    check('D3 segment1 NEW', false, 'skipped — only 1 window');
    check('D4 segment0 end', false, 'skipped');
    check('D5 segment1 start', false, 'skipped');
  }

  let planned;
  try {
    planned = await planPayrollSegments(after._id, PAY_MONTH);
    check(
      'D6 planPayrollSegments returns multi-segment plan',
      planned.length >= 2,
      JSON.stringify(planned.map((p) => ({
        i: p.segmentIndex,
        start: p.startDate,
        end: p.endDate,
        dept: idStr(p.department_id),
        gross: p.gross_salary,
      })))
    );
  } catch (e) {
    check('D6 planPayrollSegments', false, e.message);
  }

  // --- E deferred master apply (future-dated) ---
  console.log('\n--- E) Future-dated change does NOT update master until due ---');
  const FUTURE = '2027-01-01';
  // find another dept or reuse original for "revert future"
  applyOrgChange(after, {
    division_id: snapshot.division_id,
    department_id: snapshot.department_id,
    designation_id: snapshot.designation_id,
    effectiveFrom: FUTURE,
    source: 'transfer',
    applyMaster: true,
  });
  // After future apply: master should STILL be alt (current), not snapshot, because FUTURE > today
  const masterStillNew =
    idStr(after.department_id) === String(altDept._id);
  check(
    'E1 future effectDate does not flip master yet',
    masterStillNew,
    `masterDept=${idStr(after.department_id)} (should remain NEW alt until 2027)`
  );

  // Simulate cron as-of future
  const changed = applyDueTimelineToMaster(after, FUTURE);
  check(
    'E2 applyDueTimelineToMaster as-of future flips master to planned org',
    changed && idStr(after.department_id) === snapshot.department_id,
    `changed=${changed} masterDept=${idStr(after.department_id)}`
  );

  // Do not save the future/cron experiment onto DB permanently — reload from DB for restore path
  // We already saved March transfer; E mutated in-memory only unless we save.
  // Reload clean March state from DB for restore.
  const forRestore = await Employee.findOne({ emp_no: EMP });

  // --- F controller guards (code presence / soft checks) ---
  console.log('\n--- F) Guard / wiring smoke checks ---');
  const fs = require('fs');
  const path = require('path');
  const empCtrl = fs.readFileSync(
    path.join(__dirname, '../employees/controllers/employeeController.js'),
    'utf8'
  );
  const ptCtrl = fs.readFileSync(
    path.join(__dirname, '../promotions-transfers/controllers/promotionTransferController.js'),
    'utf8'
  );
  const liveAtt = fs.readFileSync(
    path.join(__dirname, '../attendance/controllers/liveAttendanceReportController.js'),
    'utf8'
  );
  const payCtrl = fs.readFileSync(
    path.join(__dirname, '../payroll/controllers/payrollController.js'),
    'utf8'
  );
  const payCalc = fs.readFileSync(
    path.join(__dirname, '../payroll/services/payrollCalculationService.js'),
    'utf8'
  );
  const dynForm = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/components/DynamicEmployeeForm.tsx'),
    'utf8'
  );

  check('F1 workspace/superadmin org guard in employeeController', empCtrl.includes('acknowledgeOrgTimelineRisk'));
  check('F2 PT requires effectDate on org change', ptCtrl.includes('effectDate is required'));
  check('F3 PT applyApprovedChanges writes timeline', ptCtrl.includes('applyOrgChange'));
  check('F4 live attendance uses org filter service', liveAtt.includes('resolveEmployeesForOrgFilter') || liveAtt.includes('attendanceOrgFilterService'));
  check(
    'F5 payroll controller wires segment service',
    payCtrl.includes('calculatePayrollWithSegments') && payCtrl.includes('payrollSegmentService')
  );
  check(
    'F5b calculatePayrollNew accepts segment overrides',
    payCalc.includes('options.segment') && payCalc.includes('grossSalaryUsed')
  );
  check('F6 DynamicEmployeeForm has lockOrgFields', dynForm.includes('lockOrgFields'));

  // --- Restore ---
  console.log('\n--- Restore ---');
  if (KEEP) {
    console.log('KEEP_SIM=1 → leaving March transfer timeline on emp 2146 for UI inspection.');
    console.log('Master now points at NEW org/salary. Original snapshot was:');
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    forRestore.division_id = snapshot.division_id;
    forRestore.department_id = snapshot.department_id;
    forRestore.designation_id = snapshot.designation_id;
    forRestore.gross_salary = snapshot.gross_salary;
    forRestore.orgHistory = snapshot.orgHistory;
    forRestore.salaryHistory = snapshot.salaryHistory;
    await forRestore.save();
    console.log('Restored emp 2146 to pre-sim snapshot.');
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const total = results.length;
  const rate = ((passed / total) * 100).toFixed(1);

  console.log('\n========== SIMULATION REPORT ==========');
  console.log(`Employee: ${EMP} (${emp.employee_name})`);
  console.log(`Sim transfer date: ${TRANSFER_DATE}`);
  console.log(`Old dept: ${snapshot.department_id} → New dept: ${altDept._id}`);
  console.log(`Old gross: ${oldGross} → New gross: ${newGross}`);
  console.log(`Total checks: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Success rate: ${rate}%`);
  if (failed.length) {
    console.log('\nFAILURES:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  } else {
    console.log('\nAll intentions verified.');
  }
  console.log('=======================================\n');

  // Machine-readable summary for the chat report
  console.log('JSON_SUMMARY', JSON.stringify({
    emp: EMP,
    name: emp.employee_name,
    transferDate: TRANSFER_DATE,
    oldDepartmentId: snapshot.department_id,
    newDepartmentId: String(altDept._id),
    oldGross,
    newGross,
    payrollPeriod: { startDate, endDate },
    plannedSegments: planned || null,
    total,
    passed,
    failed: failed.length,
    successRate: Number(rate),
    failures: failed,
    restored: !KEEP,
  }));

  await mongoose.disconnect();
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
