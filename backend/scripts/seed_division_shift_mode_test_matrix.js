/**
 * Division shift-mode test matrix: divisions, shifts, employees, punches, processing, report.
 *
 * Usage:
 *   node scripts/seed_division_shift_mode_test_matrix.js
 *   node scripts/seed_division_shift_mode_test_matrix.js --teardown
 *   node scripts/seed_division_shift_mode_test_matrix.js --full-month
 *   node scripts/seed_division_shift_mode_test_matrix.js --full-month --year=2026 --month=6
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const EmployeeGroup = require('../employees/model/EmployeeGroup');
const Shift = require('../shifts/model/Shift');
const Settings = require('../settings/model/Settings');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const {
  getProcessingModeForEmployee,
  getProcessingModeForDivisionId,
} = require('../attendance/services/processingModeResolutionService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');

const PREFIX = 'DSMODE';
const TEST_BASE = '2026-06-22';
const REPORT_PATH = path.resolve(__dirname, '../../tmp/division-shift-mode-test-matrix-report.html');

const PUNCH_SCENARIOS = {
  FULL_DAY: { offset: 0, punches: [['09:00', 'IN'], ['21:00', 'OUT']], label: 'Single IN/OUT 9–21' },
  LUNCH_TWO_PAIR: {
    offset: 1,
    punches: [['09:00', 'IN'], ['13:00', 'OUT'], ['13:30', 'IN'], ['21:00', 'OUT']],
    label: 'Lunch split (2 IN + 2 OUT)',
  },
  PARTIAL_IN: { offset: 2, punches: [['09:00', 'IN']], label: 'IN only (partial)' },
  HALF_MORNING: { offset: 3, punches: [['09:00', 'IN'], ['13:00', 'OUT']], label: 'Morning half 9–13' },
};

const DIVISION_MATRIX = [
  {
    code: `${PREFIX}_INH`,
    name: `${PREFIX} Inherit Org Default`,
    processingMode: { useOrgDefault: true },
    employees: [
      { suffix: '01', scenario: 'LUNCH_TWO_PAIR', note: 'Org single_shift: collapses to 1 shift' },
      { suffix: '02', scenario: 'FULL_DAY', note: 'Full day single pair' },
    ],
  },
  {
    code: `${PREFIX}_MULT`,
    name: `${PREFIX} Override Multi-Shift`,
    processingMode: {
      useOrgDefault: false,
      mode: 'multi_shift',
      maxShiftsPerDay: 3,
      continuousSplitThresholdHours: 14,
      splitMinGapHours: 3,
    },
    employees: [
      { suffix: '01', scenario: 'LUNCH_TWO_PAIR', note: 'Should split into 2 shifts' },
      { suffix: '02', scenario: 'FULL_DAY', note: 'One continuous shift' },
    ],
  },
  {
    code: `${PREFIX}_SST`,
    name: `${PREFIX} Override Single Strict`,
    processingMode: {
      useOrgDefault: false,
      mode: 'single_shift',
      strictCheckInOutOnly: true,
    },
    employees: [
      { suffix: '01', scenario: 'LUNCH_TWO_PAIR', note: 'Strict single: first IN / last OUT' },
      { suffix: '02', scenario: 'PARTIAL_IN', note: 'Partial day (no OUT)' },
    ],
  },
  {
    code: `${PREFIX}_SFX`,
    name: `${PREFIX} Override Single Flexible`,
    processingMode: {
      useOrgDefault: false,
      mode: 'single_shift',
      strictCheckInOutOnly: false,
      postShiftOutMarginHours: 4,
    },
    employees: [
      { suffix: '01', scenario: 'LUNCH_TWO_PAIR', note: 'Flexible single-shift pairing' },
      { suffix: '02', scenario: 'HALF_MORNING', note: 'Short morning block' },
    ],
  },
];

function parseArgs() {
  const out = {
    teardown: process.argv.includes('--teardown'),
    reportOnly: process.argv.includes('--report-only'),
    fullMonth: process.argv.includes('--full-month'),
    year: 2026,
    month: 6,
  };
  for (const raw of process.argv.slice(2)) {
    if (raw.startsWith('--year=')) out.year = Number(raw.split('=')[1]);
    else if (raw.startsWith('--month=')) out.month = Number(raw.split('=')[1]);
  }
  return out;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return extractISTComponents(d).dateStr;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function ensureShift() {
  return Shift.findOneAndUpdate(
    { name: `${PREFIX} 9-21 SEGMENTED` },
    {
      name: `${PREFIX} 9-21 SEGMENTED`,
      startTime: '09:00',
      endTime: '21:00',
      duration: 12,
      payableShifts: 1,
      gracePeriod: 15,
      isActive: true,
      firstHalf: {
        startTime: '09:00',
        endTime: '13:00',
        duration: 4,
        minDuration: 3,
        gracePeriod: 15,
        payableShifts: 0.5,
      },
      break: { startTime: '13:00', endTime: '13:30' },
      secondHalf: {
        startTime: '13:30',
        endTime: '21:00',
        duration: 7.5,
        minDuration: 3,
        gracePeriod: 15,
        payableShifts: 0.5,
      },
    },
    { upsert: true, new: true }
  );
}

async function ensureGroup() {
  return EmployeeGroup.findOneAndUpdate(
    { code: `${PREFIX}_GRP` },
    { name: `${PREFIX} Test Group`, code: `${PREFIX}_GRP`, isActive: true },
    { upsert: true, new: true }
  );
}

async function upsertDivision(block, shift, group) {
  const division = await Division.findOneAndUpdate(
    { code: block.code },
    {
      name: block.name,
      code: block.code,
      description: `Auto test matrix for division processingMode (${block.code})`,
      isActive: true,
      processingMode: block.processingMode,
      shifts: [{ shiftId: shift._id, gender: 'All', employee_group_id: group._id }],
    },
    { upsert: true, new: true }
  );

  const deptCode = `${block.code}_DEPT`;
  const department = await Department.findOneAndUpdate(
    { code: deptCode },
    {
      name: `${block.name} Department`,
      code: deptCode,
      isActive: true,
      divisionDefaults: [
        {
          division: division._id,
          shifts: [{ shiftId: shift._id, gender: 'All', employee_group_id: group._id }],
        },
      ],
    },
    { upsert: true, new: true }
  );

  await Division.findByIdAndUpdate(division._id, {
    $addToSet: { departments: department._id },
  });

  return { division, department };
}

async function upsertEmployee(empNo, name, division, department, group) {
  return Employee.findOneAndUpdate(
    { emp_no: empNo },
    {
      emp_no: empNo,
      employee_name: name,
      division_id: division._id,
      department_id: department._id,
      employee_group_id: group._id,
      gender: 'Male',
      doj: createISTDate('2025-01-01'),
      is_active: true,
    },
    { upsert: true, new: true }
  );
}

async function clearEmployeeData(empNo) {
  await AttendanceRawLog.deleteMany({ employeeNumber: empNo });
  await AttendanceDaily.deleteMany({ employeeNumber: empNo });
}

async function clearEmployeeDataForRange(empNo, fromStr, toStr) {
  await AttendanceRawLog.deleteMany({
    employeeNumber: empNo,
    date: { $gte: fromStr, $lte: toStr },
  });
  await AttendanceDaily.deleteMany({
    employeeNumber: empNo,
    date: { $gte: fromStr, $lte: toStr },
  });
}

async function processDayForEmployee(empNo, dateStr, punchDefs, generalConfig) {
  const rawDocs = await insertPunches(empNo, dateStr, punchDefs);
  const windowStart = createISTDate(addDays(dateStr, -1), '00:00');
  const windowEnd = createISTDate(addDays(dateStr, 1), '23:59');
  const allLogs = await AttendanceRawLog.find({
    employeeNumber: empNo,
    timestamp: { $gte: windowStart, $lte: windowEnd },
  })
    .sort({ timestamp: 1 })
    .lean();

  await AttendanceDaily.deleteMany({ employeeNumber: empNo, date: dateStr });
  const proc = await processMultiShiftAttendance(
    empNo,
    dateStr,
    logsForProcessing(empNo, allLogs),
    generalConfig
  );
  await recalculateOnAttendanceUpdate(empNo, dateStr);
  return { rawDocs, proc };
}

async function insertPunches(empNo, dateStr, punchDefs) {
  const docs = [];
  let seq = 0;
  for (const [time, type] of punchDefs) {
    seq += 1;
    const timestamp = createISTDate(dateStr, time);
    docs.push({
      employeeNumber: empNo,
      timestamp,
      type,
      punch_state: type === 'IN' ? 0 : 1,
      source: 'manual',
      date: dateStr,
      rawData: { testMatrix: PREFIX, seq },
    });
  }
  await AttendanceRawLog.deleteMany({ employeeNumber: empNo, date: dateStr });
  if (docs.length) await AttendanceRawLog.insertMany(docs);
  return docs;
}

function logsForProcessing(empNo, allLogs) {
  return allLogs.map((log, i) => ({
    _id: log._id,
    id: log._id,
    employeeNumber: empNo,
    timestamp: log.timestamp,
    type: log.type,
    punch_state: log.punch_state,
    source: log.source,
  }));
}

async function teardown() {
  const finalEmpList = DIVISION_MATRIX.flatMap((b) =>
    b.employees.map((e) => `${b.code}${e.suffix}`)
  );

  for (const empNo of finalEmpList) {
    await clearEmployeeData(empNo);
    await Employee.deleteOne({ emp_no: empNo });
    await MonthlyAttendanceSummary.deleteMany({ emp_no: empNo });
  }

  for (const block of DIVISION_MATRIX) {
    const deptCode = `${block.code}_DEPT`;
    await Department.deleteOne({ code: deptCode });
    await Division.deleteOne({ code: block.code });
  }

  await Shift.deleteOne({ name: `${PREFIX} 9-21 SEGMENTED` });
  await EmployeeGroup.deleteOne({ code: `${PREFIX}_GRP` });

  console.log('Teardown complete for', PREFIX, 'test matrix (', finalEmpList.length, 'employees )');
}

async function seedAndRun() {
  const shift = await ensureShift();
  const group = await ensureGroup();

  await Settings.findOneAndUpdate(
    { key: 'custom_employee_grouping_enabled' },
    { key: 'custom_employee_grouping_enabled', value: true, category: 'feature_control' },
    { upsert: true }
  );

  const orgSettings = await AttendanceSettings.getSettings();
  const orgMode = orgSettings.processingMode?.mode || 'multi_shift';
  console.log(`Org processing mode: ${orgMode}`);

  const generalConfig = await Settings.getSettingsByCategory('general');
  const results = [];

  for (const block of DIVISION_MATRIX) {
    const { division, department } = await upsertDivision(block, shift, group);
    const effectiveMode = (await getProcessingModeForDivisionId(division._id)).mode;

    console.log(`\n=== ${block.name} (${block.code}) effective=${effectiveMode} ===`);

    for (const empDef of block.employees) {
      const empNo = `${block.code}${empDef.suffix}`;
      const empName = `${block.name} Employee ${empDef.suffix}`;
      await upsertEmployee(empNo, empName, division, department, group);
      await clearEmployeeData(empNo);

      const scenario = PUNCH_SCENARIOS[empDef.scenario];
      const dateStr = addDays(TEST_BASE, scenario.offset);
      const { rawDocs, proc } = await processDayForEmployee(
        empNo,
        dateStr,
        scenario.punches,
        generalConfig
      );

      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr }).lean();
      const empPm = await getProcessingModeForEmployee(empNo);
      const summary = await MonthlyAttendanceSummary.findOne({
        emp_no: empNo,
        month: '2026-06',
      })
        .select('totalPresentDays totalPartialDays totalAbsentDays totalPayableShifts')
        .lean();

      const row = {
        division: block.name,
        divCode: block.code,
        config: block.processingMode.useOrgDefault !== false ? 'inherit' : block.processingMode.mode,
        effectiveMode: empPm.mode,
        empNo,
        scenario: empDef.scenario,
        scenarioLabel: scenario.label,
        date: dateStr,
        note: empDef.note,
        punchCount: rawDocs.length,
        success: proc?.success,
        status: daily?.status,
        totalShifts: daily?.totalShifts ?? daily?.shifts?.length ?? 0,
        payableShifts: daily?.payableShifts,
        shiftDetails: (daily?.shifts || []).map((s, i) => ({
          n: s.shiftNumber || i + 1,
          in: s.inTime ? extractISTComponents(s.inTime).timeStr?.slice(0, 5) : '-',
          out: s.outTime ? extractISTComponents(s.outTime).timeStr?.slice(0, 5) : '-',
          status: s.status,
          payable: s.payableShift,
        })),
        summary,
      };
      results.push(row);

      console.log(
        `  ${empNo} ${empDef.scenario} → ${daily?.status} shifts=${row.totalShifts} payable=${daily?.payableShifts}`
      );
    }
  }

  return { orgMode, results };
}

async function seedAndRunFullMonth(year, month) {
  const shift = await ensureShift();
  const group = await ensureGroup();

  await Settings.findOneAndUpdate(
    { key: 'custom_employee_grouping_enabled' },
    { key: 'custom_employee_grouping_enabled', value: true, category: 'feature_control' },
    { upsert: true }
  );

  const orgSettings = await AttendanceSettings.getSettings();
  const orgMode = orgSettings.processingMode?.mode || 'multi_shift';
  const generalConfig = await Settings.getSettingsByCategory('general');

  const period = await dateCycleService.getPayrollCycleForMonth(year, month);
  const startDate = extractISTComponents(new Date(period.startDate)).dateStr;
  const endDate = extractISTComponents(new Date(period.endDate)).dateStr;
  const dates = getAllDatesInRange(startDate, endDate);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  console.log(`Org processing mode: ${orgMode}`);
  console.log(`Full-month feed: ${startDate} → ${endDate} (${dates.length} days)\n`);

  const results = [];

  for (const block of DIVISION_MATRIX) {
    const { division, department } = await upsertDivision(block, shift, group);
    const effectiveMode = (await getProcessingModeForDivisionId(division._id)).mode;

    console.log(`\n=== ${block.name} (${block.code}) effective=${effectiveMode} ===`);

    for (const empDef of block.employees) {
      const empNo = `${block.code}${empDef.suffix}`;
      const empName = `${block.name} Employee ${empDef.suffix}`;
      await upsertEmployee(empNo, empName, division, department, group);
      await clearEmployeeDataForRange(empNo, startDate, endDate);

      const scenario = PUNCH_SCENARIOS[empDef.scenario];
      let daysOk = 0;
      let lastDaily = null;

      for (const dateStr of dates) {
        const { proc } = await processDayForEmployee(
          empNo,
          dateStr,
          scenario.punches,
          generalConfig
        );
        if (proc?.success) daysOk += 1;
        lastDaily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr })
          .select('status payableShifts totalShifts shifts')
          .lean();
      }

      const empPm = await getProcessingModeForEmployee(empNo);
      const summary = await MonthlyAttendanceSummary.findOne({
        emp_no: empNo,
        month: monthStr,
      })
        .select('totalPresentDays totalPartialDays totalAbsentDays totalPayableShifts')
        .lean();

      const statusMix = await AttendanceDaily.aggregate([
        { $match: { employeeNumber: empNo, date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const row = {
        division: block.name,
        divCode: block.code,
        config: block.processingMode.useOrgDefault !== false ? 'inherit' : block.processingMode.mode,
        effectiveMode: empPm.mode,
        empNo,
        scenario: empDef.scenario,
        scenarioLabel: scenario.label,
        date: `${startDate}..${endDate}`,
        note: empDef.note,
        punchCount: scenario.punches.length,
        daysFed: dates.length,
        daysProcessed: daysOk,
        success: daysOk === dates.length,
        status: lastDaily?.status,
        totalShifts: lastDaily?.totalShifts ?? lastDaily?.shifts?.length ?? 0,
        payableShifts: lastDaily?.payableShifts,
        statusMix: Object.fromEntries(statusMix.map((s) => [s._id || 'UNKNOWN', s.count])),
        summary,
      };
      results.push(row);

      console.log(
        `  ${empNo} ${empDef.scenario} → ${daysOk}/${dates.length} days | summary pres=${summary?.totalPresentDays ?? 0} pay=${summary?.totalPayableShifts ?? 0}`
      );
    }
  }

  return { orgMode, results, period: { startDate, endDate, monthStr } };
}

function buildHtml({ orgMode, results }) {
  const rows = results
    .map(
      (r) => `<tr>
        <td>${esc(r.divCode)}</td>
        <td><code>${esc(r.config)}</code> → <code>${esc(r.effectiveMode)}</code></td>
        <td>${esc(r.empNo)}</td>
        <td>${esc(r.scenarioLabel)}</td>
        <td>${esc(r.date)}</td>
        <td>${r.punchCount}</td>
        <td><b>${esc(r.status)}</b></td>
        <td>${r.totalShifts}</td>
        <td>${r.payableShifts ?? '—'}</td>
        <td>${r.summary ? `${r.summary.totalPresentDays}/${r.summary.totalPartialDays}/${r.summary.totalPayableShifts}` : '—'}</td>
        <td>${esc(r.note)}</td>
        <td><pre>${esc(JSON.stringify(r.shiftDetails, null, 0))}</pre></td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${PREFIX} Shift Mode Test Matrix</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#f8fafc}
h1{margin:0 0 8px}
.sub{color:#64748b;margin-bottom:20px}
table{border-collapse:collapse;width:100%;font-size:12px;background:#fff}
th,td{border:1px solid #e2e8f0;padding:8px;vertical-align:top;text-align:left}
th{background:#f1f5f9}
code{background:#eef2ff;padding:2px 6px;border-radius:4px}
pre{margin:0;white-space:pre-wrap;font-size:11px}
.legend{background:#fff;border:1px solid #e2e8f0;padding:14px;border-radius:8px;margin-bottom:16px}
</style></head><body>
<h1>${PREFIX} Division Shift-Mode Test Matrix</h1>
<p class="sub">Org mode: <code>${esc(orgMode)}</code> · Test dates from ${TEST_BASE} · Generated ${new Date().toISOString()}</p>
<div class="legend">
<b>Divisions created</b><br/>
${DIVISION_MATRIX.map((d) => `• <b>${esc(d.code)}</b> — ${esc(d.name)} (${d.processingMode.useOrgDefault !== false ? 'inherit org' : 'override ' + d.processingMode.mode})`).join('<br/>')}
</div>
<table>
<thead><tr>
<th>Division</th><th>Config → Effective</th><th>Employee</th><th>Scenario</th><th>Date</th>
<th>Punches</th><th>Status</th><th>Shifts</th><th>Payable</th><th>Jun summary P/Part/Pay</th><th>Expected</th><th>Shift segments</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

async function generateReportFromDb() {
  const orgSettings = await AttendanceSettings.getSettings();
  const orgMode = orgSettings.processingMode?.mode || 'multi_shift';
  const results = [];

  for (const block of DIVISION_MATRIX) {
    const division = await Division.findOne({ code: block.code }).lean();
    if (!division) continue;
    for (const empDef of block.employees) {
      const empNo = `${block.code}${empDef.suffix}`;
      const scenario = PUNCH_SCENARIOS[empDef.scenario];
      const dateStr = addDays(TEST_BASE, scenario.offset);
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr }).lean();
      const empPm = await getProcessingModeForEmployee(empNo);
      const summary = await MonthlyAttendanceSummary.findOne({ emp_no: empNo, month: '2026-06' }).lean();
      results.push({
        division: block.name,
        divCode: block.code,
        config: block.processingMode.useOrgDefault !== false ? 'inherit' : block.processingMode.mode,
        effectiveMode: empPm.mode,
        empNo,
        scenario: empDef.scenario,
        scenarioLabel: scenario.label,
        date: dateStr,
        note: empDef.note,
        punchCount: await AttendanceRawLog.countDocuments({ employeeNumber: empNo, date: dateStr }),
        success: true,
        status: daily?.status,
        totalShifts: daily?.totalShifts ?? daily?.shifts?.length ?? 0,
        payableShifts: daily?.payableShifts,
        shiftDetails: (daily?.shifts || []).map((s, i) => ({
          n: s.shiftNumber || i + 1,
          status: s.status,
          payable: s.payableShift,
        })),
        summary,
      });
    }
  }
  return { orgMode, results };
}

async function main() {
  const args = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  if (args.teardown) {
    await teardown();
    await mongoose.disconnect();
    return;
  }

  let payload;
  if (args.reportOnly) {
    payload = await generateReportFromDb();
  } else if (args.fullMonth) {
    payload = await seedAndRunFullMonth(args.year, args.month);
  } else {
    payload = await seedAndRun();
  }

  const html = buildHtml(payload);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, html, 'utf8');
  fs.writeFileSync(REPORT_PATH.replace('.html', '.json'), JSON.stringify(payload, null, 2));

  console.log('\n' + '═'.repeat(50));
  console.log('Report:', REPORT_PATH);
  console.log('Employees:', payload.results.map((r) => r.empNo).join(', '));

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
