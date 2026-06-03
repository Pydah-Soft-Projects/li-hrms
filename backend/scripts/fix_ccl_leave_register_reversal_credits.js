/**
 * CCL-only cleanup: remove "Leave Application Cancelled/Reversed" CREDIT rows from
 * LeaveRegisterYear slots. They must not count as month pool credits or reduce Used.
 *
 * - Drops each matching CCL reversal CREDIT from months[].transactions
 * - Reduces slot.compensatoryOffs by removed days (reversal had bumped the pool)
 * - Recalculates CCL ledger balances + Employee.compensatoryOffs
 *
 * Usage:
 *   node scripts/fix_ccl_leave_register_reversal_credits.js --dry-run
 *   node scripts/fix_ccl_leave_register_reversal_credits.js --apply
 *   node scripts/fix_ccl_leave_register_reversal_credits.js --apply --fy 2026
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');

const REVERSAL_SNIP = 'Leave Application Cancelled/Reversed';

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function isCclReversalCredit(tx) {
  return (
    String(tx?.leaveType || '').toUpperCase() === 'CCL' &&
    String(tx?.transactionType || '').toUpperCase() === 'CREDIT' &&
    String(tx?.reason || '').includes(REVERSAL_SNIP)
  );
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = !hasFlag('--apply');
  const fyArg = process.argv.find((a) => a.startsWith('--fy='));
  const fyFilter = fyArg
    ? fyArg.split('=')[1]
    : process.argv.includes('--fy')
      ? process.argv[process.argv.indexOf('--fy') + 1]
      : null;

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const query = fyFilter ? { financialYear: String(fyFilter).trim() } : {};
  const docs = await LeaveRegisterYear.find(query).lean();
  const results = [];
  let docsChanged = 0;
  let reversalRowsRemoved = 0;
  let poolDaysReduced = 0;

  for (const lean of docs) {
    const doc = await LeaveRegisterYear.findById(lean._id);
    if (!doc) continue;
    let docTouched = false;
    let empReversalRemoved = 0;
    let empPoolReduced = 0;
    let earliest = null;

    for (const slot of doc.months || []) {
      const before = (slot.transactions || []).length;
      let slotPoolReduce = 0;
      const kept = [];
      for (const tx of slot.transactions || []) {
        if (isCclReversalCredit(tx)) {
          const d = Math.max(0, Number(tx.days) || 0);
          slotPoolReduce += d;
          empReversalRemoved += 1;
          if (tx.startDate) {
            const t = new Date(tx.startDate);
            if (!Number.isNaN(t.getTime()) && (!earliest || t < earliest)) earliest = t;
          }
          continue;
        }
        kept.push(tx);
      }
      if (slotPoolReduce > 0) {
        slot.transactions = kept;
        const beforePool = Number(slot.compensatoryOffs) || 0;
        slot.compensatoryOffs = round2(Math.max(0, beforePool - slotPoolReduce));
        empPoolReduced += slotPoolReduce;
        docTouched = true;
        doc.markModified('months');
      } else if (kept.length !== before) {
        slot.transactions = kept;
        docTouched = true;
        doc.markModified('months');
      }
    }

    if (!docTouched) continue;

    reversalRowsRemoved += empReversalRemoved;
    poolDaysReduced += empPoolReduced;
    docsChanged += 1;

    const row = {
      empNo: doc.empNo,
      employeeName: doc.employeeName,
      financialYear: doc.financialYear,
      reversalCreditsRemoved: empReversalRemoved,
      poolDaysReduced: round2(empPoolReduced),
      compensatoryOffBalanceBefore: lean.compensatoryOffBalance,
    };

    if (!dryRun) {
      await doc.save();
      const anchor = earliest || doc.financialYearStart || new Date();
      await leaveRegisterYearLedgerService.recalculateRegisterBalances(
        doc.employeeId,
        'CCL',
        anchor
      );
      const afterDoc = await LeaveRegisterYear.findById(doc._id).select('compensatoryOffBalance').lean();
      row.compensatoryOffBalanceAfter = afterDoc?.compensatoryOffBalance;
    }

    results.push(row);
  }

  const summary = {
    dryRun,
    financialYearFilter: fyFilter || 'all',
    leaveRegisterYearDocsScanned: docs.length,
    employeesUpdated: docsChanged,
    cclReversalCreditRowsRemoved: reversalRowsRemoved,
    compensatoryOffsPoolDaysReduced: round2(poolDaysReduced),
  };

  console.log(JSON.stringify({ summary, employees: results }, null, 2));

  const fs = require('fs');
  const out = path.join(__dirname, '_fix_ccl_reversal_results.json');
  fs.writeFileSync(out, JSON.stringify({ summary, employees: results }, null, 2));
  console.log(`\nWrote ${out}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
