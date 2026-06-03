const mongoose = require('mongoose');
require('dotenv').config();

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const EmployeeGroup = require('../employees/model/EmployeeGroup');
const Employee = require('../employees/model/Employee');
const Shift = require('../shifts/model/Shift');
const Settings = require('../settings/model/Settings');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const { createISTDate } = require('../shared/utils/dateUtils');
const { partialSingleShiftHalfCreditsAsync } = require('../attendance/utils/attendanceHalfPresence');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function upsertSetting(key, value, description, category = 'feature_control') {
  return Settings.findOneAndUpdate(
    { key },
    { key, value, description, category },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function ensureTestData() {
  const division = await Division.findOneAndUpdate(
    { code: 'SIM_DIV' },
    {
      name: 'SIMULATION DIVISION',
      code: 'SIM_DIV',
      description: 'Auto-created division for half-day shift detection smoke test',
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const division2 = await Division.findOneAndUpdate(
    { code: 'SIM_DIV2' },
    {
      name: 'SIMULATION DIVISION 2',
      code: 'SIM_DIV2',
      description: 'Auto-created division for per-division segment override test',
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const employeeGroup = await EmployeeGroup.findOneAndUpdate(
    { code: 'SIM_GROUP' },
    {
      name: 'SIMULATION EMPLOYEE GROUP',
      code: 'SIM_GROUP',
      description: 'Employee group used for shift assignment testing',
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const shift = await Shift.findOneAndUpdate(
    { name: 'SIM HALF-DAY SEGMENT SHIFT' },
    {
      name: 'SIM HALF-DAY SEGMENT SHIFT',
      startTime: '09:00',
      endTime: '18:00',
      duration: 8,
      payableShifts: 1,
      gracePeriod: 10,
      description: 'Shift with first and second halves for half-day segment detection',
      isActive: true,
      segmentOverrides: [
        {
          division: division._id,
          firstHalf: {
            startTime: '09:00',
            endTime: '13:00',
            duration: 4,
            gracePeriod: 10,
            payableShifts: 0.5,
          },
          break: {
            startTime: '13:00',
            endTime: '14:00',
          },
          secondHalf: {
            startTime: '14:00',
            endTime: '18:00',
            duration: 4,
            gracePeriod: 8,
            payableShifts: 0.5,
          },
        },
        // Same shift, different division override timings (split shifted by 30 mins)
        {
          division: division2._id,
          firstHalf: {
            startTime: '09:00',
            endTime: '13:30',
            duration: 4.5,
            gracePeriod: 10,
            payableShifts: 0.5,
          },
          break: {
            startTime: '13:30',
            endTime: '14:30',
          },
          secondHalf: {
            startTime: '14:30',
            endTime: '18:00',
            duration: 3.5,
            gracePeriod: 8,
            payableShifts: 0.5,
          },
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const department = await Department.findOneAndUpdate(
    { code: 'SIM_DEPT' },
    {
      name: 'SIMULATION DEPARTMENT',
      code: 'SIM_DEPT',
      description: 'Auto-created department for half-day shift detection smoke test',
      isActive: true,
      divisionDefaults: [
        {
          division: division._id,
          shifts: [
            {
              shiftId: shift._id,
              gender: 'All',
              employee_group_id: employeeGroup._id,
            },
          ],
        },
        {
          division: division2._id,
          shifts: [
            {
              shiftId: shift._id,
              gender: 'All',
              employee_group_id: employeeGroup._id,
            },
          ],
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const employee = await Employee.findOneAndUpdate(
    { emp_no: 'SIM001' },
    {
      emp_no: 'SIM001',
      employee_name: 'Simulated Half-Day Test User',
      division_id: division._id,
      department_id: department._id,
      employee_group_id: employeeGroup._id,
      doj: createISTDate('2025-01-01'),
      is_active: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const employee2 = await Employee.findOneAndUpdate(
    { emp_no: 'SIM002' },
    {
      emp_no: 'SIM002',
      employee_name: 'Simulated Half-Day Test User 2',
      division_id: division2._id,
      department_id: department._id,
      employee_group_id: employeeGroup._id,
      doj: createISTDate('2025-01-01'),
      is_active: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await upsertSetting(
    'custom_employee_grouping_enabled',
    true,
    'Enable strict employee group filtering when assigning shifts',
    'feature_control'
  );

  return { division, division2, department, employeeGroup, employee, employee2, shift };
}

function buildISTDate(dateStr, timeStr) {
  return createISTDate(dateStr, timeStr);
}

function formatResult(result) {
  return {
    success: result?.success ?? null,
    message: result?.message || null,
    assignedShift: result?.assignedShift || result?.shiftName || null,
    source: result?.source || null,
    matchMethod: result?.matchMethod || null,
    lateInMinutes: result?.lateInMinutes ?? null,
    earlyOutMinutes: result?.earlyOutMinutes ?? null,
    totalPayableShifts: result?.totalPayableShifts ?? null,
    shiftSegments: result?.shiftSegments || result?.shiftAssignments || [],
    attendanceDaily: result?.attendanceDaily || null,
  };
}

function pickPrimaryShift(daily) {
  const shifts = Array.isArray(daily?.shifts) ? daily.shifts : [];
  return shifts.find((s) => s && s.inTime && s.outTime) || shifts.find((s) => s && (s.inTime || s.outTime)) || shifts[0] || null;
}

async function createRawLogsForScenario(employeeNumber, date, inTime, outTime) {
  const source = 'biometric-realtime';
  await AttendanceRawLog.deleteMany({ employeeNumber, date, source });

  const logs = [
    {
      employeeNumber,
      timestamp: inTime,
      type: 'IN',
      subType: 'CHECK-IN',
      source,
      date,
      rawData: { simulated: true, event: 'IN' },
    },
  ];

  if (outTime) {
    logs.push({
      employeeNumber,
      timestamp: outTime,
      type: 'OUT',
      subType: 'CHECK-OUT',
      source,
      date,
      rawData: { simulated: true, event: 'OUT' },
    });
  }

  await AttendanceRawLog.insertMany(logs);
  return await AttendanceRawLog.find({ employeeNumber, date, source }).sort({ timestamp: 1 }).lean();
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to MongoDB: ${MONGODB_URI}`);

  const { division, division2, department, employeeGroup, employee, employee2, shift } = await ensureTestData();

  console.log('\n=== Test Data Created ===');
  console.log(`Division: ${division.name} (${division.code})`);
  console.log(`Division 2: ${division2.name} (${division2.code})`);
  console.log(`Department: ${department.name} (${department.code})`);
  console.log(`Employee Group: ${employeeGroup.name} (${employeeGroup.code})`);
  console.log(`Employee: ${employee.employee_name} (${employee.emp_no})`);
  console.log(`Employee 2: ${employee2.employee_name} (${employee2.emp_no})`);
  console.log(`Shift: ${shift.name} ${shift.startTime}-${shift.endTime}`);

  const globalConfig = {
    late_in_grace_time: 7,
    early_out_grace_time: 7,
    processingMode: {},
  };

  const scenarios = [
    {
      date: '2026-05-06',
      description: 'Full day on-time',
      in: '09:00',
      out: '18:00',
    },
    {
      date: '2026-05-07',
      description: 'First half only',
      in: '09:00',
      out: '12:45',
    },
    {
      date: '2026-05-08',
      description: 'Second half only',
      in: '14:05',
      out: '18:00',
    },
    {
      date: '2026-05-09',
      description: 'Late first-half beyond grace',
      in: '09:25',
      out: '18:00',
    },
    {
      date: '2026-05-10',
      description: 'Early out second-half beyond grace',
      in: '09:00',
      out: '17:40',
    },
    {
      date: '2026-05-11',
      description: 'Partial overlap across both halves',
      in: '12:30',
      out: '15:00',
    },
  ];

  console.log('\n=== Running Attendance Processing Scenarios ===');

  const runForEmployee = async (empNo, label) => {
    for (const scenario of scenarios) {
      const inTime = buildISTDate(scenario.date, scenario.in);
      const outTime = buildISTDate(scenario.date, scenario.out);

      await createRawLogsForScenario(empNo, scenario.date, inTime, outTime);

      const rawLogs = await AttendanceRawLog.find({ employeeNumber: empNo, date: scenario.date, source: 'biometric-realtime' })
        .sort({ timestamp: 1 })
        .lean();

      const result = await processMultiShiftAttendance(empNo, scenario.date, rawLogs, globalConfig);
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: scenario.date }).lean();
      const primary = pickPrimaryShift(daily);
      const credits = daily ? await partialSingleShiftHalfCreditsAsync(daily, scenario.date) : null;

      console.log('\n---');
      console.log(`${label} | ${scenario.description} | Date: ${scenario.date}`);
      console.log(`IN  : ${scenario.in}`);
      console.log(`OUT : ${scenario.out}`);
      console.log(JSON.stringify({
        dailyStatus: daily?.status || null,
        dailyPayable: daily?.payableShifts ?? null,
        halfCredits: credits || null,
        primaryShift: primary ? {
          shiftId: primary.shiftId || null,
          shiftName: primary.shiftName || null,
          payableShift: primary.payableShift ?? null,
          shiftSegments: primary.shiftSegments || [],
          segmentTotalPayableShifts: primary.segmentTotalPayableShifts ?? null,
          segmentContinuityWarnings: primary.segmentContinuityWarnings || [],
        } : null,
        engineResult: formatResult(result),
      }, null, 2));
    }
  };

  await runForEmployee(employee.emp_no, `${division.code}/${employee.emp_no}`);
  await runForEmployee(employee2.emp_no, `${division2.code}/${employee2.emp_no}`);

  await mongoose.disconnect();
  console.log('\nSimulation completed.');
}

main().catch((error) => {
  console.error('Simulation failed:', error);
  process.exit(1);
});
