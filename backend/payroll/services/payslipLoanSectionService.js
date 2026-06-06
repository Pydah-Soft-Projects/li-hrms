/**
 * Payslip loan section — balance before / EMI deducted / balance after per loan.
 * EMI total comes from paysheet "Loan EMI" column (snapshot row), then record.loanAdvance.totalEMI.
 */
const Loan = require('../../loans/model/Loan');
const PayrollPayslipSnapshot = require('../model/PayrollPayslipSnapshot');
const loanAdvanceService = require('./loanAdvanceService');
const { getDueInstallmentAmount } = require('../../loans/services/loanInstallmentScheduleService');

const LOAN_EMI_FIELD = 'loanAdvance.totalEMI';
const LOAN_REMAINING_FIELD = 'loanAdvance.remainingBalance';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function findOutputColumnByField(outputColumns, fieldPath) {
  const path = String(fieldPath || '').trim();
  if (!path || !Array.isArray(outputColumns)) return null;
  return (
    outputColumns.find((col) => String(col?.field || '').trim() === path) ||
    outputColumns.find((col) => String(col?.paysheetEditableFieldPath || '').trim() === path) ||
    null
  );
}

function resolvePaysheetColumnValue(outputColumns, snapshotRow, record, fieldPath) {
  const col = findOutputColumnByField(outputColumns, fieldPath);
  const header = col?.header?.trim();

  if (header && snapshotRow && typeof snapshotRow === 'object') {
    const snapVal = snapshotRow[header];
    if (snapVal !== undefined && snapVal !== null && snapVal !== '') {
      const n = Number(snapVal);
      if (Number.isFinite(n)) return round2(n);
    }
  }

  const plain =
    record && typeof record.toObject === 'function' ? record.toObject() : record || {};
  const parts = String(fieldPath).split('.').filter(Boolean);
  let val = plain;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') {
      val = undefined;
      break;
    }
    val = val[p];
  }
  const n = Number(val);
  return Number.isFinite(n) ? round2(n) : 0;
}

function isEmiSettledForPayrollMonth(loan, month, loanId, payrollId) {
  const txs = Array.isArray(loan?.transactions) ? loan.transactions : [];
  const monthStr = month != null ? String(month).trim() : '';
  const canon =
    monthStr && loanId ? `payroll_month:${monthStr}:emi:${String(loanId)}` : null;
  const legacy =
    payrollId != null && payrollId !== '' ? `payroll_settle:${String(payrollId)}:emi` : null;

  for (const t of txs) {
    if (t.transactionType !== 'emi_payment') continue;
    if (canon && t.payrollSettlementKey === canon) return true;
    if (legacy && t.payrollSettlementKey === legacy) return true;
    if (monthStr && String(t.payrollCycle || '').trim() === monthStr && t.payrollSettlementKey) {
      return true;
    }
  }
  return false;
}

function loanDisplayLabel(loan) {
  if (!loan) return 'Loan';
  const reason = String(loan.reason || '').trim();
  if (reason) {
    return reason.length > 48 ? `${reason.slice(0, 45)}…` : reason;
  }
  const amount = round2(loan.amount);
  return amount > 0 ? `Loan · Rs. ${amount.toLocaleString('en-IN')}` : 'Loan';
}

function computeLoanBalances(loan, emiAmount, month, payrollId) {
  const emiDeducted = round2(emiAmount);
  const remainingNow = round2(loan?.repayment?.remainingBalance);
  const settled = loan ? isEmiSettledForPayrollMonth(loan, month, loan._id, payrollId) : false;

  let balanceBefore;
  let balanceAfter;

  if (settled) {
    balanceAfter = remainingNow;
    balanceBefore = round2(balanceAfter + emiDeducted);
  } else {
    balanceBefore = remainingNow;
    balanceAfter = round2(Math.max(0, balanceBefore - emiDeducted));
  }

  return { balanceBefore, emiDeducted, balanceAfter };
}

function reconcileEmiTotalToPaysheet(items, paysheetEmiTotal) {
  const target = round2(paysheetEmiTotal);
  if (!items.length || target <= 0) return items;

  const current = round2(items.reduce((s, i) => s + i.emiDeducted, 0));
  if (current === target) return items;

  if (items.length === 1) {
    const loan = items[0];
    const balanceBefore = round2(loan.balanceAfter + target);
    return [{ ...loan, emiDeducted: target, balanceBefore }];
  }

  const ratio = current > 0 ? target / current : 0;
  const adjusted = items.map((item) => {
    const emiDeducted = round2(item.emiDeducted * ratio);
    const balanceAfter = round2(Math.max(0, item.balanceBefore - emiDeducted));
    return { ...item, emiDeducted, balanceAfter };
  });

  const drift = round2(target - adjusted.reduce((s, i) => s + i.emiDeducted, 0));
  if (drift !== 0 && adjusted.length > 0) {
    const last = adjusted[adjusted.length - 1];
    last.emiDeducted = round2(last.emiDeducted + drift);
    last.balanceAfter = round2(Math.max(0, last.balanceBefore - last.emiDeducted));
  }
  return adjusted;
}

