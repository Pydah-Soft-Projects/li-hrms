/**
 * One-time repair for leave register reversal-credit pollution.
 *
 * What it does:
 * 1) Removes CREDIT transactions where reason includes "Leave Application Cancelled/Reversed"
 *    for the target employee + payroll cycle month/year.
 * 2) Recalculates LeaveRegisterYear ledger balances (CL/CCL/EL/LOP) from start of target cycle.
 * 3) Recalculates monthly attendance summary for the target month (YYYY-MM).
 *
 * Usage:
 *   node scripts/repair_leave_register_reversal_pollution.js --empNo 1974 --month 2026-04
 *
 * Optional:
 *   --dryRun true   (no writes, only prints counts)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const summaryCalculationService = require('../attendance/services/summaryCalculationService');
const dateCycleService = require('../leaves/services/dateCycleService');

function parseArg(name) {
  const key = String(name).replace(/^--/, '');
  const idx = process.argv.findIndex((a) => a === `--${key}`);
  if (idx >= 0 && process.argv[idx + 1] != null) return process.argv[idx + 1];
  return undefined;
}

function parseBool(v, defaultValue = false) {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

function normalizeMonthArg(monthArg) {
  if (!monthArg || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthArg)) {
    throw new Error(`Invalid --month "${monthArg}". Expected YYYY-MM`);
  }
  const [year, month] = monthArg.split('-').map(Number);
  return { year, month, monthArg };
}

async function getEmployeeByEmpNo(empNo) {
  return Employee.findOne({ emp_no: String(empNo).trim() })
    .select('_id emp_no employee_name')
    .lean();
}

async function removeReversalCreditsForCycle(employeeId, year, month, dryRun) {
  const slotAnchorDate = new Date(`${year}-${String(month).padStart(2, '0')}-15T00:00:00.000Z`);
  const periodInfo = await dateCycleService.getPeriodInfo(slotAnchorDate);
  const financialYear = periodInfo?.financialYear?.name;
  const cycleMonth = Number(periodInfo?.payrollCycle?.month);
  const cycleYear = Number(periodInfo?.payrollCycle?.year);
  const cycleStart = periodInfo?.payrollCycle?.startDate;

  if (!financialYear || !cycleMonth || !cycleYear || !cycleStart) {
    throw new Error('Could not resolve payroll cycle/financial year');
  }

  const doc = await LeaveRegisterYear.findOne({
    employeeId,
    financialYear,
  });

  if (!doc) {
    return {
      financialYear,
      cycleMonth,
      cycleYear,
      cycleStart,
      removedCount: 0,
      affectedTypes: [],
      txBefore: 0,
      txAfter: 0,
    };
  }

  const slot = (doc.months || []).find(
    (m) =>
      Number(m.payrollCycleMonth) === cycleMonth &&
      Number(m.payrollCycleYear) === cycleYear
  );

  if (!slot) {
    return {
      financialYear,
      cycleMonth,
      cycleYear,
      cycleStart,
      removedCount: 0,
      affectedTypes: [],
      txBefore: 0,
      txAfter: 0,
    };
  }

  const before = Array.isArray(slot.transactions) ? slot.transactions.length : 0;
  const affectedTypes = new Set();
  let removedCount = 0;

  const filtered = (slot.transactions || []).filter((tx) => {
    const isReversalCredit =
      String(tx?.transactionType || '').toUpperCase() === 'CREDIT' &&
      String(tx?.reason || '').includes('Leave Application Cancelled/Reversed');
    if (isReversalCredit) {
      removedCount += 1;
      if (tx?.leaveType) affectedTypes.add(String(tx.leaveType).toUpperCase());
      return false;
    }
    return true;
  });

  const after = filtered.length;

  if (!dryRun && removedCount > 0) {
    slot.transactions = filtered;
    doc.markModified('months');
    await doc.save();

    // Re-chain balances from cycle start for relevant leave types.
    const recalcTypes = affectedTypes.size > 0 ? Array.from(affectedTypes) : ['CL', 'CCL', 'EL'];
    for (const t of recalcTypes) {
      await leaveRegisterYearLedgerService.recalculateRegisterBalances(
        employeeId,
        t === 'LOP' ? 'LOP' : t,
        cycleStart
      );
    }
  }

  return {
    financialYear,
    cycleMonth,
    cycleYear,
    cycleStart,
    removedCount,
    affectedTypes: Array.from(affectedTypes),
    txBefore: before,
    txAfter: after,
  };
}

async function recalcMonthlySummary(empNo, monthArg, dryRun) {
  if (dryRun) return { skipped: true };
  const summary = await summaryCalculationService.calculateMonthlySummaryByEmpNo(empNo, monthArg);
  return {
    skipped: false,
    month: summary?.month,
    totalLeaveDays: summary?.totalLeaveDays,
    totalPaidLeaveDays: summary?.totalPaidLeaveDays,
    totalLopLeaveDays: summary?.totalLopLeaveDays,
  };
}

async function main() {
  const empNo = parseArg('empNo');
  const monthArg = parseArg('month');
  const dryRun = parseBool(parseArg('dryRun'), false);

  if (!empNo) throw new Error('Missing --empNo');
  const { year, month } = normalizeMonthArg(monthArg);

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 60000 });

  const employee = await getEmployeeByEmpNo(empNo);
  if (!employee) throw new Error(`Employee not found for emp_no ${empNo}`);

  const repair = await removeReversalCreditsForCycle(employee._id, year, month, dryRun);
  const summary = await recalcMonthlySummary(employee.emp_no, `${year}-${String(month).padStart(2, '0')}`, dryRun);

  console.log(
    JSON.stringify(
      {
        employee: {
          _id: String(employee._id),
          emp_no: employee.emp_no,
          employee_name: employee.employee_name,
        },
        dryRun,
        repair,
        summary,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});

