/**
 * Audit MonthlyAttendanceSummary vs PayRegisterSummary for one payroll month (YYYY-MM).
 * Compares totalLeaves / paid+lop vs pay-register totals and leave-type breakdown from dailyRecords.
 *
 * Usage (from backend folder, Mongo available):
 *   node scripts/audit_monthly_summary_vs_payregister.js
 *   MONTH=2026-03 node scripts/audit_monthly_summary_vs_payregister.js
 *   MONTH=2026-03 ONLY_MISMATCHES=1 node scripts/audit_monthly_summary_vs_payregister.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const { computeLeaveTypeBreakdownFromDailyRecords } = require('../pay-register/services/totalsCalculationService');

function monthStr() {
  let m = process.env.MONTH || '2026-03';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) m = '2026-03';
  return m;
}

function sumBreakdownDays(dailyRecords) {
  const rows = computeLeaveTypeBreakdownFromDailyRecords(dailyRecords || []);
  return rows.reduce((s, r) => s + (Number(r.days) || 0), 0);
}

function badLeaveTypeLabels(dailyRecords) {
  const bad = { paid: 0, lop: 0, other: 0 };
  if (!Array.isArray(dailyRecords)) return bad;
  for (const dr of dailyRecords) {
    const check = (lt) => {
      const x = String(lt || '').toLowerCase();
      if (x === 'paid') bad.paid += 1;
      else if (x === 'lop') bad.lop += 1;
    };
    check(dr.leaveType);
    check(dr.firstHalf?.leaveType);
    check(dr.secondHalf?.leaveType);
  }
  return bad;
}

async function run() {
  const MONTH = monthStr();
  const onlyMis = process.env.ONLY_MISMATCHES === '1' || process.env.ONLY_MISMATCHES === 'true';

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  const summaries = await MonthlyAttendanceSummary.find({ month: MONTH })
    .select(
      'employeeId emp_no month totalLeaves totalPaidLeaves totalLopLeaves totalPresentDays totalPayableShifts'
    )
    .lean();
  const byEmp = new Map();
  for (const s of summaries) {
    byEmp.set(String(s.employeeId), s);
  }

  const registers = await PayRegisterSummary.find({ month: MONTH })
    .select('employeeId emp_no month totals dailyRecords summaryLocked')
    .lean();

  const lines = [];
  lines.push(`Audit month=${MONTH} summaries=${summaries.length} payRegisters=${registers.length}`);

  let mismatch = 0;
  for (const pr of registers) {
    const sid = String(pr.employeeId);
    const mas = byEmp.get(sid);
    const tl = Number(pr.totals?.totalLeaveDays) || 0;
    const gridSum = sumBreakdownDays(pr.dailyRecords);
    const masLeaves = mas != null ? Number(mas.totalLeaves) || 0 : null;
    const d1 = Math.abs(tl - gridSum);
    const d2 = mas != null ? Math.abs(tl - masLeaves) : null;
    const bad = badLeaveTypeLabels(pr.dailyRecords);
    const hasBad = bad.paid + bad.lop > 0;

    const flag =
      d1 > 0.051 ||
      (d2 != null && d2 > 0.051) ||
      hasBad ||
      mas == null;

    if (onlyMis && !flag) continue;

    if (flag) mismatch++;

    lines.push(
      JSON.stringify({
        emp_no: pr.emp_no,
        employeeId: sid,
        hasMonthlySummary: !!mas,
        mas_totalLeaves: masLeaves,
        pr_totalLeaveDays: tl,
        breakdownSumFromGrid: Math.round(gridSum * 100) / 100,
        abs_pr_minus_grid: Math.round(d1 * 100) / 100,
        abs_pr_minus_mas: d2 == null ? null : Math.round(d2 * 100) / 100,
        halfRowsWith_leaveType_paid_or_lop: bad,
        summaryLocked: !!pr.summaryLocked,
      })
    );
  }

  const prIds = new Set(registers.map((r) => String(r.employeeId)));
  let orphanSummary = 0;
  for (const s of summaries) {
    if (!prIds.has(String(s.employeeId))) {
      orphanSummary++;
      if (!onlyMis) {
        lines.push(
          JSON.stringify({
            emp_no: s.emp_no,
            employeeId: String(s.employeeId),
            note: 'Monthly summary exists but no pay register row for this month',
            mas_totalLeaves: s.totalLeaves,
          })
        );
      }
    }
  }

  lines.push(`Rows flagged (mismatch or bad leaveType label or missing MAS): ${mismatch}`);
  lines.push(`Monthly summaries without pay register: ${orphanSummary}`);

  console.log(lines.join('\n'));
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
