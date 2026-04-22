const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const {
  mergeScheduledCreditsTypePatch,
  syncSlotLegacyToScheduledMap,
} = require('../utils/leaveRegisterScheduledCredits');
const { getLeavePolicyResolved, toResolvedPolicyPlain } = require('../../settings/services/leavePolicyTypeConfigService');
const dateCycleService = require('./dateCycleService');
const { extractISTComponents, createISTDate, getTodayISTDateString } = require('../../shared/utils/dateUtils');
const { computeScheduledPoolApplyCeiling } = require('./monthlyApplicationCapService');
const leaveRegisterYearMonthlyApplyService = require('./leaveRegisterYearMonthlyApplyService');
const leaveRegisterYearLedgerService = require('./leaveRegisterYearLedgerService');

/** YYYY-MM-DD in Asia/Kolkata (same basis as payroll cycles). */
function istDateStr(d) {
  if (d == null) return null;
  return extractISTComponents(d).dateStr;
}

/** Inclusive calendar days from IST date A through B (A <= B). */
function istInclusiveDayCount(fromDateStr, toDateStr) {
  const a = createISTDate(fromDateStr);
  const b = createISTDate(toDateStr);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/**
 * 12 monthly CL credits for a tier; if monthlyClCredits missing, split casualLeave evenly.
 */
function normalizeTierMonthlyCredits(tier, defaultAnnual) {
  const annual = Number(tier?.casualLeave ?? defaultAnnual ?? 12);
  const grid = tier?.monthlyClCredits;
  if (Array.isArray(grid) && grid.length === 12) {
    return grid.map((n) => Math.max(0, Number(n) || 0));
  }
  const base = annual / 12;
  const rounded = Math.round(base * 100) / 100;
  return Array.from({ length: 12 }, () => rounded);
}

/**
 * How to treat the payroll cycle that contains DOJ (join after period start).
 * - zero: no CL for that cycle (credit starts next period).
 * - majority_full: full tier cell if more than half the cycle (inclusive) remains from DOJ to cycle end; else 0.
 * - pro_rata: legacy fractional accrual by days in cycle.
 */
function resolveJoinCycleMode(options = {}) {
  if (options.joiningCycleClRule === 'zero' || options.joiningCycleClRule === 'majority_full' || options.joiningCycleClRule === 'pro_rata') {
    return options.joiningCycleClRule;
  }
  if (options.zeroJoiningPayrollCycle === true) return 'zero';
  if (options.zeroJoiningPayrollCycle === false) return 'pro_rata';
  return 'majority_full';
}

/**
 * CL credits for one payroll cycle vs DOJ.
 * - No DOJ: full cell (treat as employed whole period).
 * - Join after cycle: 0.
 * - Join on/before cycle start: full tier cell.
 * - Join during cycle: see resolveJoinCycleMode (default majority_full).
 */
function proRataClForCycle(cycleStart, cycleEnd, doj, tierCell, options = {}) {
  const mode = resolveJoinCycleMode(options);
  const cell = Number(tierCell) || 0;
  if (cell <= 0) return 0;
  if (!doj) return cell;

  const joinStr = istDateStr(doj);
  const startStr = istDateStr(cycleStart);
  const endStr = istDateStr(cycleEnd);
  if (!joinStr || !startStr || !endStr) return cell;

  if (joinStr > endStr) return 0;
  if (joinStr <= startStr) return cell;

  if (mode === 'zero') return 0;

  const daysInCycle = istInclusiveDayCount(startStr, endStr);
  const daysFromJoinToEnd = istInclusiveDayCount(joinStr, endStr);

  if (mode === 'majority_full') {
    // Credit this period when at least half the pay cycle (inclusive) remains from DOJ through period end
    if (daysFromJoinToEnd * 2 >= daysInCycle) return cell;
    return 0;
  }

  // pro_rata
  const daysInService = daysFromJoinToEnd;
  let accrual = Math.round((daysInService / daysInCycle) * cell * 100) / 100;
  if (accrual > 0 && accrual < 0.5) accrual = 0.5;
  if (accrual > 0) accrual = Math.round(accrual * 2) / 2;
  return accrual;
}

/**
 * Up to 12 payroll cycles from FY start to FY end (chronological).
 */
async function getTwelvePayrollCyclesForFY(fyStart, fyEnd) {
  const cycles = await dateCycleService.getPayrollCyclesInRange(new Date(fyStart), new Date(fyEnd));
  let ordered = [...cycles].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (ordered.length >= 12) {
    return ordered.slice(0, 12);
  }
  let cursor = ordered.length
    ? new Date(ordered[ordered.length - 1].endDate)
    : new Date(fyStart);
  cursor.setDate(cursor.getDate() + 1);
  const seen = new Set(ordered.map((c) => c.startDate.getTime()));
  let guard = 0;
  while (ordered.length < 12 && cursor <= new Date(fyEnd) && guard < 24) {
    guard++;
    const c = await dateCycleService.getPayrollCycleForDate(cursor);
    const key = c.startDate.getTime();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(c);
    }
    const next = new Date(c.endDate);
    next.setDate(next.getDate() + 1);
    cursor = next;
  }
  return ordered.slice(0, 12);
}

function monthLabel(cycle) {
  const m = cycle.month;
  const y = cycle.year;
  try {
    return `${new Date(0, m - 1).toLocaleString('en', { month: 'short' })} ${y}`;
  } catch {
    return `M${m}/${y}`;
  }
}

/**
 * Build 12 month slots with CL credits from policy grid (period 1 = first payroll cycle in FY order).
 * @param {object} [slotOptions]
 * @param {'zero'|'majority_full'|'pro_rata'} [slotOptions.joiningCycleClRule] — join-in-cycle behaviour; default majority_full.
 * @param {boolean} [slotOptions.zeroJoiningPayrollCycle] — legacy: true = zero, false = pro_rata.
 */
async function buildYearMonthSlots(resetDate, monthlyGrid, doj, slotOptions = {}) {
  let policy = {};
  try {
    policy = await getLeavePolicyResolved();
  } catch {
    policy = {};
  }
  const fy = await dateCycleService.getFinancialYearForDate(resetDate);
  const cycles = await getTwelvePayrollCyclesForFY(fy.startDate, fy.endDate);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const cycle = cycles[i];
    const tierCell = monthlyGrid[i] ?? 0;
    if (!cycle) {
    const emptySlot = {
      payrollMonthIndex: i + 1,
      label: `Period ${i + 1}`,
      payPeriodStart: fy.startDate,
      payPeriodEnd: fy.endDate,
      payrollCycleMonth: i + 1,
      payrollCycleYear: fy.year,
      clCredits: 0,
      elCredits: 0,
      compensatoryOffs: 0,
      lockedCredits: 0,
    };
    syncSlotLegacyToScheduledMap(emptySlot);
    months.push(emptySlot);
    continue;
    }
    const clCredits = proRataClForCycle(
      cycle.startDate,
      cycle.endDate,
      doj,
      tierCell,
      slotOptions
    );
    const ceiling = computeScheduledPoolApplyCeiling(
      { clCredits, elCredits: 0, compensatoryOffs: 0 },
      policy
    );
    const monthSlot = {
      payrollMonthIndex: i + 1,
      label: monthLabel(cycle),
      payPeriodStart: cycle.startDate,
      payPeriodEnd: cycle.endDate,
      payrollCycleMonth: cycle.month,
      payrollCycleYear: cycle.year,
      clCredits,
      elCredits: 0,
      compensatoryOffs: 0,
      lockedCredits: 0,
      monthlyApplyCeiling: ceiling != null ? Math.max(0, ceiling) : 0,
      monthlyApplyConsumed: 0,
      monthlyApplyLocked: 0,
      monthlyApplyApproved: 0,
    };
    syncSlotLegacyToScheduledMap(monthSlot);
    months.push(monthSlot);
  }
  return { fy, months };
}

/**
 * Sum of scheduled CL credits for the year (after join pro-rata).
 */
function sumScheduledCl(months) {
  return months.reduce((s, m) => s + (Number(m.clCredits) || 0), 0);
}

/**
 * True when the payroll cycle is fully over before the given effective calendar day (IST).
 * On the cycle end date (e.g. 25th) we do NOT count that period yet — credit is earned after close.
 * Compares IST YYYY-MM-DD of payPeriodEnd vs effectiveDate.
 */
function isPayrollPeriodClosedBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr < effStr;
}

