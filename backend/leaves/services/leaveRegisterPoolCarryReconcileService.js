/**
 * Strip + replay monthly pool carry for one employee after register debits change.
 *
 * **Self-contained** in this module (no leaveRegisterYearService / monthlyPoolCarryForwardService /
 * leaveRegisterYearLedgerService / leaveRegisterService / leaveRegisterYearMonthlyApplyService).
 *
 * **CL carry** is pool-based: unused amount rolled = max(0, clCredits + transferIn − usedCl)
 * where clCredits is the monthly scheduled amount and transferIn is the amount carried from previous month.
 *
 * **CCL / EL** carry still uses scheduled pool on the slot (compensatoryOffs/elCredits − used), unchanged.
 *
 * Models / infra only: LeaveRegisterYear, Employee, LeavePolicySettings, Settings, dateUtils (IST).
 */

const mongoose = require('mongoose');
const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const Employee = require('../../employees/model/Employee');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const Settings = require('../../settings/model/Settings');
const { createISTDate, getTodayISTDateString, extractISTComponents } = require('../../shared/utils/dateUtils');

async function getPayrollCycleSettingsLocal() {
  try {
    const cfg = await Settings.getSettingsByCategory('payroll');
    const startDay = Math.min(31, Math.max(1, parseInt(cfg.payroll_cycle_start_day, 10) || 1));
    const endDay = Math.min(31, Math.max(1, parseInt(cfg.payroll_cycle_end_day, 10) || 31));
    return { startDay, endDay };
  } catch {
    return { startDay: 1, endDay: 31 };
  }
}

