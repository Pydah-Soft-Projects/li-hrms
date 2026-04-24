/**
 * After monthly summaries are recalculated, push snapshots/parity + synced totals
 * onto existing PayRegisterSummary rows (no MSSQL / full repopulate).
 *
 *   MONTH=2026-03 node scripts/reapply_payregister_from_monthly_summary_month.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { applyPayRegisterParityFromMonthlySummary } = require('../pay-register/services/autoPopulationService');
const { syncTotalsFromMonthlySummary } = require('../pay-register/services/totalsCalculationService');
const { applyContributingDatesFromMonthlySummary } = require('../pay-register/services/contributingDatesService');
const { recalculatePayRegisterAttendanceDeduction } = require('../pay-register/services/payRegisterAttendanceDeductionService');

async function run() {
  let month = process.env.MONTH || '2026-03';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) month = '2026-03';
  const [year, monthNum] = month.split('-').map(Number);

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  const prs = await PayRegisterSummary.find({ month }).select('_id').lean();
  let ok = 0;
  let skipLocked = 0;
  let skipNoSummary = 0;
  let fail = 0;

  for (const { _id } of prs) {
    const payRegister = await PayRegisterSummary.findById(_id);
    if (!payRegister) continue;
    if (payRegister.summaryLocked) {
      skipLocked++;
      continue;
    }
    const summary = await MonthlyAttendanceSummary.findOne({
      employeeId: payRegister.employeeId,
      month,
    });
    if (!summary) {
      skipNoSummary++;
      continue;
    }
    try {
      await applyPayRegisterParityFromMonthlySummary(
        payRegister.dailyRecords,
        summary,
        payRegister.employeeId,
        payRegister.emp_no,
        year,
        monthNum
      );
      await syncTotalsFromMonthlySummary(payRegister, summary);
      applyContributingDatesFromMonthlySummary(payRegister, summary);
      payRegister.lastAutoSyncedAt = new Date();
      payRegister.markModified('dailyRecords');
      await recalculatePayRegisterAttendanceDeduction(payRegister);
      await payRegister.save();
      ok++;
    } catch (e) {
      console.error(String(payRegister.emp_no), e.message);
      fail++;
    }
  }

  console.log(
    JSON.stringify({
      month,
      payRegisters: prs.length,
      reapplied: ok,
      skipLocked,
      skipNoSummary,
      fail,
    })
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
