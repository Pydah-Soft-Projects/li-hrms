/**
 * Read-only division shift-mode report for current pay period.
 * Uses stored AttendanceDaily + MonthlyAttendanceSummary (no DB writes).
 *
 * Usage:
 *   node scripts/report_division_shift_mode_june.js
 *   node scripts/report_division_shift_mode_june.js --year 2026 --month 6
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const dateCycleService = require('../leaves/services/dateCycleService');
const {
  getOrgAttendanceContext,
  getProcessingModeForDivisionId,
  getProcessingModeForEmployee,
} = require('../attendance/services/processingModeResolutionService');
const { getAllDatesInRange, extractISTComponents } = require('../shared/utils/dateUtils');

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    out: path.resolve(__dirname, '../../tmp/division-shift-mode-report.html'),
  };
  for (const raw of argv) {
    if (raw.startsWith('--year=')) out.year = Number(raw.split('=')[1]);
    else if (raw.startsWith('--month=')) out.month = Number(raw.split('=')[1]);
    else if (raw.startsWith('--out=')) out.out = path.resolve(raw.split('=')[1]);
  }
  return out;
}

function normEmp(v) {
  return String(v || '').trim().toUpperCase();
}

function toDateStr(v) {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return extractISTComponents(new Date(v)).dateStr;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function modeLabel(pm) {
  return pm?.mode === 'single_shift' ? 'Single-shift' : 'Multi-shift';
}

function overrideLabel(div) {
  const pm = div.processingMode;
  if (!pm || pm.useOrgDefault !== false) return 'Inherit org';
  return `Override → ${modeLabel(pm)}`;
}

function sumBreakdown(rows) {
  const b = {};
  for (const r of rows) {
    const st = r.status || 'UNKNOWN';
    b[st] = (b[st] || 0) + 1;
  }
  return b;
}

function breakdownStr(b) {
  return Object.entries(b)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
}

function buildHtml(report) {
  const { generatedAt, period, orgMode, divisions, totals } = report;

  const divSections = divisions
    .map((div) => {
      const empRows = div.employees
        .map(
          (e) => `<tr>
            <td>${esc(e.empNo)}</td>
            <td>${esc(e.name)}</td>
            <td>${esc(e.dept)}</td>
            <td><code>${esc(e.effectiveMode)}</code></td>
            <td>${e.dailyCount}</td>
            <td>${esc(e.dailyBreakdown)}</td>
            <td>${e.summary ? `${e.summary.totalPresentDays ?? 0} / ${e.summary.totalPartialDays ?? 0} / ${e.summary.totalAbsentDays ?? 0} / ${e.summary.totalPayableShifts ?? 0}` : '—'}</td>
            <td>${e.summary?.totalLeaves ?? 0} / ${e.summary?.totalODs ?? 0}</td>
            <td>${e.multiShiftDays ?? 0}</td>
          </tr>`
        )
        .join('');

      return `<section class="division">
        <h2>${esc(div.name)} <span class="code">(${esc(div.code)})</span></h2>
        <div class="meta">
          <span><b>Config:</b> ${esc(div.configLabel)}</span>
          <span><b>Effective:</b> <code>${esc(div.effectiveMode)}</code></span>
          <span><b>Employees:</b> ${div.employeeCount}</span>
          <span><b>Division totals:</b> ${div.totals.present} pres · ${div.totals.partial} part · ${div.totals.absent} abs · ${div.totals.payable} pay</span>
        </div>
        <div class="chips">${Object.entries(div.totals.statusMix)
          .map(([k, v]) => `<span class="chip">${esc(k)}: ${v}</span>`)
          .join('')}</div>
        <table>
          <thead>
            <tr>
              <th>Emp#</th><th>Name</th><th>Dept</th><th>Mode</th><th>Days</th>
              <th>Daily status mix</th><th>Summary pres/part/abs/pay</th><th>Leave/OD</th><th>Days &gt;1 shift</th>
            </tr>
          </thead>
          <tbody>${empRows || '<tr><td colspan="9">No employees</td></tr>'}</tbody>
        </table>
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Division Shift Mode Report — ${esc(period.label)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #f8fafc; color: #0f172a; }
    h1 { margin-bottom: 4px; }
    .sub { color: #64748b; margin-bottom: 24px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 28px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .card b { display: block; font-size: 22px; }
    .division { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
    .division h2 { margin: 0 0 8px; }
    .code { color: #6366f1; font-weight: normal; }
    .meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #475569; margin-bottom: 10px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .chip { background: #f1f5f9; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    code { background: #eef2ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; }
    .legend { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Division shift-mode report (stored data)</h1>
  <p class="sub">Generated ${esc(generatedAt)} · Pay period ${esc(period.start)} → ${esc(period.end)} · Org default: <code>${esc(orgMode)}</code></p>
  <div class="legend">
    <b>How to read this</b><br/>
    Each division shows its <em>effective</em> processing mode (override or org default). Employee rows use stored daily attendance and monthly summary for this pay period.
    <b>Days &gt;1 shift</b> counts days where AttendanceDaily has multiple shift segments — meaningful mainly under multi-shift rules.
  </div>
  <div class="summary">
    <div class="card">Divisions<b>${totals.divisions}</b></div>
    <div class="card">Employees<b>${totals.employees}</b></div>
    <div class="card">With summary<b>${totals.withSummary}</b></div>
    <div class="card">Override divisions<b>${totals.overrideDivisions}</b></div>
    <div class="card">Multi-shift days<b>${totals.multiShiftDays}</b></div>
  </div>
  ${divSections}
</body>
</html>`;
}

async function main() {
  const args = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected');

  const period = await dateCycleService.getPayrollCycleForMonth(args.year, args.month);
  const startDate = toDateStr(period.startDate);
  const endDate = toDateStr(period.endDate);
  const dates = getAllDatesInRange(startDate, endDate);
  const monthStr = `${args.year}-${String(args.month).padStart(2, '0')}`;

  const { processingMode: orgPm } = await getOrgAttendanceContext();
  const orgMode = orgPm.mode;

  const divisions = await Division.find({ isActive: { $ne: false } })
    .select('name code processingMode')
    .sort({ name: 1 })
    .lean();

  const report = {
    generatedAt: new Date().toISOString(),
    period: { label: monthStr, start: startDate, end: endDate },
    orgMode,
    divisions: [],
    totals: {
      divisions: 0,
      employees: 0,
      withSummary: 0,
      overrideDivisions: 0,
      multiShiftDays: 0,
    },
  };

  console.log(`Period: ${startDate} → ${endDate} (${dates.length} days)`);
  console.log(`Org mode: ${orgMode}\n`);

  for (const div of divisions) {
    const effectivePm = await getProcessingModeForDivisionId(div._id);
    const hasOverride = div.processingMode?.useOrgDefault === false;

    const employees = await Employee.find({
      is_active: { $ne: false },
      division_id: div._id,
    })
      .select('emp_no employee_name department_id')
      .populate('department_id', 'name')
      .sort({ emp_no: 1 })
      .lean();

    const divBlock = {
      name: div.name,
      code: div.code,
      configLabel: overrideLabel(div),
      effectiveMode: effectivePm.mode,
      employeeCount: employees.length,
      employees: [],
      totals: { present: 0, partial: 0, absent: 0, payable: 0, statusMix: {} },
    };

    if (hasOverride) report.totals.overrideDivisions += 1;

    console.log(`── ${div.name} (${div.code}) ──`);
    console.log(`   ${divBlock.configLabel} → ${divBlock.effectiveMode} | ${employees.length} employees`);

    for (const emp of employees) {
      const empNo = normEmp(emp.emp_no);
      const empPm = await getProcessingModeForEmployee(emp);

      const dailies = await AttendanceDaily.find({
        employeeNumber: empNo,
        date: { $gte: startDate, $lte: endDate },
      })
        .select('status payableShifts totalShifts shifts')
        .lean();

      const breakdown = sumBreakdown(dailies);
      const multiShiftDays = dailies.filter((d) => (d.totalShifts || d.shifts?.length || 0) > 1).length;

      const summary = await MonthlyAttendanceSummary.findOne({
        employeeId: emp._id,
        month: monthStr,
      })
        .select('totalPresentDays totalPartialDays totalAbsentDays totalPayableShifts totalLeaves totalODs')
        .lean();

      if (summary) report.totals.withSummary += 1;

      divBlock.totals.present += Number(summary?.totalPresentDays || 0);
      divBlock.totals.partial += Number(summary?.totalPartialDays || 0);
      divBlock.totals.absent += Number(summary?.totalAbsentDays || 0);
      divBlock.totals.payable += Number(summary?.totalPayableShifts || 0);
      for (const [k, v] of Object.entries(breakdown)) {
        divBlock.totals.statusMix[k] = (divBlock.totals.statusMix[k] || 0) + v;
      }

      report.totals.employees += 1;
      report.totals.multiShiftDays += multiShiftDays;

      divBlock.employees.push({
        empNo,
        name: emp.employee_name || '',
        dept: emp.department_id?.name || '—',
        effectiveMode: empPm.mode,
        dailyCount: dailies.length,
        dailyBreakdown: breakdownStr(breakdown) || '—',
        multiShiftDays,
        summary,
      });
    }

    divBlock.totals.present = Math.round(divBlock.totals.present * 100) / 100;
    divBlock.totals.partial = Math.round(divBlock.totals.partial * 100) / 100;
    divBlock.totals.absent = Math.round(divBlock.totals.absent * 100) / 100;
    divBlock.totals.payable = Math.round(divBlock.totals.payable * 100) / 100;

    report.divisions.push(divBlock);
    report.totals.divisions += 1;
    console.log(
      `   Totals: pres=${divBlock.totals.present} part=${divBlock.totals.partial} abs=${divBlock.totals.absent} pay=${divBlock.totals.payable}`
    );
    console.log('');
  }

  const html = buildHtml(report);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, html, 'utf8');
  const jsonOut = args.out.replace(/\.html$/i, '.json');
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');

  console.log('═'.repeat(60));
  console.log(`HTML: ${args.out}`);
  console.log(`JSON: ${jsonOut}`);
  console.log(`Divisions: ${report.totals.divisions} | Employees: ${report.totals.employees} | Override divisions: ${report.totals.overrideDivisions}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
