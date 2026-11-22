/**
 * Script to sync missing loan EMI & salary advance settlements from Payroll Records into Loan records.
 *
 * Background:
 * When payroll batches are created and calculated, loan deductions are recorded in `payrollrecords`.
 * However, the actual deduction in the `loans` collection (repayment balance, installmentsPaid,
 * and ledger transaction history) is triggered when a batch moves to status 'complete'.
 * If a batch was left in 'approved' or never transitioned to 'complete', the loan accounts miss
 * the settlement, causing an installment count / balance lag.
 *
 * This script safely and idempotently syncs those deductions into the Loan documents without
 * altering already disbursed payroll salaries or touching attendance/leaves.
 *
 * Usage:
 *   # Dry run (default, preview only without changes):
 *   node backend/scripts/sync_loan_settlements_from_payroll.js [YYYY-MM]
 *
 *   # Apply changes:
 *   node backend/scripts/sync_loan_settlements_from_payroll.js [YYYY-MM] --apply
 *
 * Example:
 *   node backend/scripts/sync_loan_settlements_from_payroll.js 2026-08 --dry-run
 *   node backend/scripts/sync_loan_settlements_from_payroll.js 2026-08 --apply
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const PayrollRecord = require('../payroll/model/PayrollRecord');
const Loan = require('../loans/model/Loan');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const loanAdvanceService = require('../payroll/services/loanAdvanceService');

const {
  setNextPaymentDateFromInstallmentsPaid,
} = require('../loans/services/loanHistoryRepairService');

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const monthArg = args.find((a) => /^\d{4}-\d{2}$/.test(a)) || '2026-08';

  const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb+srv://saketh:saketh123@cluster0.1kuhvxe.mongodb.net/teja-hrms';

  console.log('===========================================================');
  console.log('   LOAN & ADVANCE PAYROLL SETTLEMENT SYNC SCRIPT');
  console.log('===========================================================');
  console.log(`Target Month: ${monthArg}`);
  console.log(`Execution Mode: ${isApply ? 'APPLY (Making changes)' : 'DRY-RUN (Preview only)'}`);
  console.log('-----------------------------------------------------------');

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  try {
    // Find a system or admin user for processedBy
    let adminUser = await User.findOne({ role: 'admin' }).select('_id email').lean();
    if (!adminUser) {
      adminUser = await User.findOne({}).select('_id email').lean();
    }
    const userId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

    // Query payroll records with loan EMI or salary advance
    const payrollRecords = await PayrollRecord.find({
      month: monthArg,
      $or: [
        { 'loanAdvance.totalEMI': { $gt: 0 } },
        { 'loanAdvance.advanceDeduction': { $gt: 0 } },
      ],
    })
      .select('_id employeeId emp_no month loanAdvance')
      .lean();

    console.log(`Found ${payrollRecords.length} payroll records with loan EMI / advance in ${monthArg}.\n`);

    if (payrollRecords.length === 0) {
      console.log(`No payroll records found with deductions for month ${monthArg}.`);
      return;
    }

    let loansToProcess = 0;
    let loansAlreadySettled = 0;
    let totalEmiAmount = 0;

    let advancesToProcess = 0;
    let advancesAlreadySettled = 0;
    let totalAdvanceAmount = 0;

    const dryRunPlan = [];

    for (const pr of payrollRecords) {
      const payrollIdStr = pr._id.toString();
      const la = pr.loanAdvance || {};
      const emiBreakdown = Array.isArray(la.emiBreakdown) ? la.emiBreakdown : [];
      const advanceBreakdown = Array.isArray(la.advanceBreakdown) ? la.advanceBreakdown : [];

      // Check EMIs
      for (const emi of emiBreakdown) {
        if (!emi.loanId || !(Number(emi.emiAmount) > 0)) continue;

        const loan = await Loan.findById(emi.loanId);
        if (!loan) {
          console.warn(`[WARN] Loan ID ${emi.loanId} for emp_no ${pr.emp_no} not found in database.`);
          continue;
        }

        const canonKey = `payroll_month:${monthArg}:emi:${loan._id}`;
        const legacyKey = `payroll_settle:${payrollIdStr}:emi`;
        const txs = loan.transactions || [];

        const alreadySettled = txs.some(
          (t) =>
            t.payrollSettlementKey === canonKey ||
            t.payrollSettlementKey === legacyKey ||
            (t.transactionType === 'emi_payment' &&
              String(t.payrollCycle || '').trim() === monthArg &&
              t.payrollSettlementKey)
        );

        if (alreadySettled) {
          loansAlreadySettled++;
        } else {
          loansToProcess++;
          totalEmiAmount += Number(emi.emiAmount) || 0;

          const currentPaid = loan.repayment?.totalPaid || 0;
          const currentInstallments = loan.repayment?.installmentsPaid || 0;
          const totalAmount = loan.loanConfig?.totalAmount || loan.amount;
          const newTotalPaid = currentPaid + emi.emiAmount;
          const newInstallments = currentInstallments + 1;
          const newBalance = Math.max(0, totalAmount - newTotalPaid);

          dryRunPlan.push({
            type: 'LOAN_EMI',
            emp_no: pr.emp_no,
            loanId: loan._id.toString(),
            amount: emi.emiAmount,
            currentPaid,
            newTotalPaid,
            currentInstallments,
            newInstallments,
            newBalance,
            payrollRecordId: payrollIdStr,
            emiItem: emi,
          });
        }
      }

      // Check Salary Advances
      for (const adv of advanceBreakdown) {
        if (!adv.advanceId || !(Number(adv.advanceAmount) > 0)) continue;

        const advanceRecord = await Loan.findById(adv.advanceId);
        if (!advanceRecord) {
          console.warn(`[WARN] Advance ID ${adv.advanceId} for emp_no ${pr.emp_no} not found in database.`);
          continue;
        }

        const canonKey = `payroll_month:${monthArg}:adv:${advanceRecord._id}`;
        const legacyKey = `payroll_settle:${payrollIdStr}:adv:${advanceRecord._id}`;
        const txs = advanceRecord.transactions || [];

        const alreadySettled = txs.some(
          (t) =>
            t.payrollSettlementKey === canonKey ||
            t.payrollSettlementKey === legacyKey ||
            (t.transactionType === 'advance_deduction' &&
              String(t.payrollCycle || '').trim() === monthArg &&
              t.payrollSettlementKey)
        );

        if (alreadySettled) {
          advancesAlreadySettled++;
        } else {
          advancesToProcess++;
          totalAdvanceAmount += Number(adv.advanceAmount) || 0;

          dryRunPlan.push({
            type: 'ADVANCE',
            emp_no: pr.emp_no,
            advanceId: advanceRecord._id.toString(),
            amount: adv.advanceAmount,
            carriedForward: adv.carriedForward,
            payrollRecordId: payrollIdStr,
            advItem: adv,
          });
        }
      }
    }

    console.log('=== SYNC AUDIT SUMMARY ===');
    console.log(`Loans already settled for ${monthArg}: ${loansAlreadySettled}`);
    console.log(`Loans needing settlement for ${monthArg}: ${loansToProcess} (Total EMI: ₹${totalEmiAmount.toLocaleString('en-IN')})`);
    console.log(`Advances already settled for ${monthArg}: ${advancesAlreadySettled}`);
    console.log(`Advances needing settlement for ${monthArg}: ${advancesToProcess} (Total Advance: ₹${totalAdvanceAmount.toLocaleString('en-IN')})`);
    console.log('-----------------------------------------------------------\n');

    if (!isApply) {
      console.log('Sample of pending settlements to be applied:');
      dryRunPlan.slice(0, 10).forEach((item, idx) => {
        if (item.type === 'LOAN_EMI') {
          console.log(
            `[${idx + 1}] Emp ${item.emp_no} | Loan ${item.loanId} | EMI: ₹${item.amount} | Installments: ${item.currentInstallments} -> ${item.newInstallments} | Remaining: ₹${item.newBalance}`
          );
        } else {
          console.log(
            `[${idx + 1}] Emp ${item.emp_no} | Advance ${item.advanceId} | Amount: ₹${item.amount} | CarriedForward: ₹${item.carriedForward}`
          );
        }
      });
      if (dryRunPlan.length > 10) {
        console.log(`... and ${dryRunPlan.length - 10} more records.`);
      }
      console.log('\n[DRY-RUN COMPLETE] No database modifications were made.');
      console.log(`To apply these changes, run:\n  node backend/scripts/sync_loan_settlements_from_payroll.js ${monthArg} --apply\n`);
      return;
    }

    // Apply mode
    console.log(`Applying settlements for ${monthArg}...`);
    let appliedLoansCount = 0;
    let appliedAdvanceCount = 0;

    for (const pr of payrollRecords) {
      const payrollIdStr = pr._id.toString();
      const la = pr.loanAdvance || {};
      const emiBreakdown = Array.isArray(la.emiBreakdown) ? la.emiBreakdown : [];
      const advanceBreakdown = Array.isArray(la.advanceBreakdown) ? la.advanceBreakdown : [];

      if (emiBreakdown.length > 0) {
        try {
          await loanAdvanceService.updateLoanRecordsAfterEMI(
            emiBreakdown,
            monthArg,
            userId,
            payrollIdStr
          );
          appliedLoansCount += emiBreakdown.length;
        } catch (err) {
          console.error(`[ERROR] Loan EMI settlement failed for payroll ${payrollIdStr} (emp ${pr.emp_no}):`, err.message);
        }
      }

      if (advanceBreakdown.length > 0) {
        try {
          await loanAdvanceService.updateAdvanceRecordsAfterDeduction(
            advanceBreakdown,
            monthArg,
            userId,
            payrollIdStr
          );
          appliedAdvanceCount += advanceBreakdown.length;
        } catch (err) {
          console.error(`[ERROR] Advance settlement failed for payroll ${payrollIdStr} (emp ${pr.emp_no}):`, err.message);
        }
      }
    }

    console.log('\n===========================================================');
    console.log('   APPLY COMPLETED SUCCESSFULLY');
    console.log('===========================================================');
    console.log(`Total Loan EMI records processed: ${appliedLoansCount}`);
    console.log(`Total Salary Advance records processed: ${appliedAdvanceCount}`);
    console.log(`Loan balances, installment counts, and transaction logs have been updated.`);
    console.log('===========================================================\n');
  } catch (error) {
    console.error('Fatal execution error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main();
