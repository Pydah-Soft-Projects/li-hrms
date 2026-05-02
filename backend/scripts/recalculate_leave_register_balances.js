/**
 * Re-chain opening/closing balances on all LeaveRegisterYear transactions (CL, CCL, EL)
 * and sync Employee model fields — same as leaveRegisterYearLedgerService.recalculateRegisterBalances.
 *
 * Does NOT mutate slot credits or delete rows; only refreshes tx openingBalance/closingBalance
 * and latest FY snapshot + Employee.casualLeaves / compensatoryOffs / paidLeaves.
 *
 * Usage (from backend folder):
 *   node scripts/recalculate_leave_register_balances.js --empNo 2213
 *   node scripts/recalculate_leave_register_balances.js --all
 *   node scripts/recalculate_leave_register_balances.js --all --limit 100
 *   node scripts/recalculate_leave_register_balances.js --divisionName "PYDAHSOFT"
 *     (case-insensitive substring on Division.name; all active employees in matching division(s))
 *
 * Flags:
 *   --syncMonthlyApply false   Skip syncStoredMonthApplyFieldsForEmployeeDate after each employee (default: true when using --divisionName)
 *   --rebuildCarryTx true      Strip old MONTHLY_POOL_TRANSFER_* rows + poolCarryForward* artifacts, then re-run
 *                              monthlyPoolCarryForwardService per closed payroll month (chronological) for each
 *                              employee in scope — posts correct OUT/IN pairs and aligns slot credits with cron logic.
 *   --throughPayrollMonth N    With --rebuildCarryTx: only run carry for closings whose payrollCycleMonth <= N (e.g. 5 = through May).
 *   --throughPayrollYear Y     Optional; with --throughPayrollMonth, restrict to payrollCycleYear === Y.
 *
 * Env (optional):
 *   DRY_RUN=true   — list who would run, no writes
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const dateCycleService = require('../leaves/services/dateCycleService');
const leaveRegisterYearMonthlyApplyService = require('../leaves/services/leaveRegisterYearMonthlyApplyService');
const leaveRegisterPoolCarryReconcileService = require('../leaves/services/leaveRegisterPoolCarryReconcileService');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

async function recalcOne(employeeId) {
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CL', null);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CCL', null);
  await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'EL', null);
}

/** Re-sync pooled monthly apply fields for “today” slot after ledger re-chain (keeps ceilings/consumed aligned). */
async function syncMonthApplySnapshot(employeeId) {
  try {
    await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(employeeId, new Date());
  } catch (e) {
    console.warn(`  (syncMonthlyApply warn) ${e.message || e}`);
  }
}

/** Persist register month grid aggregates on LeaveRegisterYear slots (current FY). */
async function syncRegisterDisplaySnapshot(employeeId) {
  try {
    const periodInfo = await dateCycleService.getPeriodInfo(new Date());
    const fy = periodInfo?.financialYear?.name;
    if (!fy) return;
    const leaveRegisterYearRegisterDisplaySyncService = require('../leaves/services/leaveRegisterYearRegisterDisplaySyncService');
    await leaveRegisterYearRegisterDisplaySyncService.syncRegisterDisplaySnapshotsForEmployeeFy(employeeId, fy);
  } catch (e) {
    console.warn(`  (registerDisplaySnapshot warn) ${e.message || e}`);
  }
}

/**
 * Rebuild pool carry using the same path as payroll close: strip old MONTHLY_POOL_TRANSFER_* rows
 * (and undo carry-in bumps on slot credits), then monthlyPoolCarryForwardService for each closed
 * payroll month in chronological order (scoped to this employee only).
 *
 * "Closed" = slot pay period **strictly ends before the current open payroll cycle starts** (same
 * idea as accrual/carry cron: if May is the running cycle, only Jan…Apr-type closings run — not May).
 * Optional --throughPayrollMonth caps which closings are processed (e.g. 5 = do not run Jun–Dec carry).
 */
