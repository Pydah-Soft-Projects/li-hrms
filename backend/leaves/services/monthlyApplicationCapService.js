/**
 * Leave policy: combined application cap per payroll period (CL + CCL + optional EL).
 * EL counts toward the cap only when policy.includeEL is true and earnedLeave.useAsPaidInPayroll is false.
 */

const Leave = require('../model/Leave');
const LeaveSplit = require('../model/LeaveSplit');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const dateCycleService = require('./dateCycleService');
const { extractISTComponents } = require('../../shared/utils/dateUtils');

/**
 * Statuses where the leave still consumes monthly apply quota (in-flight pipeline or fully approved).
 * Rejected (`rejected`, `*_rejected`), cancelled, draft, etc. are omitted — those days no longer
 * count as locked or approved, so the payroll-period credit is available for new applications.
 */
const CAP_COUNT_STATUSES = [
  'pending',
  'reporting_manager_approved',
  'hod_approved',
  'manager_approved',
  'hr_approved',
  'principal_approved',
  'approved',
];

/** Subset of {@link CAP_COUNT_STATUSES}: still in workflow — not final `approved` (days show as "locked" on the register). */
const PENDING_PIPELINE_STATUSES = CAP_COUNT_STATUSES.filter((s) => s !== 'approved');

function parseFromDateForPeriod(fromDate) {
  const fromDateStr = String(fromDate || '').trim();
  let fromForPeriod = new Date(fromDate);
  const isoMatch = fromDateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const dmyMatch = fromDateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (isoMatch) {
    fromForPeriod = new Date(
      Date.UTC(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10),
        12,
        0,
        0
      )
    );
  } else if (dmyMatch) {
    const y = parseInt(dmyMatch[3], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const d = parseInt(dmyMatch[1], 10);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      fromForPeriod = new Date(Date.UTC(y, m, d, 12, 0, 0));
    }
  }
  return fromForPeriod;
}

/**
 * Days from one leave row that count toward the cap under current policy.
 */
function countedDaysForLeave(leave, policy) {
  const u = String(leave.leaveType || '').toUpperCase();
  const days = Number(leave.numberOfDays);
  const n = Number.isFinite(days) ? days : 0;
  if (u === 'CL' || u === 'CCL') return n;
  if (u === 'EL') {
    if (!policy?.earnedLeave?.enabled) return 0;
    const includeEL = !!policy?.monthlyLeaveApplicationCap?.includeEL;
    const elPaidInPayroll = policy?.earnedLeave?.useAsPaidInPayroll !== false;
    if (includeEL && !elPaidInPayroll) return n;
    return 0;
  }
  return 0;
}

/**
 * Scheduled credits pool for the payroll period: CL + CCL + EL (EL only when it counts toward monthly cap).
 * If policy monthly cap is enabled → min(pool, maxDays); otherwise → pool (register-only ceiling).
 */
function elCountsTowardMonthlyPool(policy) {
  const capCfg = policy?.monthlyLeaveApplicationCap;
  const includeEL = !!capCfg?.includeEL;
  const elPaidInPayroll = policy?.earnedLeave?.useAsPaidInPayroll !== false;
  return !!policy?.earnedLeave?.enabled && includeEL && !elPaidInPayroll;
}

/** Allocate consumption U against scheduled pool: CL credits first, then CCL, then EL (same as payroll close). */
function allocateMonthlyPoolConsumptionClFirst(U, clS, cclS, elS) {
  const cl = Math.max(0, Number(clS) || 0);
  const ccl = Math.max(0, Number(cclS) || 0);
  const el = Math.max(0, Number(elS) || 0);
  const u = Math.max(0, Number(U) || 0);
  const clAlloc = Math.min(u, cl);
  let r = u - clAlloc;
  const cclAlloc = Math.min(r, ccl);
  r -= cclAlloc;
  const elAlloc = Math.min(r, el);
  return { clAlloc, cclAlloc, elAlloc };
}

/** CCL-typed applications: draw CCL pool first, then CL, then EL. */
function allocateMonthlyPoolConsumptionCclFirst(U, clS, cclS, elS) {
  const cl = Math.max(0, Number(clS) || 0);
  const ccl = Math.max(0, Number(cclS) || 0);
  const el = Math.max(0, Number(elS) || 0);
  const u = Math.max(0, Number(U) || 0);
  const cclAlloc = Math.min(u, ccl);
  let r = u - cclAlloc;
  const clAlloc = Math.min(r, cl);
  r -= clAlloc;
  const elAlloc = Math.min(r, el);
  return { clAlloc, cclAlloc, elAlloc };
}

