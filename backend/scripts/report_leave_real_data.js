/**
 * Real-data report: leave register + MonthlyLeaveRecord + MonthlyAttendanceSummary
 * for sample leaves (approved, rejected, cancelled, hod_approved).
 *
 * Optionally compares OLD vs NEW heavy-path output field-by-field (restores DB after).
 *
 * Usage:
 *   node scripts/report_leave_real_data.js
 *   node scripts/report_leave_real_data.js --compare-paths
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const COMPARE_PATHS = process.argv.includes('--compare-paths');

function fmt(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toISOString().slice(0, 10);
}

function pickSummary(obj, keys) {
  if (!obj) return null;
  const out = {};
  for (const k of keys) {
    if (obj[k] != null) out[k] = obj[k];
  }
  return Object.keys(out).length ? out : null;
}

async function calendarMonthsForLeave(leave) {
  const { extractISTComponents, createISTDate } = require('../shared/utils/dateUtils');
  const { year: sy, month: sm } = extractISTComponents(leave.fromDate);
  const { year: ey, month: em } = extractISTComponents(leave.toDate);
  const months = new Set();
  let cur = createISTDate(`${sy}-${String(sm).padStart(2, '0')}-01`);
  const end = createISTDate(`${ey}-${String(em).padStart(2, '0')}-01`);
  while (cur <= end) {
    const { year, month } = extractISTComponents(cur);
    months.add(`${year}-${String(month).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1);
  }
  return [...months];
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

async function getRegisterDebitsForLeave(leave) {
  const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
  const dateCycleService = require('../leaves/services/dateCycleService');
  const fy = await dateCycleService.getFinancialYearForDate(leave.fromDate);
  const doc = await LeaveRegisterYear.findOne({
    employeeId: leave.employeeId,
    financialYear: fy.name,
  }).lean();
  if (!doc?.months?.length) return { financialYear: fy.name, debits: [] };

  const appId = String(leave._id);
  const debits = [];
  for (const slot of doc.months) {
    for (const tx of slot.transactions || []) {
      if (String(tx.applicationId || '') !== appId) continue;
      if (String(tx.transactionType || '').toUpperCase() !== 'DEBIT') continue;
      debits.push({
        leaveType: tx.leaveType,
        days: tx.days,
        openingBalance: tx.openingBalance,
        closingBalance: tx.closingBalance,
        startDate: fmt(tx.startDate),
        endDate: fmt(tx.endDate),
        payrollSlot: `${slot.payrollCycleYear}-${String(slot.payrollCycleMonth).padStart(2, '0')}`,
        monthlyApplyApproved: slot.monthlyApplyApproved,
        monthlyApplyConsumed: slot.monthlyApplyConsumed,
      });
    }
  }
  return { financialYear: fy.name, debits };
}

async function captureReport(leave) {
  const MonthlyLeaveRecord = require('../leaves/model/MonthlyLeaveRecord');
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const { getPayrollDateRange } = require('../shared/utils/dateUtils');

  const calMonths = await calendarMonthsForLeave(leave);
  const payMonths = await payrollMonthsForLeave(leave);
  const register = await getRegisterDebitsForLeave(leave);

  const monthlyLeaveRecords = {};
  for (const month of calMonths) {
    const rec = await MonthlyLeaveRecord.findOne({ employeeId: leave.employeeId, month })
      .select('month summary leaveIds')
      .lean();
    monthlyLeaveRecords[month] = rec
      ? {
          totalLeaves: rec.summary?.totalLeaves,
          paidLeaves: rec.summary?.paidLeaves,
          lopLeaves: rec.summary?.lopLeaves,
          withoutPayLeaves: rec.summary?.withoutPayLeaves,
          leaveTypes: (rec.summary?.leaveTypesBreakdown || []).map((t) => ({
            type: t.leaveType,
            days: t.days,
          })),
          includesThisLeave: (rec.leaveIds || []).some((id) => String(id) === String(leave._id)),
        }
      : null;
  }

  const attendanceSummaries = {};
  const payRegisterLeaveDays = {};
  for (const month of payMonths) {
    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);

    const ms = await MonthlyAttendanceSummary.findOne({ employeeId: leave.employeeId, month }).lean();
    attendanceSummaries[month] = ms
      ? pickSummary(ms, [
          'totalPresentDays',
          'totalAbsentDays',
          'totalLeaves',
          'totalPaidLeaves',
          'totalLopLeaves',
          'totalWeeklyOffs',
          'totalHolidays',
          'lateEarlyDeductionDays',
          'absentDeductionDays',
        ])
      : null;

    const pr = await PayRegisterSummary.findOne({ employeeId: leave.employeeId, month })
      .select('dailyRecords totals')
      .lean();
    const leaveCells = (pr?.dailyRecords || []).filter(
      (d) =>
        d.date >= startDate &&
        d.date <= endDate &&
        (d.status === 'leave' ||
          d.leaveType ||
          d.firstHalf?.status === 'leave' ||
          d.secondHalf?.status === 'leave')
    );
    payRegisterLeaveDays[month] = {
      leaveCellCount: leaveCells.length,
      leaveTypesOnGrid: [...new Set(leaveCells.map((c) => c.leaveType || c.status).filter(Boolean))],
      totalsPresent: pr?.totals?.presentDays,
      totalsLeave: pr?.totals?.leaveDays,
      totalsLop: pr?.totals?.lopDays,
    };
  }

  return {
    register,
    monthlyLeaveRecords,
    attendanceSummaries,
    payRegisterLeaveDays,
    calMonths,
    payMonths,
  };
}

function printLeaveHeader(label, leave) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`${label}`);
  console.log(`${'='.repeat(72)}`);
  console.log(`Leave ID     : ${leave._id}`);
  console.log(`Employee     : ${leave.emp_no}`);
  console.log(`Type         : ${leave.leaveType}`);
  console.log(`Status       : ${leave.status}`);
  console.log(`Dates        : ${fmt(leave.fromDate)} → ${fmt(leave.toDate)}`);
  console.log(`Days         : ${leave.numberOfDays}${leave.isHalfDay ? ' (half day)' : ''}`);
}

function printReportBlock(title, data) {
  console.log(`\n--- ${title} ---`);
  console.log(JSON.stringify(data, null, 2));
}

function diffObjects(a, b) {
  const diffs = [];
  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of allKeys) {
    const va = JSON.stringify(a?.[k]);
    const vb = JSON.stringify(b?.[k]);
    if (va !== vb) diffs.push({ field: k, old: a?.[k], new: b?.[k] });
  }
  return diffs;
}

async function snapshotDocs(employeeId, payMonths, calMonths) {
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  return {
    pr: await PayRegisterSummary.find({ employeeId, month: { $in: payMonths } }).lean(),
    ms: await MonthlyAttendanceSummary.find({ employeeId, month: { $in: payMonths } }).lean(),
    ml: await require('../leaves/model/MonthlyLeaveRecord')
      .find({ employeeId, month: { $in: calMonths } })
      .lean(),
  };
}

async function restoreDocs(snap, employeeId, payMonths, calMonths) {
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const MonthlyLeaveRecord = require('../leaves/model/MonthlyLeaveRecord');
  await PayRegisterSummary.deleteMany({ employeeId, month: { $in: payMonths } });
  await MonthlyAttendanceSummary.deleteMany({ employeeId, month: { $in: payMonths } });
  await MonthlyLeaveRecord.deleteMany({ employeeId, month: { $in: calMonths } });
  if (snap.pr.length) await PayRegisterSummary.insertMany(snap.pr);
  if (snap.ms.length) await MonthlyAttendanceSummary.insertMany(snap.ms);
  if (snap.ml.length) await MonthlyLeaveRecord.insertMany(snap.ml);
}

async function runOldSinglePass(snap) {
  const { recalculateOnLeaveApproval } = require('../attendance/services/summaryCalculationService');
  const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
  if (snap.status === 'approved') await recalculateOnLeaveApproval(snap);
  const prStatuses = new Set(['approved', 'hod_approved', 'hr_approved', 'rejected', 'cancelled']);
  if (prStatuses.has(snap.status)) await syncPayRegisterFromLeave(snap);
}

async function runNewPath(snap, options = {}) {
  const { runLeaveStatusSideEffects } = require('../leaves/services/leaveApprovalSideEffectsService');
  await runLeaveStatusSideEffects(snap, options);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  require('../departments/model/Department');
  require('../employees/model/Employee');

  const Leave = require('../leaves/model/Leave');

  const scenarios = [
    { label: 'FINAL APPROVED (CL/LOP)', query: { status: 'approved', isActive: { $ne: false } }, limit: 2 },
    { label: 'HOD INTERMEDIATE', query: { status: 'hod_approved', isActive: { $ne: false } }, limit: 1 },
    { label: 'REJECTED', query: { status: 'rejected', isActive: { $ne: false } }, limit: 1 },
    { label: 'CANCELLED', query: { status: 'cancelled', isActive: { $ne: false } }, limit: 1 },
  ];

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  LEAVE REAL DATA REPORT (from live MongoDB)                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`Generated: ${new Date().toISOString()}`);

  for (const sc of scenarios) {
    const leaves = await Leave.find(sc.query).sort({ updatedAt: -1 }).limit(sc.limit).lean();
    if (!leaves.length) {
      console.log(`\n[${sc.label}] — no sample leave in database`);
      continue;
    }

    for (const leave of leaves) {
      printLeaveHeader(sc.label, leave);
      const report = await captureReport(leave);

      printReportBlock(
        `LEAVE REGISTER (FY ${report.register.financialYear}) — DEBIT rows for this application`,
        report.register.debits.length
          ? report.register.debits
          : { note: 'No DEBIT row (expected if not finally approved or register not posted)' }
      );

      printReportBlock('MONTHLY LEAVE RECORD (calendar month analytics)', report.monthlyLeaveRecords);
      printReportBlock('MONTHLY ATTENDANCE SUMMARY (payroll month totals)', report.attendanceSummaries);
      printReportBlock('PAY REGISTER leave on grid', report.payRegisterLeaveDays);

      if (COMPARE_PATHS && ['approved', 'rejected', 'cancelled', 'hod_approved'].includes(leave.status)) {
        const snap = {
          _id: leave._id,
          employeeId: leave.employeeId,
          emp_no: leave.emp_no,
          fromDate: leave.fromDate,
          toDate: leave.toDate,
          status: leave.status,
          leaveType: leave.leaveType,
        };
        const calMonths = report.calMonths;
        const payMonths = report.payMonths;
        const docSnap = await snapshotDocs(String(leave.employeeId), payMonths, calMonths);

        try {
          await runOldSinglePass(snap);
          const afterOld = await captureReport(leave);
          await restoreDocs(docSnap, String(leave.employeeId), payMonths, calMonths);

          await runNewPath(snap);
          const afterNew = await captureReport(leave);

          console.log('\n--- PATH COMPARE: single-pass OLD vs NEW (attendance summary) ---');
          for (const m of payMonths) {
            const diffs = diffObjects(afterOld.attendanceSummaries[m], afterNew.attendanceSummaries[m]);
            if (diffs.length) {
              console.log(`  Payroll month ${m} — ${diffs.length} field(s) differ:`);
              for (const d of diffs) {
                console.log(`    ${d.field}: OLD=${JSON.stringify(d.old)}  NEW=${JSON.stringify(d.new)}`);
              }
            } else {
              console.log(`  Payroll month ${m} — MATCH`);
            }
          }
          console.log('\n--- PATH COMPARE: pay register leave cells ---');
          for (const m of payMonths) {
            const o = afterOld.payRegisterLeaveDays[m];
            const n = afterNew.payRegisterLeaveDays[m];
            const match =
              o?.leaveCellCount === n?.leaveCellCount &&
              JSON.stringify(o?.totalsLeave) === JSON.stringify(n?.totalsLeave);
            console.log(
              `  ${m}: cells OLD=${o?.leaveCellCount} NEW=${n?.leaveCellCount} | leave totals OLD=${o?.totalsLeave} NEW=${n?.totalsLeave} → ${match ? 'MATCH' : 'DIFF'}`
            );
          }
        } finally {
          await restoreDocs(docSnap, String(leave.employeeId), payMonths, calMonths);
        }
      }
    }
  }

  console.log('\n\nDone.\n');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