async function rebuildCarryTransactionsForEmployee(employeeId, carryOpts = {}) {
  const capM = carryOpts.throughPayrollMonth;
  const capY = carryOpts.throughPayrollYear;

  const r = await leaveRegisterPoolCarryReconcileService.reconcilePoolCarryChainAfterRegisterChange(employeeId, {
    asOfDate: new Date(),
    throughPayrollMonth: capM != null && Number.isFinite(Number(capM)) ? Number(capM) : undefined,
    throughPayrollYear: capY != null && Number.isFinite(Number(capY)) ? Number(capY) : undefined,
  });

  const carryErrorSamples = [];
  if (r.ok === false && r.error) {
    carryErrorSamples.push({ error: r.error });
  }
  return {
    yearsTouched: r.yearsTouched || 0,
    edgesApplied: r.edgesApplied || 0,
    carriesPosted: r.carriesPosted || 0,
    carryErrors: r.carryErrors || 0,
    carryCutoffIso: r.carryCutoffIso,
    carryErrorSamples,
    throughPayrollMonth: capM != null && Number.isFinite(Number(capM)) ? Number(capM) : null,
    throughPayrollYear: capY != null && Number.isFinite(Number(capY)) ? Number(capY) : null,
    carryFailed: r.ok === false,
    carryFailMessage: r.error,
  };
}

async function printRegisterSummary(employeeId) {
  const periodInfo = await dateCycleService.getPeriodInfo(new Date());
  const fy = periodInfo?.financialYear?.name;
  if (!fy) {
    console.log('  (no FY from dateCycleService; skip getLeaveRegister summary)');
    return;
  }
  const grouped = await leaveRegisterService.getLeaveRegister({ employeeId, financialYear: fy }, null, null);
  const row = Array.isArray(grouped) ? grouped[0] : grouped;
  if (!row) {
    console.log('  getLeaveRegister: empty row');
    return;
  }
  const months = row.registerMonths || [];
  const last = months.length ? months[months.length - 1] : null;
  const sum = row.summary || {};
  const ys = row.yearSnapshot || {};
  const cl = sum.clBalance ?? ys.casualBalance ?? last?.clBalance;
  const el = sum.elBalance ?? ys.earnedLeaveBalance ?? last?.elBalance;
  const ccl = sum.cclBalance ?? ys.compensatoryOffBalance ?? last?.cclBalance;
  console.log(`  FY ${fy} (service view): CL=${cl} EL=${el} CCL=${ccl} total=${(Number(cl) || 0) + (Number(el) || 0) + (Number(ccl) || 0)}`);
  const cclTrail = months.slice(0, 6).map((m) => ({
    label: m.label,
    cclBal: m.cclBalance,
    cclUsed: m.ccl?.used,
    cclCr: m.policyScheduledCco ?? m.scheduledCco,
  }));
  console.log('  First 6 months CCL snapshot:', JSON.stringify(cclTrail));
}

function rowBalances(row) {
  const months = row.registerMonths || [];
  const last = months.length ? months[months.length - 1] : null;
  const sum = row.summary || {};
  const ys = row.yearSnapshot || {};
  const cl = sum.clBalance ?? ys.casualBalance ?? last?.clBalance;
  const el = sum.elBalance ?? ys.earnedLeaveBalance ?? last?.elBalance;
  const ccl = sum.cclBalance ?? ys.compensatoryOffBalance ?? last?.cclBalance;
  const nCl = Number(cl) || 0;
  const nEl = Number(el) || 0;
  const nCcl = Number(ccl) || 0;
  let txnCount = 0;
  for (const sub of row.monthlySubLedgers || []) {
    const tx = sub.transactions && sub.transactions.length;
    if (tx) txnCount += tx;
    else if (Number.isFinite(Number(sub.transactionCount))) txnCount += Number(sub.transactionCount);
  }
  return { cl: nCl, el: nEl, ccl: nCcl, total: nCl + nEl + nCcl, txnCount };
}

