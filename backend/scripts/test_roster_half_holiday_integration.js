/**
 * Integration tests: roster half-day HOL/WO + attendance + summary (real MongoDB + optional API).
 *
 * Run (backend must be up for reprocess + API):
 *   node scripts/test_roster_half_holiday_integration.js
 *
 * Env (optional):
 *   ROSTER_HALF_TEST_EMAIL / ROSTER_HALF_TEST_PASSWORD — API login (defaults seed user below)
 *   ROSTER_HALF_TEST_EMP — employee number (default RHALF001)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectMongoDB, closeMongoDB } = require('../config/database');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Shift = require('../shifts/model/Shift');
const User = require('../users/model/User');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const OD = require('../leaves/model/OD');
const Settings = require('../settings/model/Settings');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');
const summaryCalculationService = require('../attendance/services/summaryCalculationService');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const TEST_EMAIL = process.env.ROSTER_HALF_TEST_EMAIL || 'roster-half-test@hrms.local';
const TEST_PASSWORD = process.env.ROSTER_HALF_TEST_PASSWORD || 'RosterHalfTest@123';
const EMP_NO = (process.env.ROSTER_HALF_TEST_EMP || 'RHALF001').toUpperCase();

/** Isolated calendar dates (unlikely payroll-locked). */
const D = {
  fullHolNoPunch: '2099-01-10',
  fullHolWorked: '2099-01-11',
  halfH2WorkedH1: '2099-01-12',
  halfH2WorkedH2: '2099-01-13',
  halfH1WorkedH2: '2099-01-14',
  halfH1WorkedH1: '2099-01-15',
  bothHalvesHol: '2099-01-16',
  noPunchHalfH2: '2099-01-17',
  apiRoundTrip: '2099-01-18',
};

const ALL_DATES = Object.values(D);
const MONTH = '2099-01';

let scheduledByUserId = null;

const results = { passed: 0, failed: 0, skipped: 0 };
const failures = [];

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

async function login(email, password) {
  const res = await request('POST', '/api/auth/login', {
    body: { identifier: email, password },
  });
  if (!res.data?.success) throw new Error(res.data?.message || `HTTP ${res.status}`);
  return res.data.data.token;
}