/** EL-typed applications (when EL counts toward cap): EL pool first, then CL, then CCL. */
function allocateMonthlyPoolConsumptionElFirst(U, clS, cclS, elS) {
  const cl = Math.max(0, Number(clS) || 0);
  const ccl = Math.max(0, Number(cclS) || 0);
  const el = Math.max(0, Number(elS) || 0);
  const u = Math.max(0, Number(U) || 0);
  const elAlloc = Math.min(u, el);
  let r = u - elAlloc;
  const clAlloc = Math.min(r, cl);
  r -= clAlloc;
  const cclAlloc = Math.min(r, ccl);
  return { clAlloc, cclAlloc, elAlloc };
}

/**
 * Map in-flight leave days to register "Lk" columns using monthly pool hierarchy.
 * CL applications consume scheduled CL → CCL → EL; native CCL/EL apps prefer their tier first.
 * Approved consumption is applied first so remainder for locks matches substitution order.
 */
function finalizePendingLockedDisplayByPool(bucket, slot, policy) {
  if (!bucket || !slot || slot.payPeriodStart == null) return false;
  const clS = Math.max(0, Number(slot.clCredits) || 0);
  const cclS = Math.max(0, Number(slot.compensatoryOffs) || 0);
  const elS = elCountsTowardMonthlyPool(policy) ? Math.max(0, Number(slot.elCredits) || 0) : 0;

  const A = Math.max(0, Number(bucket.capApprovedDays) || 0);
  const allocA = allocateMonthlyPoolConsumptionClFirst(A, clS, cclS, elS);
  let remCl = clS - allocA.clAlloc;
  let remCcl = cclS - allocA.cclAlloc;
  let remEl = elS - allocA.elAlloc;

  let plc = 0;
  let plcc = 0;
  let ple = 0;

  const lockedCLapp = Math.max(0, Number(bucket.lockedClAppDays) || 0);
  const a1 = allocateMonthlyPoolConsumptionClFirst(lockedCLapp, remCl, remCcl, remEl);
  plc += a1.clAlloc;
  plcc += a1.cclAlloc;
  ple += a1.elAlloc;
  remCl -= a1.clAlloc;
  remCcl -= a1.cclAlloc;
  remEl -= a1.elAlloc;

  const lockedCCLapp = Math.max(0, Number(bucket.lockedCclAppDays) || 0);
  const a2 = allocateMonthlyPoolConsumptionCclFirst(lockedCCLapp, remCl, remCcl, remEl);
  plc += a2.clAlloc;
  plcc += a2.cclAlloc;
  ple += a2.elAlloc;
  remCl -= a2.clAlloc;
  remCcl -= a2.cclAlloc;
  remEl -= a2.elAlloc;

  const lockedELapp = Math.max(0, Number(bucket.lockedElAppDays) || 0);
  const a3 = allocateMonthlyPoolConsumptionElFirst(lockedELapp, remCl, remCcl, remEl);
  plc += a3.clAlloc;
  plcc += a3.cclAlloc;
  ple += a3.elAlloc;

  bucket.pendingLockedCL = plc;
  bucket.pendingLockedCCL = plcc;
  bucket.pendingLockedEL = ple;
  return true;
}

function computeScheduledPoolApplyCeiling(scheduled, policy) {
  if (!scheduled || typeof scheduled !== 'object') return null;
  const cl = Number(scheduled.clCredits) || 0;
  const cco = Number(scheduled.compensatoryOffs) || 0;
  const el = Number(scheduled.elCredits) || 0;
  const capCfg = policy?.monthlyLeaveApplicationCap;
  const elInPool = elCountsTowardMonthlyPool(policy);
  const pool = cl + cco + (elInPool ? el : 0);
  const policyCapEnabled = !!capCfg?.enabled;
  const maxDays = Number(capCfg?.maxDays);
  const policyCapActive = policyCapEnabled && Number.isFinite(maxDays) && maxDays > 0;
  if (policyCapActive) return Math.min(pool, maxDays);
  return pool;
}

/**
 * Effective days employee may apply in this payroll period (same rules as register UI):
 * min(scheduled pool, policy cap) when year slot applies; else policy maxDays if cap on; else null (no pooled ceiling).
 */
