/**
 * End of payroll cycle: allocate monthlyApplyConsumed against scheduled pool in order CL → CCL → EL
 * (EL only when it counts toward monthly apply cap). Unused portions either carry into the next
 * month’s slot (+ clear CARRY_FORWARD ledger rows on the next period) or post EXPIRY on the closing
 * period when policy disables pool roll for that type.
 */

const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const Employee = require('../../employees/model/Employee');
const dateCycleService = require('./dateCycleService');
const leaveRegisterService = require('./leaveRegisterService');
const leaveRegisterYearMonthlyApplyService = require('./leaveRegisterYearMonthlyApplyService');
const { sumUsedDaysForType } = require('./leaveRegisterYearService');

const TX = {
  CL_CARRY: 'MONTHLY_POOL_CARRY_FORWARD_CL',
  CCL_CARRY: 'MONTHLY_POOL_CARRY_FORWARD_CCL',
  EL_CARRY: 'MONTHLY_POOL_CARRY_FORWARD_EL',
  CL_FORFEIT: 'MONTHLY_POOL_FORFEIT_CL',
  CCL_FORFEIT: 'MONTHLY_POOL_FORFEIT_CCL',
  EL_FORFEIT: 'MONTHLY_POOL_FORFEIT_EL',
};

function findSlotIndex(months, pcMonth, pcYear) {
  if (!Array.isArray(months)) return -1;
  return months.findIndex(
    (m) =>
      Number(m.payrollCycleMonth) === Number(pcMonth) &&
      Number(m.payrollCycleYear) === Number(pcYear)
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
    (x) =>
      Number(x.m.payrollCycleMonth) === Number(pcMonth) &&
      Number(x.m.payrollCycleYear) === Number(pcYear)
  );
  if (cur < 0 || cur >= arr.length - 1) return null;
  return arr[cur + 1];
}

function elCountsTowardMonthlyPool(policy) {
  const capCfg = policy?.monthlyLeaveApplicationCap;
  const includeEL = !!capCfg?.includeEL;
  const elPaidInPayroll = policy?.earnedLeave?.useAsPaidInPayroll !== false;
  return !!policy?.earnedLeave?.enabled && includeEL && !elPaidInPayroll;
}

/** Allocate total consumption U against CL, then CCL, then EL scheduled pool (greedy). */
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