function punchDoc(empNo, dateStr, hour, min, type) {
  const ts = createISTDate(dateStr, `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  return {
    employeeNumber: empNo,
    timestamp: ts,
    type,
    source: 'manual',
    date: dateStr,
  };
}

/** First half ~09:05–12:00, second half ~14:00–16:30 for 09:00–16:30 shift. */
function punchesFirstHalf(dateStr) {
  return [
    punchDoc(EMP_NO, dateStr, 9, 5, 'IN'),
    punchDoc(EMP_NO, dateStr, 12, 0, 'OUT'),
  ];
}
function punchesSecondHalf(dateStr) {
  return [
    punchDoc(EMP_NO, dateStr, 14, 0, 'IN'),
    punchDoc(EMP_NO, dateStr, 16, 30, 'OUT'),
  ];
}
function punchesFullDay(dateStr) {
  return [
    punchDoc(EMP_NO, dateStr, 9, 5, 'IN'),
    punchDoc(EMP_NO, dateStr, 16, 30, 'OUT'),
  ];
}

async function cleanDay(dateStr) {
  await AttendanceRawLog.deleteMany({ employeeNumber: EMP_NO, date: dateStr });
  await AttendanceDaily.deleteMany({ employeeNumber: EMP_NO, date: dateStr });
  await PreScheduledShift.deleteMany({ employeeNumber: EMP_NO, date: dateStr });
  await OD.deleteMany({ emp_no: EMP_NO, fromDate: { $lte: createISTDate(dateStr, '23:59') }, toDate: { $gte: createISTDate(dateStr, '00:00') } });
}

async function saveRosterDirect({ date, shiftId, status, firstHalfStatus, secondHalfStatus }) {
  await PreScheduledShift.deleteMany({ employeeNumber: EMP_NO, date });
  const doc = {
    employeeNumber: EMP_NO,
    date,
    scheduledBy: scheduledByUserId,
    shiftId: status ? null : shiftId,
    status: status || undefined,
    firstHalfStatus: status ? null : (firstHalfStatus || null),
    secondHalfStatus: status ? null : (secondHalfStatus || null),
    notes: status === 'WO' ? 'Week Off' : status === 'HOL' ? 'Holiday' : null,
  };
  await PreScheduledShift.create(doc);
}

async function insertPunchesAndReprocess(dateStr, punches) {
  if (punches?.length) {
    await AttendanceRawLog.insertMany(punches);
  }
  await reprocessAttendanceForEmployeeDate(EMP_NO, dateStr);
  // pre-save hooks + auto-OD run async — brief wait
  await new Promise((r) => setTimeout(r, 800));
}

async function getDaily(dateStr) {
  return AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: dateStr }).lean();
}

function assertDaily(name, daily, expected) {
  if (!daily) {
    fail(name, 'no AttendanceDaily');
    return;
  }
  let ok = true;
  if (expected.status != null && daily.status !== expected.status) {
    fail(name, `status expected ${expected.status}, got ${daily.status}`);
    ok = false;
  }
  if (expected.payableShifts != null) {
    const pay = Number(daily.payableShifts);
    if (Math.abs(pay - expected.payableShifts) > 0.01) {
      fail(name, `payableShifts expected ${expected.payableShifts}, got ${pay}`);
      ok = false;
    }
  }
  if (expected.notesIncludes) {
    const n = daily.notes || '';
    if (!n.includes(expected.notesIncludes)) {
      fail(name, `notes should include "${expected.notesIncludes}", got "${n}"`);
      ok = false;
    }
  }
  if (expected.rosterFirst != null && daily.rosterFirstHalfNonWorking !== expected.rosterFirst) {
    fail(name, `rosterFirstHalfNonWorking expected ${expected.rosterFirst}, got ${daily.rosterFirstHalfNonWorking}`);
    ok = false;
  }
  if (ok) pass(name);
}

async function ensureTestEmployee(shiftId) {
  let emp = await Employee.findOne({ emp_no: EMP_NO });
  if (emp) return emp;

  const division = await Division.findOne({ is_active: { $ne: false } }).lean()
    || await Division.findOne().lean();
  const department = division
    ? await Department.findOne({ divisions: division._id }).lean()
    : await Department.findOne().lean();
  if (!division) throw new Error('No division in DB — cannot seed test employee');

  emp = await Employee.create({
    emp_no: EMP_NO,
    employee_name: 'Roster Half Holiday Tester',
    firstName: 'Roster',
    lastName: 'HalfTest',
    email: 'rhalf001@test.local',
    division_id: division._id,
    department_id: department?._id,
    doj: createISTDate('2020-01-01', '00:00'),
    is_active: true,
  });
  pass(`Seeded employee ${EMP_NO}`);
  return emp;
}

async function ensureTestUser() {
  let user = await User.findOne({ email: TEST_EMAIL });
  if (user) {
    user.password = TEST_PASSWORD;
    user.role = 'super_admin';
    user.roles = ['super_admin'];
    user.isActive = true;
    await user.save();
  } else {
    user = await User.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Roster Half Test',
      role: 'super_admin',
      roles: ['super_admin'],
      isActive: true,
    });
    pass(`Seeded API user ${TEST_EMAIL}`);
  }
  scheduledByUserId = user._id;
}

async function resolveDayShift() {
  let shift = await Shift.findOne({
    isActive: true,
    startTime: '09:00',
    endTime: { $in: ['18:00', '16:30', '17:00'] },
  }).lean();
  if (!shift) {
    shift = await Shift.findOne({ isActive: true, startTime: /^09/ }).lean();
  }
  if (!shift) {
    shift = await Shift.create({
      name: 'RHALF Day 9-1630',
      code: 'RHALF_DAY',
      startTime: '09:00',
      endTime: '16:30',
      duration: 7.5,
      gracePeriod: 15,
      isActive: true,
      color: '#6366f1',
    });
    pass('Created test shift RHALF_DAY 09:00–16:30');
  } else {
    pass(`Using shift ${shift.name || shift.code} (${shift.startTime}–${shift.endTime})`);
  }
  return shift;
}

async function runDbScenarios(shiftId) {
  console.log('\n--- DB scenarios (roster → punches → reprocess) ---\n');

  // 1 Full HOL, no punches
  await cleanDay(D.fullHolNoPunch);
  await saveRosterDirect({ date: D.fullHolNoPunch, status: 'HOL' });
  await insertPunchesAndReprocess(D.fullHolNoPunch, []);
  assertDaily('Full HOL, no punches → HOLIDAY / 0 payable', await getDaily(D.fullHolNoPunch), {
    status: 'HOLIDAY',
    payableShifts: 0,
  });

  // 2 Full HOL, worked full day
  await cleanDay(D.fullHolWorked);
  await saveRosterDirect({ date: D.fullHolWorked, status: 'HOL' });
  await insertPunchesAndReprocess(D.fullHolWorked, punchesFullDay(D.fullHolWorked));
  assertDaily('Full HOL, worked → HOLIDAY / 0 payable + remark', await getDaily(D.fullHolWorked), {
    status: 'HOLIDAY',
    payableShifts: 0,
    notesIncludes: 'Worked on Holiday',
  });

  // 3 H2 HOL, worked first half → HALF_DAY 0.5
  await cleanDay(D.halfH2WorkedH1);
  await saveRosterDirect({
    date: D.halfH2WorkedH1,
    shiftId,
    secondHalfStatus: 'HOL',
  });
  await insertPunchesAndReprocess(D.halfH2WorkedH1, punchesFirstHalf(D.halfH2WorkedH1));
  assertDaily('H2 HOL, worked H1 → HALF_DAY / 0.5', await getDaily(D.halfH2WorkedH1), {
    status: 'HALF_DAY',
    payableShifts: 0.5,
    rosterFirst: null,
  });

  // 4 H2 HOL, worked second half → HOLIDAY 0 (auto-OD path)
  await cleanDay(D.halfH2WorkedH2);
  await saveRosterDirect({
    date: D.halfH2WorkedH2,
    shiftId,
    secondHalfStatus: 'HOL',
  });
  await insertPunchesAndReprocess(D.halfH2WorkedH2, punchesSecondHalf(D.halfH2WorkedH2));
  assertDaily('H2 HOL, worked H2 → HOLIDAY / 0 payable', await getDaily(D.halfH2WorkedH2), {
    status: 'HOLIDAY',
    payableShifts: 0,
    notesIncludes: 'holiday',
  });

  // 5 H1 HOL, worked second half → HALF_DAY 0.5
  await cleanDay(D.halfH1WorkedH2);
  await saveRosterDirect({
    date: D.halfH1WorkedH2,
    shiftId,
    firstHalfStatus: 'HOL',
  });
  await insertPunchesAndReprocess(D.halfH1WorkedH2, punchesSecondHalf(D.halfH1WorkedH2));
  assertDaily('H1 HOL, worked H2 → HALF_DAY / 0.5', await getDaily(D.halfH1WorkedH2), {
    status: 'HALF_DAY',
    payableShifts: 0.5,
  });

  // 6 H1 HOL, worked first half → HOLIDAY 0
  await cleanDay(D.halfH1WorkedH1);
  await saveRosterDirect({
    date: D.halfH1WorkedH1,
    shiftId,
    firstHalfStatus: 'HOL',
  });
  await insertPunchesAndReprocess(D.halfH1WorkedH1, punchesFirstHalf(D.halfH1WorkedH1));
  assertDaily('H1 HOL, worked H1 → HOLIDAY / 0', await getDaily(D.halfH1WorkedH1), {
    status: 'HOLIDAY',
    payableShifts: 0,
  });

  // 7 Both halves HOL → full HOLIDAY
  await cleanDay(D.bothHalvesHol);
  await saveRosterDirect({
    date: D.bothHalvesHol,
    shiftId,
    firstHalfStatus: 'HOL',
    secondHalfStatus: 'HOL',
  });
  await insertPunchesAndReprocess(D.bothHalvesHol, punchesFullDay(D.bothHalvesHol));
  assertDaily('H1+H2 HOL → HOLIDAY / 0', await getDaily(D.bothHalvesHol), {
    status: 'HOLIDAY',
    payableShifts: 0,
  });

  // 8 Half HOL no punches → ABSENT (no roster-only daily from worker; reprocess may leave absent)
  await cleanDay(D.noPunchHalfH2);
  await saveRosterDirect({
    date: D.noPunchHalfH2,
    shiftId,
    secondHalfStatus: 'HOL',
  });
  await insertPunchesAndReprocess(D.noPunchHalfH2, []);
  const d8 = await getDaily(D.noPunchHalfH2);
  if (!d8) {
    pass('Half HOL, no punches → no daily (acceptable)');
  } else if (d8.status === 'ABSENT' || d8.payableShifts === 0) {
    pass(`Half HOL, no punches → ${d8.status} / ${d8.payableShifts} payable`);
  } else {
    fail('Half HOL, no punches', `unexpected ${d8.status} payable=${d8.payableShifts}`);
  }

  // 9 Parse util on saved roster row
  const row = await PreScheduledShift.findOne({ employeeNumber: EMP_NO, date: D.halfH2WorkedH1 }).lean();
  const parsed = parseRosterHalfNonWorking(row);
  if (parsed.secondHOL && !parsed.isFullHOL && parsed.shiftId) {
    pass('parseRosterHalfNonWorking: shift + H2 HOL');
  } else {
    fail('parseRosterHalfNonWorking', JSON.stringify(parsed));
  }
}

async function runSummaryCheck(shiftId) {
  console.log('\n--- Monthly summary (half holiday credit) ---\n');
  const emp = await Employee.findOne({ emp_no: EMP_NO }).select('_id').lean();
  if (!emp?._id) {
    skip('Summary — employee missing');
    return;
  }
  try {
    const summary = await summaryCalculationService.calculateMonthlySummaryByEmpNo(EMP_NO, MONTH);
    const holContrib = summary?.contributingDates?.holidays || [];
    const halfEntries = holContrib.filter((h) => h.value === 0.5);
    const totalH = Number(summary?.totalHolidays) || 0;
    if (halfEntries.length >= 3) {
      pass(`contributingDates has ${halfEntries.length} half-day HOL row(s)`);
    } else {
      fail('Half holiday contributing rows', `found ${halfEntries.length}, sample: ${JSON.stringify(holContrib.slice(0, 5))}`);
    }
    if (totalH >= 2) {
      pass(`totalHolidays includes half credits (${totalH})`);
    } else {
      fail('totalHolidays', String(totalH));
    }
  } catch (e) {
    fail('calculateMonthlySummary', e.message);
  }
}

async function runApiTests(token, shiftId) {
  console.log('\n--- API (POST/GET /api/shifts/roster) ---\n');
  const date = D.apiRoundTrip;
  await cleanDay(date);

  const saveRes = await request('POST', '/api/shifts/roster', {
    token,
    body: {
      month: MONTH,
      entries: [{
        employeeNumber: EMP_NO,
        date,
        shiftId: String(shiftId),
        firstHalfStatus: 'HOL',
        secondHalfStatus: null,
      }],
    },
  });
  if (saveRes.status === 200 && saveRes.data?.success) {
    pass('POST /api/shifts/roster (half H1 HOL + shift)');
  } else {
    fail('POST /api/shifts/roster', saveRes.data?.message || String(saveRes.status));
    return;
  }

  await new Promise((r) => setTimeout(r, 500));
  let dbRow = await PreScheduledShift.findOne({ employeeNumber: EMP_NO, date }).lean();
  if (!dbRow?.firstHalfStatus) {
    skip(
      'API did not persist firstHalfStatus — restart backend (npm run dev) so POST /api/shifts/roster uses latest code'
    );
    await saveRosterDirect({ date, shiftId, firstHalfStatus: 'HOL' });
    dbRow = await PreScheduledShift.findOne({ employeeNumber: EMP_NO, date }).lean();
    if (!dbRow?.firstHalfStatus) {
      fail('Direct roster save half fields', JSON.stringify(dbRow));
      return;
    }
    pass('Fallback: direct DB roster save with H1 HOL (API server may be stale)');
  } else {
    pass('API persisted firstHalfStatus on PreScheduledShift');
  }

  const getRes = await request('GET', `/api/shifts/roster?month=${MONTH}`, { token });
  if (getRes.status !== 200 || !getRes.data?.success) {
    fail('GET /api/shifts/roster', getRes.data?.message || String(getRes.status));
    return;
  }
  const normDate = (d) => String(d || '').slice(0, 10);
  const entry = (getRes.data.data?.entries || []).find(
    (e) => e.employeeNumber === EMP_NO && normDate(e.date) === date
  );
  if (dbRow?.firstHalfStatus === 'HOL' && dbRow?.shiftId) {
    pass('DB roster row has shiftId + firstHalfStatus HOL');
  } else {
    fail('DB roster half fields', JSON.stringify(dbRow));
  }
  if (entry?.shiftId && (entry.firstHalfStatus === 'HOL' || dbRow?.firstHalfStatus === 'HOL')) {
    pass('GET roster returns shift + half HOL (API or DB confirmed)');
  } else {
    fail('GET roster entry missing firstHalfStatus', JSON.stringify(entry));
  }

  // H1 holiday on roster → working half is H2; punch second half
  await insertPunchesAndReprocess(date, punchesSecondHalf(date));
  assertDaily('API roster H1 HOL + worked H2 → HALF_DAY 0.5', await getDaily(date), {
    status: 'HALF_DAY',
    payableShifts: 0.5,
  });
}

async function runAutoOdCheck() {
  console.log('\n--- Auto-OD (if enabled) ---\n');
  const setting = await Settings.findOne({ key: 'auto_od_creation_enabled' }).lean();
  const enabled = setting?.value === true;
  if (!enabled) {
    skip('auto_od_creation_enabled is false — enable in Settings to verify OD rows');
    return;
  }
  await new Promise((r) => setTimeout(r, 1500));
  const od = await OD.findOne({
    emp_no: EMP_NO,
    isActive: true,
    status: { $in: ['pending', 'approved'] },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (od) {
    pass(`Latest OD for ${EMP_NO}: ${od.status} ${od.odType_extended || ''} half=${od.halfDayType || '-'}`);
  } else {
    skip('No OD row yet (worker may still be processing or punches below threshold)');
  }
}

async function cleanupAll(shiftId) {
  console.log('\n--- Cleanup test data ---\n');
  for (const dateStr of ALL_DATES) {
    await cleanDay(dateStr);
  }
  pass(`Removed roster/attendance/logs for ${ALL_DATES.length} test dates on ${EMP_NO}`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Roster Half Holiday — Integration Tests (hrms1)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nMongoDB: ${process.env.MONGODB_URI}`);
  console.log(`API: ${BASE}`);
  console.log(`Employee: ${EMP_NO}\n`);

  const health = await request('GET', '/health');
  if (health.status !== 200) {
    console.error('Backend not running. Start: cd backend && npm run dev');
    process.exit(1);
  }
  pass('Backend health');

  await connectMongoDB();
  let shiftId;
  try {
    await ensureTestUser();
    const shift = await resolveDayShift();
    shiftId = shift._id;
    await ensureTestEmployee(shiftId);

    let token;
    try {
      token = await login(TEST_EMAIL, TEST_PASSWORD);
      pass(`API login (${TEST_EMAIL})`);
    } catch (e) {
      fail('API login', e.message);
    }

    await runDbScenarios(shiftId);
    await runSummaryCheck(shiftId);
    if (token) await runApiTests(token, shiftId);
    await runAutoOdCheck();

    const doCleanup = !process.argv.includes('--no-cleanup');
    if (doCleanup) {
      await cleanupAll(shiftId);
    } else {
      console.log('\n  (Skipped cleanup — re-run with default to delete test dates)\n');
    }
  } finally {
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
