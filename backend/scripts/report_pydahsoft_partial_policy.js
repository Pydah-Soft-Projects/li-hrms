/**
 * Recalculate monthly summary for one division, then report PARTIAL days and partialDayRule policy.
 *
 * Usage (from backend):
 *   node scripts/report_pydahsoft_partial_policy.js
 *   MONTH=2026-05 DIVISION=pydahsoft node scripts/report_pydahsoft_partial_policy.js
 *   RECALC=0 MONTH=2026-05 DIVISION=pydahsoft node scripts/report_pydahsoft_partial_policy.js  # report only
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const Division = require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');

async function resolveDivision(nameOrCode) {
  const q = String(nameOrCode || 'pydahsoft').trim();
  const div = await Division.findOne({
    $or: [
      { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { code: q.toUpperCase() },
    ],
  })
    .select('_id name code')
    .lean();
  return div;
}

function policyLabel(rule) {
  if (!rule || rule.applied !== true) return 'NOT_APPLIED';
  const code = rule.ruleCode || '?';
  const f = rule.firstHalfStatus || '-';
  const s = rule.secondHalfStatus || '-';
  const lop = rule.lopPortion != null ? rule.lopPortion : '-';
  return `${code} | ${f}/${s} | LOP=${lop}`;
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  let monthStr = process.env.MONTH;
  if (!monthStr || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
    const now = new Date();
    monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const [year, monthNumber] = monthStr.split('-').map(Number);
  const divisionKey = (process.env.DIVISION || 'pydahsoft').trim();
  const doRecalc = process.env.RECALC !== '0';

  const settings = await AttendanceSettings.getSettings();
  const processingMode = settings?.processingMode?.mode || 'unknown';
  const partialPayableFlag = settings?.featureFlags?.partialDaysContributeToPayableShifts === true;

  const div = await resolveDivision(divisionKey);
  if (!div) {
    console.error('Division not found:', divisionKey);
    process.exit(1);
  }

  const employees = await Employee.find({ division_id: div._id, is_active: { $ne: false } })
    .select('_id emp_no employee_name')
    .sort({ emp_no: 1 })
    .lean();

  const periodInfo = await dateCycleService.getPeriodInfo(
    createISTDate(`${year}-${String(monthNumber).padStart(2, '0')}-15`)
  );
  const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;

  const lines = [];
  const log = (s) => {
    console.log(s);
    lines.push(s);
  };

  log('='.repeat(72));
  log('PYDAHSOFT PARTIAL POLICY REPORT');
  log('='.repeat(72));
  log(`Division: ${div.name} (${div.code || 'no-code'}) id=${div._id}`);
  log(`Payroll month label: ${monthStr} (year=${year}, monthNumber=${monthNumber})`);
  log(`Pay period: ${startDateStr} .. ${endDateStr}`);
  log(`Processing mode: ${processingMode}`);
  log(`partialDaysContributeToPayableShifts: ${partialPayableFlag}`);
  log(`Recalc before report: ${doRecalc ? 'YES' : 'NO (RECALC=0)'}`);
  log(`Active employees: ${employees.length}`);
  log('');

  const recalcErrors = [];
  if (doRecalc) {
    log('--- Recalculating monthly summary ---');
    let ok = 0;
    let fail = 0;
    for (const emp of employees) {
      try {
        await calculateMonthlySummary(emp._id, emp.emp_no, year, monthNumber);
        ok += 1;
        if (ok % 20 === 0) log(`  ... ${ok}/${employees.length} done`);
      } catch (err) {
        fail += 1;
        recalcErrors.push({ emp_no: emp.emp_no, error: err.message });
        log(`  FAIL ${emp.emp_no}: ${err.message}`);
      }
    }
    log(`Recalc complete: success=${ok}, failed=${fail}`);
    log('');
  }

  const empNos = employees.map((e) => String(e.emp_no).trim().toUpperCase());
  const partialDailies = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: startDateStr, $lte: endDateStr },
    status: 'PARTIAL',
  })
    .select(
      'employeeNumber date status payableShifts inTime outTime totalWorkingHours policyMeta.partialDayRule rosterFirstHalfNonWorking rosterSecondHalfNonWorking notes'
    )
    .sort({ employeeNumber: 1, date: 1 })
    .lean();

  const applied = [];
  const notApplied = [];
  const byRuleCode = new Map();

  for (const d of partialDailies) {
    const rule = d.policyMeta?.partialDayRule;
    const row = {
      emp_no: d.employeeNumber,
      date: d.date,
      payableShifts: d.payableShifts,
      inTime: d.inTime,
      outTime: d.outTime,
      hours: d.totalWorkingHours,
      roster: `${d.rosterFirstHalfNonWorking || '-'}/${d.rosterSecondHalfNonWorking || '-'}`,
      policy: policyLabel(rule),
      note: rule?.note || d.notes || '',
    };
    if (rule?.applied === true) {
      applied.push(row);
      const code = rule.ruleCode || 'UNKNOWN';
      byRuleCode.set(code, (byRuleCode.get(code) || 0) + 1);
    } else {
      notApplied.push(row);
    }
  }

  log('--- SUMMARY ---');
  log(`Total PARTIAL days in period: ${partialDailies.length}`);
  log(`  policy applied=true:  ${applied.length}`);
  log(`  policy applied=false: ${notApplied.length}`);
  if (byRuleCode.size) {
    log('  By ruleCode:');
    for (const [code, n] of [...byRuleCode.entries()].sort()) {
      log(`    ${code}: ${n}`);
    }
  }
  log('');

  if (notApplied.length) {
    log('--- PARTIAL days WITHOUT policy (applied=false or missing) ---');
    for (const r of notApplied) {
      log(
        `  ${r.emp_no} ${r.date} pay=${r.payableShifts} roster=${r.roster} IN=${r.inTime || '-'} OUT=${r.outTime || '-'} | ${r.policy}`
      );
      if (r.note) log(`      note: ${String(r.note).slice(0, 120)}`);
    }
    log('');
  }

  if (applied.length) {
    log('--- PARTIAL days WITH policy applied ---');
    for (const r of applied) {
      log(
        `  ${r.emp_no} ${r.date} pay=${r.payableShifts} roster=${r.roster} | ${r.policy}`
      );
    }
    log('');
  }

  // Per-employee rollup
  const byEmp = new Map();
  for (const d of partialDailies) {
    const e = d.employeeNumber;
    if (!byEmp.has(e)) byEmp.set(e, { partial: 0, applied: 0, notApplied: 0 });
    const b = byEmp.get(e);
    b.partial += 1;
    if (d.policyMeta?.partialDayRule?.applied === true) b.applied += 1;
    else b.notApplied += 1;
  }
  log('--- Per employee (only if has PARTIAL days) ---');
  for (const emp of employees) {
    const key = String(emp.emp_no).trim().toUpperCase();
    const b = byEmp.get(key);
    if (!b) continue;
    log(
      `  ${key} ${emp.employee_name || ''}: partial=${b.partial}, policy_applied=${b.applied}, no_policy=${b.notApplied}`
    );
  }

  if (recalcErrors.length) {
    log('');
    log('--- Recalc errors ---');
    for (const e of recalcErrors) log(`  ${e.emp_no}: ${e.error}`);
  }

  const outDir = path.resolve(__dirname, '../../tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `pydahsoft_partial_policy_${monthStr.replace('-', '')}.txt`
  );
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  log('');
  log(`Report saved: ${outFile}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