/** Period finished on or before effective calendar day (IST). Used to zero past months on initial sync (incl. cycle ending on effective day). */
function isPayrollPeriodEndedOnOrBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr <= effStr;
}

/**
 * Sum scheduled clCredits for payroll periods that have fully ended before effectiveDate (IST).
 * Used for initial sync / preview YTD (excludes the cycle that ends on effectiveDate, e.g. 26–25 March period on Mar 25).
 */
function sumScheduledClThroughDate(months, effectiveDate) {
  if (!effectiveDate || !Array.isArray(months)) return 0;
  let s = 0;
  for (const m of months) {
    if (!m.payPeriodEnd) continue;
    if (!isPayrollPeriodClosedBeforeAsOf(m.payPeriodEnd, effectiveDate)) continue;
    s += Number(m.clCredits) || 0;
  }
  return Math.round(s * 2) / 2;
}

/**
 * Append one CL CREDIT per slot equal to clCredits (policy schedule). Call after clCredits finalised (incl. carry on slot 0).
 * Transaction dates use payPeriodEnd so balances “as of” a calendar day exclude the cycle that ends that day (IST).
 * @param {object} [opts]
 * @param {Date} [opts.throughDate] — if set, only post CREDIT for periods with payPeriodEnd (IST) strictly before throughDate’s calendar day.
 */
function appendMonthlyClScheduledCreditTransactions(monthsPayload, opts = {}) {
  if (!Array.isArray(monthsPayload)) return;
  const through = opts.throughDate != null ? opts.throughDate : null;
  for (const m of monthsPayload) {
    if (through != null && m.payPeriodEnd) {
      if (!isPayrollPeriodClosedBeforeAsOf(m.payPeriodEnd, through)) continue;
    }
    const d = Number(m.clCredits) || 0;
    if (d <= 0) continue;
    if (!m.transactions) m.transactions = [];
    const creditAt = m.payPeriodEnd ? new Date(m.payPeriodEnd) : m.payPeriodStart ? new Date(m.payPeriodStart) : new Date();
    m.transactions.push({
      at: creditAt,
      leaveType: 'CL',
      transactionType: 'CREDIT',
      days: d,
      openingBalance: 0,
      closingBalance: 0,
      startDate: creditAt,
      endDate: creditAt,
      reason: `Scheduled CL — ${m.label || `period ${m.payrollMonthIndex}`}: ${d} day(s) (policy month ${m.payrollMonthIndex})`,
      status: 'APPROVED',
      autoGenerated: true,
      autoGeneratedType: 'MONTHLY_CL_SCHEDULE',
    });
  }
}

/**
 * One CREDIT per month for a leave type, days from getter(m). Used after annual reset for EL / map types.
 * @param {string} autoGeneratedType e.g. MONTHLY_EL_SCHEDULE, MONTHLY_TYPE_SCHEDULE_SL
 */
function appendMonthlyScheduledCreditByGetter(monthsPayload, leaveType, getDays, autoGeneratedType, labelShort, opts = {}) {
  if (!Array.isArray(monthsPayload) || !leaveType) return;
  const u = String(leaveType).toUpperCase();
  const through = opts.throughDate != null ? opts.throughDate : null;
  for (const m of monthsPayload) {
    if (through != null && m.payPeriodEnd) {
      if (!isPayrollPeriodClosedBeforeAsOf(m.payPeriodEnd, through)) continue;
    }
    const d = Math.max(0, Number(getDays(m)) || 0);
    if (d <= 0) continue;
    if (!m.transactions) m.transactions = [];
    const creditAt = m.payPeriodEnd ? new Date(m.payPeriodEnd) : m.payPeriodStart ? new Date(m.payPeriodStart) : new Date();
    const tag = labelShort || u;
    m.transactions.push({
      at: creditAt,
      leaveType: u,
      transactionType: 'CREDIT',
      days: d,
      openingBalance: 0,
      closingBalance: 0,
      startDate: creditAt,
      endDate: creditAt,
      reason: `Scheduled ${tag} — ${m.label || `period ${m.payrollMonthIndex}`}: ${d} day(s) (policy month ${m.payrollMonthIndex})`,
      status: 'APPROVED',
      autoGenerated: true,
      autoGeneratedType,
    });
  }
}

/**
 * After CL annual slots exist, set EL / CCL / or scheduledCreditsByType[code] for each of 12 periods using same
 * join rules as CL (reuses proRataClForCycle + cycle bounds from each slot).
 * @param {'el'|'ccl'|'map'} field
 * @param {string} [mapCode] upper case when field==='map'
 */
function applyProRataGridToExistingMonthSlots(monthsPayload, grid12, doj, field, mapCode, slotOptions = {}) {
  if (!Array.isArray(monthsPayload) || !Array.isArray(grid12) || monthsPayload.length === 0) return;
  const codeU = field === 'map' ? String(mapCode || '').toUpperCase() : '';
  for (let i = 0; i < monthsPayload.length; i++) {
    const m = monthsPayload[i];
    const cell = i < grid12.length ? Number(grid12[i]) || 0 : 0;
    if (!m.payPeriodStart || !m.payPeriodEnd) continue;
    const val = proRataClForCycle(m.payPeriodStart, m.payPeriodEnd, doj, cell, slotOptions);
    if (field === 'el') {
      m.elCredits = val;
    } else if (field === 'ccl') {
      m.compensatoryOffs = val;
    } else if (field === 'map' && codeU) {
      if (!m.scheduledCreditsByType || typeof m.scheduledCreditsByType !== 'object') {
        m.scheduledCreditsByType = {};
      }
      m.scheduledCreditsByType[codeU] = val;
    }
    syncSlotLegacyToScheduledMap(m);
  }
}

async function upsertLeaveRegisterYear({
  employeeId,
  empNo,
  employeeName,
  resetDate,
  casualBalance,
  compensatoryOffBalance,
  months,
  yearlyTransactions,
  yearlyPolicyClScheduledTotal,
  source = 'ANNUAL_RESET'
}) {
  const fy = await dateCycleService.getFinancialYearForDate(resetDate);
  const setDoc = {
    empNo,
    employeeName: employeeName || '',
    financialYear: fy.name,
    financialYearStart: fy.startDate,
    financialYearEnd: fy.endDate,
    casualBalance,
    compensatoryOffBalance,
    months,
    yearlyTransactions,
    resetAt: resetDate,
    source
  };
  if (yearlyPolicyClScheduledTotal != null && Number.isFinite(Number(yearlyPolicyClScheduledTotal))) {
    setDoc.yearlyPolicyClScheduledTotal = Math.round(Number(yearlyPolicyClScheduledTotal) * 100) / 100;
  }
  return LeaveRegisterYear.findOneAndUpdate(
    { employeeId, financialYear: fy.name },
    {
      $set: setDoc
    },
    { upsert: true, new: true }
  );
}

async function findByEmployeeAndFY(employeeId, financialYearName) {
  return LeaveRegisterYear.findOne({ employeeId, financialYear: financialYearName }).lean();
}