function roundHalf(x) {
  const n = Number(x) || 0;
  if (n <= 0) return 0;
  return Math.round(n * 2) / 2;
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

/**
 * @param {number} closingPayrollMonth 1–12
 * @param {number} closingPayrollYear calendar label for cycle
 */
async function processPayrollCycleCarryForward(closingPayrollMonth, closingPayrollYear) {
  const results = {
    processed: 0,
    carriedEmployees: 0,
    forfeitsPosted: 0,
    carriesPosted: 0,
    skipped: 0,
    errors: [],
  };

  const policy = await LeavePolicySettings.getSettings().catch(() => ({}));
  const elInPool = elCountsTowardMonthlyPool(policy);

  const pm = Number(closingPayrollMonth);
  const py = Number(closingPayrollYear);
  const midDate = new Date(py, pm - 1, 15);
  const periodInfo = await dateCycleService.getPeriodInfo(midDate);
  const cycleEnd = periodInfo.payrollCycle.endDate;
  const closingLabel = `${pm}/${py}`;

  const clRoll =
    policy?.carryForward?.casualLeave?.carryMonthlyClCreditToNextPayrollMonth !== false;
  const cclRoll =
    policy?.carryForward?.compensatoryOff?.carryMonthlyPoolToNextPayrollMonth !== false;
  const elRoll =
    elInPool && policy?.carryForward?.earnedLeave?.carryMonthlyPoolToNextPayrollMonth !== false;

  const cursor = LeaveRegisterYear.find({
    months: { $elemMatch: { payrollCycleMonth: pm, payrollCycleYear: py } },
  }).cursor();

  for await (const doc of cursor) {
    results.processed++;
    const curIdx = findSlotIndex(doc.months, pm, py);
    if (curIdx < 0) {
      results.skipped++;
      continue;
    }
    const closeSlot = doc.months[curIdx];
    if (closeSlot.poolCarryForwardOutAt) {
      results.skipped++;
      continue;
    }

    try {
      await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
        doc.employeeId,
        cycleEnd
      );

      // Per-employee: used to optionally refresh the next payroll slot’s cached apply fields.
      let nextPayPeriodStartForSync = null;

      const fresh = await LeaveRegisterYear.findById(doc._id);
      if (!fresh || !fresh.months?.length) {
        results.skipped++;
        continue;
      }
      const idx = findSlotIndex(fresh.months, pm, py);
      if (idx < 0) {
        results.skipped++;
        continue;
      }

      const slot = fresh.months[idx];
      const U = roundHalf(slot.monthlyApplyConsumed);
      const clS = roundHalf(slot.clCredits);
      const cclS = roundHalf(slot.compensatoryOffs);
      const elS = elInPool ? roundHalf(slot.elCredits) : 0;

      // Cap-consumption model (audit): how pooled monthlyApplyConsumed maps onto CL→CCL→EL.
      const alloc = allocatePoolConsumption(U, clS, cclS, elS);

      /**
       * Posted carry must match register "Transfer" / bulk carry rebuild (`applySequentialMonthlyPoolCarry`):
       * unused **scheduled pool** minus **real debits** on the slot (excl. MONTHLY_POOL_TRANSFER_OUT_*).
       * Using only `alloc.cclRem` from cap U could yield **zero CCL carry** while CL consumed the cap,
       * even when no CCL was taken — then May shows no Carried in though April shows a large CCL Transfer.
       */
      const usedCl = roundHalf(sumUsedDaysForType(slot, 'CL'));
      const clLocked = roundHalf(Number(slot.lockedCredits) || 0);
      const usedCcl = roundHalf(sumUsedDaysForType(slot, 'CCL'));
      const usedEl = roundHalf(sumUsedDaysForType(slot, 'EL'));

      const clCarry = clRoll ? roundHalf(Math.max(0, clS - usedCl - clLocked)) : 0;
      const cclCarry = cclRoll ? roundHalf(Math.max(0, cclS - usedCcl)) : 0;
      const elCarry = elRoll ? roundHalf(Math.max(0, elS - usedEl)) : 0;

      const clForfeit = clRoll ? 0 : roundHalf(Math.max(0, clS - usedCl - clLocked));
      const cclForfeit = cclRoll ? 0 : roundHalf(Math.max(0, cclS - usedCcl));
      const elForfeit = elRoll ? 0 : roundHalf(Math.max(0, elS - usedEl));

      const next = findNextPayrollSlot(fresh.months, pm, py);
      if ((clCarry > 0 || cclCarry > 0 || elCarry > 0) && !next) {
        results.errors.push({
          empNo: fresh.empNo,
          error: `Carry-forward pending: no next payroll slot in this FY doc after ${closingLabel} (add FY slots or handle manually).`,
        });
        results.skipped++;
        continue;
      }

      const empPayload = await buildEmployeeTxPayload(fresh.employeeId);
      if (!empPayload) {
        results.errors.push({ empNo: fresh.empNo, error: 'Employee missing' });
        continue;
      }

      // Closing slot: audit + mark closed before mutations on next slot
      slot.poolCarryForwardAllocation = {
        ...alloc,
        scheduled: { cl: clS, ccl: cclS, el: elS },
        ledgerUsed: { cl: usedCl, ccl: usedCcl, el: usedEl, clLocked },
        carryPosted: { cl: clCarry, ccl: cclCarry, el: elCarry },
        elInPool,
        policies: { clRoll, cclRoll, elRoll },
      };
      slot.poolCarryForwardOut = {
        cl: clCarry,
        ccl: cclCarry,
        el: elCarry,
      };
      slot.poolCarryForwardOutAt = new Date();
      fresh.markModified(`months.${idx}`);

      if (next && (clCarry > 0 || cclCarry > 0 || elCarry > 0)) {
        const nSlot = fresh.months[next.idx];
        const fromLabel = closingLabel;
        nSlot.clCredits = roundHalf((Number(nSlot.clCredits) || 0) + clCarry);
        nSlot.compensatoryOffs = roundHalf((Number(nSlot.compensatoryOffs) || 0) + cclCarry);
        nSlot.elCredits = roundHalf((Number(nSlot.elCredits) || 0) + elCarry);
        nSlot.poolCarryForwardIn = { cl: clCarry, ccl: cclCarry, el: elCarry };
        nSlot.poolCarryForwardFromLabel = fromLabel;
        fresh.markModified(`months.${next.idx}`);
        nextPayPeriodStartForSync = nSlot.payPeriodStart || null;
      }

      await fresh.save();

      if (next && (clCarry > 0 || cclCarry > 0 || elCarry > 0)) {
        const nSlot = fresh.months[next.idx];
        const anchor = nSlot.payPeriodStart || cycleEnd;
        const nextLabel = `${nSlot.payrollCycleMonth}/${nSlot.payrollCycleYear}`;
        const fromLabel = closingLabel;

        if (clCarry > 0) {
          // Transfer-out debit (closing cycle)
          await leaveRegisterService.addTransaction({
            ...empPayload,
            leaveType: 'CL',
            transactionType: 'DEBIT',
            startDate: cycleEnd,
            endDate: cycleEnd,
            days: clCarry,
            reason: `Transfer out — unused monthly apply pool CL from payroll ${fromLabel} → ${nextLabel} (after CL→CCL→EL priority vs ${alloc.U} day(s) toward cap).`,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_CL',
          });
          // Transfer-in credit (next payroll slot)
          await leaveRegisterService.addTransaction({
            ...empPayload,
            leaveType: 'CL',
            transactionType: 'CREDIT',
            startDate: anchor,
            endDate: anchor,
            days: clCarry,
            reason: `Transfer in — unused monthly apply pool CL from payroll ${fromLabel} → ${nextLabel} (moved to next slot).`,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_CL',
          });
          results.carriesPosted++;
        }
        if (cclCarry > 0) {
          await leaveRegisterService.addTransaction({
            ...empPayload,
            leaveType: 'CCL',
            transactionType: 'DEBIT',
            startDate: cycleEnd,
            endDate: cycleEnd,
            days: cclCarry,
            reason: `Transfer out — unused monthly apply pool CCL from payroll ${fromLabel} → ${nextLabel}.`,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_CCL',
          });
          // Next slot’s `compensatoryOffs` was already increased above; ledger CREDIT uses
          // autoGeneratedType MONTHLY_POOL_TRANSFER_IN_CCL without double-bumping the slot
          // (see leaveRegisterYearLedgerService.addTransaction).
          await leaveRegisterService.addTransaction({
            ...empPayload,
            leaveType: 'CCL',
            transactionType: 'CREDIT',
            startDate: anchor,
            endDate: anchor,
            days: cclCarry,
            reason: `Transfer in — unused monthly apply pool CCL from payroll ${fromLabel} → ${nextLabel}.`,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_CCL',
          });
          results.carriesPosted++;
        }
        if (elCarry > 0) {
          await leaveRegisterService.addTransaction({
            ...empPayload,
            leaveType: 'EL',
            transactionType: 'DEBIT',
            startDate: cycleEnd,
            endDate: cycleEnd,
            days: elCarry,
            reason: `Transfer out — unused monthly apply pool EL from payroll ${fromLabel} → ${nextLabel}.`,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_EL',
          });
          await leaveRegisterService.addTransaction({
            ...empPayload,
            leaveType: 'EL',
            transactionType: 'CREDIT',
            startDate: anchor,
            endDate: anchor,
            days: elCarry,
            reason: `Transfer in — unused monthly apply pool EL from payroll ${fromLabel} → ${nextLabel}.`,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_EL',
          });
          results.carriesPosted++;
        }
        results.carriedEmployees++;
      }

      // Forfeits on closing cycle end (ledger + balance)
      if (clForfeit > 0) {
        await leaveRegisterService.addTransaction({
          ...empPayload,
          leaveType: 'CL',
          transactionType: 'EXPIRY',
          startDate: cycleEnd,
          endDate: cycleEnd,
          days: clForfeit,
          reason: `Forfeit — unused monthly apply pool CL for payroll ${closingLabel} (carry to next month disabled; ${alloc.U} day(s) consumed toward cap in priority CL→CCL→EL).`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: TX.CL_FORFEIT,
        });
        results.forfeitsPosted++;
      }
      if (cclForfeit > 0) {
        await leaveRegisterService.addTransaction({
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
        results.forfeitsPosted++;
      }
      if (elForfeit > 0) {
        await leaveRegisterService.addTransaction({
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
        results.forfeitsPosted++;
      }

      await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
        doc.employeeId,
        cycleEnd
      );
      if (nextPayPeriodStartForSync) {
        await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
          doc.employeeId,
          nextPayPeriodStartForSync
        );
      }
    } catch (e) {
      results.errors.push({
        empNo: doc.empNo,
        error: e.message || String(e),
      });
    }
  }

  return results;
}

module.exports = {
  processPayrollCycleCarryForward,
  allocatePoolConsumption,
  TX,
};
