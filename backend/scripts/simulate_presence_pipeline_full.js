/**
 * Full presence-pipeline simulation: DB setup + punches + multi/single shift + auto edge permission on/off
 * Usage: node scripts/simulate_presence_pipeline_full.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const PREFIX = 'SIMPRS';
const DATE_BASE = '2026-06-20';

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const EmployeeGroup = require('../employees/model/EmployeeGroup');
const Employee = require('../employees/model/Employee');
const Shift = require('../shifts/model/Shift');
const Settings = require('../settings/model/Settings');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const AutoEdgePermissionSettings = require('../permissions/model/AutoEdgePermissionSettings');
const Permission = require('../permissions/model/Permission');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');

function punch(dateStr, timeStr, type, empNo, seq) {
  const ts = createISTDate(dateStr, timeStr);
  return {
    employeeNumber: empNo,
    timestamp: ts,
    type,
    punch_state: type === 'IN' ? 0 : 1,
    source: 'manual',
    _id: `sim-${empNo}-${dateStr}-${seq}`,
    id: `sim-${empNo}-${dateStr}-${seq}`,
  };
}

function istTime(d) {
  if (!d) return '-';
  return extractISTComponents(d).timeStr?.slice(0, 5) || new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(d));
}

function summarizeDaily(daily) {
  if (!daily) return { status: 'NO_RECORD', shifts: 0, payable: 0, paths: [] };
  const shifts = (daily.shifts || []).map((s, i) => ({
    n: s.shiftNumber || i + 1,
    in: istTime(s.inTime),
    out: istTime(s.outTime),
    status: s.status,
    payable: s.payableShift,
    path: s.presenceResolutionPath || '-',
    late: s.lateInMinutes,
    early: s.earlyOutMinutes,
    edgeH: s.edgePermissionHours,
    halves: (s.shiftSegments || []).map((seg) => `${seg.segmentName}:${seg.present ? 'Y' : 'N'}`).join(' '),
  }));
  return {
    status: daily.status,
    shifts: shifts.length,
    payable: daily.payableShifts,
    paths: shifts.map((s) => s.path),
    shiftDetails: shifts,
  };
}

async function ensureInfrastructure() {
  const division = await Division.findOneAndUpdate(
    { code: `${PREFIX}_DIV` },
    {
      name: `${PREFIX} Simulation Division`,
      code: `${PREFIX}_DIV`,
      isActive: true,
    },
    { upsert: true, new: true }
  );

  const department = await Department.findOneAndUpdate(
    { code: `${PREFIX}_DEPT` },
    {
      name: `${PREFIX} Simulation Department`,
      code: `${PREFIX}_DEPT`,
      isActive: true,
    },
    { upsert: true, new: true }
  );

  const group = await EmployeeGroup.findOneAndUpdate(
    { code: `${PREFIX}_GRP` },
    { name: `${PREFIX} Group`, code: `${PREFIX}_GRP`, isActive: true },
    { upsert: true, new: true }
  );

  const shift = await Shift.findOneAndUpdate(
    { name: `${PREFIX} 9-21 HALF SEGMENT` },
    {
      name: `${PREFIX} 9-21 HALF SEGMENT`,
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
        minDuration: 4,
        gracePeriod: 15,
        payableShifts: 0.5,
      },
      break: { startTime: '13:00', endTime: '13:30', duration: 0.5 },
      secondHalf: {
        startTime: '13:30',
        endTime: '21:00',
        duration: 7.5,
        minDuration: 4,
        gracePeriod: 15,
        payableShifts: 0.5,
      },
    },
    { upsert: true, new: true }
  );

  department.divisionDefaults = [{
    division: division._id,
    shifts: [{ shiftId: shift._id, gender: 'All', employee_group_id: group._id }],
  }];
  await department.save();

  const employee = await Employee.findOneAndUpdate(
    { emp_no: `${PREFIX}001` },
    {
      emp_no: `${PREFIX}001`,
      employee_name: `${PREFIX} Test Employee`,
      division_id: division._id,
      department_id: department._id,
      employee_group_id: group._id,
      gender: 'Male',
      doj: createISTDate('2025-01-01'),
      is_active: true,
    },
    { upsert: true, new: true }
  );

  await Settings.findOneAndUpdate(
    { key: 'custom_employee_grouping_enabled' },
    { key: 'custom_employee_grouping_enabled', value: true, category: 'feature_control' },
    { upsert: true }
  );

  return { division, department, group, shift, employee };
}

async function setProcessingMode(mode) {
  const settings = await AttendanceSettings.getSettings();
  if (!settings.processingMode) settings.processingMode = {};
  settings.processingMode.mode = mode;
  settings.processingMode.strictCheckInOutOnly = mode === 'multi_shift';
  settings.processingMode.maxShiftsPerDay = 3;
  await settings.save();
  return settings.processingMode;
}

async function setAutoEdgePermission(enabled) {
  let doc = await AutoEdgePermissionSettings.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (!doc) {
    doc = new AutoEdgePermissionSettings({ isActive: true });
  }
  doc.isEnabled = enabled;
  doc.applyFor = 'both';
  doc.useSameRulesForBoth = true;
  doc.lateInRules = {
    shiftDurationRanges: [{
      minShiftHours: 10,
      maxShiftHours: 14,
      allowedMinutes: 120,
      minimumMinutes: 15,
      description: '12h shift late-in slab (sim)',
    }],
  };
  doc.earlyOutRules = {
    shiftDurationRanges: [{
      minShiftHours: 10,
      maxShiftHours: 14,
      allowedMinutes: 180,
      minimumMinutes: 30,
      description: '12h shift early-out slab (sim)',
    }],
  };
  doc.isActive = true;
  await doc.save();
  return doc;
}

async function clearDay(empNo, dateStr) {
  await AttendanceRawLog.deleteMany({ employeeNumber: empNo, date: dateStr });
  await AttendanceDaily.deleteMany({ employeeNumber: empNo, date: dateStr });
  const emp = await Employee.findOne({ emp_no: empNo });
  if (emp) {
    await Permission.deleteMany({ employeeId: emp._id, date: dateStr, creationSource: 'auto_edge' });
  }
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return extractISTComponents(d).dateStr;
}

const SCENARIOS = [
  {
    id: 'FULL_DAY',
    dayOffset: 0,
    punches: [['09:00', 'IN'], ['21:00', 'OUT']],
    note: 'Continuous 9-21, no lunch punches',
  },
  {
    id: 'HALF_MORNING',
    dayOffset: 1,
    punches: [['09:00', 'IN'], ['13:00', 'OUT']],
    note: 'Morning only 4h',
  },
  {
    id: 'HALF_AFTERNOON',
    dayOffset: 2,
    punches: [['13:30', 'IN'], ['21:00', 'OUT']],
    note: 'Afternoon only',
  },
  {
    id: 'LUNCH_TWO_PAIR',
    dayOffset: 3,
    punches: [['09:00', 'IN'], ['13:00', 'OUT'], ['13:30', 'IN'], ['21:00', 'OUT']],
    note: 'Proper lunch — multi-shift should be 2 shift rows',
  },
  {
    id: 'LATE_FULL_DAY',
    dayOffset: 4,
    punches: [['11:00', 'IN'], ['21:00', 'OUT']],
    note: 'Late in but 10h ≥ 75% of 12h',
  },
  {
    id: 'BREAK_SKIP',
    dayOffset: 5,
    punches: [['09:18', 'IN'], ['13:41', 'OUT']],
    note: 'Skip lunch, first half break-aware',
  },
  {
    id: 'TOO_SHORT',
    dayOffset: 6,
    punches: [['09:00', 'IN'], ['11:30', 'OUT']],
    note: '2.5h — absent',
  },
  {
    id: 'EARLY_OUT_PERM',
    dayOffset: 7,
    punches: [['09:00', 'IN'], ['17:00', 'OUT']],
    note: '8h work, ~4h early out — auto perm may help when enabled',
    autoPermFocus: true,
  },
  {
    id: 'LATE_IN_PERM',
    dayOffset: 8,
    punches: [['10:30', 'IN'], ['19:30', 'OUT']],
    note: '9h work, 90min late — shift level present; perm documents edge',
    autoPermFocus: true,
  },
];

async function runScenario(empNo, scenario, mode, autoPermEnabled, generalConfig) {
  const dateStr = addDays(DATE_BASE, scenario.dayOffset);
  await clearDay(empNo, dateStr);
  await setProcessingMode(mode);
  await setAutoEdgePermission(autoPermEnabled);

  const rawLogs = scenario.punches.map(([t, type], i) => punch(dateStr, t, type, empNo, i));
  await AttendanceRawLog.insertMany(rawLogs.map((l) => ({
    employeeNumber: l.employeeNumber,
    timestamp: l.timestamp,
    type: l.type,
    punch_state: l.punch_state,
    source: l.source,
    date: dateStr,
  })));

  const result = await processMultiShiftAttendance(empNo, dateStr, rawLogs, generalConfig);
  const daily = result?.dailyRecord
    || await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr }).lean();

  const permCount = await Permission.countDocuments({
    employeeNumber: empNo,
    date: dateStr,
    creationSource: 'auto_edge',
    isActive: true,
  });

  return {
    scenarioId: scenario.id,
    date: dateStr,
    mode,
    autoPermEnabled,
    note: scenario.note,
    success: result?.success,
    ...summarizeDaily(daily),
    autoPermissionsCreated: permCount,
  };
}

async function main() {
  console.log('\n' + '='.repeat(100));
  console.log('PRESENCE PIPELINE FULL SIMULATION');
  console.log('='.repeat(100));
  console.log('DB:', (MONGODB_URI || '').replace(/:[^:@]+@/, ':***@'));

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected.\n');

  const { employee } = await ensureInfrastructure();
  const empNo = employee.emp_no;
  const generalConfig = (await Settings.getSettingsByCategory?.('general')) || {
    late_in_grace_time: 15,
    early_out_grace_time: 15,
  };

  const results = [];

  for (const scenario of SCENARIOS) {
    for (const mode of ['multi_shift', 'single_shift']) {
      const autoPerm = scenario.autoPermFocus ? [false, true] : [false];
      for (const enabled of autoPerm) {
        const row = await runScenario(empNo, scenario, mode, enabled, generalConfig);
        results.push(row);
        console.log(
          `[${row.scenarioId}] ${row.date} | ${mode} | autoPerm=${enabled}`
          + ` → daily=${row.status} payable=${row.payable} shifts=${row.shifts} perms=${row.autoPermissionsCreated}`
        );
        for (const s of row.shiftDetails || []) {
          console.log(
            `    shift#${s.n} ${s.in}-${s.out} | ${s.status} pay=${s.payable} path=${s.path}`
            + ` | late=${s.late ?? 0} early=${s.early ?? 0} edgeH=${s.edgeH ?? 0} | ${s.halves}`
          );
        }
      }
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(100));
  console.log(
    'Scenario'.padEnd(18)
    + 'Mode'.padEnd(14)
    + 'AutoPerm'.padEnd(10)
    + 'Daily'.padEnd(10)
    + 'Pay'.padEnd(6)
    + '#Sh'.padEnd(5)
    + 'Paths'
  );
  console.log('-'.repeat(100));
  for (const r of results) {
    console.log(
      r.scenarioId.padEnd(18)
      + r.mode.padEnd(14)
      + String(r.autoPermEnabled).padEnd(10)
      + String(r.status).padEnd(10)
      + String(r.payable).padEnd(6)
      + String(r.shifts).padEnd(5)
      + (r.paths || []).join(',')
      + (r.autoPermissionsCreated ? ` | perms:${r.autoPermissionsCreated}` : '')
    );
  }

  console.log('\n' + '='.repeat(100));
  console.log('KEY COMPARISONS');
  console.log('='.repeat(100));

  const lunchMulti = results.find((r) => r.scenarioId === 'LUNCH_TWO_PAIR' && r.mode === 'multi_shift');
  const lunchSingle = results.find((r) => r.scenarioId === 'LUNCH_TWO_PAIR' && r.mode === 'single_shift');
  console.log(`LUNCH_TWO_PAIR multi_shift: ${lunchMulti?.shifts} shifts, status=${lunchMulti?.status}, payable=${lunchMulti?.payable}`);
  console.log(`LUNCH_TWO_PAIR single_shift: ${lunchSingle?.shifts} shifts, status=${lunchSingle?.status}, payable=${lunchSingle?.payable}`);

  const earlyOff = results.find((r) => r.scenarioId === 'EARLY_OUT_PERM' && r.mode === 'multi_shift' && !r.autoPermEnabled);
  const earlyOn = results.find((r) => r.scenarioId === 'EARLY_OUT_PERM' && r.mode === 'multi_shift' && r.autoPermEnabled);
  console.log(`EARLY_OUT_PERM autoPerm OFF: status=${earlyOff?.status}, payable=${earlyOff?.payable}, perms=${earlyOff?.autoPermissionsCreated}`);
  console.log(`EARLY_OUT_PERM autoPerm ON:  status=${earlyOn?.status}, payable=${earlyOn?.payable}, perms=${earlyOn?.autoPermissionsCreated}`);

  const fullMulti = results.find((r) => r.scenarioId === 'FULL_DAY' && r.mode === 'multi_shift');
  console.log(`FULL_DAY multi_shift: path=${fullMulti?.paths?.[0]}, halves=${fullMulti?.shiftDetails?.[0]?.halves}`);

  await mongoose.disconnect();
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