function numOrUndef(v) {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function gateMonthSlotEditFlags(flags) {
  if (flags.allowEditMonth === false) {
    return {
      allowEditMonth: false,
      allowEditClCredits: false,
      allowEditCclCredits: false,
      allowEditElCredits: false,
      allowEditPolicyLock: false,
      allowEditUsedCl: false,
      allowEditUsedCcl: false,
      allowEditUsedEl: false,
      // Unused-pool carry is independent of admin slot edit lock; still controlled by allowCarryUnusedToNextMonth + roll flags.
      allowCarryUnusedToNextMonth: flags.allowCarryUnusedToNextMonth !== false,
    };
  }
  return { ...flags, allowEditMonth: flags.allowEditMonth !== false };
}

function resolveMonthSlotEditFlags(policyDoc, payrollMonthIndex) {
  const allow = (v) => v !== false;
  const base = {
    allowEditMonth: true,
    allowEditClCredits: true,
    allowEditCclCredits: true,
    allowEditElCredits: true,
    allowEditPolicyLock: true,
    allowEditUsedCl: true,
    allowEditUsedCcl: true,
    allowEditUsedEl: true,
    allowCarryUnusedToNextMonth: true,
  };
  const cfg = policyDoc?.leaveRegisterMonthSlotEdit || {};
  // Backward compatibility with older flat shape.
  const mergedDefaults = {
    ...base,
    allowEditMonth: allow(cfg.defaults?.allowEditMonth ?? cfg.allowEditMonth),
    allowEditClCredits: allow(cfg.defaults?.allowEditClCredits ?? cfg.allowEditClCredits),
    allowEditCclCredits: allow(cfg.defaults?.allowEditCclCredits ?? cfg.allowEditCclCredits),
    allowEditElCredits: allow(cfg.defaults?.allowEditElCredits ?? cfg.allowEditElCredits),
    allowEditPolicyLock: allow(cfg.defaults?.allowEditPolicyLock ?? cfg.allowEditPolicyLock),
    allowEditUsedCl: allow(cfg.defaults?.allowEditUsedCl ?? cfg.allowEditUsedCl),
    allowEditUsedCcl: allow(cfg.defaults?.allowEditUsedCcl ?? cfg.allowEditUsedCcl),
    allowEditUsedEl: allow(cfg.defaults?.allowEditUsedEl ?? cfg.allowEditUsedEl),
    allowCarryUnusedToNextMonth: allow(
      cfg.defaults?.allowCarryUnusedToNextMonth ?? cfg.allowCarryUnusedToNextMonth
    ),
  };
  const key = String(Number(payrollMonthIndex) || '');
  const monthOverride =
    key && cfg?.byPayrollMonthIndex && typeof cfg.byPayrollMonthIndex === 'object'
      ? cfg.byPayrollMonthIndex[key]
      : null;
  if (!monthOverride || typeof monthOverride !== 'object') return gateMonthSlotEditFlags(mergedDefaults);
  const merged = {
    ...mergedDefaults,
    allowEditMonth: allow(
      monthOverride.allowEditMonth != null
        ? monthOverride.allowEditMonth
        : mergedDefaults.allowEditMonth
    ),
    allowEditClCredits: allow(
      monthOverride.allowEditClCredits != null
        ? monthOverride.allowEditClCredits
        : mergedDefaults.allowEditClCredits
    ),
    allowEditCclCredits: allow(
      monthOverride.allowEditCclCredits != null
        ? monthOverride.allowEditCclCredits
        : mergedDefaults.allowEditCclCredits
    ),
    allowEditElCredits: allow(
      monthOverride.allowEditElCredits != null
        ? monthOverride.allowEditElCredits
        : mergedDefaults.allowEditElCredits
    ),
    allowEditPolicyLock: allow(
      monthOverride.allowEditPolicyLock != null
        ? monthOverride.allowEditPolicyLock
        : mergedDefaults.allowEditPolicyLock
    ),
    allowEditUsedCl: allow(
      monthOverride.allowEditUsedCl != null
        ? monthOverride.allowEditUsedCl
        : mergedDefaults.allowEditUsedCl
    ),
    allowEditUsedCcl: allow(
      monthOverride.allowEditUsedCcl != null
        ? monthOverride.allowEditUsedCcl
        : mergedDefaults.allowEditUsedCcl
    ),
    allowEditUsedEl: allow(
      monthOverride.allowEditUsedEl != null
        ? monthOverride.allowEditUsedEl
        : mergedDefaults.allowEditUsedEl
    ),
    allowCarryUnusedToNextMonth: allow(
      monthOverride.allowCarryUnusedToNextMonth != null
        ? monthOverride.allowCarryUnusedToNextMonth
        : mergedDefaults.allowCarryUnusedToNextMonth
    ),
  };
  return gateMonthSlotEditFlags(merged);
}

/** First calendar month (1–12) of FY period 1 — must match DateCycleService FY + settings grid order. */
function effectiveFyStartMonthForPayrollIndex(policyDoc) {
  const fy = policyDoc?.financialYear;
  if (fy && fy.useCalendarYear === true) return 1;
  const m = Number(fy?.startMonth);
  if (Number.isFinite(m) && m >= 1 && m <= 12) return m;
  return 4;
}

function derivePolicyMonthIndexFromCycleMonth(slot, policyDoc) {
  const startMonth = effectiveFyStartMonthForPayrollIndex(policyDoc);
  const pcm = Number(slot?.payrollCycleMonth);
  if (!Number.isFinite(pcm) || pcm < 1 || pcm > 12) {
    return Number(slot?.payrollMonthIndex) || 1;
  }
  return ((pcm - startMonth + 12) % 12) + 1;
}

function round2(v) {
  const n = Number(v) || 0;
  return Math.round(n * 100) / 100;
}

function sumUsedDaysForType(slot, leaveType) {
  const txs = Array.isArray(slot?.transactions) ? slot.transactions : [];
  return round2(
    txs
      .filter((t) => String(t?.leaveType || '').toUpperCase() === leaveType && String(t?.transactionType) === 'DEBIT')
      .filter((t) => !String(t?.autoGeneratedType || '').startsWith('MONTHLY_POOL_TRANSFER_OUT_'))
      .reduce((s, t) => s + Math.max(0, Number(t?.days) || 0), 0)
  );
}

function findNextSlot(months, currentIdx) {
  if (!Array.isArray(months)) return null;
  const ordered = months
    .map((m, idx) => ({ idx, t: new Date(m?.payPeriodStart || m?.payPeriodEnd || 0).getTime() }))
    .sort((a, b) => a.t - b.t);
  const pos = ordered.findIndex((x) => x.idx === currentIdx);
  if (pos < 0 || pos >= ordered.length - 1) return null;
  const nextIdx = ordered[pos + 1].idx;
  return { idx: nextIdx, slot: months[nextIdx] };
}

function creditAtForSlot(slot) {
  return slot?.payPeriodEnd
    ? new Date(slot.payPeriodEnd)
    : slot?.payPeriodStart
      ? new Date(slot.payPeriodStart)
      : new Date();
}

function isManualSlotUsedTx(t) {
  return String(t?.autoGeneratedType || '').startsWith('MANUAL_SLOT_USED_');
}

function isMonthlyPoolTransferOutTx(t) {
  return String(t?.autoGeneratedType || '').startsWith('MONTHLY_POOL_TRANSFER_OUT_');
}

function setManualUsedForType({ slot, leaveType, desiredUsed, manualAutoGeneratedType, anchorAt, reasonStr }) {
  if (desiredUsed === undefined) return;
  if (!Array.isArray(slot.transactions)) slot.transactions = [];

  // Remove previous manual "used" entries so repeated edits overwrite, not accumulate.
  slot.transactions = slot.transactions.filter((t) => !(t && String(t?.autoGeneratedType || '') === manualAutoGeneratedType));

  const usedNonManual = round2(
    slot.transactions
      .filter(
        (t) =>
          String(t?.leaveType || '').toUpperCase() === leaveType &&
          String(t?.transactionType) === 'DEBIT' &&
          !isMonthlyPoolTransferOutTx(t) &&
          !isManualSlotUsedTx(t)
      )
      .reduce((s, t) => s + Math.max(0, Number(t?.days) || 0), 0)
  );

  const desired = round2(desiredUsed);
  if (desired < usedNonManual) {
    throw new Error(`Manual used validation failed: desired used ${desired} is less than already used ${usedNonManual} in records`);
  }

  const delta = round2(desired - usedNonManual);
  if (delta <= 0) return;

  slot.transactions.push({
    at: new Date(),
    leaveType,
    transactionType: 'DEBIT',
    days: delta,
    openingBalance: 0,
    closingBalance: 0,
    startDate: anchorAt,
    endDate: anchorAt,
    reason: `Manual used slot edit — ${reasonStr}`,
    status: 'APPROVED',
    autoGenerated: true,
    autoGeneratedType: manualAutoGeneratedType,
  });
}

function upsertSlotScheduledCreditTx({
  slot,
  leaveType,
  autoGeneratedType,
  days,
  reasonPrefix,
}) {
  const d = round2(Number(days) || 0);
  if (!slot || d <= 0) return;
  if (!Array.isArray(slot.transactions)) slot.transactions = [];

  // Avoid duplicates when admin repeats edits or toggles options.
  slot.transactions = slot.transactions.filter(
    (t) => !(t && String(t.leaveType || '').toUpperCase() === String(leaveType).toUpperCase() && t.autoGeneratedType === autoGeneratedType)
  );

  const creditAt = creditAtForSlot(slot);
  const label = slot.label || `${slot.payrollMonthIndex}/${slot.payrollCycleYear}`;
  slot.transactions.push({
    at: creditAt,
    leaveType,
    transactionType: 'CREDIT',
    days: d,
    openingBalance: 0,
    closingBalance: 0,
    startDate: creditAt,
    endDate: creditAt,
    reason: `${reasonPrefix} — ${label}: ${d} day(s)`,
    status: 'APPROVED',
    autoGenerated: true,
    autoGeneratedType,
  });
}

/**
 * HR / sub-admin / super-admin: adjust scheduled pool fields on one payroll month slot.
 * Recomputes monthlyApplyCeiling, syncs monthly apply consumption from Leave rows, appends FY audit row.
 */
async function patchMonthSlotScheduledCredits({
  employeeId,
  financialYear,
  payrollCycleMonth,
  payrollCycleYear,
  patch,
  reason,
  actorUserId,
  validateWithRecords = false,
  carryUnusedToNextMonth = false,
  usedCl,
  usedCcl,
  usedEl,
}) {
  const fy = String(financialYear || '').trim();
  if (!fy) throw new Error('financialYear is required');
  const reasonStr = String(reason || '').trim();
  if (!reasonStr) throw new Error('reason is required');

  const pm = Number(payrollCycleMonth);
  const py = Number(payrollCycleYear);
  if (!Number.isFinite(pm) || !Number.isFinite(py)) {
    throw new Error('payrollCycleMonth and payrollCycleYear are required');
  }

  const doc = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy });
  if (!doc || !Array.isArray(doc.months)) {
    throw new Error('Leave register year not found');
  }

  const idx = doc.months.findIndex(
    (m) => Number(m.payrollCycleMonth) === pm && Number(m.payrollCycleYear) === py
  );
  if (idx < 0) throw new Error('Payroll month slot not found for this FY');

  const slot = doc.months[idx];
  if (!Array.isArray(slot.transactions)) slot.transactions = [];
  const anchorAt =
    slot.payPeriodStart || slot.payPeriodEnd || new Date(py, pm - 1, 15);
  const policy = await getLeavePolicyResolved().catch(() => toResolvedPolicyPlain({}));
  const policyMonthIndex = derivePolicyMonthIndexFromCycleMonth(slot, policy);
  const editFlags = resolveMonthSlotEditFlags(policy, policyMonthIndex);
  if (editFlags.allowEditMonth === false) {
    throw new Error(
      `Leave register month slot editing is disabled for policy payroll month ${policyMonthIndex} (${pm}/${py}).`
    );
  }
  const disallowed = [];
  if (patch.clCredits !== undefined && !editFlags.allowEditClCredits) disallowed.push('clCredits');
  if (patch.compensatoryOffs !== undefined && !editFlags.allowEditCclCredits) disallowed.push('compensatoryOffs');
  if (patch.elCredits !== undefined && !editFlags.allowEditElCredits) disallowed.push('elCredits');
  if (patch.lockedCredits !== undefined && !editFlags.allowEditPolicyLock) disallowed.push('lockedCredits');
  if (usedCl !== undefined && !editFlags.allowEditUsedCl) disallowed.push('usedCl');
  if (usedCcl !== undefined && !editFlags.allowEditUsedCcl) disallowed.push('usedCcl');
  if (usedEl !== undefined && !editFlags.allowEditUsedEl) disallowed.push('usedEl');
  if (carryUnusedToNextMonth === true && !editFlags.allowCarryUnusedToNextMonth) {
    disallowed.push('carryUnusedToNextMonth');
  }
  if (disallowed.length > 0) {
    throw new Error(`Not allowed by month-slot edit policy for payroll month ${policyMonthIndex}: ${disallowed.join(', ')}`);
  }

  // Optional manual "Used" override:
  // Create DEBIT transactions so UI used columns + monthly apply "Left" update even without Leave rows.
  setManualUsedForType({
    slot,
    leaveType: 'CL',
    desiredUsed: numOrUndef(usedCl),
    manualAutoGeneratedType: 'MANUAL_SLOT_USED_CL',
    anchorAt,
    reasonStr,
  });
  setManualUsedForType({
    slot,
    leaveType: 'CCL',
    desiredUsed: numOrUndef(usedCcl),
    manualAutoGeneratedType: 'MANUAL_SLOT_USED_CCL',
    anchorAt,
    reasonStr,
  });
  setManualUsedForType({
    slot,
    leaveType: 'EL',
    desiredUsed: numOrUndef(usedEl),
    manualAutoGeneratedType: 'MANUAL_SLOT_USED_EL',
    anchorAt,
    reasonStr,
  });

  const before = {
    clCredits: slot.clCredits,
    compensatoryOffs: slot.compensatoryOffs,
    elCredits: slot.elCredits,
    lockedCredits: slot.lockedCredits,
    monthlyApplyCeiling: slot.monthlyApplyCeiling,
  };

  const nextCl = numOrUndef(patch.clCredits);
  const nextCco = numOrUndef(patch.compensatoryOffs);
  const nextEl = numOrUndef(patch.elCredits);
  const nextLk = numOrUndef(patch.lockedCredits);

  const hasTypePatch =
    patch.scheduledCreditsByType != null &&
    typeof patch.scheduledCreditsByType === 'object' &&
    Object.keys(patch.scheduledCreditsByType).length > 0;

  if (nextCl === undefined && nextCco === undefined && nextEl === undefined && nextLk === undefined && !hasTypePatch) {
    throw new Error('At least one field to update is required');
  }

  if (nextCl !== undefined) slot.clCredits = Math.max(0, nextCl);
  if (nextCco !== undefined) slot.compensatoryOffs = Math.max(0, nextCco);
  if (nextEl !== undefined) slot.elCredits = Math.max(0, nextEl);
  if (nextLk !== undefined) slot.lockedCredits = Math.max(0, nextLk);

  if (hasTypePatch) {
    mergeScheduledCreditsTypePatch(slot, patch.scheduledCreditsByType);
  } else {
    syncSlotLegacyToScheduledMap(slot);
  }

  if (validateWithRecords) {
    const usedCl = sumUsedDaysForType(slot, 'CL');
    const usedCcl = sumUsedDaysForType(slot, 'CCL');
    const usedEl = sumUsedDaysForType(slot, 'EL');
    if (Number(slot.clCredits) < usedCl) {
      throw new Error(`Validation failed: Scheduled CL (${slot.clCredits}) is below used CL (${usedCl}) in records`);
    }
    if (Number(slot.compensatoryOffs) < usedCcl) {
      throw new Error(
        `Validation failed: Scheduled CCL (${slot.compensatoryOffs}) is below used CCL (${usedCcl}) in records`
      );
    }
    if (Number(slot.elCredits) < usedEl) {
      throw new Error(`Validation failed: Scheduled EL (${slot.elCredits}) is below used EL (${usedEl}) in records`);
    }
  }

  const ceilingRaw = computeScheduledPoolApplyCeiling(
    {
      clCredits: slot.clCredits,
      compensatoryOffs: slot.compensatoryOffs,
      elCredits: slot.elCredits,
    },
    policy
  );
  if (ceilingRaw != null && Number.isFinite(ceilingRaw)) {
    slot.monthlyApplyCeiling = Math.max(0, ceilingRaw);
  }

  if (carryUnusedToNextMonth) {
    const next = findNextSlot(doc.months, idx);
    if (next?.slot) {
      const usedCl = sumUsedDaysForType(slot, 'CL');
      const usedCcl = sumUsedDaysForType(slot, 'CCL');
      const usedEl = sumUsedDaysForType(slot, 'EL');

      const clCarry = Math.max(0, round2(Number(slot.clCredits) - usedCl));
      const cclCarry = Math.max(0, round2(Number(slot.compensatoryOffs) - usedCcl));
      const elCarry = Math.max(0, round2(Number(slot.elCredits) - usedEl));

      if (clCarry > 0 || cclCarry > 0 || elCarry > 0) {
        // Mark transfer-out from the edited month so the UI can show it in the "Transfer" column.
        slot.poolCarryForwardOut = {
          cl: clCarry,
          ccl: cclCarry,
          el: elCarry,
        };
        slot.poolCarryForwardOutAt = new Date();

        next.slot.clCredits = round2((Number(next.slot.clCredits) || 0) + clCarry);
        next.slot.compensatoryOffs = round2((Number(next.slot.compensatoryOffs) || 0) + cclCarry);
        next.slot.elCredits = round2((Number(next.slot.elCredits) || 0) + elCarry);
        next.slot.poolCarryForwardIn = {
          cl: round2((Number(next.slot.poolCarryForwardIn?.cl) || 0) + clCarry),
          ccl: round2((Number(next.slot.poolCarryForwardIn?.ccl) || 0) + cclCarry),
          el: round2((Number(next.slot.poolCarryForwardIn?.el) || 0) + elCarry),
        };
        next.slot.poolCarryForwardFromLabel =
          slot.label || `${slot.payrollCycleMonth}/${slot.payrollCycleYear || ''}`.trim();

        const nextCeilingRaw = computeScheduledPoolApplyCeiling(
          {
            clCredits: next.slot.clCredits,
            compensatoryOffs: next.slot.compensatoryOffs,
            elCredits: next.slot.elCredits,
          },
          policy
        );
        if (nextCeilingRaw != null && Number.isFinite(nextCeilingRaw)) {
          next.slot.monthlyApplyCeiling = Math.max(0, nextCeilingRaw);
        }
      }
      // Create actual ledger movement transactions for the carry:
      // - transfer-out from the edited month as DEBIT (but UI "Used" excludes these via autoGeneratedType)
      // - transfer-in to the next month as CREDIT
      const debitAt = creditAtForSlot(slot);
      const creditAt = creditAtForSlot(next.slot);
      if (!Array.isArray(next.slot.transactions)) next.slot.transactions = [];
      if (clCarry > 0) {
        slot.transactions.push({
          at: new Date(),
          leaveType: 'CL',
          transactionType: 'DEBIT',
          days: clCarry,
          openingBalance: 0,
          closingBalance: 0,
          startDate: debitAt,
          endDate: debitAt,
          reason: `Transfer unused CL to next month (${slot.payrollCycleMonth}/${slot.payrollCycleYear} → ${next.slot.payrollCycleMonth}/${next.slot.payrollCycleYear})`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_CL',
        });
        next.slot.transactions.push({
          at: new Date(),
          leaveType: 'CL',
          transactionType: 'CREDIT',
          days: clCarry,
          openingBalance: 0,
          closingBalance: 0,
          startDate: creditAt,
          endDate: creditAt,
          reason: `Transfer unused CL from previous month (${slot.payrollCycleMonth}/${slot.payrollCycleYear} → ${next.slot.payrollCycleMonth}/${next.slot.payrollCycleYear})`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_CL',
        });
      }
      if (cclCarry > 0) {
        slot.transactions.push({
          at: new Date(),
          leaveType: 'CCL',
          transactionType: 'DEBIT',
          days: cclCarry,
          openingBalance: 0,
          closingBalance: 0,
          startDate: debitAt,
          endDate: debitAt,
          reason: `Transfer unused CCL to next month (${slot.payrollCycleMonth}/${slot.payrollCycleYear} → ${next.slot.payrollCycleMonth}/${next.slot.payrollCycleYear})`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_CCL',
        });
        next.slot.transactions.push({
          at: new Date(),
          leaveType: 'CCL',
          transactionType: 'CREDIT',
          days: cclCarry,
          openingBalance: 0,
          closingBalance: 0,
          startDate: creditAt,
          endDate: creditAt,
          reason: `Transfer unused CCL from previous month (${slot.payrollCycleMonth}/${slot.payrollCycleYear} → ${next.slot.payrollCycleMonth}/${next.slot.payrollCycleYear})`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_CCL',
        });
      }
      if (elCarry > 0) {
        slot.transactions.push({
          at: new Date(),
          leaveType: 'EL',
          transactionType: 'DEBIT',
          days: elCarry,
          openingBalance: 0,
          closingBalance: 0,
          startDate: debitAt,
          endDate: debitAt,
          reason: `Transfer unused EL to next month (${slot.payrollCycleMonth}/${slot.payrollCycleYear} → ${next.slot.payrollCycleMonth}/${next.slot.payrollCycleYear})`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: 'MONTHLY_POOL_TRANSFER_OUT_EL',
        });
        next.slot.transactions.push({
          at: new Date(),
          leaveType: 'EL',
          transactionType: 'CREDIT',
          days: elCarry,
          openingBalance: 0,
          closingBalance: 0,
          startDate: creditAt,
          endDate: creditAt,
          reason: `Transfer unused EL from previous month (${slot.payrollCycleMonth}/${slot.payrollCycleYear} → ${next.slot.payrollCycleMonth}/${next.slot.payrollCycleYear})`,
          status: 'APPROVED',
          autoGenerated: true,
          autoGeneratedType: 'MONTHLY_POOL_TRANSFER_IN_EL',
        });
      }
    }
  }

  doc.yearlyPolicyClScheduledTotal = round2(
    (doc.months || []).reduce((s, m) => s + (Number(m?.clCredits) || 0), 0)
  );

  // Post ledger movements for manual schedule deltas so UI remains transaction-driven.
  if (!Array.isArray(slot.transactions)) slot.transactions = [];
  const anchorAtForDeltas = slot.payPeriodStart || slot.payPeriodEnd || new Date(py, pm - 1, 15);
  const pushManualDeltaTx = (leaveType, delta, fieldLabel) => {
    const d = round2(delta);
    if (!d) return;
    const isCredit = d > 0;
    slot.transactions.push({
      at: new Date(),
      leaveType,
      transactionType: isCredit ? 'CREDIT' : 'EXPIRY',
      days: Math.abs(d),
      openingBalance: 0,
      closingBalance: 0,
      startDate: anchorAtForDeltas,
      endDate: anchorAtForDeltas,
      reason: `Manual slot edit (${pm}/${py}) ${fieldLabel} ${isCredit ? 'increase' : 'decrease'}: ${Math.abs(d)}`,
      status: 'APPROVED',
      autoGenerated: true,
      autoGeneratedType: 'MANUAL_SLOT_EDIT',
    });
  };
  pushManualDeltaTx('CL', Number(slot.clCredits) - Number(before.clCredits || 0), 'Scheduled CL');
  pushManualDeltaTx(
    'CCL',
    Number(slot.compensatoryOffs) - Number(before.compensatoryOffs || 0),
    'Scheduled CCL'
  );
  pushManualDeltaTx('EL', Number(slot.elCredits) - Number(before.elCredits || 0), 'Scheduled EL');

  const after = {
    clCredits: slot.clCredits,
    compensatoryOffs: slot.compensatoryOffs,
    elCredits: slot.elCredits,
    lockedCredits: slot.lockedCredits,
    monthlyApplyCeiling: slot.monthlyApplyCeiling,
  };

  if (!Array.isArray(doc.yearlyTransactions)) doc.yearlyTransactions = [];
  doc.yearlyTransactions.push({
    at: new Date(),
    transactionKind: 'ADJUSTMENT',
    leaveType: 'CL',
    days: 0,
    reason: `Admin month slot (${pm}/${py}): ${reasonStr}`,
    payrollMonthIndex: slot.payrollMonthIndex,
    payPeriodStart: slot.payPeriodStart,
    payPeriodEnd: slot.payPeriodEnd,
    meta: {
      kind: 'SLOT_SCHEDULE_EDIT',
      actorUserId: actorUserId ? String(actorUserId) : null,
      flags: {
        validateWithRecords: !!validateWithRecords,
        carryUnusedToNextMonth: !!carryUnusedToNextMonth,
      },
      before,
      after,
    },
  });

  doc.source = doc.source || 'MANUAL';
  doc.markModified('months');
  doc.markModified('yearlyTransactions');
  await doc.save();

  const anchorDate =
    slot.payPeriodStart || slot.payPeriodEnd || new Date(py, pm - 1, 15);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CL', anchorDate);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CCL', anchorDate);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'EL', anchorDate);
  await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
    employeeId,
    anchorDate
  );

  const fresh = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy }).lean();
  const slotOut =
    fresh?.months?.find(
      (m) => Number(m.payrollCycleMonth) === pm && Number(m.payrollCycleYear) === py
    ) || null;

  return { ok: true, slot: slotOut, before, after };
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
    if (clIn || cclIn || elIn) {
      slot.clCredits = round2(Math.max(0, (Number(slot.clCredits) || 0) - clIn));
      slot.compensatoryOffs = round2(Math.max(0, (Number(slot.compensatoryOffs) || 0) - cclIn));
      slot.elCredits = round2(Math.max(0, (Number(slot.elCredits) || 0) - elIn));
    }
    slot.transactions = slot.transactions.filter(
      (t) =>
        !String(t?.autoGeneratedType || '').startsWith('MONTHLY_POOL_TRANSFER_OUT_') &&
        !String(t?.autoGeneratedType || '').startsWith('MONTHLY_POOL_TRANSFER_IN_')
    );
    delete slot.poolCarryForwardIn;
    delete slot.poolCarryForwardFromLabel;
    delete slot.poolCarryForwardOut;
    delete slot.poolCarryForwardOutAt;
  }
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
  return { clRoll, cclRoll, elRoll };
}

