/**
 * One-off maintenance:
 * Align every open loan / salary-advance so that the *next* repayment is due in a target payroll month,
 * which makes it eligible for that payroll run.
 *
 * What it updates:
 * - approvals.final.firstDeductionPayrollMonth is shifted so that (first + installmentsPaid) === TARGET_MONTH
 * - repayment.nextPaymentDate is set to the target payroll period end date (via shared schedule helper)
 *
 * Safe defaults:
 * - DRY_RUN=1 by default (no writes unless DRY_RUN=0)
 * - Only affects open records with remainingBalance > 0 and status in [active, disbursed]
 *
 * Run:
 *   set TARGET_PAYROLL_MONTH=2026-05
 *   set DRY_RUN=1
 *   node backend/scripts/set_all_open_loans_next_due_to_payroll_month.js
 *
 * Then (to apply):
 *   set DRY_RUN=0
 *   node backend/scripts/set_all_open_loans_next_due_to_payroll_month.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Loan = require('../loans/model/Loan');
const {
  addCalendarMonthsToYm,
} = require('../shared/utils/dateUtils');
const {
  normalizePayrollMonthKey,
  setNextPaymentDateFromInstallmentsPaid,
} = require('../loans/services/loanHistoryRepairService');

function mustGetMongoUri() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Set MONGO_URI or MONGODB_URI in backend/.env');
  }
  return uri;
}

function mustGetTargetMonth() {
  const raw = process.env.TARGET_PAYROLL_MONTH || process.env.PAYROLL_MONTH || process.env.MONTH;
  const ym = normalizePayrollMonthKey(raw);
  if (!ym) {
    throw new Error('Set TARGET_PAYROLL_MONTH as YYYY-MM (example: 2026-05)');
  }
  return ym;
}

function toTime(d) {
  if (!d) return null;
  try {
    return new Date(d).getTime();
  } catch {
    return null;
  }
}

async function main() {
  const targetYm = mustGetTargetMonth();
  const dryRun = String(process.env.DRY_RUN ?? '1').trim() !== '0';

  await mongoose.connect(mustGetMongoUri());
  console.log('Connected DB:', {
    host: mongoose.connection?.host,
    name: mongoose.connection?.name,
    readyState: mongoose.connection?.readyState,
  });

  const query = {
    isActive: { $ne: false },
    status: { $in: ['active', 'disbursed'] },
    requestType: { $in: ['loan', 'salary_advance'] },
  };

  const totalCandidates = await Loan.countDocuments(query);
  console.log('Candidate docs (before remainingBalance filter):', totalCandidates);

  const cursor = Loan.find(query).cursor();

  const summary = {
    targetYm,
    dryRun,
    checked: 0,
    updated: 0,
    skipped: 0,
    skippedNoBalance: 0,
    errors: 0,
  };

  for await (const loan of cursor) {
    summary.checked += 1;

    try {
      if (!loan.repayment) loan.repayment = {};
      const remaining = Number(loan.repayment.remainingBalance);
      if (!(remaining > 0)) {
        summary.skippedNoBalance += 1;
        continue;
      }
      const paid = Math.max(0, Number(loan.repayment.installmentsPaid) || 0);

      // Shift the schedule anchor so that the due month for the *next* installment equals targetYm.
      // Due month is: firstYm + paid. So choose firstYm = targetYm - paid.
      const desiredFirstYm = addCalendarMonthsToYm(targetYm, -paid);

      const before = {
        id: loan._id?.toString?.(),
        emp_no: loan.emp_no,
        requestType: loan.requestType,
        status: loan.status,
        installmentsPaid: paid,
        firstDeductionPayrollMonth: loan.approvals?.final?.firstDeductionPayrollMonth || null,
        nextPaymentDate: loan.repayment?.nextPaymentDate || null,
      };

      if (!loan.approvals) loan.approvals = {};
      if (!loan.approvals.final) loan.approvals.final = {};
      loan.approvals.final.firstDeductionPayrollMonth = desiredFirstYm;

      const prevNext = toTime(loan.repayment?.nextPaymentDate);
      await setNextPaymentDateFromInstallmentsPaid(loan);
      const nextNext = toTime(loan.repayment?.nextPaymentDate);

      const changed =
        String(before.firstDeductionPayrollMonth || '') !== String(desiredFirstYm || '')
        || prevNext !== nextNext;

      if (!changed) {
        summary.skipped += 1;
        continue;
      }

      summary.updated += 1;

      loan.markModified('approvals');
      loan.markModified('repayment');

      if (!dryRun) {
        // eslint-disable-next-line no-await-in-loop
        await loan.save();
      }

      const after = {
        firstDeductionPayrollMonth: loan.approvals?.final?.firstDeductionPayrollMonth || null,
        nextPaymentDate: loan.repayment?.nextPaymentDate || null,
      };

      console.log(
        JSON.stringify(
          { updated: !dryRun, dryRun, targetYm, before, after },
          null,
          2
        )
      );
    } catch (e) {
      summary.errors += 1;
      console.error('Error updating loan', loan?._id?.toString?.(), e?.message || e);
    }
  }

  console.log('Summary:', summary);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