async function resolvePooledMonthlyApplyCeiling(employeeId, fromDate, policy) {
  const capCfg = policy?.monthlyLeaveApplicationCap;
  const policyCapEnabled = !!capCfg?.enabled;
  const maxDays = Number(capCfg?.maxDays);
  const policyCapActive = policyCapEnabled && Number.isFinite(maxDays) && maxDays > 0;

  const fromForPeriod = parseFromDateForPeriod(fromDate);
  const periodInfo = await dateCycleService.getPeriodInfo(fromForPeriod);
  const pc = periodInfo.payrollCycle;
  const fy = await dateCycleService.getFinancialYearForDate(fromForPeriod);
  const doc = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy.name }).lean();
  const slot = doc?.months?.find(
    (m) =>
      Number(m.payrollCycleMonth) === Number(pc.month) &&
      Number(m.payrollCycleYear) === Number(pc.year)
  );

  // Enforce scheduled pooled ceiling even for future payroll periods.
  // Otherwise, UI can show "0 left" (stored ceiling/consumption) while backend allows apply
  // just because the period hasn't started yet.
  if (slot?.payPeriodStart) {
    const scheduled = {
      clCredits: slot.clCredits,
      compensatoryOffs: slot.compensatoryOffs,
      elCredits: slot.elCredits,
    };
    const c = computeScheduledPoolApplyCeiling(scheduled, policy);
    if (c != null && Number.isFinite(c)) return Math.max(0, c);
  }

  if (policyCapActive) return maxDays;
  return null;
}

/**
 * Max CL days allowed from LeaveRegisterYear for this payroll period, or null if not applicable.
 * Applies only after the period has started (IST); future periods return null (no register-based CL cap yet).
 */
async function getRegisterClApplicationCap(employeeId, fromDate, policy) {
  if (policy?.monthlyLeaveApplicationCap?.clCapFromLeaveRegisterYear === false) return null;
  const fromForPeriod = parseFromDateForPeriod(fromDate);
  const periodInfo = await dateCycleService.getPeriodInfo(fromForPeriod);
  const pc = periodInfo.payrollCycle;
  const fy = await dateCycleService.getFinancialYearForDate(fromForPeriod);
  const doc = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy.name }).lean();
  if (!doc?.months?.length) return null;
  const slot = doc.months.find(
    (m) =>
      Number(m.payrollCycleMonth) === Number(pc.month) && Number(m.payrollCycleYear) === Number(pc.year)
  );
  if (!slot?.payPeriodStart) return null;
  return Math.max(0, Number(slot.clCredits) || 0);
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
async function assertWithinMonthlyApplicationCap(employeeId, fromDate, leaveType, numberOfDays) {
  const policy = await LeavePolicySettings.getSettings();
  const capCfg = policy?.monthlyLeaveApplicationCap;

  const fromForPeriod = parseFromDateForPeriod(fromDate);
  const periodInfo = await dateCycleService.getPeriodInfo(fromForPeriod);
  const start = periodInfo.payrollCycle.startDate;
  const end = periodInfo.payrollCycle.endDate;

  const existing = await Leave.find({
    employeeId,
    isActive: true,
    status: { $in: CAP_COUNT_STATUSES },
    fromDate: { $gte: start, $lte: end },
  })
    .select('leaveType numberOfDays splitStatus')
    .lean();

  const add = countedDaysForLeave({ leaveType, numberOfDays }, policy);
  if (add <= 0) return { ok: true };

  /** Period limit is the pooled register ceiling (scheduled CL + CCL in slot + optional EL), not CL credits alone.
   * A separate CL-only cap would block valid applies when CCL extends the pool (substitution / shared monthly cap).
   */
  const pooledCeiling = await resolvePooledMonthlyApplyCeiling(employeeId, fromDate, policy);
  if (pooledCeiling == null) return { ok: true };

  let usedTowardCeiling = 0;
  for (const row of existing) {
    usedTowardCeiling += await sumCountedCapDaysForLeaveInPeriod(row, policy, start, end);
  }

  if (usedTowardCeiling + add > pooledCeiling) {
    const elPart =
      capCfg?.includeEL && policy?.earnedLeave?.useAsPaidInPayroll === false ? ', EL' : '';
    return {
      ok: false,
      error: `Payroll-period apply ceiling is ${pooledCeiling} day(s) (scheduled pool and policy cap when set; CL + CCL${elPart}). Days already counting (pending + approved): ${usedTowardCeiling}; this request: ${add}.`,
    };
  }
  return { ok: true };
}

/**
 * Days counting toward monthly apply cap for one leave row in a payroll window.
 * For split-approved leaves, only approved split segments whose date falls in [start,end]
 * and whose leave type counts (CL/CCL/EL rules) are included — LOP slices do not consume cap.
 */