/**
 * Register list/detail: implied transfer-out for Xfer columns from current scheduled vs used vs policy lock.
 * Ignores persisted poolCarryForwardOut (avoids stale values after usage or schedule changes).
 * Only non-zero for payroll periods ended on/before asOf (IST). Uses global roll toggles (same basis as bulk carry rebuild).
 */
function computeRegisterMonthPoolTransferOutDisplay(
  { payPeriodEnd, scheduled, usedCl, usedCcl, usedEl },
  asOf,
  policy
) {
  const z = { cl: 0, ccl: 0, el: 0 };
  if (!scheduled || !payPeriodEnd) return z;
  if (!isPayrollPeriodEndedOnOrBeforeAsOf(payPeriodEnd, asOf)) return z;

  const { clRoll, cclRoll, elRoll } = resolveMonthlyPoolCarryRollFlags(policy);
  const clCredits = round2(Number(scheduled.clCredits) || 0);
  const cco = round2(Number(scheduled.compensatoryOffs) || 0);
  const elCr = round2(Number(scheduled.elCredits) || 0);
  const clLocked = round2(Number(scheduled.lockedCredits) || 0);

  const uCl = round2(Number(usedCl) || 0);
  const uCcl = round2(Number(usedCcl) || 0);
  const uEl = round2(Number(usedEl) || 0);

  let clCarry = Math.max(0, round2(clCredits - uCl - clLocked));
  if (!clRoll) clCarry = 0;
  let cclCarry = Math.max(0, round2(cco - uCcl));
  if (!cclRoll) cclCarry = 0;
  let elCarry = Math.max(0, round2(elCr - uEl));
  if (!elRoll) elCarry = 0;

  return { cl: clCarry, ccl: cclCarry, el: elCarry };
}

