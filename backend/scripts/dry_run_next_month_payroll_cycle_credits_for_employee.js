/**
 * Dry-run: projected CL/CCL/EL credits for the NEXT payroll cycle.
 *
 * What it computes (no DB writes):
 * 1) CL/CCL/EL pool credits that would be available in NEXT payroll slot,
 *    based on the monthly pool carry-forward allocation from the CURRENT slot.
 * 2) EL earned-leave credits that the accrual engine would credit for NEXT slot
 *    (idempotent: skipped if auto EL credit already exists in that month).
 *
 * Usage:
 *   node scripts/dry_run_next_month_payroll_cycle_credits_for_employee.js --empNo 2145
 *   EMP_NO=2145 node scripts/dry_run_next_month_payroll_cycle_credits_for_employee.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Standalone-script safety:
// `leaveRegisterService.getLeaveRegister()` uses `populate('designation_id')`,
// so we must ensure the Mongoose schema for Designation is registered.
require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const LeavePolicySettings = require('../settings/model/LeavePolicySettings');

const dateCycleService = require('../leaves/services/dateCycleService');
const earnedLeaveService = require('../leaves/services/earnedLeaveService');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');
const monthlyApplicationCapService = require('../leaves/services/monthlyApplicationCapService');

function parseArg(name) {
  const key = String(name).replace(/^--/, '');
  const idx = process.argv.findIndex((a) => a === `--${key}`);
  if (idx >= 0 && process.argv[idx + 1] != null) return process.argv[idx + 1];
  return undefined;
}

function roundHalf(x) {
  const n = Number(x) || 0;
  if (n <= 0) return 0;
  return Math.round(n * 2) / 2;
}

async function computeMonthlyApplyConsumed(employeeId, start, end, policy) {
  // Mirrors leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate,
  // but in-memory only.
  const capLeaves = await Leave.find({
    employeeId,
    isActive: true,
    status: { $in: monthlyApplicationCapService.CAP_COUNT_STATUSES },
    fromDate: { $gte: new Date(start), $lte: new Date(end) },
  })
    .select('leaveType numberOfDays fromDate status splitStatus')
    .lean();

  let consumed = 0;
  for (const l of capLeaves) {
    consumed += await monthlyApplicationCapService.sumCountedCapDaysForLeaveInPeriod(l, policy, start, end);
  }

  return consumed;
}

function findSlotByCycle(months, payrollCycleMonth, payrollCycleYear) {
  return (months || []).find(
    (m) => Number(m.payrollCycleMonth) === Number(payrollCycleMonth) && Number(m.payrollCycleYear) === Number(payrollCycleYear)
  );
}

function sortSlotsByPayPeriodStart(months) {
  return (months || []).slice().sort((a, b) => new Date(a.payPeriodStart).getTime() - new Date(b.payPeriodStart).getTime());
}

async function computePoolCarryOutFromCycleToNext(fromCycle, toCycle, policy, employeeId) {
  const capCfg = policy?.monthlyLeaveApplicationCap || {};
  const includeEL = !!capCfg?.includeEL;
  const elPaidInPayroll = policy?.earnedLeave?.useAsPaidInPayroll !== false;
  const elInPool = !!policy?.earnedLeave?.enabled && includeEL && !elPaidInPayroll;

  const clRoll = policy?.carryForward?.casualLeave?.carryMonthlyClCreditToNextPayrollMonth !== false;
  const cclRoll = policy?.carryForward?.compensatoryOff?.carryMonthlyPoolToNextPayrollMonth !== false;
  const elRoll = elInPool && policy?.carryForward?.earnedLeave?.carryMonthlyPoolToNextPayrollMonth !== false;

  const carryDoc = await LeaveRegisterYear.findOne({
    employeeId,
    months: {
      $elemMatch: {
        payrollCycleMonth: fromCycle.month,
        payrollCycleYear: fromCycle.year,
      },
    },
  }).lean();

  if (!carryDoc?.months?.length) return { cl: 0, ccl: 0, el: 0, reason: 'no_fy_doc' };

  const closingSlot = findSlotByCycle(carryDoc.months, fromCycle.month, fromCycle.year);
  const nextSlot = findSlotByCycle(carryDoc.months, toCycle.month, toCycle.year);
  if (!closingSlot || !nextSlot) return { cl: 0, ccl: 0, el: 0, reason: 'missing_slot_in_fy_doc' };

  const alreadyProcessed = !!closingSlot.poolCarryForwardOutAt;
  if (alreadyProcessed) {
    const out = closingSlot.poolCarryForwardOut || {};
    return {
      cl: roundHalf(Number(out.cl) || 0),
      ccl: roundHalf(Number(out.ccl) || 0),
      el: roundHalf(Number(out.el) || 0),
      reason: 'already_processed_db',
    };
  }

  // U = cap consumption counted from cap-count leaves in this FROM cycle period.
  const consumedRaw = await computeMonthlyApplyConsumed(employeeId, fromCycle.startDate, fromCycle.endDate, policy);
  const U = roundHalf(consumedRaw);

  const clS = roundHalf(closingSlot.clCredits);
  const cclS = roundHalf(closingSlot.compensatoryOffs);
  const elS = elInPool ? roundHalf(closingSlot.elCredits) : 0;

  const alloc = monthlyPoolCarryForwardService.allocatePoolConsumption(U, clS, cclS, elS);

  const clCarry = clRoll ? roundHalf(alloc.clRem) : 0;
  const cclCarry = cclRoll ? roundHalf(alloc.cclRem) : 0;
  const elCarry = elRoll ? roundHalf(alloc.elRem) : 0;

  return { cl: clCarry, ccl: cclCarry, el: elCarry, reason: 'dry_run_calc' };
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  const empNoRaw = parseArg('empNo') || process.env.EMP_NO || parseArg('emp_no');
  const empNo = empNoRaw != null ? Number(empNoRaw) : null;
  const lookAheadRaw = parseArg('lookAhead') || '1';
  const lookAhead = Math.max(1, Math.min(6, Number(lookAheadRaw))); // max 6 to keep output small
  const assumeNotUsedRaw = parseArg('assumeNotUsed') || parseArg('assumeUnused');
  const assumeNotUsed =
    assumeNotUsedRaw != null &&
    ['1', 'true', 'TRUE', 'yes', 'YES'].includes(String(assumeNotUsedRaw).trim());

  if (!empNo || Number.isNaN(empNo)) {
    throw new Error('Provide --empNo <number> (or set EMP_NO). Example: --empNo 2145');
  }

  await mongoose.connect(uri);

  const employee = await Employee.findOne({ emp_no: empNo }).lean();
  if (!employee) {
    throw new Error(`Employee not found for emp_no=${empNo}`);
  }

  // Allow overriding which payroll cycle we consider "current" for projection.
  // This is helpful when you want to preview carry-forward from cycle X/Y → X+1/Y
  // even if today's date is still inside a different cycle.
  const overrideMonthRaw = parseArg('currentMonth') || parseArg('baseMonth');
  const overrideYearRaw = parseArg('currentYear') || parseArg('baseYear');

  let currentCycle;
  if (overrideMonthRaw != null && overrideYearRaw != null) {
    const overrideMonth = Number(overrideMonthRaw);
    const overrideYear = Number(overrideYearRaw);
    if (Number.isNaN(overrideMonth) || Number.isNaN(overrideYear) || overrideMonth < 1 || overrideMonth > 12) {
      throw new Error(`Invalid --currentMonth/--currentYear. Got month=${overrideMonthRaw}, year=${overrideYearRaw}`);
    }

    // Use 15th of the payroll month label as a safe "within-cycle" anchor (cycle labeling is derived from cycle end).
    const anchorDate = new Date(overrideYear, overrideMonth - 1, 15);
    const overridePeriod = await dateCycleService.getPeriodInfo(anchorDate);
    currentCycle = overridePeriod.payrollCycle;
  } else {
    const nowPeriod = await dateCycleService.getPeriodInfo(new Date());
    currentCycle = nowPeriod.payrollCycle;
  }

  // "Next payroll cycle" = the period after the current one ends.
  const nextPeriod = await dateCycleService.getPeriodInfo(new Date(currentCycle.endDate.getTime() + 24 * 60 * 60 * 1000));
  const nextCycle = nextPeriod.payrollCycle;

  const policy = await LeavePolicySettings.getSettings().catch(() => ({}));

  const capCfg = policy?.monthlyLeaveApplicationCap || {};
  const includeEL = !!capCfg?.includeEL;
  const elPaidInPayroll = policy?.earnedLeave?.useAsPaidInPayroll !== false;
  const elInPool = !!policy?.earnedLeave?.enabled && includeEL && !elPaidInPayroll;

  const clRoll =
    policy?.carryForward?.casualLeave?.carryMonthlyClCreditToNextPayrollMonth !== false;
  const cclRoll =
    policy?.carryForward?.compensatoryOff?.carryMonthlyPoolToNextPayrollMonth !== false;
  const elRoll =
    elInPool && policy?.carryForward?.earnedLeave?.carryMonthlyPoolToNextPayrollMonth !== false;

  // Locate the FY document that contains the CURRENT cycle slot (carry-forward source).
  const carryDoc = await LeaveRegisterYear.findOne({
    employeeId: employee._id,
    months: {
      $elemMatch: {
        payrollCycleMonth: currentCycle.month,
        payrollCycleYear: currentCycle.year,
      },
    },
  }).lean();

  let baseNextPool = { cl: null, ccl: null, el: null };
  let projectedNextPool = { cl: null, ccl: null, el: null };
  let carryProjection = {
    alreadyProcessed: null,
    currentMonthlyApplyConsumed: null,
    allocation: null,
    increments: { cl: 0, ccl: 0, el: 0 },
    poolCarryForwardOutAt: null,
  };

  if (carryDoc?.months?.length) {
    const closingSlot = findSlotByCycle(carryDoc.months, currentCycle.month, currentCycle.year);
    const nextSlot = findSlotByCycle(carryDoc.months, nextCycle.month, nextCycle.year);

    if (closingSlot && nextSlot) {
      baseNextPool = {
        cl: Number(nextSlot.clCredits) || 0,
        ccl: Number(nextSlot.compensatoryOffs) || 0,
        el: Number(nextSlot.elCredits) || 0,
      };

      const alreadyProcessed = !!(closingSlot.poolCarryForwardOutAt);
      carryProjection.alreadyProcessed = alreadyProcessed;

      if (!alreadyProcessed) {
        // U is the cap-counted consumption for the CURRENT slot.
        const consumedRaw = await computeMonthlyApplyConsumed(
          employee._id,
          currentCycle.startDate,
          currentCycle.endDate,
          policy
        );
        const U = roundHalf(consumedRaw);

        const clS = roundHalf(closingSlot.clCredits);
        const cclS = roundHalf(closingSlot.compensatoryOffs);
        const elS = elInPool ? roundHalf(closingSlot.elCredits) : 0;

        const alloc = monthlyPoolCarryForwardService.allocatePoolConsumption(U, clS, cclS, elS);

        const clCarry = clRoll ? roundHalf(alloc.clRem) : 0;
        const cclCarry = cclRoll ? roundHalf(alloc.cclRem) : 0;
        const elCarry = elRoll ? roundHalf(alloc.elRem) : 0;

        carryProjection.currentMonthlyApplyConsumed = U;
        carryProjection.allocation = {
          U,
          clS,
          cclS,
          elS,
          alloc,
          policyCarryFlags: { clRoll, cclRoll, elRoll, elInPool },
        };
        carryProjection.increments = { cl: clCarry, ccl: cclCarry, el: elCarry };

        projectedNextPool = {
          cl: baseNextPool.cl + clCarry,
          ccl: baseNextPool.ccl + cclCarry,
          el: baseNextPool.el + elCarry,
        };
      } else {
        // If already processed, DB next-slot already includes carry-forward.
        // Read the stored output so we can still explain why CCL carry is 0 (or not).
        carryProjection.currentMonthlyApplyConsumed = null;
        carryProjection.allocation = closingSlot.poolCarryForwardAllocation || null;
        const out = closingSlot.poolCarryForwardOut || {};
        carryProjection.increments = {
          cl: roundHalf(Number(out.cl) || 0),
          ccl: roundHalf(Number(out.ccl) || 0),
          el: roundHalf(Number(out.el) || 0),
        };
        carryProjection.poolCarryForwardOutAt = closingSlot.poolCarryForwardOutAt || null;
        projectedNextPool = { ...baseNextPool };
      }
    }
  }

  // EL accrual engine simulation for NEXT cycle (ledger CREDIT, idempotent).
  // It posts to the slot matching payrollCycleMonth/year for a cycle target date (15th).
  const elCycleTargetDate = new Date(nextCycle.year, nextCycle.month - 1, 15);
  const fyForEl = await dateCycleService.getFinancialYearForDate(elCycleTargetDate);
  const hasElCredit = await leaveRegisterYearLedgerService.hasEarnedLeaveCreditInMonth(
    employee._id,
    fyForEl.name,
    nextCycle.month,
    nextCycle.year
  );

  const elCalc = await earnedLeaveService.calculateEarnedLeave(
    employee._id,
    nextCycle.month,
    nextCycle.year,
    nextCycle.startDate,
    nextCycle.endDate
  );

  const elEarnedProjected = elCalc?.eligible && Number(elCalc.elEarned) > 0 ? Number(elCalc.elEarned) : 0;
  const elToBeCreditedByEngine = !hasElCredit ? elEarnedProjected : 0;

  // Build a list of cycles to display: Next, Next+1, Next+2... based on --lookAhead
  const cyclesToShow = [];
  let cursorCycle = nextCycle;
  for (let i = 0; i < lookAhead; i++) {
    cyclesToShow.push(cursorCycle);
    const followingPeriod = await dateCycleService.getPeriodInfo(
      new Date(cursorCycle.endDate.getTime() + 24 * 60 * 60 * 1000)
    );
    cursorCycle = followingPeriod.payrollCycle;
  }

  // Compute pool-carry "carry-in" credited into each shown NEXT month, from its previous cycle.
  // This answers: is this month credited via pool carry-forward from the previous month?
  const carryInByCycleKey = new Map(); // key: `${year}-${month}` -> {cl,ccl,el}

  // For the first shown cycle, previous cycle is CURRENT cycle.
  if (cyclesToShow.length > 0) {
    const first = cyclesToShow[0];
    const firstCarry = await computePoolCarryOutFromCycleToNext(currentCycle, first, policy, employee._id);
    carryInByCycleKey.set(`${first.year}-${first.month}`, firstCarry);
  }

  // For remaining shown cycles, previous cycle is the immediately preceding shown cycle.
  for (let i = 1; i < cyclesToShow.length; i++) {
    const prev = cyclesToShow[i - 1];
    const cur = cyclesToShow[i];
    const c = await computePoolCarryOutFromCycleToNext(prev, cur, policy, employee._id);
    carryInByCycleKey.set(`${cur.year}-${cur.month}`, c);
  }

  // Fetch UI-style credited + balances for each cycle (Leave Register "Cr" + "Bal" columns).
  const cycleRows = [];
  let nextCycleUIView = null;
  const cclCreditBreakdownByCycle = [];
  // Also fetch current cycle UI (for carry-forward movement comparison).
  const fyForCurrentCycle = await dateCycleService.getFinancialYearForDate(
    new Date(currentCycle.year, currentCycle.month - 1, 15)
  );
  const currentRegister = await leaveRegisterService.getLeaveRegister(
    { employeeId: employee._id, financialYear: fyForCurrentCycle.name },
    currentCycle.month,
    currentCycle.year
  );
  const currentCycleUIView =
    Array.isArray(currentRegister) && currentRegister.length > 0
      ? currentRegister[0]?.registerMonths?.find(
          (m) =>
            Number(m.month) === Number(currentCycle.month) && Number(m.year) === Number(currentCycle.year)
        )
      : null;
  for (const cycle of cyclesToShow) {
    const fyForCycle = await dateCycleService.getFinancialYearForDate(new Date(cycle.year, cycle.month - 1, 15));

    // UI-style credits ("Cr" columns) are derived from ledger CREDIT transactions,
    // so we fetch them via the same service used by the Leave Register.
    const register = await leaveRegisterService.getLeaveRegister(
      { employeeId: employee._id, financialYear: fyForCycle.name },
      cycle.month,
      cycle.year
    );

    const view =
      Array.isArray(register) && register.length > 0
        ? register[0]?.registerMonths?.find((m) => Number(m.month) === Number(cycle.month) && Number(m.year) === Number(cycle.year))
        : null;
    const monthDetail =
      Array.isArray(register) && register.length > 0
        ? register[0]?.months?.find(
            (m) => Number(m.payrollCycleMonth) === Number(cycle.month) && Number(m.payrollCycleYear) === Number(cycle.year)
          )
        : null;
    if (Number(cycle.month) === Number(nextCycle.month) && Number(cycle.year) === Number(nextCycle.year)) {
      nextCycleUIView = view;
    }

    const credited = {
      CL: Number(view?.cl?.credited) || 0,
      CCL: Number(view?.ccl?.credited) || 0,
      EL: Number(view?.el?.credited) || 0,
    };
    const balances = {
      CL: Number(view?.clBalance) || 0,
      CCL: Number(view?.cclBalance) || 0,
      EL: Number(view?.elBalance) || 0,
    };
    const usedCounts = {
      CL: Number(view?.cl?.used) || 0,
      CCL: Number(view?.ccl?.used) || 0,
      EL: Number(view?.el?.used) || 0,
    };
    const carryIn = carryInByCycleKey.get(`${cycle.year}-${cycle.month}`) || { cl: 0, ccl: 0, el: 0 };

    cycleRows.push({
      Cycle: `${cycle.month}/${cycle.year}`,
      CL: `Cr=${credited.CL}, Used=${usedCounts.CL}, Bal=${balances.CL}, CarryInBalFromPrev=${carryIn.cl}`,
      CCL: `Cr=${credited.CCL}, Used=${usedCounts.CCL}, Bal=${balances.CCL}, CarryInBalFromPrev=${carryIn.ccl}`,
      EL: `Cr=${credited.EL}, Used=${usedCounts.EL}, Bal=${balances.EL}, CarryInBalFromPrev=${carryIn.el}`,
    });

    // Extract underlying CCL CREDIT transactions and show their calculationBreakdown.
    const cclCreditTxs =
      monthDetail?.transactions
        ?.filter((t) => t?.leaveType === 'CCL' && t?.transactionType === 'CREDIT') || [];
    const sumCclCreditDays = cclCreditTxs.reduce((s, t) => s + (Number(t?.days) || 0), 0);

    cclCreditBreakdownByCycle.push({
      Cycle: `${cycle.month}/${cycle.year}`,
      CCL_Cr_UI: credited.CCL,
      CCL_Credit_TxCount: cclCreditTxs.length,
      CCL_Credit_TxSumDays: sumCclCreditDays,
      CCL_Credit_TxDetails:
        cclCreditTxs.length === 0
          ? '[]'
          : JSON.stringify(
              cclCreditTxs.slice(0, 3).map((t) => ({
                days: t.days,
                reason: t.reason,
                autoGeneratedType: t.autoGeneratedType,
                startDate: t.startDate,
                calculationBreakdown: t.calculationBreakdown,
              })),
              null,
              0
            ),
    });
  }

  console.log(
    `\nEmpNo=${empNo} | Current=${currentCycle.month}/${currentCycle.year} | Showing next ${lookAhead} cycle(s) (no DB writes)\n` +
      `Leave Register UI: Credited ("Cr" columns) + Balance for each shown cycle\n`
  );
  console.table(cycleRows);

  console.log('\nCCL CREDIT transaction calculationBreakdown (underlying ledger) per cycle:');
  console.table(cclCreditBreakdownByCycle);

  console.log(
    `\nCarry-forward basis (pool credits scheduled for NEXT slot + carry increment from CURRENT)` +
      ` | currentSlotProcessed=${carryProjection.alreadyProcessed ? 'yes' : 'no'}`
  );
  console.table([
    {
      LeaveType: 'CL',
      ScheduledNextPoolCr: baseNextPool.cl ?? 0,
      CarryIncrement_FromCurrent: carryProjection.increments.cl ?? 0,
      ProjectedNextPoolCr: projectedNextPool.cl ?? 0,
    },
    {
      LeaveType: 'CCL',
      ScheduledNextPoolCr: baseNextPool.ccl ?? 0,
      CarryIncrement_FromCurrent: carryProjection.increments.ccl ?? 0,
      ProjectedNextPoolCr: projectedNextPool.ccl ?? 0,
    },
    {
      LeaveType: 'EL',
      ScheduledNextPoolCr: baseNextPool.el ?? 0,
      CarryIncrement_FromCurrent: carryProjection.increments.el ?? 0,
      ProjectedNextPoolCr: projectedNextPool.el ?? 0,
    },
  ]);

  // One-line “why CCL carry is 0” explanation (based on carry-forward allocation).
  const allocation = carryProjection.allocation;
  const cclCarry = Number(carryProjection.increments.ccl) || 0;
  let cclReason = '';
  if (!cclRoll) {
    cclReason = 'Policy carry-forward for CCL is disabled';
  } else if (cclCarry !== 0) {
    cclReason = 'CCL carry-forward increment is non-zero';
  } else if (allocation?.cclS != null && Number(allocation.cclS) <= 0) {
    cclReason = 'Current cycle CCL scheduled pool is 0';
  } else if (allocation?.alloc?.cclRem != null && Number(allocation.alloc.cclRem) <= 0) {
    cclReason = 'Consumption exhausted CCL remainder (after CL → CCL priority)';
  } else {
    cclReason = 'CCL carry-forward increment computed as 0';
  }

  console.log(`CCL why: ${cclReason}`);

  // Carry-forward movement check:
  // Pool carry-forward does not "move" OD-generated CCL credits.
  // It only carries forward the *unused scheduled monthly apply pool remainder*
  // (CARRY_FORWARD CREDIT) into the NEXT payroll month.
  const cclCarryComputed = Number(carryProjection.increments.ccl) || 0;
  const alloc = carryProjection.allocation || {};
  const allocCclScheduled = alloc.cclS != null ? Number(alloc.cclS) : 0;
  const allocCclAllocated = alloc.alloc?.cclAlloc != null ? Number(alloc.alloc.cclAlloc) : 0;
  const allocCclRemainder = alloc.alloc?.cclRem != null ? Number(alloc.alloc.cclRem) : 0;

  const currentCclCrUi = Number(currentCycleUIView?.ccl?.credited) || 0;
  const currentCclBalUi = Number(currentCycleUIView?.cclBalance) || 0;
  const nextCclCrUi = Number(nextCycleUIView?.ccl?.credited) || 0;
  const nextCclBalUi = Number(nextCycleUIView?.cclBalance) || 0;

  console.log('\nCarry-forward movement check (pool remainder -> NEXT month credit)');
  console.table([
    {
      FromCycle_Current: `${currentCycle.month}/${currentCycle.year}`,
      From_CCL_Cr_UI: currentCclCrUi,
      From_CCL_Bal_UI: currentCclBalUi,
      CurrentSlot_CCL_ScheduledPool: allocCclScheduled,
      CurrentSlot_CCL_AllocatedToConsumption: allocCclAllocated,
      CurrentSlot_CCL_UnusedRemainder: allocCclRemainder,
      Computed_CCL_CarryOut: cclCarryComputed,
      ToCycle_Next: `${nextCycle.month}/${nextCycle.year}`,
      To_CCL_Cr_UI: nextCclCrUi,
      To_CCL_Bal_UI: nextCclBalUi,
    },
  ]);

  // How credits are applied in the NEXT cycle:
  // Compute cap-consumption U for NEXT cycle, then apply greedy allocation CL -> CCL -> EL
  // using NEXT slot pool credit sizes (same allocation used by carry-forward service).
  // This tells you whether CCL balance exists but consumption is being allocated to CL first.
  let UNext;
  if (assumeNotUsed) {
    UNext = 0;
  } else {
    const consumedNextRaw = await computeMonthlyApplyConsumed(
      employee._id,
      nextCycle.startDate,
      nextCycle.endDate,
      policy
    );
    UNext = roundHalf(consumedNextRaw);
  }

  const clS_next = roundHalf(baseNextPool.cl);
  const cclS_next = roundHalf(baseNextPool.ccl);
  const elS_next = elInPool ? roundHalf(baseNextPool.el) : 0;

  const allocNext = monthlyPoolCarryForwardService.allocatePoolConsumption(UNext, clS_next, cclS_next, elS_next);

  console.log(
    `\nNext cycle credit application (cap consumption allocation for ${nextCycle.month}/${nextCycle.year})`
  );

  console.table([
    {
      Assumption: assumeNotUsed ? 'Assume Not Used (U=0)' : 'Real U',
      NextCycle_U_CapConsumed: UNext,
      NextSlot_CL_Pool: clS_next,
      NextSlot_CCL_Pool: cclS_next,
      NextSlot_EL_Pool: elS_next,
      Alloc_CL: allocNext.clAlloc,
      Alloc_CCL: allocNext.cclAlloc,
      Alloc_EL: allocNext.elAlloc,
      Remaining_CCL_afterAlloc: allocNext.cclRem,
      UI_CCL_Used: Number(nextCycleUIView?.ccl?.used) || 0,
      UI_CCL_Locked: Number(nextCycleUIView?.ccl?.locked) || 0,
    },
  ]);

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[DryRunNextPayrollCredits] Fatal:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