async function getPayrollCycleForDateLocal(date = new Date()) {
  const { startDay, endDay } = await getPayrollCycleSettingsLocal();
  const ist = extractISTComponents(new Date(date));
  const day = ist.day;
  const month1Based = ist.month;
  const year = ist.year;

  if (startDay === 1 && endDay >= 28) {
    const startDate = createISTDate(`${year}-${String(month1Based).padStart(2, '0')}-01`);
    const lastDay = new Date(year, month1Based, 0).getDate();
    const endDate = createISTDate(
      `${year}-${String(month1Based).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      '23:59'
    );
    return { startDate, endDate, month: month1Based, year, isCustomCycle: false };
  }

  let cycleStartDate;
  let cycleEndDate;
  if (day >= startDay) {
    cycleStartDate = createISTDate(`${year}-${String(month1Based).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`);
    const nextMonth = month1Based === 12 ? 1 : month1Based + 1;
    const nextYear = month1Based === 12 ? year + 1 : year;
    const lastDayNext = new Date(nextYear, nextMonth, 0).getDate();
    const endDayActual = Math.min(endDay, lastDayNext);
    cycleEndDate = createISTDate(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(endDayActual).padStart(2, '0')}`,
      '23:59'
    );
  } else {
    const prevMonth = month1Based === 1 ? 12 : month1Based - 1;
    const prevYear = month1Based === 1 ? year - 1 : year;
    cycleStartDate = createISTDate(`${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`);
    const lastDayCur = new Date(year, month1Based, 0).getDate();
    const endDayActual = Math.min(endDay, lastDayCur);
    cycleEndDate = createISTDate(
      `${year}-${String(month1Based).padStart(2, '0')}-${String(endDayActual).padStart(2, '0')}`,
      '23:59'
    );
  }
  const endIST = extractISTComponents(cycleEndDate);
  return {
    startDate: cycleStartDate,
    endDate: cycleEndDate,
    month: endIST.month,
    year: endIST.year,
    isCustomCycle: true,
  };
}

async function getFinancialYearForDateLocal(date = new Date()) {
  let leaveSettings = {};
  try {
    leaveSettings = await LeavePolicySettings.getSettings();
  } catch {
    leaveSettings = { financialYear: { useCalendarYear: true } };
  }
  const targetDate = new Date(date);
  if (leaveSettings.financialYear?.useCalendarYear) {
    return {
      startDate: new Date(targetDate.getFullYear(), 0, 1),
      endDate: new Date(targetDate.getFullYear(), 11, 31),
      year: targetDate.getFullYear(),
      name: `${targetDate.getFullYear()}`,
      isCustomYear: false,
    };
  }
  const { startMonth, startDay } = leaveSettings.financialYear;
  let fyStartDate;
  let fyEndDate;
  let fyYear;
  if (
    targetDate.getMonth() + 1 > startMonth ||
    (targetDate.getMonth() + 1 === startMonth && targetDate.getDate() >= startDay)
  ) {
    fyStartDate = new Date(targetDate.getFullYear(), startMonth - 1, startDay);
    fyEndDate = new Date(targetDate.getFullYear() + 1, startMonth - 1, startDay - 1);
    fyYear = targetDate.getFullYear();
  } else {
    fyStartDate = new Date(targetDate.getFullYear() - 1, startMonth - 1, startDay);
    fyEndDate = new Date(targetDate.getFullYear(), startMonth - 1, startDay - 1);
    fyYear = targetDate.getFullYear() - 1;
  }
  return {
    startDate: fyStartDate,
    endDate: fyEndDate,
    year: fyYear,
    name: `${fyYear}-${fyYear + 1}`,
    isCustomYear: true,
  };
}

async function getPeriodInfoLocal(date = new Date()) {
  const [payrollCycle, financialYear] = await Promise.all([
    getPayrollCycleForDateLocal(date),
    getFinancialYearForDateLocal(date),
  ]);
  return { date, payrollCycle, financialYear };
}

const TX = {
  CL_FORFEIT: 'MONTHLY_POOL_FORFEIT_CL',
  CCL_FORFEIT: 'MONTHLY_POOL_FORFEIT_CCL',
  EL_FORFEIT: 'MONTHLY_POOL_FORFEIT_EL',
};

function toObjectId(employeeId) {
  const s = String(employeeId || '').trim();
  if (!s) return null;
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : employeeId;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function roundHalf(x) {
  const n = Number(x) || 0;
  if (n <= 0) return 0;
  return Math.round(n * 2) / 2;
}

function istDateStr(d) {
  if (d == null) return null;
  return extractISTComponents(d).dateStr;
}

function isPayrollPeriodClosedBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr < effStr;
}

function isLegacyMonthlyPoolCarryReason(reason) {
  const r = String(reason || '').toLowerCase();
  return (
    r.includes('unused monthly apply pool') &&
    (r.startsWith('transfer in') || r.startsWith('transfer out'))
  );
}

function isMonthlyPoolTransferOutTx(t) {
  const ag = String(t?.autoGeneratedType || '');
  if (ag.startsWith('MONTHLY_POOL_TRANSFER_OUT_')) return true;
  return (
    String(t?.transactionType || '').toUpperCase() === 'DEBIT' &&
    t?.autoGenerated === true &&
    isLegacyMonthlyPoolCarryReason(t?.reason) &&
    String(t?.reason || '').toLowerCase().startsWith('transfer out')
  );
}

function isMonthlyPoolCarrySlotTransaction(t) {
  const ag = String(t?.autoGeneratedType || '');
  if (ag.startsWith('MONTHLY_POOL_TRANSFER_OUT_') || ag.startsWith('MONTHLY_POOL_TRANSFER_IN_')) return true;
  if (t?.autoGenerated !== true) return false;
  const lt = String(t?.leaveType || '').toUpperCase();
  if (lt !== 'CL' && lt !== 'CCL' && lt !== 'EL') return false;
  return isLegacyMonthlyPoolCarryReason(t?.reason);
}

function sumMonthlyPoolTransferInDaysOnSlot(slot, leaveType) {
  const lt = String(leaveType || '').toUpperCase();
  const txs = Array.isArray(slot?.transactions) ? slot.transactions : [];
  let s = 0;
  for (const t of txs) {
    if (String(t?.leaveType || '').toUpperCase() !== lt) continue;
    const ag = String(t?.autoGeneratedType || '');
    if (ag.startsWith('MONTHLY_POOL_TRANSFER_IN_')) {
      s += Math.max(0, Number(t?.days) || 0);
      continue;
    }
    if (
      String(t?.transactionType || '').toUpperCase() === 'CREDIT' &&
      t?.autoGenerated === true &&
      isLegacyMonthlyPoolCarryReason(t?.reason) &&
      String(t?.reason || '').toLowerCase().startsWith('transfer in')
    ) {
      s += Math.max(0, Number(t?.days) || 0);
    }
  }
  return round2(s);
}

function sumUsedDaysForType(slot, leaveType) {
  const txs = Array.isArray(slot?.transactions) ? slot.transactions : [];
  const wantType = String(leaveType || '').toUpperCase();
  return round2(
    txs
      .filter((t) => {
        const tType = String(t?.transactionType || '').trim().toUpperCase();
        if (tType !== 'DEBIT') return false;
        
        const lt = String(t?.leaveType || '').trim().toUpperCase();
        if (lt !== wantType) return false;

        const status = String(t?.status || 'APPROVED').toUpperCase();
        if (status !== 'APPROVED' && status !== 'PENDING') return false;

        if (isMonthlyPoolTransferOutTx(t)) return false;

        return true;
      })
      .reduce((s, t) => s + Math.max(0, Number(t?.days) || 0), 0)
  );
}

function sumTotalPooledUsedDays(slot) {
  const txs = Array.isArray(slot?.transactions) ? slot.transactions : [];
  return round2(
    txs
      .filter((t) => {
        const tType = String(t?.transactionType || '').trim().toUpperCase();
        if (tType !== 'DEBIT') return false;
        
        const lt = String(t?.leaveType || '').trim().toUpperCase();
        if (lt !== 'CL' && lt !== 'CCL' && lt !== 'EL') return false;

        const status = String(t?.status || 'APPROVED').toUpperCase();
        if (status !== 'APPROVED' && status !== 'PENDING') return false;

        if (isMonthlyPoolTransferOutTx(t)) return false;

        return true;
      })
      .reduce((s, t) => s + Math.max(0, Number(t?.days) || 0), 0)
  );
}

function stripMonthlyPoolTransferArtifactsFromMonths(months) {
  if (!Array.isArray(months)) return;
  for (const slot of months) {
    if (!slot) continue;
    if (!Array.isArray(slot.transactions)) slot.transactions = [];
    const pin = slot.poolCarryForwardIn || {};
    const clIn = round2(Number(pin.cl) || 0);
    const cclIn = round2(Number(pin.ccl) || 0);
    const elIn = round2(Number(pin.el) || 0);
    const clInTx = sumMonthlyPoolTransferInDaysOnSlot(slot, 'CL');
    const cclInTx = sumMonthlyPoolTransferInDaysOnSlot(slot, 'CCL');
    const elInTx = sumMonthlyPoolTransferInDaysOnSlot(slot, 'EL');
    const clSubtract = round2(Math.max(clIn, clInTx));
    const cclSubtract = round2(Math.max(cclIn, cclInTx));
    const elSubtract = round2(Math.max(elIn, elInTx));
    if (clSubtract || cclSubtract || elSubtract) {
      slot.clCredits = round2(Math.max(0, (Number(slot.clCredits) || 0) - clSubtract));
      slot.compensatoryOffs = round2(Math.max(0, (Number(slot.compensatoryOffs) || 0) - cclSubtract));
      slot.elCredits = round2(Math.max(0, (Number(slot.elCredits) || 0) - elSubtract));
    }
    slot.transactions = slot.transactions.filter((t) => !isMonthlyPoolCarrySlotTransaction(t));
    delete slot.poolCarryForwardIn;
    delete slot.poolCarryForwardFromLabel;
    delete slot.poolCarryForwardOut;
    delete slot.poolCarryForwardOutAt;
    delete slot.poolCarryForwardAllocation;
  }
}

function findSlotIndex(months, pcMonth, pcYear) {
  if (!Array.isArray(months)) return -1;
  return months.findIndex(
    (m) => Number(m.payrollCycleMonth) === Number(pcMonth) && Number(m.payrollCycleYear) === Number(pcYear)
  );
}

function sortedSlotRefs(months) {
  return (months || [])
    .map((m, idx) => ({
      idx,
      m,
      t: new Date(m.payPeriodStart).getTime(),
    }))
    .sort((a, b) => a.t - b.t);
}

function findNextPayrollSlot(months, pcMonth, pcYear) {
  const arr = sortedSlotRefs(months);
  const cur = arr.findIndex(
    (x) => Number(x.m.payrollCycleMonth) === Number(pcMonth) && Number(x.m.payrollCycleYear) === Number(pcYear)
  );
  if (cur < 0 || cur >= arr.length - 1) return null;
  return arr[cur + 1];
}

function allocatePoolConsumption(U, clS, cclS, elS) {
  const clAlloc = Math.min(Math.max(0, U), Math.max(0, clS));
  let r = Math.max(0, U - clAlloc);
  const cclAlloc = Math.min(r, Math.max(0, cclS));
  r -= cclAlloc;
  const elAlloc = Math.min(r, Math.max(0, elS));
  return {
    U: Math.max(0, U),
    clAlloc,
    cclAlloc,
    elAlloc,
    clRem: Math.max(0, clS - clAlloc),
    cclRem: Math.max(0, cclS - cclAlloc),
    elRem: Math.max(0, elS - elAlloc),
  };
}

function resolveMonthlyPoolCarryRollFlags(policy) {
  const clRoll = policy?.carryForward?.casualLeave?.carryMonthlyClCreditToNextPayrollMonth !== false;
  const cclRoll = policy?.carryForward?.compensatoryOff?.carryMonthlyPoolToNextPayrollMonth !== false;
  const capCfg = policy?.monthlyLeaveApplicationCap;
  const includeEL = !!capCfg?.includeEL;
  const elPaidInPayroll = policy?.earnedLeave?.useAsPaidInPayroll !== false;
  const elInPool = !!policy?.earnedLeave?.enabled && includeEL && !elPaidInPayroll;
  const elRoll =
    elInPool && policy?.carryForward?.earnedLeave?.carryMonthlyPoolToNextPayrollMonth !== false;
  return { clRoll, cclRoll, elRoll, elInPool };
}

function sumPoolCarryEdgeTxDays(slot, direction, leaveType, fromLabel, nextLabel) {
  const lt = String(leaveType || '').toUpperCase();
  const ag =
    direction === 'OUT' ? `MONTHLY_POOL_TRANSFER_OUT_${lt}` : `MONTHLY_POOL_TRANSFER_IN_${lt}`;
  const needle = `payroll ${fromLabel} → ${nextLabel}`;
  let s = 0;
  for (const t of slot?.transactions || []) {
    if (String(t.autoGeneratedType || '') !== ag) continue;
    if (!String(t.reason || '').includes(needle)) continue;
    s += Math.max(0, Number(t.days) || 0);
  }
  return roundHalf(s);
}

function poolCarryMetadataMatchesClose(closeSlot, nextSlot, closingLabel, clC, cclC, elC) {
  if ((clC <= 0 && cclC <= 0 && elC <= 0) || !nextSlot) return false;
  if (!closeSlot.poolCarryForwardOutAt) return false;
  if (String(nextSlot.poolCarryForwardFromLabel || '') !== String(closingLabel)) return false;
  const out = closeSlot.poolCarryForwardOut || {};
  const inn = nextSlot.poolCarryForwardIn || {};
  return (
    roundHalf(Number(out.cl || 0)) === roundHalf(clC) &&
    roundHalf(Number(out.ccl || 0)) === roundHalf(cclC) &&
    roundHalf(Number(out.el || 0)) === roundHalf(elC) &&
    roundHalf(Number(inn.cl || 0)) >= roundHalf(clC) &&
    roundHalf(Number(inn.ccl || 0)) >= roundHalf(cclC) &&
    roundHalf(Number(inn.el || 0)) >= roundHalf(elC)
  );
}

function collectTxnRefsForLeaveType(docs, leaveType) {
  const refs = [];
  for (const doc of docs) {
    const months = doc.months || [];
    for (let mi = 0; mi < months.length; mi++) {
      const txs = months[mi].transactions || [];
      for (let ti = 0; ti < txs.length; ti++) {
        const tx = txs[ti];
        if (tx.leaveType === leaveType) {
          refs.push({ doc, mi, ti, tx });
        }
      }
    }
  }
  refs.sort((a, b) => {
    const da = new Date(a.tx.startDate).getTime() - new Date(b.tx.startDate).getTime();
    if (da !== 0) return da;
    const aa = a.tx.at ? new Date(a.tx.at).getTime() : 0;
    const ab = b.tx.at ? new Date(b.tx.at).getTime() : 0;
    return aa - ab;
  });
  return refs;
}

function calculateClosingBalance(openingBalance, transactionData) {
  const { transactionType, days } = transactionData;
  const d = Number(days) || 0;
  if (transactionType === 'CREDIT') return openingBalance + d;
  if (transactionType === 'DEBIT' || transactionType === 'EXPIRY') return Math.max(0, openingBalance - d);
  if (transactionType === 'ADJUSTMENT') return d;
  if (transactionType === 'CARRY_FORWARD') return openingBalance + d;
  return openingBalance;
}

async function syncEmployeeModelBalance(employeeId, leaveType, closingBalance) {
  const fieldMap = {
    EL: 'paidLeaves',
    CL: 'casualLeaves',
    CCL: 'compensatoryOffs',
  };
  const field = fieldMap[leaveType] || 'paidLeaves';
  try {
    await Employee.findByIdAndUpdate(employeeId, { [field]: closingBalance });
  } catch (e) {
    console.error('[leaveRegisterPoolCarryReconcile] Employee balance sync failed:', e.message);
  }
}

async function recalculateRegisterBalancesOnce(employeeId, leaveType, fromDate) {
  const years = await LeaveRegisterYear.find({ employeeId }).sort({ financialYearStart: 1 }).exec();
  const refs = collectTxnRefsForLeaveType(years, leaveType);
  const fromMs = fromDate ? new Date(fromDate).getTime() : null;

  let startIdx = 0;
  let currentBalance = 0;
  if (fromMs != null) {
    for (; startIdx < refs.length; startIdx++) {
      const t = new Date(refs[startIdx].tx.startDate).getTime();
      if (t >= fromMs) break;
      currentBalance = Number(refs[startIdx].tx.closingBalance) || 0;
    }
  }

  const dirty = new Set();
  for (let i = startIdx; i < refs.length; i++) {
    const { doc, mi, tx } = refs[i];
    tx.openingBalance = currentBalance;
    tx.closingBalance = calculateClosingBalance(currentBalance, tx);
    currentBalance = tx.closingBalance;
    dirty.add(doc);
    doc.markModified(`months.${mi}.transactions`);
  }

  for (const doc of dirty) {
    await doc.save();
  }

  const finalBalance = refs.length === 0 ? 0 : currentBalance;
  if (leaveType === 'CL' || leaveType === 'CCL' || leaveType === 'EL') {
    const latest = await LeaveRegisterYear.findOne({ employeeId }).sort({ financialYearStart: -1 });
    if (latest) {
      if (leaveType === 'CL') latest.casualBalance = finalBalance;
      if (leaveType === 'CCL') latest.compensatoryOffBalance = finalBalance;
      if (leaveType === 'EL') latest.earnedLeaveBalance = finalBalance;
      await latest.save();
    }
  }
  await syncEmployeeModelBalance(employeeId, leaveType, finalBalance);
  return true;
}

async function recalculateAllRegisterBalances(employeeId, fromDate = null) {
  await recalculateRegisterBalancesOnce(employeeId, 'CL', fromDate);
  await recalculateRegisterBalancesOnce(employeeId, 'CCL', fromDate);
  await recalculateRegisterBalancesOnce(employeeId, 'EL', fromDate);
}

/**
 * CL carry should include any debit/credit whose *effective posting* is within the payroll cycle.
 * Our ledger ordering is by `startDate`, and some “Initial sync used” transactions may have an
 * `endDate` after the cycle end even though they belong to the cycle. So use `startDate` boundaries.
 */
function clClosingBalanceStrictlyBeforePayPeriod(sortedClTxs, payPeriodStart) {
  const b = new Date(payPeriodStart).getTime();
  let best = 0;
  let bestStart = -Infinity;
  for (const { tx } of sortedClTxs) {
    const s = new Date(tx.startDate).getTime();
    if (s < b && s >= bestStart) {
      bestStart = s;
      best = Number(tx.closingBalance) || 0;
    }
  }
  return best;
}

function clClosingBalanceAtOrBefore(sortedClTxs, boundaryDate) {
  const b = new Date(boundaryDate).getTime();
  let best = 0;
  let bestStart = -Infinity;
  for (const { tx } of sortedClTxs) {
    const s = new Date(tx.startDate).getTime();
    if (s <= b && s >= bestStart) {
      bestStart = s;
      best = Number(tx.closingBalance) || 0;
    }
  }
  return best;
}

function collectSortedClTxnRefs(docs) {
  return collectTxnRefsForLeaveType(docs, 'CL');
}

async function buildEmployeeTxPayload(employeeId) {
  const employee = await Employee.findById(employeeId)
    .select('_id emp_no employee_name department_id division_id designation_id doj is_active')
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .populate('designation_id', 'name')
    .lean();
  if (!employee) return null;
  const department = employee.department_id?.name || 'N/A';
  const designation = employee.designation_id?.name || 'N/A';
  return {
    employeeId: employee._id,
    empNo: employee.emp_no,
    employeeName: employee.employee_name || 'N/A',
    designation,
    department,
    divisionId: employee.division_id?._id || employee.division_id,
    departmentId: employee.department_id?._id || employee.department_id,
    dateOfJoining: employee.doj,
    employmentStatus: employee.is_active ? 'active' : 'inactive',
  };
}

function findMonthIndex(doc, payrollMonth, payrollYear) {
  const months = doc.months || [];
  const pm = Number(payrollMonth);
  const py = Number(payrollYear);
  return months.findIndex((m) => Number(m.payrollCycleMonth) === pm && Number(m.payrollCycleYear) === py);
}

/**
 * Append one movement on LeaveRegisterYear (same slot rules as leaveRegisterYearLedgerService.addTransactionOnce,
 * without scheduling other services).
 */
async function appendYearSlotTransaction(transactionData, existingDoc = null) {
  const periodInfo = await getPeriodInfoLocal(transactionData.startDate);
  const fyName = periodInfo.financialYear.name;
  
  let doc = existingDoc;
  if (doc && doc.financialYear !== fyName) {
    doc = null; // Next month is in a different FY doc
  }

  if (!doc) {
    doc = await LeaveRegisterYear.findOne({
      employeeId: transactionData.employeeId,
      financialYear: fyName,
    });
  }
  
  if (!doc) throw new Error(`LeaveRegisterYear not found for FY ${fyName}`);

  const slotMonth = periodInfo.payrollCycle.month;
  const slotYear = periodInfo.payrollCycle.year;
  const mi = findMonthIndex(doc, slotMonth, slotYear);
  if (mi < 0) {
    throw new Error(
      `LeaveRegisterYear (${doc.financialYear}) has no payroll slot for ${slotMonth}/${slotYear}.`
    );
  }

  if (!doc.months[mi].transactions) doc.months[mi].transactions = [];

  const leaveTypeUpper = String(transactionData.leaveType || '').toUpperCase();
  const txTypeUpper = String(transactionData.transactionType || '').toUpperCase();
  const creditDays = roundHalf(Number(transactionData.days) || 0);
  const autoGenType = String(transactionData.autoGeneratedType || '');
  const skipCclSlotBumpForMonthlyPoolTransferIn =
    leaveTypeUpper === 'CCL' && autoGenType === 'MONTHLY_POOL_TRANSFER_IN_CCL';

  if (txTypeUpper === 'CREDIT' && creditDays > 0) {
    if (leaveTypeUpper === 'CL') {
      doc.yearlyClCreditDaysPosted = roundHalf((Number(doc.yearlyClCreditDaysPosted) || 0) + creditDays);
    }
    if (leaveTypeUpper === 'CCL' && !skipCclSlotBumpForMonthlyPoolTransferIn) {
      doc.yearlyCclCreditDaysPosted = roundHalf((Number(doc.yearlyCclCreditDaysPosted) || 0) + creditDays);
      const curPool = roundHalf(Number(doc.months[mi].compensatoryOffs) || 0);
      doc.months[mi].compensatoryOffs = roundHalf(curPool + creditDays);
    }
  }

  const expiryDays = roundHalf(Number(transactionData.days) || 0);
  if (txTypeUpper === 'EXPIRY' && expiryDays > 0 && leaveTypeUpper === 'CCL') {
    const curPool = roundHalf(Number(doc.months[mi].compensatoryOffs) || 0);
    const dec = Math.min(expiryDays, curPool);
    doc.months[mi].compensatoryOffs = roundHalf(Math.max(0, curPool - dec));
  }

  doc.months[mi].transactions.push({
    at: new Date(),
    leaveType: transactionData.leaveType,
    transactionType: transactionData.transactionType,
    days: Number(transactionData.days) || 0,
    openingBalance: 0,
    closingBalance: 0,
    startDate: transactionData.startDate,
    endDate: transactionData.endDate,
    reason: transactionData.reason || '',
    status: transactionData.status || 'APPROVED',
    autoGenerated: !!transactionData.autoGenerated,
    autoGeneratedType: transactionData.autoGeneratedType || null,
    divisionId: transactionData.divisionId,
    departmentId: transactionData.departmentId,
  });

  doc.markModified(`months.${mi}.transactions`);
  doc.markModified(`months.${mi}`);
  await doc.save();

  await recalculateRegisterBalancesOnce(
    transactionData.employeeId,
    transactionData.leaveType,
    transactionData.startDate
  );
}

/** Serialize strip+replay per employee so async paths never interleave. */
const carryRebuildChainByEmployee = new Map();

async function reconcilePoolCarryChainAfterRegisterChangeCore(employeeId, opts = {}) {
  const eid = toObjectId(employeeId);
  if (!eid) return { ok: false, error: 'employeeId required' };

  const asOf = opts.asOfDate ? new Date(opts.asOfDate) : new Date();
  const capM = opts.throughPayrollMonth;
  const capY = opts.throughPayrollYear;
  const scopedEmployee = true;

  try {
    const policy = await LeavePolicySettings.getSettings().catch(() => ({}));
    const { clRoll, cclRoll, elRoll, elInPool } = resolveMonthlyPoolCarryRollFlags(policy);

    const fyDocs = await LeaveRegisterYear.find({ employeeId: eid }).sort({ financialYearStart: 1 });
    for (const doc of fyDocs) {
      stripMonthlyPoolTransferArtifactsFromMonths(doc.months);
      doc.markModified('months');
      await doc.save();
    }

    await recalculateAllRegisterBalances(eid, null);

    const periodInfo = await getPeriodInfoLocal(asOf);
    const currentCycleStart = periodInfo?.payrollCycle?.startDate;
    const carryCutoff =
      currentCycleStart != null ? new Date(currentCycleStart) : createISTDate(getTodayISTDateString());

    const closings = [];
    const refreshed = await LeaveRegisterYear.find({ employeeId: eid }).sort({ financialYearStart: 1 }).exec();
    for (const d of refreshed) {
      for (const slot of d.months || []) {
        if (!slot.payPeriodEnd) continue;
        if (!isPayrollPeriodClosedBeforeAsOf(slot.payPeriodEnd, carryCutoff)) {
          continue;
        }
        closings.push({
          pm: Number(slot.payrollCycleMonth),
          py: Number(slot.payrollCycleYear),
          t: new Date(slot.payPeriodEnd).getTime(),
        });
      }
    }
    const seen = new Set();
    let ordered = closings
      .filter((c) => {
        if (!Number.isFinite(c.pm) || !Number.isFinite(c.py)) return false;
        const k = `${c.py}-${c.pm}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.t - b.t);

    if (capM != null && Number.isFinite(Number(capM))) {
      const beforeCap = ordered.length;
      ordered = ordered.filter((c) => {
        if (Number(c.pm) > Number(capM)) return false;
        if (capY != null && Number.isFinite(Number(capY)) && Number(c.py) !== Number(capY)) return false;
        return true;
      });
      if (beforeCap !== ordered.length) {
        console.log(
          `[leaveRegisterPoolCarryReconcile] throughPayrollMonth<=${capM}${
            capY != null && Number.isFinite(Number(capY)) ? ` year=${capY}` : ''
          }: ${beforeCap} → ${ordered.length} closings`
        );
      }
    }

    if (ordered.length > 0) {
      const f = ordered[0];
      const l = ordered[ordered.length - 1];
      console.log(
        `[leaveRegisterPoolCarryReconcile] replay ${ordered.length} closed month(s) (CL carry from ledger balance; CCL/EL from pool) (first ${f.py}/${f.pm}, last ${l.py}/${l.pm})`
      );
    }

    let carriesPosted = 0;
    let carryErrors = 0;
    let forfeitsPosted = 0;

    for (const c of ordered) {
      const pm = Number(c.pm);
      const py = Number(c.py);
      const midDate = new Date(py, pm - 1, 15);
      const periodClose = await getPeriodInfoLocal(midDate);
      const cycleEnd = periodClose.payrollCycle.endDate;
      const closingLabel = `${pm}/${py}`;

      const q = {
        employeeId: eid,
        months: { $elemMatch: { payrollCycleMonth: pm, payrollCycleYear: py } },
      };

      for (let carryAttempt = 1; carryAttempt <= 12; carryAttempt++) {
        try {
          await recalculateAllRegisterBalances(eid, null);

          const yearDocs = await LeaveRegisterYear.find({ employeeId: eid }).sort({ financialYearStart: 1 }).exec();
          const sortedClRefs = collectSortedClTxnRefs(yearDocs);

          const doc = await LeaveRegisterYear.findOne(q);
          if (!doc || !doc.months?.length) {
            break;
          }
          const idx = findSlotIndex(doc.months, pm, py);
          if (idx < 0) {
            break;
          }

          const slot = doc.months[idx];
          if (slot.poolCarryForwardOutAt && !scopedEmployee) {
            break;
          }

          const payPeriodStart = slot.payPeriodStart;
          const openingCl = clClosingBalanceStrictlyBeforePayPeriod(sortedClRefs, payPeriodStart);
          const closingCl = clClosingBalanceAtOrBefore(sortedClRefs, cycleEnd);

          // Explicitly validate "used" from ledger transactions as the source of truth for reconciliation,
          // ensuring even legacy/migrated entries (which may lack Leave docs) are correctly counted.
          const ledgerPooledUsed = sumTotalPooledUsedDays(slot);
          const U = roundHalf(ledgerPooledUsed);
          
          const clS = roundHalf(slot.clCredits);
          const cclS = roundHalf(slot.compensatoryOffs);
          const elS = elInPool ? roundHalf(slot.elCredits) : 0;
          const alloc = allocatePoolConsumption(U, clS, cclS, elS);

          const usedCl = roundHalf(sumUsedDaysForType(slot, 'CL'));
          const clTransferIn = roundHalf(sumMonthlyPoolTransferInDaysOnSlot(slot, 'CL'));
          const clLocked = roundHalf(Number(slot.monthlyApplyLocked) || 0);
          const usedCcl = roundHalf(sumUsedDaysForType(slot, 'CCL'));
          const usedEl = roundHalf(sumUsedDaysForType(slot, 'EL'));

          const clCarry = clRoll ? roundHalf(Math.max(0, clS + clTransferIn - U)) : 0;
          const cclCarry = cclRoll ? roundHalf(Math.max(0, cclS - usedCcl)) : 0;
          const elCarry = elRoll ? roundHalf(Math.max(0, elS - usedEl)) : 0;

          const clForfeit = clRoll ? 0 : roundHalf(Math.max(0, closingCl - openingCl));
          const cclForfeit = cclRoll ? 0 : roundHalf(Math.max(0, cclS - usedCcl));
          const elForfeit = elRoll ? 0 : roundHalf(Math.max(0, elS - usedEl));

          const next = findNextPayrollSlot(doc.months, pm, py);
          if ((clCarry > 0 || cclCarry > 0 || elCarry > 0) && !next) {
            carryErrors++;
            console.warn(
              `[leaveRegisterPoolCarryReconcile] ${doc.empNo}: no next slot after ${closingLabel}; cannot carry.`
            );
            break;
          }

          const empPayload = await buildEmployeeTxPayload(doc.employeeId);
          if (!empPayload) {
            carryErrors++;
            break;
          }

          const fromLabel = closingLabel;
          const nSlotPreview = next ? doc.months[next.idx] : null;
          const skipMetadataSave = poolCarryMetadataMatchesClose(
            slot,
            nSlotPreview,
            closingLabel,
            clCarry,
            cclCarry,
            elCarry
          );

          let postClOut = 0;
          let postClIn = 0;
          let postCclOut = 0;
          let postCclIn = 0;
          let postElOut = 0;
          let postElIn = 0;

          if (next && (clCarry > 0 || cclCarry > 0 || elCarry > 0)) {
            const nSlot = doc.months[next.idx];
            const nextLabel = `${nSlot.payrollCycleMonth}/${nSlot.payrollCycleYear}`;

            if (clCarry > 0) {
              const sumOutCl = sumPoolCarryEdgeTxDays(slot, 'OUT', 'CL', fromLabel, nextLabel);
              const sumInCl = sumPoolCarryEdgeTxDays(nSlot, 'IN', 'CL', fromLabel, nextLabel);
              if (sumOutCl > clCarry + 0.001 || sumInCl > clCarry + 0.001) {
                carryErrors++;
                console.warn(
                  `[leaveRegisterPoolCarryReconcile] ${doc.empNo}: CL pool ledger overshoot ${fromLabel}→${nextLabel}`
                );
              } else {
                postClOut = roundHalf(Math.max(0, clCarry - sumOutCl));
                postClIn = roundHalf(Math.max(0, Math.min(clCarry, sumOutCl + postClOut) - sumInCl));
              }
            }
            if (cclCarry > 0) {
              const sumOut = sumPoolCarryEdgeTxDays(slot, 'OUT', 'CCL', fromLabel, nextLabel);
              const sumIn = sumPoolCarryEdgeTxDays(nSlot, 'IN', 'CCL', fromLabel, nextLabel);
              if (sumOut > cclCarry + 0.001 || sumIn > cclCarry + 0.001) {
                carryErrors++;
              } else {
                postCclOut = roundHalf(Math.max(0, cclCarry - sumOut));
                postCclIn = roundHalf(Math.max(0, Math.min(cclCarry, sumOut + postCclOut) - sumIn));
              }
            }
            if (elCarry > 0) {
              const sumOut = sumPoolCarryEdgeTxDays(slot, 'OUT', 'EL', fromLabel, nextLabel);
              const sumIn = sumPoolCarryEdgeTxDays(nSlot, 'IN', 'EL', fromLabel, nextLabel);
              if (sumOut > elCarry + 0.001 || sumIn > elCarry + 0.001) {
                carryErrors++;
              } else {
                postElOut = roundHalf(Math.max(0, elCarry - sumOut));
                postElIn = roundHalf(Math.max(0, Math.min(elCarry, sumOut + postElOut) - sumIn));
              }
            }
          }

          const carryPositive = clCarry > 0 || cclCarry > 0 || elCarry > 0;
          const anyCarryPost =
            postClOut > 0 ||
            postClIn > 0 ||
            postCclOut > 0 ||
            postCclIn > 0 ||
            postElOut > 0 ||
            postElIn > 0;
          const applyCarryMetadataSave = !skipMetadataSave && (!carryPositive || anyCarryPost);

          if (applyCarryMetadataSave) {
            slot.poolCarryForwardAllocation = {
              ...alloc,
              scheduled: { cl: clS, ccl: cclS, el: elS },
              ledgerUsed: { cl: usedCl, ccl: usedCcl, el: usedEl, clLocked },
              clLedger: { opening: openingCl, closing: closingCl, carryFromLedger: clCarry },
              carryPosted: { cl: clCarry, ccl: cclCarry, el: elCarry },
              elInPool,
              policies: { clRoll, cclRoll, elRoll },
            };
            slot.poolCarryForwardOut = { cl: clCarry, ccl: cclCarry, el: elCarry };
            slot.poolCarryForwardOutAt = new Date();
            doc.markModified(`months.${idx}`);

            if (next && (clCarry > 0 || cclCarry > 0 || elCarry > 0)) {
              const nSlot = doc.months[next.idx];
              nSlot.clCredits = roundHalf((Number(nSlot.clCredits) || 0) + clCarry);
              nSlot.compensatoryOffs = roundHalf((Number(nSlot.compensatoryOffs) || 0) + cclCarry);
              nSlot.elCredits = roundHalf((Number(nSlot.elCredits) || 0) + elCarry);
              nSlot.poolCarryForwardIn = { cl: clCarry, ccl: cclCarry, el: elCarry };
              nSlot.poolCarryForwardFromLabel = fromLabel;
              doc.markModified(`months.${next.idx}`);
            }

            await doc.save();
          }

          if (next && (clCarry > 0 || cclCarry > 0 || elCarry > 0)) {
            const nSlot = doc.months[next.idx];
            const anchor = nSlot.payPeriodStart || cycleEnd;
            const nextLabel = `${nSlot.payrollCycleMonth}/${nSlot.payrollCycleYear}`;

            if (postClOut > 0) {
              await appendYearSlotTransaction({
                ...empPayload,
                leaveType: 'CL',
                transactionType: 'DEBIT',
                startDate: cycleEnd,
                endDate: cycleEnd,
                days: postClOut,
                reason: `Transfer out — unused monthly apply pool CL from payroll ${fromLabel} → ${nextLabel} (ledger balance basis: opening ${openingCl}, closing ${closingCl}, lock ${clLocked}; after CL→CCL→EL cap ${alloc.U} day(s)).`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_CL',
              });
            }
            if (postClIn > 0) {
              await appendYearSlotTransaction({
                ...empPayload,
                leaveType: 'CL',
                transactionType: 'CREDIT',
                startDate: anchor,
                endDate: anchor,
                days: postClIn,
                reason: `Transfer in — unused monthly apply pool CL from payroll ${fromLabel} → ${nextLabel} (moved to next slot).`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_CL',
              });
            }
            if (postClOut > 0 || postClIn > 0) carriesPosted++;

            if (postCclOut > 0) {
              await appendYearSlotTransaction({
                ...empPayload,
                leaveType: 'CCL',
                transactionType: 'DEBIT',
                startDate: cycleEnd,
                endDate: cycleEnd,
                days: postCclOut,
                reason: `Transfer out — unused monthly apply pool CCL from payroll ${fromLabel} → ${nextLabel}.`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_CCL',
              });
            }
            if (postCclIn > 0) {
              await appendYearSlotTransaction({
                ...empPayload,
                leaveType: 'CCL',
                transactionType: 'CREDIT',
                startDate: anchor,
                endDate: anchor,
                days: postCclIn,
                reason: `Transfer in — unused monthly apply pool CCL from payroll ${fromLabel} → ${nextLabel}.`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_CCL',
              });
            }
            if (postCclOut > 0 || postCclIn > 0) carriesPosted++;

            if (postElOut > 0) {
              await appendYearSlotTransaction({
                ...empPayload,
                leaveType: 'EL',
                transactionType: 'DEBIT',
                startDate: cycleEnd,
                endDate: cycleEnd,
                days: postElOut,
                reason: `Transfer out — unused monthly apply pool EL from payroll ${fromLabel} → ${nextLabel}.`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_EL',
              });
            }
            if (postElIn > 0) {
              await appendYearSlotTransaction({
                ...empPayload,
                leaveType: 'EL',
                transactionType: 'CREDIT',
                startDate: anchor,
                endDate: anchor,
                days: postElIn,
                reason: `Transfer in — unused monthly apply pool EL from payroll ${fromLabel} → ${nextLabel}.`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_EL',
              });
            }
            if (postElOut > 0 || postElIn > 0) carriesPosted++;
          }

          if (clForfeit > 0) {
            await appendYearSlotTransaction({
              ...empPayload,
              leaveType: 'CL',
              transactionType: 'EXPIRY',
              startDate: cycleEnd,
              endDate: cycleEnd,
              days: clForfeit,
              reason: `Forfeit — unused monthly apply pool CL for payroll ${closingLabel} (carry disabled; ledger basis opening ${openingCl} closing ${closingCl}; ${alloc.U} day(s) toward cap).`,
              status: 'APPROVED',
              autoGenerated: true,
              autoGeneratedType: TX.CL_FORFEIT,
            });
            forfeitsPosted++;
          }
          if (cclForfeit > 0) {
            await appendYearSlotTransaction({
              ...empPayload,
              leaveType: 'CCL',
              transactionType: 'EXPIRY',
              startDate: cycleEnd,
              endDate: cycleEnd,
              days: cclForfeit,
              reason: `Forfeit — unused monthly apply pool CCL for payroll ${closingLabel} (carry disabled).`,
              status: 'APPROVED',
              autoGenerated: true,
              autoGeneratedType: TX.CCL_FORFEIT,
            });
            forfeitsPosted++;
          }
          if (elForfeit > 0) {
            await appendYearSlotTransaction({
              ...empPayload,
              leaveType: 'EL',
              transactionType: 'EXPIRY',
              startDate: cycleEnd,
              endDate: cycleEnd,
              days: elForfeit,
              reason: `Forfeit — unused monthly apply pool EL for payroll ${closingLabel} (carry disabled).`,
              status: 'APPROVED',
              autoGenerated: true,
              autoGeneratedType: TX.EL_FORFEIT,
            });
            forfeitsPosted++;
          }

          break;
        } catch (e) {
          if (carryAttempt === 12) {
            carryErrors++;
            console.warn('[leaveRegisterPoolCarryReconcile]', e?.message || e);
            break;
          }
          await new Promise((r) => setTimeout(r, 50 * carryAttempt));
        }
      }
    }

    await recalculateAllRegisterBalances(eid, null);

    return {
      ok: true,
      yearsTouched: fyDocs.length,
      edgesApplied: ordered.length,
      carriesPosted,
      carryErrors,
      forfeitsPosted,
      carryCutoffIso: carryCutoff?.toISOString?.() || String(carryCutoff),
    };
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn('[leaveRegisterPoolCarryReconcile] failed:', msg);
    return { ok: false, error: msg };
  }
}

async function reconcilePoolCarryChainAfterRegisterChange(employeeId, opts = {}) {
  const eid = toObjectId(employeeId);
  if (!eid) return { ok: false, error: 'employeeId required' };
  const key = String(eid);
  const prev = carryRebuildChainByEmployee.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => reconcilePoolCarryChainAfterRegisterChangeCore(employeeId, opts));
  carryRebuildChainByEmployee.set(key, next);
  return next;
}

function leaveTypeAffectsMonthlyPoolCarry(leaveType) {
  const u = String(leaveType || '').trim().toUpperCase();
  return u === 'CL' || u === 'CCL' || u === 'EL';
}

module.exports = {
  reconcilePoolCarryChainAfterRegisterChange,
  leaveTypeAffectsMonthlyPoolCarry,
};
