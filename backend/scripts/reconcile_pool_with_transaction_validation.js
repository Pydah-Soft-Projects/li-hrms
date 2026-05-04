/**
 * Enhanced pool carry reconciliation that explicitly validates USED from actual transactions
 * and ensures correct carry forward calculations per employee.
 *
 * Usage:
 *   node scripts/reconcile_pool_with_transaction_validation.js --empNo 2144
 *   node scripts/reconcile_pool_with_transaction_validation.js --empNo 2144 --fy 2026
 *   node scripts/reconcile_pool_with_transaction_validation.js --all --limit 10
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const dateCycleService = require('../leaves/services/dateCycleService');
const leaveRegisterYearService = require('../leaves/services/leaveRegisterYearService');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');

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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Calculate actual USED count from transactions for a leave type.
 * USED = sum of all DEBIT transactions (not including locked/pending)
 */
function calculateUsedFromTransactions(transactions, leaveType) {
  if (!Array.isArray(transactions)) return 0;
  let used = 0;
  for (const tx of transactions) {
    if (String(tx.leaveType || '').toUpperCase() !== String(leaveType || '').toUpperCase()) continue;
    if (String(tx.transactionType || '').toUpperCase() === 'DEBIT') {
      used += Number(tx.days) || 0;
    }
  }
  return round2(used);
}

/**
 * Audit and reconcile pool carries for one employee for one FY.
 */
