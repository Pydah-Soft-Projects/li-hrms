/**
 * Integration: half-day holiday via POST /api/holidays → roster → attendance.
 *
 * Prereq: backend running, MongoDB, employee RHALF001 (created by test_roster_half_holiday_integration if missing).
 *
 * Run: node scripts/test_half_day_holiday_api.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectMongoDB, closeMongoDB } = require('../config/database');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Shift = require('../shifts/model/Shift');
const User = require('../users/model/User');
const Holiday = require('../holidays/model/Holiday');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const Settings = require('../settings/model/Settings');
const { createISTDate } = require('../shared/utils/dateUtils');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const EMAIL = process.env.ROSTER_HALF_TEST_EMAIL || 'roster-half-test@hrms.local';
const PASSWORD = process.env.ROSTER_HALF_TEST_PASSWORD || 'RosterHalfTest@123';
const EMP_NO = (process.env.ROSTER_HALF_TEST_EMP || 'RHALF001').toUpperCase();

/** Monday — weekday pattern seeded on prior Mondays */
const HOLIDAY_DATE = '2099-02-02';
const PATTERN_DATES = ['2099-01-05', '2099-01-12', '2099-01-19', '2099-01-26'];
const HOLIDAY_NAME = 'AUTO_HALF_DAY_HOLIDAY_TEST';

