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
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const dateCycleService = require('../leaves/services/dateCycleService');

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

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI (or MONGO_URI) not set');

  const dryRun = parseBool(process.env.DRY_RUN, false) || parseArg('dryRun') === 'true';
  const all = process.argv.includes('--all');
  const empNo = parseArg('empNo') || process.env.EMP_NO;
  const limit = Math.max(0, Number(parseArg('limit') || process.env.LIMIT || 0));

  await mongoose.connect(uri);
  console.log('[recalculate_leave_register_balances] connected\n');

  let employees = [];
  if (all) {
    const q = Employee.find({ is_active: true }).select('_id emp_no employee_name').sort({ emp_no: 1 }).lean();
    const list = await q;
    employees = limit > 0 ? list.slice(0, limit) : list;
    console.log(`Mode: --all (${employees.length} employees${limit ? `, limit ${limit}` : ''})`);
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
    console.error('Pass --empNo <number> or --all [--limit N]');
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  for (const e of employees) {
    const id = e._id;
    const label = `${e.emp_no} ${e.employee_name || ''}`.trim();
    try {
      if (dryRun) {
        console.log(`[dry-run] would recalc: ${label}`);
        ok++;
        continue;
      }
      await recalcOne(id);
      console.log(`OK: ${label}`);
      if (employees.length === 1) {
        await printRegisterSummary(id);
      }
      ok++;
    } catch (err) {
      fail++;
      console.error(`FAIL: ${label}`, err.message || err);
    }
  }

  console.log(`\nDone. success=${ok} failed=${fail}${dryRun ? ' (dry run)' : ''}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
