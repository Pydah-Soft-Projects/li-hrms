const mongoose = require('mongoose');
require('dotenv').config();

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const EmployeeGroup = require('../employees/model/EmployeeGroup');
const Employee = require('../employees/model/Employee');
const Shift = require('../shifts/model/Shift');
const Settings = require('../settings/model/Settings');
const { detectAndAssignShift } = require('../shifts/services/shiftDetectionService');
const { createISTDate } = require('../shared/utils/dateUtils');

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
      description: 'Shift with first and second halves for half-day segment detection',
      isActive: true,
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

  await upsertSetting(
    'custom_employee_grouping_enabled',
    true,
    'Enable strict employee group filtering when assigning shifts',
    'feature_control'
  );

  return { division, department, employeeGroup, employee, shift };
}

function buildISTDate(dateStr, timeStr) {
  return createISTDate(dateStr, timeStr);
}

function formatResult(result) {
  return {
    success: result.success,
    message: result.message || null,
    assignedShift: result.shiftName || null,
    source: result.source || null,
    matchMethod: result.matchMethod || null,
    lateInMinutes: result.lateInMinutes,
    earlyOutMinutes: result.earlyOutMinutes,
    totalPayableShifts: result.totalPayableShifts,
    shiftSegments: result.shiftSegments || [],
    continuityWarnings: result.continuityWarnings || [],
  };
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to MongoDB: ${MONGODB_URI}`);

  const { division, department, employeeGroup, employee, shift } = await ensureTestData();

  console.log('\n=== Test Data Created ===');
  console.log(`Division: ${division.name} (${division.code})`);
  console.log(`Department: ${department.name} (${department.code})`);
  console.log(`Employee Group: ${employeeGroup.name} (${employeeGroup.code})`);
  console.log(`Employee: ${employee.employee_name} (${employee.emp_no})`);
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

  console.log('\n=== Running Shift Detection Scenarios ===');

  for (const scenario of scenarios) {
    const inTime = buildISTDate(scenario.date, scenario.in);
    const outTime = buildISTDate(scenario.date, scenario.out);
    const result = await detectAndAssignShift(employee.emp_no, scenario.date, inTime, outTime, globalConfig);

    console.log('\n---');
    console.log(`${scenario.description} | Date: ${scenario.date}`);
    console.log(`IN  : ${scenario.in}`);
    console.log(`OUT : ${scenario.out}`);
    console.log(JSON.stringify(formatResult(result), null, 2));
  }

  await mongoose.disconnect();
  console.log('\nSimulation completed.');
}

main().catch((error) => {
  console.error('Simulation failed:', error);
  process.exit(1);
});
