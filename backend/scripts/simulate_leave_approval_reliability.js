/**
 * Leave approval reliability: compare OLD vs NEW side-effect data outputs.
 *
 * For each test case we snapshot PayRegister + MonthlyAttendanceSummary,
 * run the previous-version heavy path, capture fingerprint, restore, run new path, compare.
 *
 * Usage:
 *   node scripts/simulate_leave_approval_reliability.js
 *   node scripts/simulate_leave_approval_reliability.js --verbose
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const mongoose = require('mongoose');

const VERBOSE = process.argv.includes('--verbose');

function stableHash(obj) {
  const json = JSON.stringify(obj, (_, v) => (v instanceof Date ? v.toISOString() : v));
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function leaveSnapFromDoc(leave) {
  return {
    _id: leave._id,
    employeeId: leave.employeeId,
    emp_no: leave.emp_no,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    status: leave.status,
    leaveType: leave.leaveType,
    isActive: leave.isActive,
  };
}

async function payrollMonthsForLeave(leave) {
  const dateCycleService = require('../leaves/services/dateCycleService');
  const { payrollCycle: startCycle } = await dateCycleService.getPeriodInfo(leave.fromDate);
  const { payrollCycle: endCycle } = await dateCycleService.getPeriodInfo(leave.toDate);
  const months = [];
  let y = startCycle.year;
  let m = startCycle.month;
  while (y < endCycle.year || (y === endCycle.year && m <= endCycle.month)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) {
      m = 1;
      y += 1;
    } else {
      m += 1;
    }
  }
  return [...new Set(months)];
}

async function captureEmployeeData(employeeId, months, empNo) {
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const { getPayrollDateRange } = require('../shared/utils/dateUtils');

  const payRegisters = {};
  const summaries = {};
  const leaveGrids = {};

  for (const month of months) {
    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);

    const pr = await PayRegisterSummary.findOne({ employeeId, month })
      .select('totals dailyRecords')
      .lean();
    payRegisters[month] = pr?.totals || null;

    const ms = await MonthlyAttendanceSummary.findOne({
      employeeId,
      month: `${year}-${String(monthNum).padStart(2, '0')}`,
    })
      .select('totals presentDays leaveDays lopDays absentDays')
      .lean();
    summaries[month] = ms?.totals || ms || null;

    const leaveDays = (pr?.dailyRecords || [])
      .filter((d) => d.date >= startDate && d.date <= endDate)
      .filter(
        (d) =>
          d.status === 'leave' ||
          d.leaveType ||
          d.firstHalf?.status === 'leave' ||
          d.secondHalf?.status === 'leave'
      )
      .map((d) => ({
        date: d.date,
        status: d.status,
        leaveType: d.leaveType,
        first: d.firstHalf?.status,
        second: d.secondHalf?.status,
      }));
    leaveGrids[month] = leaveDays;
  }

  return {
    fingerprint: stableHash({ payRegisters, summaries, leaveGrids }),
    payRegisters,
    summaries,
    leaveGrids,
    empNo,
    months,
  };
}

async function snapshotEmployeeDocs(employeeId, months) {
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const prDocs = await PayRegisterSummary.find({ employeeId, month: { $in: months } }).lean();
  const msDocs = await MonthlyAttendanceSummary.find({
    employeeId,
    month: { $in: months },
  }).lean();
  return { prDocs, msDocs };
}

async function restoreEmployeeDocs(snapshot) {
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const employeeIds = [
    ...new Set([
      ...snapshot.prDocs.map((d) => String(d.employeeId)),
      ...snapshot.msDocs.map((d) => String(d.employeeId)),
    ]),
  ];
  const months = [...new Set([...snapshot.prDocs.map((d) => d.month), ...snapshot.msDocs.map((d) => d.month)])];

  for (const eid of employeeIds) {
    await PayRegisterSummary.deleteMany({ employeeId: eid, month: { $in: months } });
    await MonthlyAttendanceSummary.deleteMany({ employeeId: eid, month: { $in: months } });
  }
  if (snapshot.prDocs.length) {
    await PayRegisterSummary.insertMany(snapshot.prDocs);
  }
  if (snapshot.msDocs.length) {
    await MonthlyAttendanceSummary.insertMany(snapshot.msDocs);
  }
}

/** Single-pass OLD (hook only, no controller duplicate) — the intended calculation. */
async function simulateOldSinglePass(leaveSnap) {
  const { recalculateOnLeaveApproval } = require('../attendance/services/summaryCalculationService');
  const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
  const { syncEsiLeaveOtForLeave, isEsiLeaveType } = require('../overtime/services/esiLeaveOtService');
  const prSyncStatuses = new Set(['approved', 'hod_approved', 'hr_approved', 'rejected', 'cancelled']);
  const started = process.hrtime.bigint();

  if (leaveSnap.status === 'approved') {
    await recalculateOnLeaveApproval(leaveSnap);
  }
  if (prSyncStatuses.has(leaveSnap.status)) {
    await syncPayRegisterFromLeave(leaveSnap);
  }
  if (isEsiLeaveType(leaveSnap.leaveType)) {
    await syncEsiLeaveOtForLeave(leaveSnap);
  }
  return Number(process.hrtime.bigint() - started) / 1e6;
}