function buildItemsFromEmiBreakdown(emiBreakdown, loanMap, month, payrollId) {
  return emiBreakdown
    .filter((emi) => emi && emi.loanId)
    .map((emi) => {
      const loanId = String(emi.loanId);
      const loan = loanMap.get(loanId) || null;
      const balances = computeLoanBalances(loan, emi.emiAmount, month, payrollId);
      return {
        loanId,
        label: loanDisplayLabel(loan),
        balanceBefore: balances.balanceBefore,
        emiDeducted: balances.emiDeducted,
        balanceAfter: balances.balanceAfter,
      };
    });
}

function buildItemsFromActiveLoans(loans, paysheetEmiTotal, month, payrollId) {
  if (!loans.length) return [];

  const withScheduled = loans.map((loan) => ({
    loan,
    scheduledEmi: getDueInstallmentAmount(loan),
  }));
  const scheduledSum = withScheduled.reduce((s, x) => s + x.scheduledEmi, 0);
  const target = round2(paysheetEmiTotal);

  const items = withScheduled.map(({ loan, scheduledEmi }) => {
    let emiDeducted = 0;
    if (loans.length === 1) {
      emiDeducted = target;
    } else if (scheduledSum > 0) {
      emiDeducted = round2(target * (scheduledEmi / scheduledSum));
    } else {
      emiDeducted = round2(target / loans.length);
    }
    const balances = computeLoanBalances(loan, emiDeducted, month, payrollId);
    return {
      loanId: String(loan._id),
      label: loanDisplayLabel(loan),
      balanceBefore: balances.balanceBefore,
      emiDeducted: balances.emiDeducted,
      balanceAfter: balances.balanceAfter,
    };
  });

  return reconcileEmiTotalToPaysheet(items, target);
}

function buildSummaryLoanRow(paysheetEmiTotal, paysheetRemainingTotal) {
  const emiDeducted = round2(paysheetEmiTotal);
  const balanceAfter = round2(paysheetRemainingTotal);
  const balanceBefore = round2(balanceAfter + emiDeducted);
  return {
    loanId: '',
    label: 'Loan',
    balanceBefore,
    emiDeducted,
    balanceAfter,
  };
}

/**
 * @param {Object} record
 * @param {Map<string, Object>|null} loanMap
 * @param {{ outputColumns?: Object[], snapshotRow?: Object|null }} opts
 */
function buildPayslipLoans(record, loanMap = null, opts = {}) {
  const plain =
    record && typeof record.toObject === 'function' ? record.toObject() : record || {};
  const outputColumns = Array.isArray(opts.outputColumns) ? opts.outputColumns : [];
  const snapshotRow = opts.snapshotRow && typeof opts.snapshotRow === 'object' ? opts.snapshotRow : null;

  const paysheetEmiTotal = resolvePaysheetColumnValue(
    outputColumns,
    snapshotRow,
    plain,
    LOAN_EMI_FIELD
  );
  const paysheetRemainingTotal = resolvePaysheetColumnValue(
    outputColumns,
    snapshotRow,
    plain,
    LOAN_REMAINING_FIELD
  );

  const emiBreakdown = Array.isArray(plain.loanAdvance?.emiBreakdown)
    ? plain.loanAdvance.emiBreakdown
    : [];
  const month = plain.month;
  const payrollId = plain._id;

  let items = [];

  if (emiBreakdown.length > 0) {
    items = buildItemsFromEmiBreakdown(emiBreakdown, loanMap || new Map(), month, payrollId);
    items = reconcileEmiTotalToPaysheet(items, paysheetEmiTotal);
  }

  const hasActiveLoanBalances =
    loanMap &&
    [...loanMap.values()].some((loan) => round2(loan?.repayment?.remainingBalance) > 0);

  const hasLoans =
    paysheetEmiTotal > 0 ||
    paysheetRemainingTotal > 0 ||
    items.length > 0 ||
    hasActiveLoanBalances;

  if (!hasLoans) {
    return { items: [], totalEmiDeducted: 0, totalBalanceAfter: 0, hasLoans: false };
  }

  if (items.length === 0 && loanMap && loanMap.size > 0) {
    if (paysheetEmiTotal > 0) {
      items = buildItemsFromActiveLoans([...loanMap.values()], paysheetEmiTotal, month, payrollId);
    } else {
      items = [...loanMap.values()]
        .map((loan) => {
          const remaining = round2(loan?.repayment?.remainingBalance);
          if (remaining <= 0) return null;
          return {
            loanId: String(loan._id),
            label: loanDisplayLabel(loan),
            balanceBefore: remaining,
            emiDeducted: 0,
            balanceAfter: remaining,
          };
        })
        .filter(Boolean);
    }
  }

  if (items.length === 0 && (paysheetEmiTotal > 0 || paysheetRemainingTotal > 0)) {
    items = [buildSummaryLoanRow(paysheetEmiTotal, paysheetRemainingTotal)];
  }

  const totalEmiDeducted =
    paysheetEmiTotal > 0
      ? paysheetEmiTotal
      : round2(items.reduce((s, i) => s + i.emiDeducted, 0));

  const totalBalanceAfter =
    paysheetRemainingTotal > 0
      ? paysheetRemainingTotal
      : round2(items.reduce((s, i) => s + i.balanceAfter, 0));

  return {
    items,
    totalEmiDeducted,
    totalBalanceAfter,
    hasLoans: items.length > 0 || totalEmiDeducted > 0 || totalBalanceAfter > 0,
  };
}