/**
 * How many chronological edges would run (unused > 0), without mutating.
 * @param {object} [options]
 * @param {boolean} [options.ignoreMonthSlotCarryGates] — bulk "carry forward unused": skip per-month leaveRegisterMonthSlotEdit carry/edit gates; use only closed period (IST) + global roll flags.
 */
function countQualifyingMonthlyPoolCarryEdges(months, asOf, policy, options = {}) {
  if (!Array.isArray(months) || months.length < 2) return 0;
  const ignoreMonthSlotCarryGates = options.ignoreMonthSlotCarryGates === true;
  const { clRoll, cclRoll, elRoll } = resolveMonthlyPoolCarryRollFlags(policy);
  const ordered = months
    .map((m, idx) => ({ idx, t: new Date(m?.payPeriodStart || m?.payPeriodEnd || 0).getTime() }))
    .sort((a, b) => a.t - b.t);
  let n = 0;
  for (let p = 0; p < ordered.length - 1; p++) {
    const cur = months[ordered[p].idx];
    const next = months[ordered[p + 1].idx];
    if (!cur?.payPeriodEnd || !next) continue;
    if (!isPayrollPeriodEndedOnOrBeforeAsOf(cur.payPeriodEnd, asOf)) continue;
    if (!ignoreMonthSlotCarryGates) {
      const pi = derivePolicyMonthIndexFromCycleMonth(cur, policy);
      const flags = resolveMonthSlotEditFlags(policy, pi);
      if (flags.allowCarryUnusedToNextMonth === false) continue;
    }
    const usedCl = sumUsedDaysForType(cur, 'CL');
    const clLocked = round2(Number(cur.lockedCredits) || 0);
    let clCarry = Math.max(0, round2(Number(cur.clCredits) - usedCl - clLocked));
    if (!clRoll) clCarry = 0;
    let cclCarry = Math.max(0, round2(Number(cur.compensatoryOffs) - sumUsedDaysForType(cur, 'CCL')));
    if (!cclRoll) cclCarry = 0;
    let elCarry = Math.max(0, round2(Number(cur.elCredits) - sumUsedDaysForType(cur, 'EL')));
    if (!elRoll) elCarry = 0;
    if (clCarry > 0 || cclCarry > 0 || elCarry > 0) n++;
  }
  return n;
}