/** Previous Leave.js post-save hook + controller duplicates (committed version before optimization). */
async function simulateOldHeavyPath(leaveSnap, scenario) {
  const { recalculateOnLeaveApproval } = require('../attendance/services/summaryCalculationService');
  const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
  const { syncEsiLeaveOtForLeave, isEsiLeaveType } = require('../overtime/services/esiLeaveOtService');

  const prSyncStatuses = new Set(['approved', 'hod_approved', 'hr_approved', 'rejected', 'cancelled']);
  const started = process.hrtime.bigint();

  // --- OLD post-save hook ---
  if (leaveSnap.status === 'approved') {
    await recalculateOnLeaveApproval(leaveSnap);
  }
  if (prSyncStatuses.has(leaveSnap.status)) {
    await syncPayRegisterFromLeave(leaveSnap);
  }
  if (isEsiLeaveType(leaveSnap.leaveType)) {
    await syncEsiLeaveOtForLeave(leaveSnap);
  }

  // --- OLD controller extras ---
  if (scenario === 'final_approve' && leaveSnap.status === 'approved') {
    if (isEsiLeaveType(leaveSnap.leaveType)) {
      await syncEsiLeaveOtForLeave(leaveSnap, {});
    }
    await recalculateOnLeaveApproval(leaveSnap);
  } else if (scenario === 'action_esi' && isEsiLeaveType(leaveSnap.leaveType)) {
    await syncEsiLeaveOtForLeave(leaveSnap, {});
  } else if (scenario === 'edit_approved' && leaveSnap.status === 'approved') {
    // Controller recalc on edit when still approved (hook also ran recalc once)
    await recalculateOnLeaveApproval(leaveSnap);
  } else if (scenario === 'revoke_approved' && leaveSnap.status !== 'approved') {
    await recalculateOnLeaveApproval(leaveSnap);
    if (isEsiLeaveType(leaveSnap.leaveType)) {
      await syncEsiLeaveOtForLeave(leaveSnap, {});
    }
  }

  return Number(process.hrtime.bigint() - started) / 1e6;
}

/** Present system: single deferred pass. */
async function simulateNewHeavyPath(leaveSnap, options = {}) {
  const { runLeaveStatusSideEffects } = require('../leaves/services/leaveApprovalSideEffectsService');
  const started = process.hrtime.bigint();
  await runLeaveStatusSideEffects(leaveSnap, options);
  return Number(process.hrtime.bigint() - started) / 1e6;
}