const results = { passed: 0, failed: 0, skipped: 0 };
const failures = [];
let createdHolidayId = null;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
  results.passed += 1;
}
function fail(msg, detail) {
  const line = detail ? `${msg} — ${detail}` : msg;
  console.log(`  ✗ ${line}`);
  failures.push(line);
  results.failed += 1;
}
function skip(msg) {
  console.log(`  ○ SKIP: ${msg}`);
  results.skipped += 1;
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function login() {
  const res = await request('POST', '/api/auth/login', {
    body: { identifier: EMAIL, password: PASSWORD },
  });
  if (!res.data?.success) throw new Error(res.data?.message || `HTTP ${res.status}`);
  return res.data.data.token;
}

function punchDoc(dateStr, hour, min, type) {
  return {
    employeeNumber: EMP_NO,
    timestamp: createISTDate(dateStr, `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`),
    type,
    source: 'manual',
    date: dateStr,
  };
}

function punchesSecondHalf(dateStr) {
  return [
    punchDoc(dateStr, 14, 0, 'IN'),
    punchDoc(dateStr, 16, 30, 'OUT'),
  ];
}

async function cleanDay(dateStr) {
  await AttendanceRawLog.deleteMany({ employeeNumber: EMP_NO, date: dateStr });
  await AttendanceDaily.deleteMany({ employeeNumber: EMP_NO, date: dateStr });
  await PreScheduledShift.deleteMany({ employeeNumber: EMP_NO, date: dateStr });
}

async function ensureTestUser() {
  let user = await User.findOne({ email: EMAIL });
  if (user) {
    user.password = PASSWORD;
    user.role = 'super_admin';
    user.roles = ['super_admin'];
    user.isActive = true;
    await user.save();
  } else {
    await User.create({
      email: EMAIL,
      password: PASSWORD,
      name: 'Roster Half Test',
      role: 'super_admin',
      roles: ['super_admin'],
      isActive: true,
    });
    pass(`Seeded API user ${EMAIL}`);
  }
}

async function ensureEmployeeAndShift() {
  let emp = await Employee.findOne({ emp_no: EMP_NO }).lean();
  if (!emp) {
    const division = await Division.findOne({ is_active: { $ne: false } }).lean()
      || await Division.findOne().lean();
    const department = division
      ? await Department.findOne({ divisions: division._id }).lean()
      : null;
    emp = await Employee.create({
      emp_no: EMP_NO,
      employee_name: 'Half Day Holiday Tester',
      division_id: division._id,
      department_id: department?._id,
      doj: createISTDate('2020-01-01', '00:00'),
      is_active: true,
    });
    pass(`Created employee ${EMP_NO}`);
  } else {
    pass(`Employee ${EMP_NO} exists`);
  }

  let shift = await Shift.findOne({ isActive: true, startTime: '09:00' }).lean();
  if (!shift) {
    shift = await Shift.create({
      name: 'HalfDay Test Shift',
      code: 'HDAY_TEST',
      startTime: '09:00',
      endTime: '16:30',
      duration: 7.5,
      gracePeriod: 15,
      isActive: true,
    });
    pass('Created test shift');
  } else {
    pass(`Using shift ${shift.code || shift.name}`);
  }

  return { emp, shiftId: shift._id };
}

async function employeesInMapping(emp, mapping) {
  const row = mapping[0];
  const filter = { is_active: { $ne: false } };
  if (row?.division) filter.division_id = row.division;
  if (row?.departments?.length) filter.department_id = { $in: row.departments };
  return Employee.find(filter).select('emp_no').lean();
}

async function seedWeekdayPattern(shiftId, employeeNumbers) {
  for (const empNo of employeeNumbers) {
    for (const d of PATTERN_DATES) {
      await PreScheduledShift.updateOne(
        { employeeNumber: empNo, date: d },
        {
          $set: {
            employeeNumber: empNo,
            date: d,
            shiftId,
            status: null,
            firstHalfStatus: null,
            secondHalfStatus: null,
          },
        },
        { upsert: true }
      );
    }
  }
  pass(`Seeded weekday shift pattern for ${employeeNumbers.length} employee(s)`);
}

async function buildMapping(emp) {
  if (!emp.division_id) {
    const div = await Division.findOne().lean();
    return [{ division: div._id, departments: [], employeeGroups: [] }];
  }
  const depts = emp.department_id ? [emp.department_id] : [];
  return [{ division: emp.division_id, departments: depts, employeeGroups: [] }];
}

async function main() {
  console.log('\n=== Half-Day Holiday API Tests ===\n');
  console.log(`API: ${BASE}`);
  console.log(`User: ${EMAIL}`);
  console.log(`Employee: ${EMP_NO}`);
  console.log(`Holiday date: ${HOLIDAY_DATE}\n`);

  const health = await request('GET', '/health');
  if (health.status !== 200) {
    console.error('Backend not running. Start: cd backend && npm run dev');
    process.exit(1);
  }
  pass('Backend health');

  let token;
  try {
    token = await login();
    pass('API login (super_admin)');
  } catch (e) {
    fail('API login', e.message);
    process.exit(1);
  }

  await connectMongoDB();
  let shiftId;
  let emp;
  try {
    await ensureTestUser();
    const ensured = await ensureEmployeeAndShift();
    emp = ensured.emp;
    shiftId = ensured.shiftId;

    const settingsDoc = await Settings.findOne({ key: 'attendance_settings' }).lean();
    const mode = settingsDoc?.value?.processingMode?.mode || 'multi_shift';
    pass(`Attendance processing mode: ${mode}`);

    await cleanDay(HOLIDAY_DATE);
    const mapping = await buildMapping(emp);
    const scopeEmps = await employeesInMapping(emp, mapping);
    const scopeEmpNos = scopeEmps.map((e) => String(e.emp_no).toUpperCase());
    if (!scopeEmpNos.includes(EMP_NO)) scopeEmpNos.push(EMP_NO);
    await seedWeekdayPattern(shiftId, scopeEmpNos);
    const multiShiftScope = mode === 'multi_shift' ? 'ALL_SEGMENTS' : 'FULL_DAY';

    const createRes = await request('POST', '/api/holidays', {
      token,
      body: {
        name: HOLIDAY_NAME,
        date: HOLIDAY_DATE,
        type: 'Company',
        scope: 'MAPPING',
        divisionMapping: mapping,
        description: 'Half-day holiday API integration test',
        rosterFillMode: 'HOL',
        rosterApplyMode: 'HALF_DAY',
        halfDayType: 'first_half',
        multiShiftScope,
      },
    });

    if (createRes.status !== 200 || !createRes.data?.success) {
      const detail = createRes.data?.error || createRes.data?.message || String(createRes.status);
      fail('POST /api/holidays HALF_DAY', detail);
    } else {
      const holiday = createRes.data.data;
      createdHolidayId = holiday?._id;
      pass(`Created half-day holiday (${createdHolidayId})`);

      if (holiday?.rosterApplyMode === 'HALF_DAY') pass('Holiday.rosterApplyMode = HALF_DAY');
      else fail('Holiday.rosterApplyMode', holiday?.rosterApplyMode);

      if (holiday?.halfDayType === 'first_half') pass('Holiday.halfDayType = first_half');
      else fail('Holiday.halfDayType', holiday?.halfDayType);

      if (mode === 'multi_shift' && holiday?.multiShiftScope === 'ALL_SEGMENTS') {
        pass('Holiday.multiShiftScope = ALL_SEGMENTS');
      } else if (mode !== 'multi_shift') {
        skip('multiShiftScope check (single_shift mode)');
      } else {
        fail('Holiday.multiShiftScope', holiday?.multiShiftScope);
      }

      const affected = createRes.data.affectedEmployees;
      if (typeof affected === 'number' && affected >= 1) {
        pass(`affectedEmployees: ${affected}`);
      } else {
        fail('affectedEmployees', String(affected));
      }
    }

    const roster = await PreScheduledShift.findOne({ employeeNumber: EMP_NO, date: HOLIDAY_DATE }).lean();
    if (!roster) {
      fail('Roster row missing after holiday apply');
    } else {
      if (roster.shiftId) pass('Roster has shiftId (auto-guess)');
      else fail('Roster shiftId missing', JSON.stringify(roster));

      if (roster.firstHalfStatus === 'HOL') pass('Roster firstHalfStatus = HOL');
      else fail('Roster firstHalfStatus', roster.firstHalfStatus);

      if (!roster.secondHalfStatus) pass('Roster secondHalfStatus empty (working half)');
      else fail('Roster secondHalfStatus should be null', roster.secondHalfStatus);

      if (roster.holidayHalfDayType === 'first_half') pass('Roster holidayHalfDayType = first_half');
      else fail('Roster holidayHalfDayType', roster.holidayHalfDayType);

      if (String(roster.sourceHolidayId) === String(createdHolidayId)) {
        pass('Roster sourceHolidayId linked to holiday');
      } else {
        fail('Roster sourceHolidayId', String(roster.sourceHolidayId));
      }

      if (mode === 'multi_shift') {
        if (roster.holidaySegmentScope === 'ALL_SEGMENTS') {
          pass('Roster holidaySegmentScope = ALL_SEGMENTS');
        } else {
          fail('Roster holidaySegmentScope', roster.holidaySegmentScope);
        }
      }

      if (roster.notes && roster.notes.includes(HOLIDAY_NAME)) {
        pass('Roster notes include holiday name');
      } else {
        fail('Roster notes', roster.notes);
      }
    }

    console.log('\n--- Attendance: sync on create (no punches yet) ---\n');
    const dailyAfterCreate = await AttendanceDaily.findOne({
      employeeNumber: EMP_NO,
      date: HOLIDAY_DATE,
    }).lean();
    if (dailyAfterCreate?.rosterFirstHalfNonWorking === 'HOL') {
      pass('Create sync: rosterFirstHalfNonWorking = HOL on AttendanceDaily');
    } else {
      fail('Create sync: rosterFirstHalfNonWorking missing', dailyAfterCreate?.rosterFirstHalfNonWorking);
    }
    if (!dailyAfterCreate?.rosterSecondHalfNonWorking) {
      pass('Create sync: rosterSecondHalfNonWorking empty (working half)');
    } else {
      fail('Create sync: rosterSecondHalfNonWorking', dailyAfterCreate.rosterSecondHalfNonWorking);
    }

    console.log('\n--- Attendance: worked second half on first-half holiday ---\n');
    await AttendanceRawLog.insertMany(punchesSecondHalf(HOLIDAY_DATE));
    await reprocessAttendanceForEmployeeDate(EMP_NO, HOLIDAY_DATE);
    await new Promise((r) => setTimeout(r, 800));

    const daily = await AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: HOLIDAY_DATE }).lean();
    if (!daily) {
      fail('AttendanceDaily missing after reprocess');
    } else {
      if (daily.status === 'HALF_DAY') pass('Attendance status = HALF_DAY');
      else fail('Attendance status', daily.status);

      if (daily.payableShifts === 0.5) pass('payableShifts = 0.5');
      else fail('payableShifts', String(daily.payableShifts));

      if (daily.rosterFirstHalfNonWorking === 'HOL') pass('rosterFirstHalfNonWorking = HOL');
      else fail('rosterFirstHalfNonWorking', daily.rosterFirstHalfNonWorking);
    }

    if (createdHolidayId) {
      const delRes = await request('DELETE', `/api/holidays/${createdHolidayId}`, {
        token,
        body: { onDeleteAction: 'RESTORE_PATTERN' },
      });
      if (delRes.status === 200) pass('Deactivated test holiday (cleanup)');
      else fail('DELETE holiday cleanup', delRes.data?.message || String(delRes.status));
      createdHolidayId = null;
    }

    await cleanDay(HOLIDAY_DATE);
    for (const d of PATTERN_DATES) {
      await PreScheduledShift.deleteMany({ employeeNumber: EMP_NO, date: d });
    }
    pass('Cleaned test roster/attendance dates');
  } finally {
    if (createdHolidayId) {
      await Holiday.updateOne(
        { _id: createdHolidayId },
        { $set: { isActive: false } }
      ).catch(() => {});
    }
    await closeMongoDB().catch(() => mongoose.disconnect());
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`PASSED: ${results.passed}  FAILED: ${results.failed}  SKIPPED: ${results.skipped}`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  • ${f}`));
  }
  console.log('══════════════════════════════════════════════════════════════\n');
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