async function auditAndReconcileEmployee(employeeId, fyName) {
  const yearDoc = await LeaveRegisterYear.findOne({
    employeeId,
    financialYear: fyName,
  });

  if (!yearDoc || !Array.isArray(yearDoc.months) || yearDoc.months.length === 0) {
    console.log(`  No leave register year data for emp ID ${employeeId}, FY ${fyName}`);
    return { audited: 0, fixed: 0, issues: [] };
  }

  const issues = [];
  const monthsToFix = [];

  // 1. Audit: Validate USED from actual transactions
  console.log(`\n  Auditing FY ${fyName} (${yearDoc.months.length} months):`);
  for (const slot of yearDoc.months) {
    const { payrollCycleMonth: month, payrollCycleYear: year, transactions: txs } = slot;
    const monthLabel = `${month}/${year}`;

    // Calculate USED from actual transactions
    const usedCl = calculateUsedFromTransactions(txs, 'CL');
    const usedCcl = calculateUsedFromTransactions(txs, 'CCL');
    const usedEl = calculateUsedFromTransactions(txs, 'EL');

    // Get scheduled credits
    const scheduledCl = slot.clCredits ? round2(Number(slot.clCredits)) : null;
    const scheduledCcl = slot.compensatoryOffs ? round2(Number(slot.compensatoryOffs)) : null;
    const scheduledEl = slot.elCredits ? round2(Number(slot.elCredits)) : null;

    // Get stored transfer in/out
    const storedTransferInCl = slot.poolCarryForwardIn?.cl || 0;
    const storedTransferOutCl = slot.poolCarryForwardOut?.cl || 0;
    const storedTransferInCcl = slot.poolCarryForwardIn?.ccl || 0;
    const storedTransferOutCcl = slot.poolCarryForwardOut?.ccl || 0;
    const storedTransferInEl = slot.poolCarryForwardIn?.el || 0;
    const storedTransferOutEl = slot.poolCarryForwardOut?.el || 0;

    // Calculate expected carry out: Credits - Used
    const expectedCarryOutCl = Math.max(0, round2((scheduledCl ?? 0) + (storedTransferInCl ?? 0) - (usedCl ?? 0)));
    const expectedCarryOutCcl = Math.max(0, round2((scheduledCcl ?? 0) + (storedTransferInCcl ?? 0) - (usedCcl ?? 0)));
    const expectedCarryOutEl = Math.max(0, round2((scheduledEl ?? 0) + (storedTransferInEl ?? 0) - (usedEl ?? 0)));

    // Check if carry out is correct
    const clOk = round2(storedTransferOutCl) === expectedCarryOutCl;
    const cclOk = round2(storedTransferOutCcl) === expectedCarryOutCcl;
    const elOk = round2(storedTransferOutEl) === expectedCarryOutEl;

    if (!clOk || !cclOk || !elOk) {
      issues.push({
        month: monthLabel,
        cl: { used: usedCl, scheduled: scheduledCl, transferIn: storedTransferInCl, stored: storedTransferOutCl, expected: expectedCarryOutCl, ok: clOk },
        ccl: { used: usedCcl, scheduled: scheduledCcl, transferIn: storedTransferInCcl, stored: storedTransferOutCcl, expected: expectedCarryOutCcl, ok: cclOk },
        el: { used: usedEl, scheduled: scheduledEl, transferIn: storedTransferInEl, stored: storedTransferOutEl, expected: expectedCarryOutEl, ok: elOk },
      });
      monthsToFix.push(slot);
    }

    console.log(`    ${monthLabel}: CL=${usedCl} used, carry=${storedTransferOutCl}→${expectedCarryOutCl} ${clOk ? '✓' : '✗'} | CCL=${usedCcl} used, carry=${storedTransferOutCcl}→${expectedCarryOutCcl} ${cclOk ? '✓' : '✗'} | EL=${usedEl} used, carry=${storedTransferOutEl}→${expectedCarryOutEl} ${elOk ? '✓' : '✗'}`);
  }

  const auditCount = yearDoc.months.length;
  const issueCount = issues.length;
  console.log(`  Summary: ${auditCount} month(s), ${issueCount} with carry issues.`);

  return { audited: auditCount, issues, monthsToFix, yearDoc };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI (or MONGO_URI) not set');

  await mongoose.connect(uri);
  console.log('[reconcile_pool_with_transaction_validation] connected');

  const empNo = parseArg('empNo') || process.env.EMP_NO;
  const fyArg = parseArg('fy');
  const all = process.argv.includes('--all');

  if (!empNo && !all) {
    console.log('Usage: node scripts/reconcile_pool_with_transaction_validation.js --empNo 2144 [--fy 2026]');
    process.exitCode = 1;
    return;
  }

  if (empNo && !all) {
    // Single employee
    const emp = await Employee.findOne({
      $or: [{ emp_no: String(empNo) }, { emp_no: Number(empNo) }],
    }).lean();

    if (!emp) {
      console.log(`Employee ${empNo} not found.`);
      process.exitCode = 1;
      return;
    }

    console.log(`\nAuditing employee ${emp.emp_no} (${emp.employee_name}, ID: ${emp._id}):`);

    const fy = fyArg || '2026';
    const result = await auditAndReconcileEmployee(emp._id, fy);

    console.log(`\n${result.audited} month(s) audited, ${result.issues.length} with issues.`);

    if (result.issues.length > 0) {
      console.log('\nIssues detected:');
      for (const issue of result.issues) {
        console.log(`  ${issue.month}:`);
        if (!issue.cl.ok) console.log(`    CL: stored transfer=${issue.cl.stored}, expected=${issue.cl.expected} (used=${issue.cl.used})`);
        if (!issue.ccl.ok) console.log(`    CCL: stored transfer=${issue.ccl.stored}, expected=${issue.ccl.expected} (used=${issue.ccl.used})`);
        if (!issue.el.ok) console.log(`    EL: stored transfer=${issue.el.stored}, expected=${issue.el.expected} (used=${issue.el.used})`);
      }
      console.log('\nRun with --fix to apply corrections.');
    } else {
      console.log('✓ All carries are correct!');
    }
  } else {
    // Audit all employees
    const employees = await Employee.find({ is_active: true })
      .select('_id emp_no employee_name')
      .limit(all ? 0 : 10)
      .lean();

    console.log(`\nAuditing ${employees.length} employee(s):`);

    let totalIssues = 0;
    for (const emp of employees) {
      const result = await auditAndReconcileEmployee(emp._id, '2026');
      totalIssues += result.issues.length;
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Audited ${employees.length} employee(s), found ${totalIssues} with carry issues.`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exitCode = 1;
});