/** After batch recalc: aggregate balances for all active employees in division(s) (current FY). */
async function printDivisionAggregateReport(divisionIds, label) {
  const periodInfo = await dateCycleService.getPeriodInfo(new Date());
  const fy = periodInfo?.financialYear?.name;
  if (!fy) {
    console.log('\n(No FY from dateCycleService; skip division aggregate report)');
    return;
  }
  const divObjectIds = divisionIds.filter(Boolean);
  if (!divObjectIds.length) return;

  console.log('\n========== DIVISION REGISTER REPORT (after recalc) ==========');
  console.log(`Division(s): ${label}`);
  console.log(`Financial year: ${fy}`);

  const rows = [];
  for (const did of divObjectIds) {
    const chunk = await leaveRegisterService.getLeaveRegister({ divisionId: did, financialYear: fy }, null, null);
    const arr = Array.isArray(chunk) ? chunk : chunk.entries || [];
    for (const r of arr) {
      rows.push(r);
    }
  }
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const id = (r.employee?.id || r.employee?._id)?.toString();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(r);
  }
  unique.sort((a, b) => String(a.employee?.empNo || '').localeCompare(String(b.employee?.empNo || '')));

  let tCl = 0;
  let tEl = 0;
  let tCcl = 0;
  let tTxn = 0;
  console.log('\nemp_no\tname\tCL\tEL\tCCL\ttotal\ttxns');
  for (const row of unique) {
    const b = rowBalances(row);
    tCl += b.cl;
    tEl += b.el;
    tCcl += b.ccl;
    tTxn += b.txnCount;
    const name = String(row.employee?.name || row.employee?.employee_name || '').replace(/\s+/g, ' ');
    console.log(`${row.employee?.empNo ?? '—'}\t${name}\t${b.cl}\t${b.el}\t${b.ccl}\t${b.total}\t${b.txnCount}`);
  }
  console.log('\n--- Totals (sum across employees above) ---');
  console.log(`Employees listed: ${unique.length}`);
  console.log(`Sum CL: ${tCl}\tSum EL: ${tEl}\tSum CCL: ${tCcl}\tSum all: ${tCl + tEl + tCcl}\tTxn rows: ${tTxn}`);
  console.log('============================================================\n');
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI (or MONGO_URI) not set');

  const dryRun = parseBool(process.env.DRY_RUN, false) || parseArg('dryRun') === 'true';
  const all = process.argv.includes('--all');
  const empNo = parseArg('empNo') || process.env.EMP_NO;
  const divisionToken = parseArg('divisionName');
  const limit = Math.max(0, Number(parseArg('limit') || process.env.LIMIT || 0));

  let divisionReport = null;
  let doSyncApply = true;
  const rebuildCarryTx = parseBool(parseArg('rebuildCarryTx'), false);
  if (parseArg('syncMonthlyApply') != null) {
    doSyncApply = parseBool(parseArg('syncMonthlyApply'), true);
  }

  const tpmRaw = parseArg('throughPayrollMonth');
  const tpyRaw = parseArg('throughPayrollYear');
  let throughPayrollMonth = null;
  let throughPayrollYear = null;
  if (tpmRaw != null && String(tpmRaw).trim() !== '') {
    const n = parseInt(String(tpmRaw).trim(), 10);
    if (Number.isFinite(n)) throughPayrollMonth = n;
  }
  if (tpyRaw != null && String(tpyRaw).trim() !== '') {
    const n = parseInt(String(tpyRaw).trim(), 10);
    if (Number.isFinite(n)) throughPayrollYear = n;
  }
  if ((throughPayrollMonth != null || throughPayrollYear != null) && !rebuildCarryTx) {
    console.warn('[recalculate_leave_register_balances] --throughPayrollMonth/--throughPayrollYear ignored without --rebuildCarryTx true');
  }
  if (throughPayrollYear != null && throughPayrollMonth == null) {
    console.warn('[recalculate_leave_register_balances] --throughPayrollYear requires --throughPayrollMonth; year cap ignored');
    throughPayrollYear = null;
  }

  await mongoose.connect(uri);
  console.log('[recalculate_leave_register_balances] connected\n');
  if (rebuildCarryTx && throughPayrollMonth != null) {
    console.log(
      `Carry scope: payroll months <= ${throughPayrollMonth}${throughPayrollYear != null ? ` (year ${throughPayrollYear})` : ''}\n`
    );
  }

  let employees = [];
  if (all) {
    const q = Employee.find({ is_active: true }).select('_id emp_no employee_name').sort({ emp_no: 1 }).lean();
    const list = await q;
    employees = limit > 0 ? list.slice(0, limit) : list;
    console.log(`Mode: --all (${employees.length} employees${limit ? `, limit ${limit}` : ''})`);
  } else if (divisionToken) {
    const divisions = await Division.find({
      name: new RegExp(escapeRegex(String(divisionToken).trim()), 'i'),
    })
      .select('_id name')
      .lean();
    if (!divisions.length) {
      console.error('No division matched name/substring:', divisionToken);
      process.exit(1);
    }
    divisionReport = { ids: divisions.map((d) => d._id), label: divisions.map((d) => d.name).join(' | ') };
    console.log(`Mode: --divisionName "${divisionToken}" → ${divisions.map((d) => d.name).join(', ')}`);
    const divIds = divisions.map((d) => d._id);
    const q = Employee.find({ division_id: { $in: divIds }, is_active: true })
      .select('_id emp_no employee_name')
      .sort({ emp_no: 1 })
      .lean();
    const list = await q;
    employees = limit > 0 ? list.slice(0, limit) : list;
    console.log(`Employees in scope: ${employees.length}${limit ? ` (limit ${limit})` : ''}`);
  } else if (empNo) {
    const emp = await Employee.findOne({
      $or: [{ emp_no: String(empNo) }, { emp_no: Number(empNo) }],
    })
      .select('_id emp_no employee_name')
      .lean();
    if (!emp) {
      console.error('Employee not found:', empNo);
      process.exit(1);
    }
    employees = [emp];
    console.log(`Mode: --empNo ${empNo} (${emp.employee_name || 'n/a'})`);
  } else {
    console.error('Pass --empNo <number>, --all [--limit N], or --divisionName <substring>');
    process.exit(1);
  }

  if (divisionToken && parseArg('syncMonthlyApply') == null) {
    doSyncApply = true;
  }

  let ok = 0;
  let fail = 0;
  let totalCarryYearsTouched = 0;
  let totalCarryEdgesApplied = 0;
  let totalCarriesPosted = 0;
  let totalCarryErrors = 0;
  for (const e of employees) {
    const id = e._id;
    const label = `${e.emp_no} ${e.employee_name || ''}`.trim();
    try {
      if (dryRun) {
        console.log(
          `[dry-run] would recalc: ${label}${rebuildCarryTx ? ' + rebuild carry tx' : ''}`
        );
        ok++;
        continue;
      }
      let carryMeta = null;
      if (rebuildCarryTx) {
        carryMeta = await rebuildCarryTransactionsForEmployee(id, {
          throughPayrollMonth,
          throughPayrollYear,
        });
        totalCarryYearsTouched += carryMeta.yearsTouched;
        totalCarryEdgesApplied += carryMeta.edgesApplied;
        totalCarriesPosted += Number(carryMeta.carriesPosted) || 0;
        totalCarryErrors += Number(carryMeta.carryErrors) || 0;
      }
      await recalcOne(id);
      if (doSyncApply) await syncMonthApplySnapshot(id);
      await syncRegisterDisplaySnapshot(id);
      console.log(
        `OK: ${label}${doSyncApply ? '' : ' (no monthly apply sync)'}${
          carryMeta
            ? ` [carry: FY rows=${carryMeta.yearsTouched}, closedBefore=${carryMeta.carryCutoffIso || 'n/a'}, months=${carryMeta.edgesApplied}${carryMeta.throughPayrollMonth != null ? ` (cap pm<=${carryMeta.throughPayrollMonth}${carryMeta.throughPayrollYear != null ? ` py=${carryMeta.throughPayrollYear}` : ''})` : ''}, poolTxPairs=${carryMeta.carriesPosted || 0}${carryMeta.carryErrors ? `, carryErr=${carryMeta.carryErrors}` : ''}${carryMeta.carryFailed ? `, carryFailed=${carryMeta.carryFailMessage || 'yes'}` : ''}]`
            : ''
        }`
      );
      if (employees.length === 1) {
        await printRegisterSummary(id);
      }
      if (carryMeta?.carryErrorSamples?.length) {
        console.warn(`  carry errors (sample): ${JSON.stringify(carryMeta.carryErrorSamples)}`);
      }
      ok++;
    } catch (err) {
      fail++;
      console.error(`FAIL: ${label}`, err.message || err);
    }
  }

  console.log(`\nDone. success=${ok} failed=${fail}${dryRun ? ' (dry run)' : ''}`);
  if (rebuildCarryTx && !dryRun) {
    console.log(
      `Carry reconciliation totals: FY rows touched=${totalCarryYearsTouched}, closed payroll months run=${totalCarryEdgesApplied}, pool carry tx pairs posted=${totalCarriesPosted}${totalCarryErrors ? `, carry errors=${totalCarryErrors}` : ''}`
    );
  }

  if (!dryRun && divisionReport && divisionReport.ids.length) {
    await printDivisionAggregateReport(divisionReport.ids, divisionReport.label);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