async function preloadLoansForRecords(records) {
  const ids = new Set();
  const employeeIds = new Set();

  for (const record of records || []) {
    const plain =
      record && typeof record.toObject === 'function' ? record.toObject() : record || {};
    for (const emi of plain.loanAdvance?.emiBreakdown || []) {
      if (emi?.loanId) ids.add(String(emi.loanId));
    }
    const empId = plain.employeeId?._id || plain.employeeId;
    if (empId) employeeIds.add(String(empId));
  }

  const loanMap = new Map();

  if (ids.size > 0) {
    const loans = await Loan.find({ _id: { $in: [...ids] } })
      .select('amount reason repayment.remainingBalance transactions')
      .lean();
    for (const l of loans) loanMap.set(String(l._id), l);
  }

  const seenEmpMonth = new Set();
  for (const record of records || []) {
    const plain =
      record && typeof record.toObject === 'function' ? record.toObject() : record || {};
    const empId = plain.employeeId?._id || plain.employeeId;
    const month = plain.month;
    if (!empId || !month) continue;

    const key = `${String(empId)}:${month}`;
    if (seenEmpMonth.has(key)) continue;
    seenEmpMonth.add(key);

    const activeLoans = await loanAdvanceService.getActiveLoans(empId, month);
    for (const loan of activeLoans) {
      const id = String(loan._id);
      if (!loanMap.has(id)) {
        loanMap.set(id, loan.toObject ? loan.toObject() : loan);
      }
    }
  }

  return loanMap;
}

async function loadSnapshotRowsForRecords(records) {
  const pairs = [];
  for (const record of records || []) {
    const plain =
      record && typeof record.toObject === 'function' ? record.toObject() : record || {};
    const empId = plain.employeeId?._id || plain.employeeId;
    if (empId && plain.month) {
      pairs.push({ employeeId: empId, month: plain.month });
    }
  }
  if (!pairs.length) return new Map();

  const snaps = await PayrollPayslipSnapshot.find({
    kind: 'regular',
    $or: pairs.map((p) => ({ employeeId: p.employeeId, month: p.month })),
  })
    .select('employeeId month row')
    .lean();

  const map = new Map();
  for (const s of snaps) {
    map.set(`${String(s.employeeId)}:${s.month}`, s.row || null);
  }
  return map;
}

async function buildPayslipLoansForRecord(record, opts = {}) {
  const loanMap = await preloadLoansForRecords([record]);
  return buildPayslipLoans(record, loanMap, opts);
}

async function attachPayslipLoansToRecords(records, outputColumns = []) {
  if (!Array.isArray(records) || records.length === 0) return records;

  const [loanMap, snapshotMap] = await Promise.all([
    preloadLoansForRecords(records),
    loadSnapshotRowsForRecords(records),
  ]);

  return records.map((record) => {
    const plain =
      record && typeof record.toObject === 'function' ? record.toObject() : { ...record };
    const empId = plain.employeeId?._id || plain.employeeId;
    const snapshotRow =
      empId && plain.month ? snapshotMap.get(`${String(empId)}:${plain.month}`) || null : null;

    plain.payslipLoans = buildPayslipLoans(record, loanMap, {
      outputColumns,
      snapshotRow,
    });
    return plain;
  });
}

module.exports = {
  LOAN_EMI_FIELD,
  LOAN_REMAINING_FIELD,
  resolvePaysheetColumnValue,
  buildPayslipLoans,
  buildPayslipLoansForRecord,
  attachPayslipLoansToRecords,
  preloadLoansForRecords,
};