async function runCaseComparison(caseDef, leave) {
  const snap = leaveSnapFromDoc(leave);
  const employeeId = String(leave.employeeId);
  const months = await payrollMonthsForLeave(leave);
  const docSnapshot = await snapshotEmployeeDocs(employeeId, months);

  let oldMs;
  let newMs;
  let oldData;
  let newData;
  let singlePassData;
  let singlePassMs;

  try {
    oldMs = await simulateOldHeavyPath(snap, caseDef.oldScenario);
    oldData = await captureEmployeeData(employeeId, months, leave.emp_no);

    await restoreEmployeeDocs(docSnapshot);

    newMs = await simulateNewHeavyPath(snap, caseDef.newOptions || {});
    newData = await captureEmployeeData(employeeId, months, leave.emp_no);

    if (caseDef.compareSinglePass) {
      await restoreEmployeeDocs(docSnapshot);
      singlePassMs = await simulateOldSinglePass(snap);
      singlePassData = await captureEmployeeData(employeeId, months, leave.emp_no);
    }
  } finally {
    await restoreEmployeeDocs(docSnapshot);
  }

  const dataMatch = oldData.fingerprint === newData.fingerprint;
  const singlePassMatch = singlePassData ? singlePassData.fingerprint === newData.fingerprint : null;
  let verdict;
  if (caseDef.expectMatch === false) {
    verdict = dataMatch ? 'UNEXPECTED_MATCH' : 'EXPECTED_DIFF';
  } else if (caseDef.expectMatch === 'warn') {
    verdict = dataMatch ? 'PASS' : 'WARN';
  } else {
    verdict = dataMatch ? 'PASS' : 'FAIL';
  }

  return {
    case: caseDef.name,
    leaveId: String(leave._id),
    empNo: leave.emp_no,
    leaveType: leave.leaveType,
    status: leave.status,
    months,
    oldFp: oldData.fingerprint,
    newFp: newData.fingerprint,
    dataMatch,
    verdict,
    oldMs,
    newMs,
    singlePassFp: singlePassData?.fingerprint,
    singlePassMatch,
    singlePassMs,
    note: caseDef.note || '',
  };
}

const TEST_CASES = [
  {
    name: '1_final_approved_CL',
    query: { status: 'approved', isActive: { $ne: false }, leaveType: { $nin: ['ESI', 'esi'] } },
    oldScenario: 'final_approve',
    compareSinglePass: true,
    expectMatch: 'warn',
    note: 'OLD full path had duplicate recalc. NEW should match single-pass OLD (1× recalc + PR).',
  },
  {
    name: '2_final_approved_ESI',
    query: { status: 'approved', isActive: { $ne: false }, leaveType: { $regex: /^esi$/i } },
    oldScenario: 'final_approve',
    compareSinglePass: true,
    expectMatch: 'warn',
    note: 'OLD full had duplicate recalc+ESI. NEW should match single-pass OLD.',
  },
  {
    name: '3_hod_approved_intermediate',
    query: { status: 'hod_approved', isActive: { $ne: false } },
    oldScenario: 'intermediate',
    expectMatch: false,
    note: 'BY DESIGN: OLD rebuilt pay register on HOD step; NEW skips until final.',
  },
  {
    name: '4_hr_approved_intermediate',
    query: { status: 'hr_approved', isActive: { $ne: false } },
    oldScenario: 'intermediate',
    expectMatch: false,
    note: 'BY DESIGN: OLD rebuilt pay register on HR step; NEW skips until final.',
  },
  {
    name: '5_rejected_final',
    query: { status: { $in: ['rejected', 'hr_rejected', 'hod_rejected'] }, isActive: { $ne: false } },
    oldScenario: 'action_esi',
    expectMatch: 'warn',
    note: 'OLD: PR sync only. NEW: also runs recalc on rejected/cancelled.',
  },
  {
    name: '6_cancelled',
    query: { status: 'cancelled', isActive: { $ne: false } },
    oldScenario: 'action_esi',
    expectMatch: 'warn',
    note: 'OLD: PR sync only. NEW: recalc + PR sync.',
  },
];