async function sumCountedCapDaysForLeaveInPeriod(leave, policy, start, end) {
  if (String(leave.splitStatus || '') === 'split_approved' && leave._id) {
    const splits = await LeaveSplit.find({
      leaveId: leave._id,
      status: 'approved',
      date: { $gte: start, $lte: end },
    })
      .select('leaveType numberOfDays')
      .lean();
    let sum = 0;
    for (const s of splits) {
      sum += countedDaysForLeave({ leaveType: s.leaveType, numberOfDays: s.numberOfDays }, policy);
    }
    return sum;
  }
  return countedDaysForLeave(leave, policy);
}

/** CL-only days in period (register CL cap / messaging). Split-aware. */
async function sumClDaysForLeaveInPeriod(leave, policy, start, end) {
  if (String(leave.splitStatus || '') === 'split_approved' && leave._id) {
    const splits = await LeaveSplit.find({
      leaveId: leave._id,
      status: 'approved',
      date: { $gte: start, $lte: end },
    })
      .select('leaveType numberOfDays')
      .lean();
    let sum = 0;
    for (const s of splits) {
      if (String(s.leaveType || '').toUpperCase() !== 'CL') continue;
      sum += countedDaysForLeave({ leaveType: s.leaveType, numberOfDays: s.numberOfDays }, policy);
    }
    return sum;
  }
  if (String(leave.leaveType || '').toUpperCase() === 'CL') {
    return countedDaysForLeave(leave, policy);
  }
  return 0;
}

/**
 * Add one leave’s cap contributions into pendingByMonthKey buckets (register grid “locked/approved”).
 * Split rows are bucketed by each segment’s date; non-split by application fromDate.
 */
async function addLeaveCapToMonthlyBuckets(leave, policy, monthPayrollWindows, pendingByMonthKey) {
  const st = String(leave.status || '');
  const isApproved = st === 'approved';
  const contributions = [];

  if (String(leave.splitStatus || '') === 'split_approved' && leave._id) {
    const splits = await LeaveSplit.find({
      leaveId: leave._id,
      status: 'approved',
    })
      .select('date leaveType numberOfDays')
      .lean();
    for (const s of splits) {
      const capDays = countedDaysForLeave(
        { leaveType: s.leaveType, numberOfDays: s.numberOfDays },
        policy
      );
      if (capDays <= 0) continue;
      const splitMs = new Date(s.date).getTime();
      for (const w of monthPayrollWindows) {
        const startMs = w.start.getTime();
        const endMs = w.end.getTime();
        if (splitMs >= startMs && splitMs <= endMs) {
          contributions.push({ key: w.key, capDays, leaveType: s.leaveType });
          break;
        }
      }
    }
  } else {
    const capDays = countedDaysForLeave(leave, policy);
    if (capDays <= 0) return;
    const leaveFromMs = new Date(leave.fromDate).getTime();
    for (const w of monthPayrollWindows) {
      const startMs = w.start.getTime();
      const endMs = w.end.getTime();
      if (leaveFromMs >= startMs && leaveFromMs <= endMs) {
        contributions.push({ key: w.key, capDays, leaveType: leave.leaveType });
        break;
      }
    }
  }

  for (const c of contributions) {
    const b = pendingByMonthKey[c.key];
    if (!b) continue;
    b.capConsumedDays += c.capDays;
    if (isApproved) b.capApprovedDays += c.capDays;
    else {
      b.capLockedDays += c.capDays;
      b.pendingCapDaysInFlight += c.capDays;
      const u = String(c.leaveType || '').toUpperCase();
      if (u === 'CL') b.lockedClAppDays = (Number(b.lockedClAppDays) || 0) + c.capDays;
      else if (u === 'CCL') b.lockedCclAppDays = (Number(b.lockedCclAppDays) || 0) + c.capDays;
      else if (u === 'EL') b.lockedElAppDays = (Number(b.lockedElAppDays) || 0) + c.capDays;
    }
  }
}

module.exports = {
  assertWithinMonthlyApplicationCap,
  getRegisterClApplicationCap,
  countedDaysForLeave,
  computeScheduledPoolApplyCeiling,
  resolvePooledMonthlyApplyCeiling,
  sumCountedCapDaysForLeaveInPeriod,
  sumClDaysForLeaveInPeriod,
  addLeaveCapToMonthlyBuckets,
  finalizePendingLockedDisplayByPool,
  CAP_COUNT_STATUSES,
  PENDING_PIPELINE_STATUSES,
};