/**
 * Chronological unused pool carry, one step per edge. Only from periods ended on/before asOf (IST)
 * (does not carry out of the current open payroll period).
 * By default, source month must have allowCarryUnusedToNextMonth (slot-edit policy).
 * @param {object} [options]
 * @param {boolean} [options.ignoreMonthSlotCarryGates] — bulk rebuild: ignore per-month carry gate; still uses carryForward.* roll flags.
 */
function applySequentialMonthlyPoolCarry(months, asOf, policy, options = {}) {
  if (!Array.isArray(months) || months.length < 2) return 0;
  const ignoreMonthSlotCarryGates = options.ignoreMonthSlotCarryGates === true;
  const { clRoll, cclRoll, elRoll } = resolveMonthlyPoolCarryRollFlags(policy);
  const ordered = months
    .map((m, idx) => ({ idx, t: new Date(m?.payPeriodStart || m?.payPeriodEnd || 0).getTime() }))
    .sort((a, b) => a.t - b.t);
  let edges = 0;
  for (let p = 0; p < ordered.length - 1; p++) {
    const cur = months[ordered[p].idx];
    const next = months[ordered[p + 1].idx];
    if (!cur?.payPeriodEnd || !next) continue;
    if (!isPayrollPeriodEndedOnOrBeforeAsOf(cur.payPeriodEnd, asOf)) continue;
    if (!ignoreMonthSlotCarryGates) {
      const pi = derivePolicyMonthIndexFromCycleMonth(cur, policy);
      const flags = resolveMonthSlotEditFlags(policy, pi);
      if (flags.allowCarryUnusedToNextMonth === false) continue;
    }
    if (!Array.isArray(cur.transactions)) cur.transactions = [];
    if (!Array.isArray(next.transactions)) next.transactions = [];
    const usedCl = sumUsedDaysForType(cur, 'CL');
    const clLocked = round2(Number(cur.lockedCredits) || 0);
    let clCarry = Math.max(0, round2(Number(cur.clCredits) - usedCl - clLocked));
    if (!clRoll) clCarry = 0;
    let cclCarry = Math.max(0, round2(Number(cur.compensatoryOffs) - sumUsedDaysForType(cur, 'CCL')));
    if (!cclRoll) cclCarry = 0;
    let elCarry = Math.max(0, round2(Number(cur.elCredits) - sumUsedDaysForType(cur, 'EL')));
    if (!elRoll) elCarry = 0;
    if (clCarry <= 0 && cclCarry <= 0 && elCarry <= 0) continue;

    cur.poolCarryForwardOut = { cl: clCarry, ccl: cclCarry, el: elCarry };
    cur.poolCarryForwardOutAt = new Date();
    next.clCredits = round2((Number(next.clCredits) || 0) + clCarry);
    next.compensatoryOffs = round2((Number(next.compensatoryOffs) || 0) + cclCarry);
    next.elCredits = round2((Number(next.elCredits) || 0) + elCarry);
    next.poolCarryForwardIn = {
      cl: round2((Number(next.poolCarryForwardIn?.cl) || 0) + clCarry),
      ccl: round2((Number(next.poolCarryForwardIn?.ccl) || 0) + cclCarry),
      el: round2((Number(next.poolCarryForwardIn?.el) || 0) + elCarry),
    };
    next.poolCarryForwardFromLabel =
      cur.label || `${cur.payrollCycleMonth}/${cur.payrollCycleYear || ''}`.trim();

    const nextCeilingRaw = computeScheduledPoolApplyCeiling(
      {
        clCredits: next.clCredits,
        compensatoryOffs: next.compensatoryOffs,
        elCredits: next.elCredits,
      },
      policy
    );
    if (nextCeilingRaw != null && Number.isFinite(nextCeilingRaw)) {
      next.monthlyApplyCeiling = Math.max(0, nextCeilingRaw);
    }

    const debitAt = creditAtForSlot(cur);
    const creditAt = creditAtForSlot(next);
    const pushCarry = (leaveType, days, outType, inType) => {
      const d = round2(days);
      if (d <= 0) return;
      cur.transactions.push({
        at: new Date(),
        leaveType,
        transactionType: 'DEBIT',
        days: d,
        openingBalance: 0,
        closingBalance: 0,
        startDate: debitAt,
        endDate: debitAt,
        reason: `Transfer unused ${leaveType} to next month (${cur.payrollCycleMonth}/${cur.payrollCycleYear} → ${next.payrollCycleMonth}/${next.payrollCycleYear})`,
        status: 'APPROVED',
        autoGenerated: true,
        autoGeneratedType: outType,
      });
      next.transactions.push({
        at: new Date(),
        leaveType,
        transactionType: 'CREDIT',
        days: d,
        openingBalance: 0,
        closingBalance: 0,
        startDate: creditAt,
        endDate: creditAt,
        reason: `Transfer unused ${leaveType} from previous month (${cur.payrollCycleMonth}/${cur.payrollCycleYear} → ${next.payrollCycleMonth}/${next.payrollCycleYear})`,
        status: 'APPROVED',
        autoGenerated: true,
        autoGeneratedType: inType,
      });
    };
    pushCarry('CL', clCarry, 'MONTHLY_POOL_TRANSFER_OUT_CL', 'MONTHLY_POOL_TRANSFER_IN_CL');
    pushCarry('CCL', cclCarry, 'MONTHLY_POOL_TRANSFER_OUT_CCL', 'MONTHLY_POOL_TRANSFER_IN_CCL');
    pushCarry('EL', elCarry, 'MONTHLY_POOL_TRANSFER_OUT_EL', 'MONTHLY_POOL_TRANSFER_IN_EL');
    edges++;
  }
  return edges;
}