async function findLeaveForCase(Leave, caseDef, usedEmployeeIds) {
  const candidates = await Leave.find(caseDef.query).sort({ updatedAt: -1 }).limit(30).lean();
  for (const leave of candidates) {
    const eid = String(leave.employeeId);
    if (!usedEmployeeIds.has(eid)) {
      usedEmployeeIds.add(eid);
      return leave;
    }
  }
  return null;
}

function printReportHeader() {
  console.log('\n=== LEAVE APPROVAL RELIABILITY: OLD vs NEW (data comparison) ===\n');
  console.log(
    'Each case: snapshot DB → run OLD heavy path → fingerprint → restore → run NEW path → compare → restore\n'
  );
}

function printCaseRow(r) {
  const icon =
    r.verdict === 'PASS'
      ? '✓'
      : r.verdict === 'EXPECTED_DIFF'
        ? '○'
        : r.verdict === 'WARN'
          ? '△'
          : '✗';
  console.log(`${icon} ${r.case}`);
  console.log(`   Leave: ${r.leaveId}  emp: ${r.empNo}  type: ${r.leaveType}  status: ${r.status}`);
  console.log(`   Payroll months: ${r.months.join(', ')}`);
  console.log(`   OLD (full duplicate path): ${r.oldFp}  (${r.oldMs.toFixed(0)}ms)`);
  console.log(`   NEW (present system):      ${r.newFp}  (${r.newMs.toFixed(0)}ms)`);
  if (r.singlePassFp) {
    console.log(`   OLD single-pass (intended): ${r.singlePassFp}  (${r.singlePassMs?.toFixed(0)}ms)`);
    console.log(
      `   NEW matches single-pass OLD: ${r.singlePassMatch ? 'YES ✓' : 'NO ✗'}  (reliability target)`
    );
  }
  console.log(`   OLD full vs NEW: ${r.dataMatch ? 'YES' : 'NO'}  →  ${r.verdict}`);
  if (r.note) console.log(`   Note: ${r.note}`);
  if (VERBOSE && !r.dataMatch && r.verdict === 'FAIL') {
    console.log('   (Use --verbose with diff tooling if fingerprints differ unexpectedly)');
  }
  console.log('');
}

