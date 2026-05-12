/**
 * Overnight Shift Segment Detection Test
 * Tests how the system detects overnight shifts (e.g., 22:00 - 06:00) with segment logic
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Division = require('../departments/model/Division');
const Shift = require('../shifts/model/Shift');
const EmployeeGroup = require('../employees/model/EmployeeGroup');
const { detectAndAssignShift } = require('../shifts/services/shiftDetectionService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

async function testOvernightShifts() {
  try {
    console.log('\n[OVERNIGHT SHIFT TEST] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms-leave');
    console.log('Connected to MongoDB');

    // Create test data
    console.log('\n=== Creating Test Data ===');
    
    // Division
    let division = await Division.findOne({ code: 'OVN_DIV' });
    if (!division) {
      division = await Division.create({
        code: 'OVN_DIV',
        name: 'OVERNIGHT TEST DIVISION',
        isActive: true,
      });
    }
    console.log(`Division: ${division.name} (${division.code})`);

    // Department
    let department = await Department.findOne({ code: 'OVN_DEPT' });
    if (!department) {
      department = await Department.create({
        code: 'OVN_DEPT',
        name: 'OVERNIGHT TEST DEPT',
        division_id: division._id,
        isActive: true,
      });
    }
    console.log(`Department: ${department.name}`);

    // Employee Group
    let empGroup = await EmployeeGroup.findOne({ code: 'OVN_GROUP' });
    if (!empGroup) {
      empGroup = await EmployeeGroup.create({
        code: 'OVN_GROUP',
        name: 'OVERNIGHT TEST GROUP',
        division_id: division._id,
        department_id: department._id,
        isActive: true,
      });
    }
    console.log(`Employee Group: ${empGroup.name}`);

    // Employee
    let employee = await Employee.findOne({ emp_no: 'OVN001' });
    if (!employee) {
      employee = await Employee.create({
        emp_no: 'OVN001',
        firstName: 'Night',
        lastName: 'Worker',
        email: 'night@test.com',
        division_id: division._id,
        department_id: department._id,
        designation_id: null,
        employeeGroup_id: empGroup._id,
        dateOfJoining: new Date('2025-01-01'),
        isActive: true,
      });
    }
    console.log(`Employee: ${employee.firstName} ${employee.lastName} (${employee.emp_no})`);

    // Create Overnight Shift with Segments
    let shiftName = `OVERNIGHT SEGMENT SHIFT (22:00-06:00) - ${Date.now()}`;
    let overnightShift = await Shift.findOne({ name: shiftName });
    if (!overnightShift) {
      overnightShift = await Shift.create({
        name: shiftName,
        code: `OVERNIGHT_SHIFT_${Date.now()}`,
        startTime: '22:00',
        endTime: '06:00',
        duration: 8,
        gracePeriod: 15,
        isActive: true,
        firstHalf: {
          name: 'Night Half',
          startTime: '22:00',
          endTime: '02:00',
          duration: 4,
          gracePeriod: 15,
          payableShifts: 0.5,
        },
        secondHalf: {
          name: 'Early Morning Half',
          startTime: '02:00',
          endTime: '06:00',
          duration: 4,
          gracePeriod: 10,
          payableShifts: 0.5,
        },
        break: {
          startTime: '02:00',
          endTime: '02:00',
          duration: 0,
        },
        divisions: [division._id],
        departments: [department._id],
      });
    }
    console.log(`\nOvernight Shift Created: ${overnightShift.name}`);
    console.log(`  First Half: ${overnightShift.firstHalf.startTime} - ${overnightShift.firstHalf.endTime} (Grace: ${overnightShift.firstHalf.gracePeriod}min)`);
    console.log(`  Second Half: ${overnightShift.secondHalf.startTime} - ${overnightShift.secondHalf.endTime} (Grace: ${overnightShift.secondHalf.gracePeriod}min)`);

    // Test Scenarios
    console.log('\n=== Testing 6 Overnight Scenarios ===\n');

    const testDate = '2026-05-12';
    const scenarios = [
      {
        name: 'Full night on-time',
        inTime: createISTDate(testDate, '22:05'),  // 5 min late to first half (within 15 min grace)
        outTime: createISTDate(testDate, '06:00'), // +1 day
      },
      {
        name: 'Late arrival (beyond grace)',
        inTime: createISTDate(testDate, '22:30'),  // 30 min late (exceeds 15 min grace)
        outTime: createISTDate(testDate, '06:00'),
      },
      {
        name: 'Early out (before break)',
        inTime: createISTDate(testDate, '22:00'),
        outTime: createISTDate(testDate, '01:45'), // 15 min early out of first half
      },
      {
        name: 'Second half only',
        inTime: createISTDate(testDate, '02:05'),  // Start second half
        outTime: createISTDate(testDate, '06:00'),
      },
      {
        name: 'First half only',
        inTime: createISTDate(testDate, '22:00'),
        outTime: createISTDate(testDate, '02:00'), // Complete first half, no second
      },
      {
        name: 'Partial overlap (cross break)',
        inTime: createISTDate(testDate, '01:30'),  // Last 30 min of first half
        outTime: createISTDate(testDate, '03:00'), // 1 hour of second half
      },
    ];

    // Update inTime and outTime to next day for overnight shifts
    scenarios.forEach(scenario => {
      scenario.inTime = new Date(scenario.inTime.getTime()); // Keep as-is
      scenario.outTime = new Date(scenario.outTime.getTime() + 24 * 60 * 60 * 1000); // Add 1 day for end
    });

    for (const scenario of scenarios) {
      console.log(`---\n${scenario.name}`);
      console.log(`IN  : ${scenario.inTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`);
      console.log(`OUT : ${scenario.outTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`);

      try {
        const result = await detectAndAssignShift(
          'OVN001',
          testDate,
          scenario.inTime,
          scenario.outTime,
          { globalLateInGrace: 15, globalEarlyOutGrace: 15 }
        );

        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error(`ERROR: ${error.message}`);
      }
    }

    console.log('\n✓ Overnight Shift Testing Completed');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

testOvernightShifts();
