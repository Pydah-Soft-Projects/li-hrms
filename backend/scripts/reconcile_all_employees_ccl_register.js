/**
 * Bulk CCL register reconciliation (same steps as employee 1890):
 * 1) Optional: strip CCL "Leave Application Cancelled/Reversed" CREDIT rows + pool fix
 * 2) Monthly pool transfer rebuild from first CCL activity in each FY doc
 * 3) Recalculate CL/CCL/EL ledger chains (CCL uses credits-before-debits within month)
 *
 * Usage:
 *   node scripts/reconcile_all_employees_ccl_register.js --dry-run
 *   node scripts/reconcile_all_employees_ccl_register.js --apply
 *   node scripts/reconcile_all_employees_ccl_register.js --apply --fy 2026
 *   node scripts/reconcile_all_employees_ccl_register.js --apply --skip-strip-reversals
 *   node scripts/reconcile_all_employees_ccl_register.js --apply --limit 50
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const Employee = require('../employees/model/Employee');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const monthlyTransferReconciliationService = require('../leaves/services/monthlyTransferReconciliationService');
const { netUsedDaysForType } = require('../leaves/services/monthlyTransferReconciliationService');

const REVERSAL_SNIP = 'Leave Application Cancelled/Reversed';

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseFy() {
  const fyArg = process.argv.find((a) => a.startsWith('--fy='));
  if (fyArg) return String(fyArg.split('=')[1]).trim();
  const i = process.argv.indexOf('--fy');
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]).trim();
  return null;
}

function parseLimit() {
  const i = process.argv.indexOf('--limit');
  if (i >= 0 && process.argv[i + 1]) return Math.max(0, parseInt(process.argv[i + 1], 10) || 0);
  return 0;
}

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

function slotHasCclActivity(slot) {
  if (!slot) return false;
  if (round2(Number(slot.compensatoryOffs) || 0) > 0) return true;
  if (round2(Number(slot.poolCarryForwardIn?.ccl) || 0) > 0) return true;
  if (round2(Number(slot.poolCarryForwardOut?.ccl) || 0) > 0) return true;
  for (const tx of slot.transactions || []) {
    if (String(tx?.leaveType || '').toUpperCase() === 'CCL') return true;
  }
  return false;
}

function docHasCclActivity(doc) {
  for (const slot of doc.months || []) {
    if (slotHasCclActivity(slot)) return true;
  }
  return false;
}

function earliestCclAnchorForDoc(doc) {
  let earliest = null;
  for (const slot of doc.months || []) {
    if (!slotHasCclActivity(slot)) continue;
    const candidates = [
      slot.payPeriodStart,
      slot.payPeriodEnd,
      ...(slot.transactions || [])
        .filter((t) => String(t?.leaveType || '').toUpperCase() === 'CCL')
        .map((t) => t.startDate),
    ]
      .map((d) => (d ? new Date(d) : null))
      .filter((d) => d && !Number.isNaN(d.getTime()));
    for (const d of candidates) {
      if (!earliest || d < earliest) earliest = d;
    }
  }
  return earliest;
}

async function stripCclReversalCredits({ fyFilter, dryRun }) {
  const query = fyFilter ? { financialYear: fyFilter } : {};
  const leans = await LeaveRegisterYear.find(query).select('_id empNo financialYear').lean();
  let docsChanged = 0;
  let reversalRowsRemoved = 0;
  let poolDaysReduced = 0;

  for (const lean of leans) {
    const doc = await LeaveRegisterYear.findById(lean._id);
    if (!doc) continue;
    let docTouched = false;
    let empRemoved = 0;
    let empPoolReduced = 0;
    let earliest = null;

    for (const slot of doc.months || []) {
      const before = (slot.transactions || []).length;
      let slotPoolReduce = 0;
      const kept = [];
      for (const tx of slot.transactions || []) {
        if (isCclReversalCredit(tx)) {
          slotPoolReduce += Math.max(0, Number(tx.days) || 0);
          empRemoved += 1;
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
        slot.compensatoryOffs = round2(
          Math.max(0, (Number(slot.compensatoryOffs) || 0) - slotPoolReduce)
        );
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
    reversalRowsRemoved += empRemoved;
    poolDaysReduced += empPoolReduced;
    docsChanged += 1;

    if (!dryRun) {
      await doc.save();
      const anchor = earliest || doc.financialYearStart || new Date();
      await leaveRegisterYearLedgerService.recalculateRegisterBalances(
        doc.employeeId,
        'CCL',
        anchor
      );
    }
  }

  return { docsChanged, reversalRowsRemoved, poolDaysReduced: round2(poolDaysReduced) };
}

function lastClosingBalanceLastInArray(slot) {
  let last = null;
  for (const tx of slot?.transactions || []) {
    if (String(tx?.leaveType || '').toUpperCase() !== 'CCL') continue;
    const c = Number(tx.closingBalance);
    if (Number.isFinite(c)) last = c;
  }
  return last;
}

function sumCclDebits(slot) {
  let d = 0;
  for (const tx of slot?.transactions || []) {
    if (String(tx?.leaveType || '').toUpperCase() !== 'CCL') continue;
    if (String(tx?.transactionType || '').toUpperCase() !== 'DEBIT') continue;
    if (String(tx?.autoGeneratedType || '').startsWith('MONTHLY_POOL_TRANSFER_OUT_')) continue;
    d += Math.max(0, Number(tx.days) || 0);
  }
  return round2(d);
}

async function buildEmployeeCclReport(employeeId, financialYear) {
  const [doc, emp] = await Promise.all([
    LeaveRegisterYear.findOne({ employeeId, financialYear }).lean(),
    Employee.findById(employeeId).select('compensatoryOffs').lean(),
  ]);
  if (!doc) return null;

  const ledgerBal = await leaveRegisterYearLedgerService.getCurrentBalance(employeeId, 'CCL', new Date());
  const months = [];
  let anyBalanceDisplayFix = false;

  for (const slot of doc.months || []) {
    if (!slotHasCclActivity(slot)) continue;
    const balanceDisplay = leaveRegisterYearLedgerService.lastClosingBalanceInSlot(slot, 'CCL');
    const balanceLastInArray = lastClosingBalanceLastInArray(slot);
    const mismatch =
      balanceLastInArray != null &&
      balanceDisplay != null &&
      round2(balanceLastInArray) !== round2(balanceDisplay);
    if (mismatch) anyBalanceDisplayFix = true;

    months.push({
      payrollCycleMonth: slot.payrollCycleMonth,
      payrollCycleYear: slot.payrollCycleYear,
      label: slot.label || `${slot.payrollCycleMonth}/${slot.payrollCycleYear}`,
      pool: round2(slot.compensatoryOffs),
      transferIn: round2(slot.poolCarryForwardIn?.ccl),
      transferOut: round2(slot.poolCarryForwardOut?.ccl),
      used: netUsedDaysForType(slot, 'CCL'),
      debitsRaw: sumCclDebits(slot),
      balanceDisplay: balanceDisplay != null ? round2(balanceDisplay) : null,
      balanceLastInArray: balanceLastInArray != null ? round2(balanceLastInArray) : null,
      balanceWouldHaveBeenWrong: mismatch,
    });
  }

  return {
    empNo: doc.empNo,
    employeeName: doc.employeeName,
    employeeId: String(employeeId),
    financialYear,
    employeeCompensatoryOffs: round2(emp?.compensatoryOffs),
    yearDocCompensatoryOffBalance: round2(doc.compensatoryOffBalance),
    ledgerBalanceNow: round2(ledgerBal),
    anyBalanceDisplayFix,
    months,
  };
}

function employeesToCsv(rows) {
  const header = [
    'empNo',
    'employeeName',
    'financialYear',
    'employeeCompensatoryOffs',
    'yearDocCompensatoryOffBalance',
    'ledgerBalanceNow',
    'reconcileStatus',
    'month',
    'pool',
    'transferIn',
    'transferOut',
    'used',
    'balanceDisplay',
    'balanceLastInArray',
    'balanceWouldHaveBeenWrong',
  ].join(',');
  const lines = [header];
  for (const row of rows) {
    const base = [
      row.empNo,
      `"${String(row.employeeName || '').replace(/"/g, '""')}"`,
      row.financialYear,
      row.employeeCompensatoryOffs,
      row.yearDocCompensatoryOffBalance,
      row.ledgerBalanceNow,
      row.reconcileStatus || '',
    ];
    if (!row.months?.length) {
      lines.push([...base, '', '', '', '', '', '', '', ''].join(','));
      continue;
    }
    for (const m of row.months) {
      lines.push(
        [
          ...base,
          m.label,
          m.pool,
          m.transferIn,
          m.transferOut,
          m.used,
          m.balanceDisplay ?? '',
          m.balanceLastInArray ?? '',
          m.balanceWouldHaveBeenWrong ? 'Y' : 'N',
        ].join(',')
      );
    }
  }
  return lines.join('\n');
}

async function main() {
  const dryRun = !hasFlag('--apply');
  const fyFilter = parseFy();
  const limit = parseLimit();
  const skipStrip = hasFlag('--skip-strip-reversals');

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`[reconcile_all_ccl] mode=${dryRun ? 'DRY-RUN' : 'APPLY'} fy=${fyFilter || 'ALL'} limit=${limit || 'none'}\n`);

  const stripSummary = skipStrip
    ? { skipped: true }
    : await stripCclReversalCredits({ fyFilter, dryRun });
  console.log('[step 1] strip CCL reversal credits:', stripSummary);

  const query = fyFilter ? { financialYear: fyFilter } : {};
  const allDocs = await LeaveRegisterYear.find(query)
    .select('employeeId empNo employeeName financialYear financialYearStart months')
    .lean();

  const jobs = [];
  for (const doc of allDocs) {
    if (!docHasCclActivity(doc)) continue;
    const anchor = earliestCclAnchorForDoc(doc);
    if (!anchor) continue;
    jobs.push({
      employeeId: doc.employeeId,
      empNo: doc.empNo,
      employeeName: doc.employeeName,
      financialYear: doc.financialYear,
      fromDate: anchor,
    });
  }

  jobs.sort((a, b) => String(a.empNo).localeCompare(String(b.empNo)));
  const toRun = limit > 0 ? jobs.slice(0, limit) : jobs;

  console.log(`[step 2] FY docs scanned=${allDocs.length} with CCL activity=${jobs.length} to reconcile=${toRun.length}\n`);

  const results = {
    ranAt: new Date().toISOString(),
    dryRun,
    fyFilter,
    stripSummary,
    totalJobs: toRun.length,
    ok: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    employees: [],
  };

  let n = 0;
  for (const job of toRun) {
    n += 1;
    const label = `${job.empNo} FY${job.financialYear}`;
    let reconcileStatus = dryRun ? 'dry_run' : 'pending';
    let reconcileDetail = null;
    try {
      if (dryRun) {
        results.ok += 1;
        reconcileStatus = 'dry_run';
        if (n <= 5) console.log(`[dry-run] ${n}/${toRun.length} ${label} from ${job.fromDate.toISOString().slice(0, 10)}`);
      } else {
        const r = await monthlyTransferReconciliationService.reconcileEmployeeFromDate({
          employeeId: job.employeeId,
          fromDate: job.fromDate,
          financialYear: job.financialYear,
          apply: true,
        });

        if (r?.skipped) {
          results.skipped += 1;
          reconcileStatus = `skipped:${r.reason || 'unknown'}`;
          results.failures.push({ empNo: job.empNo, financialYear: job.financialYear, reason: r.reason });
        } else {
          results.ok += 1;
          reconcileStatus = 'ok';
          reconcileDetail = {
            source: r.source,
            target: r.target,
            rebuiltEdges: r.rebuiltEdges,
            removedTransferRows: r.removedTransferRows,
          };
        }

        if (n % 25 === 0 || n === toRun.length) {
          console.log(`[progress] ${n}/${toRun.length} ok=${results.ok} skipped=${results.skipped} failed=${results.failed}`);
        }
      }

      const report = await buildEmployeeCclReport(job.employeeId, job.financialYear);
      if (report) {
        results.employees.push({
          ...report,
          reconcileStatus,
          reconcile: reconcileDetail,
        });
      }
    } catch (e) {
      results.failed += 1;
      reconcileStatus = `error:${e?.message || String(e)}`;
      results.failures.push({
        empNo: job.empNo,
        financialYear: job.financialYear,
        error: e?.message || String(e),
      });
      console.error(`FAIL ${label}:`, e?.message || e);
      try {
        const report = await buildEmployeeCclReport(job.employeeId, job.financialYear);
        if (report) {
          results.employees.push({ ...report, reconcileStatus, reconcile: null });
        }
      } catch (_) {
        /* ignore report error */
      }
    }
  }

  results.summary = {
    employeesInFile: results.employees.length,
    withMonthBalanceDisplayMismatch: results.employees.filter((e) => e.anyBalanceDisplayFix).length,
  };

  const outPath = path.join(__dirname, '_reconcile_all_ccl_results.json');
  const employeesJsonPath = path.join(__dirname, '_reconcile_all_ccl_employees.json');
  const employeesCsvPath = path.join(__dirname, '_reconcile_all_ccl_employees.csv');

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(employeesJsonPath, JSON.stringify(results.employees, null, 2));
  fs.writeFileSync(employeesCsvPath, employeesToCsv(results.employees));

  console.log('\n[done]', JSON.stringify({ ...results, employees: `[${results.employees.length} rows]`, failures: results.failures.slice(0, 10) }, null, 2));
  console.log('Summary JSON:', outPath);
  console.log('Per-employee JSON:', employeesJsonPath);
  console.log('Per-employee CSV (Excel):', employeesCsvPath);

  await mongoose.disconnect();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