async function main() {
  printReportHeader();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  // Pre-register models used by reconciliation/populate in side-effect chain
  require('../departments/model/Department');
  require('../employees/model/Employee');
  const Leave = require('../leaves/model/Leave');

  const results = [];
  const skipped = [];
  const usedEmployeeIds = new Set();

  for (const caseDef of TEST_CASES) {
    const leave = await findLeaveForCase(Leave, caseDef, usedEmployeeIds);
    if (!leave) {
      skipped.push({ case: caseDef.name, reason: 'No matching leave in DB (unique employee)' });
      continue;
    }
    try {
      const r = await runCaseComparison(caseDef, leave);
      results.push(r);
      printCaseRow(r);
    } catch (err) {
      results.push({
        case: caseDef.name,
        verdict: 'ERROR',
        error: err.message,
      });
      console.log(`✗ ${caseDef.name}: ERROR — ${err.message}\n`);
    }
  }

  // Edit scenario: find approved leave with date range we can simulate old+new edit recalc
  const editLeave = await Leave.findOne({
    status: 'approved',
    isActive: { $ne: false },
    employeeId: { $nin: [...usedEmployeeIds].map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (editLeave) {
    const snap = leaveSnapFromDoc(editLeave);
    const oldSnap = {
      ...snap,
      fromDate: new Date(new Date(editLeave.fromDate).getTime() - 2 * 86400000),
      toDate: new Date(new Date(editLeave.toDate).getTime() - 2 * 86400000),
    };
    const employeeId = String(editLeave.employeeId);
    const months = await payrollMonthsForLeave(editLeave);
    const docSnapshot = await snapshotEmployeeDocs(employeeId, months);

    try {
      const { recalculateOnLeaveApproval } = require('../attendance/services/summaryCalculationService');
      const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
      const { runLeaveStatusSideEffects } = require('../leaves/services/leaveApprovalSideEffectsService');

      const t0 = process.hrtime.bigint();
      // OLD edit: hook recalc + controller old+new recalc (no extra PR in controller for edit)
      await recalculateOnLeaveApproval(snap);
      await syncPayRegisterFromLeave(snap);
      await recalculateOnLeaveApproval(oldSnap);
      await recalculateOnLeaveApproval(snap);
      const oldMs = Number(process.hrtime.bigint() - t0) / 1e6;
      const oldFp = (await captureEmployeeData(employeeId, months, editLeave.emp_no)).fingerprint;

      await restoreEmployeeDocs(docSnapshot);

      const t1 = process.hrtime.bigint();
      await runLeaveStatusSideEffects(snap, {
        forceHeavyRefresh: true,
        extraLeaveSnapshots: [oldSnap],
      });
      const newMs = Number(process.hrtime.bigint() - t1) / 1e6;
      const newFp = (await captureEmployeeData(employeeId, months, editLeave.emp_no)).fingerprint;

      const dataMatch = oldFp === newFp;
      const r = {
        case: '7_edit_approved_date_range',
        leaveId: String(editLeave._id),
        empNo: editLeave.emp_no,
        leaveType: editLeave.leaveType,
        status: editLeave.status,
        months,
        oldFp,
        newFp,
        dataMatch,
        verdict: dataMatch ? 'PASS' : 'FAIL',
        oldMs,
        newMs,
        note: 'OLD: recalc current + old range + duplicate. NEW: recalc old + new snapshots once each + PR.',
      };
      results.push(r);
      printCaseRow(r);
    } catch (err) {
      console.log(`✗ 7_edit_approved_date_range: ERROR — ${err.message}\n`);
      results.push({ case: '7_edit_approved_date_range', verdict: 'ERROR', error: err.message });
    } finally {
      await restoreEmployeeDocs(docSnapshot);
    }
  } else {
    skipped.push({ case: '7_edit_approved_date_range', reason: 'No approved leave for edit simulation' });
  }

  console.log('=== SUMMARY ===\n');
  const pass = results.filter((r) => r.verdict === 'PASS').length;
  const expectedDiff = results.filter((r) => r.verdict === 'EXPECTED_DIFF').length;
  const warn = results.filter((r) => r.verdict === 'WARN').length;
  const fail = results.filter((r) => r.verdict === 'FAIL').length;
  const errors = results.filter((r) => r.verdict === 'ERROR').length;

  console.log(`PASS (data matches):        ${pass}`);
  console.log(`EXPECTED_DIFF (by design):  ${expectedDiff}`);
  console.log(`WARN (review):              ${warn}`);
  console.log(`FAIL (data mismatch):       ${fail}`);
  console.log(`ERROR:                      ${errors}`);
  if (skipped.length) {
    console.log(`SKIPPED:                    ${skipped.length}`);
    for (const s of skipped) console.log(`  - ${s.case}: ${s.reason}`);
  }

  console.log('\n=== OLD vs NEW behavior (leave only) ===\n');
  const rows = [
    ['Scenario', 'Previous version', 'Present version', 'Data should match?'],
    [
      'Final approve',
      '2× monthly recalc + 1× pay register + 2× ESI (if ESI)',
      '1× recalc + 1× pay register + 1× ESI (deferred)',
      'Yes',
    ],
    [
      'HOD / HR intermediate',
      'Pay register full rebuild',
      'Balance only — no pay register rebuild',
      'No (intentional fix)',
    ],
    ['Rejected / cancelled', 'Pay register sync only', 'Recalc + pay register sync', 'May differ'],
    ['Edit approved dates', 'Recalc old + new + hook duplicate', 'Recalc old + new snapshots once', 'Yes'],
    ['HTTP response', 'Blocked until all heavy work done', 'Returns after save; heavy work in background', 'N/A'],
  ];
  for (const row of rows) {
    console.log(row.map((c, i) => String(c).padEnd(i === 0 ? 22 : 38)).join(' | '));
  }

  console.log('\nDone.\n');
  await mongoose.disconnect();

  const ok = fail === 0 && errors === 0;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