function recomputeAllSlotApplyCeilings(months, policy) {
  if (!Array.isArray(months)) return;
  for (const slot of months) {
    if (!slot) continue;
    const ceilingRaw = computeScheduledPoolApplyCeiling(
      {
        clCredits: slot.clCredits,
        compensatoryOffs: slot.compensatoryOffs,
        elCredits: slot.elCredits,
      },
      policy
    );
    if (ceilingRaw != null && Number.isFinite(ceilingRaw)) {
      slot.monthlyApplyCeiling = Math.max(0, ceilingRaw);
    }
  }
}

/**
 * HR: adjust many FY payroll slots in one save; optional full FY unused-pool carry (closed periods only, IST as-of today).
 */
async function patchBulkMonthSlotsScheduledCredits({
  employeeId,
  financialYear,
  slots: slotItems,
  reason,
  actorUserId,
  validateWithRecords = false,
  carryForwardUnused = false,
}) {
  const fy = String(financialYear || '').trim();
  if (!fy) throw new Error('financialYear is required');
  const reasonStr = String(reason || '').trim();
  if (!reasonStr) throw new Error('reason is required');
  if (!Array.isArray(slotItems)) throw new Error('slots must be an array');

  const doc = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy });
  if (!doc || !Array.isArray(doc.months)) {
    throw new Error('Leave register year not found');
  }

  const seen = new Set();
  for (const it of slotItems) {
    const pm = Number(it?.payrollCycleMonth);
    const py = Number(it?.payrollCycleYear);
    if (!Number.isFinite(pm) || !Number.isFinite(py)) {
      throw new Error('Each slot must include payrollCycleMonth and payrollCycleYear');
    }
    const k = `${pm}-${py}`;
    if (seen.has(k)) throw new Error(`Duplicate slot in bulk payload: ${pm}/${py}`);
    seen.add(k);
  }

  const policy = await getLeavePolicyResolved().catch(() => toResolvedPolicyPlain({}));
  const asOfDate = createISTDate(getTodayISTDateString());

  const hasSlotPayloadField = (it) =>
    it &&
    (it.clCredits !== undefined ||
      it.compensatoryOffs !== undefined ||
      it.elCredits !== undefined ||
      it.lockedCredits !== undefined ||
      it.usedCl !== undefined ||
      it.usedCcl !== undefined ||
      it.usedEl !== undefined);

  const itemsToApply = slotItems.filter(hasSlotPayloadField);
  let carryEdgesApplied = 0;
  let carrySkippedAfterEdits = false;
  const bulkCarryOpts = { ignoreMonthSlotCarryGates: true };

  if (itemsToApply.length === 0 && !carryForwardUnused) {
    throw new Error('At least one slot field to update, or carry forward unused, is required');
  }

  const sortItemsChrono = (items) => {
    const decorated = items.map((it) => {
      const pm = Number(it.payrollCycleMonth);
      const py = Number(it.payrollCycleYear);
      const idx = doc.months.findIndex((m) => Number(m.payrollCycleMonth) === pm && Number(m.payrollCycleYear) === py);
      const t =
        idx >= 0
          ? new Date(doc.months[idx].payPeriodStart || doc.months[idx].payPeriodEnd || 0).getTime()
          : 0;
      return { it, t };
    });
    decorated.sort((a, b) => a.t - b.t);
    return decorated.map((x) => x.it);
  };

  const slotsAudit = [];

  for (const rawIt of sortItemsChrono(itemsToApply)) {
    const pm = Number(rawIt.payrollCycleMonth);
    const py = Number(rawIt.payrollCycleYear);
    const idx = doc.months.findIndex((m) => Number(m.payrollCycleMonth) === pm && Number(m.payrollCycleYear) === py);
    if (idx < 0) throw new Error(`Payroll month slot not found: ${pm}/${py}`);
    const slot = doc.months[idx];
    if (!Array.isArray(slot.transactions)) slot.transactions = [];
    const anchorAt = slot.payPeriodStart || slot.payPeriodEnd || new Date(py, pm - 1, 15);
    const policyMonthIndex = derivePolicyMonthIndexFromCycleMonth(slot, policy);
    const editFlags = resolveMonthSlotEditFlags(policy, policyMonthIndex);
    if (editFlags.allowEditMonth === false) {
      throw new Error(
        `Leave register month slot editing is disabled for policy payroll month ${policyMonthIndex} (${pm}/${py}).`
      );
    }
    const patch = {
      clCredits: numOrUndef(rawIt.clCredits),
      compensatoryOffs: numOrUndef(rawIt.compensatoryOffs),
      elCredits: numOrUndef(rawIt.elCredits),
      lockedCredits: numOrUndef(rawIt.lockedCredits),
    };
    const disallowed = [];
    if (patch.clCredits !== undefined && !editFlags.allowEditClCredits) disallowed.push('clCredits');
    if (patch.compensatoryOffs !== undefined && !editFlags.allowEditCclCredits) disallowed.push('compensatoryOffs');
    if (patch.elCredits !== undefined && !editFlags.allowEditElCredits) disallowed.push('elCredits');
    if (patch.lockedCredits !== undefined && !editFlags.allowEditPolicyLock) disallowed.push('lockedCredits');
    const uCl = numOrUndef(rawIt.usedCl);
    const uCcl = numOrUndef(rawIt.usedCcl);
    const uEl = numOrUndef(rawIt.usedEl);
    if (uCl !== undefined && !editFlags.allowEditUsedCl) disallowed.push('usedCl');
    if (uCcl !== undefined && !editFlags.allowEditUsedCcl) disallowed.push('usedCcl');
    if (uEl !== undefined && !editFlags.allowEditUsedEl) disallowed.push('usedEl');
    if (disallowed.length > 0) {
      throw new Error(`Not allowed by month-slot edit policy for payroll month ${policyMonthIndex}: ${disallowed.join(', ')}`);
    }

    setManualUsedForType({
      slot,
      leaveType: 'CL',
      desiredUsed: uCl,
      manualAutoGeneratedType: 'MANUAL_SLOT_USED_CL',
      anchorAt,
      reasonStr,
    });
    setManualUsedForType({
      slot,
      leaveType: 'CCL',
      desiredUsed: uCcl,
      manualAutoGeneratedType: 'MANUAL_SLOT_USED_CCL',
      anchorAt,
      reasonStr,
    });
    setManualUsedForType({
      slot,
      leaveType: 'EL',
      desiredUsed: uEl,
      manualAutoGeneratedType: 'MANUAL_SLOT_USED_EL',
      anchorAt,
      reasonStr,
    });

    const before = {
      clCredits: slot.clCredits,
      compensatoryOffs: slot.compensatoryOffs,
      elCredits: slot.elCredits,
      lockedCredits: slot.lockedCredits,
      monthlyApplyCeiling: slot.monthlyApplyCeiling,
    };

    const nextCl = patch.clCredits;
    const nextCco = patch.compensatoryOffs;
    const nextEl = patch.elCredits;
    const nextLk = patch.lockedCredits;
    if (
      nextCl === undefined &&
      nextCco === undefined &&
      nextEl === undefined &&
      nextLk === undefined &&
      uCl === undefined &&
      uCcl === undefined &&
      uEl === undefined
    ) {
      continue;
    }

    if (nextCl !== undefined) slot.clCredits = Math.max(0, nextCl);
    if (nextCco !== undefined) slot.compensatoryOffs = Math.max(0, nextCco);
    if (nextEl !== undefined) slot.elCredits = Math.max(0, nextEl);
    if (nextLk !== undefined) slot.lockedCredits = Math.max(0, nextLk);

    if (validateWithRecords) {
      const usedClN = sumUsedDaysForType(slot, 'CL');
      const usedCclN = sumUsedDaysForType(slot, 'CCL');
      const usedElN = sumUsedDaysForType(slot, 'EL');
      if (Number(slot.clCredits) < usedClN) {
        throw new Error(`Validation failed (${pm}/${py}): Scheduled CL (${slot.clCredits}) is below used CL (${usedClN})`);
      }
      if (Number(slot.compensatoryOffs) < usedCclN) {
        throw new Error(
          `Validation failed (${pm}/${py}): Scheduled CCL (${slot.compensatoryOffs}) is below used CCL (${usedCclN})`
        );
      }
      if (Number(slot.elCredits) < usedElN) {
        throw new Error(`Validation failed (${pm}/${py}): Scheduled EL (${slot.elCredits}) is below used EL (${usedElN})`);
      }
    }

    const ceilingRaw = computeScheduledPoolApplyCeiling(
      {
        clCredits: slot.clCredits,
        compensatoryOffs: slot.compensatoryOffs,
        elCredits: slot.elCredits,
      },
      policy
    );
    if (ceilingRaw != null && Number.isFinite(ceilingRaw)) {
      slot.monthlyApplyCeiling = Math.max(0, ceilingRaw);
    }

    const after = {
      clCredits: slot.clCredits,
      compensatoryOffs: slot.compensatoryOffs,
      elCredits: slot.elCredits,
      lockedCredits: slot.lockedCredits,
      monthlyApplyCeiling: slot.monthlyApplyCeiling,
    };
    slotsAudit.push({
      payrollCycleMonth: pm,
      payrollCycleYear: py,
      before,
      after,
    });

    const pushManualDeltaTx = (leaveType, delta, fieldLabel) => {
      const d = round2(delta);
      if (!d) return;
      const isCredit = d > 0;
      slot.transactions.push({
        at: new Date(),
        leaveType,
        transactionType: isCredit ? 'CREDIT' : 'EXPIRY',
        days: Math.abs(d),
        openingBalance: 0,
        closingBalance: 0,
        startDate: anchorAt,
        endDate: anchorAt,
        reason: `Bulk slot edit (${pm}/${py}) ${fieldLabel} ${isCredit ? 'increase' : 'decrease'}: ${Math.abs(d)}`,
        status: 'APPROVED',
        autoGenerated: true,
        autoGeneratedType: 'MANUAL_SLOT_EDIT',
      });
    };
    pushManualDeltaTx('CL', Number(slot.clCredits) - Number(before.clCredits || 0), 'Scheduled CL');
    pushManualDeltaTx(
      'CCL',
      Number(slot.compensatoryOffs) - Number(before.compensatoryOffs || 0),
      'Scheduled CCL'
    );
    pushManualDeltaTx('EL', Number(slot.elCredits) - Number(before.elCredits || 0), 'Scheduled EL');
  }

  if (itemsToApply.length > 0 && slotsAudit.length === 0) {
    throw new Error('No effective slot updates after filtering empty rows');
  }

  doc.yearlyPolicyClScheduledTotal = round2(
    (doc.months || []).reduce((s, m) => s + (Number(m?.clCredits) || 0), 0)
  );

  if (carryForwardUnused) {
    stripMonthlyPoolTransferArtifactsFromMonths(doc.months);
    recomputeAllSlotApplyCeilings(doc.months, policy);
    carryEdgesApplied = applySequentialMonthlyPoolCarry(doc.months, asOfDate, policy, bulkCarryOpts);
    recomputeAllSlotApplyCeilings(doc.months, policy);
    carrySkippedAfterEdits = carryEdgesApplied === 0;
  }

  if (!Array.isArray(doc.yearlyTransactions)) doc.yearlyTransactions = [];
  doc.yearlyTransactions.push({
    at: new Date(),
    transactionKind: 'ADJUSTMENT',
    leaveType: 'CL',
    days: 0,
    reason: `Admin bulk month slots (${itemsToApply.length} slot(s))${
      carryForwardUnused
        ? carryEdgesApplied > 0
          ? '; carry forward unused (closed periods)'
          : '; carry forward unused (reconcile; no qualifying edges)'
        : ''
    }: ${reasonStr}`,
    meta: {
      kind: 'BULK_SLOT_SCHEDULE_EDIT',
      actorUserId: actorUserId ? String(actorUserId) : null,
      flags: {
        validateWithRecords: !!validateWithRecords,
        carryForwardUnused: !!carryForwardUnused,
        carryEdgesApplied,
        carrySkippedAfterEdits: !!carrySkippedAfterEdits,
      },
      slots: slotsAudit,
    },
  });

  doc.source = doc.source || 'MANUAL';
  doc.markModified('months');
  doc.markModified('yearlyTransactions');
  await doc.save();

  const anchorStart = doc.financialYearStart || doc.months[0]?.payPeriodStart || new Date();
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CL', anchorStart);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CCL', anchorStart);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'EL', anchorStart);

  const orderedMonths = [...doc.months].sort(
    (a, b) =>
      new Date(a?.payPeriodStart || a?.payPeriodEnd || 0).getTime() -
      new Date(b?.payPeriodStart || b?.payPeriodEnd || 0).getTime()
  );
  for (const m of orderedMonths) {
    const d = m.payPeriodStart || m.payPeriodEnd;
    if (d) {
      await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(employeeId, d);
    }
  }

  const fresh = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy }).lean();
  return {
    ok: true,
    months: fresh?.months || [],
    carryEdgesApplied,
    slotsUpdated: slotsAudit.length,
  };
}

