/**
 * Exercise monthly apply cap helpers and optional DB sync.
 *
 * Usage:
 *   node scripts/test_monthly_apply_cap_edge_cases.js
 *   node scripts/test_monthly_apply_cap_edge_cases.js <employeeId24hex> <fromDate YYYY-MM-DD>
 *
 * With employee + date: runs syncStoredMonthApplyFieldsForEmployeeDate and prints slot summary.
 * Requires MONGODB_URI or mongodb://127.0.0.1:27017/hrms (see script).
 */

const mongoose = require('mongoose');

const {
  countedDaysForLeave,
  CAP_COUNT_STATUSES,
} = require('../leaves/services/monthlyApplicationCapService');

async function runUnitSmoke() {
  const policy = { earnedLeave: { enabled: true, useAsPaidInPayroll: false }, monthlyLeaveApplicationCap: { includeEL: true } };

  const plain = { leaveType: 'CL', numberOfDays: 1, splitStatus: null };
  const d1 = countedDaysForLeave(plain, policy);
  if (d1 !== 1) throw new Error(`expected CL 1 day counted as 1, got ${d1}`);

  const lopOnly = { leaveType: 'LOP', numberOfDays: 1, splitStatus: null };
  const d0 = countedDaysForLeave(lopOnly, policy);
  if (d0 !== 0) throw new Error(`expected LOP 0 toward pooled cap, got ${d0}`);

  console.log('Unit smoke: countedDaysForLeave (CL vs LOP) — OK');
  console.log('CAP_COUNT_STATUSES (sample):', CAP_COUNT_STATUSES.slice(0, 4).join(', '), '…');
}

async function runDbSync(employeeId, fromDate) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hrms';
  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/\/\/.*@/, '//***@'));

  const svc = require('../leaves/services/leaveRegisterYearMonthlyApplyService');
  const out = await svc.syncStoredMonthApplyFieldsForEmployeeDate(employeeId, fromDate);
  console.log('syncStoredMonthApplyFieldsForEmployeeDate:', JSON.stringify(out, null, 2));

  const ctx = await svc.getApplyPeriodContextForEmployee(employeeId, fromDate, { refresh: false });
  if (ctx.ok) {
    console.log('getApplyPeriodContextForEmployee:', {
      monthlyApplyCeiling: ctx.monthlyApplyCeiling,
      monthlyApplyConsumed: ctx.monthlyApplyConsumed,
      monthlyApplyLocked: ctx.monthlyApplyLocked,
      monthlyApplyApproved: ctx.monthlyApplyApproved,
      monthlyApplyRemaining: ctx.monthlyApplyRemaining,
    });
  } else {
    console.log('context error', ctx);
  }

  await mongoose.disconnect();
}

async function main() {
  await runUnitSmoke();

  const emp = process.argv[2];
  const from = process.argv[3];
  if (emp && from) {
    await runDbSync(emp, from);
  } else {
    console.log('\nOptional: pass <employeeId> <fromDate> to run DB sync against your cluster.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