/** Recompute denormalized monthly apply fields from Leave rows only (no slot number changes). */
async function syncMonthApplyOnly({ employeeId, financialYear, payrollCycleMonth, payrollCycleYear }) {
  const fy = String(financialYear || '').trim();
  const pm = Number(payrollCycleMonth);
  const py = Number(payrollCycleYear);
  const doc = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy }).lean();
  if (!doc?.months?.length) throw new Error('Leave register year not found');
  const slot = doc.months.find(
    (m) => Number(m.payrollCycleMonth) === pm && Number(m.payrollCycleYear) === py
  );
  if (!slot) throw new Error('Payroll month slot not found');
  const policy = await getLeavePolicyResolved().catch(() => toResolvedPolicyPlain({}));
  const policyMonthIndex = derivePolicyMonthIndexFromCycleMonth(slot, policy);
  const editFlags = resolveMonthSlotEditFlags(policy, policyMonthIndex);
  if (editFlags.allowEditMonth === false) {
    throw new Error(
      `Leave register month maintenance is disabled for policy payroll month ${policyMonthIndex} (${pm}/${py}).`
    );
  }
  const anchorDate = slot.payPeriodStart || slot.payPeriodEnd || new Date(py, pm - 1, 15);
  const sync = await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
    employeeId,
    anchorDate
  );
  return { ok: sync.ok, sync, anchorDate };
}

/** True if this FY row was already created by new-hire CL onboarding (idempotent init). */
async function hasEmployeeOnboardingYear(employeeId, financialYearName) {
  if (!employeeId || !financialYearName) return false;
  const doc = await LeaveRegisterYear.findOne({
    employeeId,
    financialYear: String(financialYearName).trim(),
    source: 'EMPLOYEE_ONBOARDING',
  })
    .select('_id')
    .lean();
  return !!doc;
}

module.exports = {
  normalizeTierMonthlyCredits,
  proRataClForCycle,
  resolveJoinCycleMode,
  buildYearMonthSlots,
  sumScheduledCl,
  isPayrollPeriodClosedBeforeAsOf,
  isPayrollPeriodEndedOnOrBeforeAsOf,
  sumScheduledClThroughDate,
  appendMonthlyClScheduledCreditTransactions,
  appendMonthlyScheduledCreditByGetter,
  applyProRataGridToExistingMonthSlots,
  upsertLeaveRegisterYear,
  findByEmployeeAndFY,
  hasEmployeeOnboardingYear,
  getTwelvePayrollCyclesForFY,
  patchMonthSlotScheduledCredits,
  patchBulkMonthSlotsScheduledCredits,
  syncMonthApplyOnly,
  computeRegisterMonthPoolTransferOutDisplay,
};
