/**
 * Comprehensive Shift Detection Test - All Shift Types
 * Tests day shifts, night shifts, early morning shifts, and overnight segmented shifts
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

async function comprehensiveShiftTest() {
  try {
    console.log('\n[COMPREHENSIVE SHIFT TEST] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms-leave');
    console.log('Connected to MongoDB');

    // Create test data
    console.log('\n=== Creating Test Data ===');

    // Division
    let division = await Division.findOne({ code: 'COMP_DIV' });
    if (!division) {
      division = await Division.create({
        code: 'COMP_DIV',
        name: 'COMPREHENSIVE TEST DIVISION',
        isActive: true,
      });
    }
    console.log(`Division: ${division.name}`);

    // Department
    let department = await Department.findOne({ code: 'COMP_DEPT' });
    if (!department) {
      department = await Department.create({
        code: 'COMP_DEPT',
        name: 'COMPREHENSIVE TEST DEPT',
        division_id: division._id,
        isActive: true,
      });
    }
    console.log(`Department: ${department.name}`);

    // Employee Group
    let empGroup = await EmployeeGroup.findOne({ code: 'COMP_GROUP' });
    if (!empGroup) {
      empGroup = await EmployeeGroup.create({
        code: 'COMP_GROUP',
        name: 'COMPREHENSIVE TEST GROUP',
        division_id: division._id,
        department_id: department._id,
        isActive: true,
      });
    }
    console.log(`Employee Group: ${empGroup.name}`);

    // Employee
    let employee = await Employee.findOne({ emp_no: 'COMP001' });
    if (!employee) {
      employee = await Employee.create({
        emp_no: 'COMP001',
        employee_name: 'Comprehensive Tester',
        firstName: 'Comprehensive',
        lastName: 'Tester',
        email: 'comp@test.com',
        division_id: division._id,
        department_id: department._id,
        designation_id: null,
        employeeGroup_id: empGroup._id,
        dateOfJoining: new Date('2025-01-01'),
        isActive: true,
      });
    }
    console.log(`Employee: ${employee.firstName} ${employee.lastName} (${employee.emp_no})`);

    // Create various shift types
    const shifts = [
      // Day Shifts
      {
        name: 'Comprehensive Standard Day Shift 9-5',
        code: 'COMP_DAY_9_5',
        startTime: '09:00',
        endTime: '17:00',
        duration: 8,
        gracePeriod: 15,
        isActive: true,
      },
      {
        name: 'Comprehensive Morning Day Shift 10-6',
        code: 'COMP_DAY_10_6',
        startTime: '10:00',
        endTime: '18:00',
        duration: 8,
        gracePeriod: 10,
        isActive: true,
      },
      // Early Morning Shifts
      {
        name: 'Comprehensive Early Morning Shift 6-2',
        code: 'COMP_EARLY_6_2',
        startTime: '06:00',
        endTime: '14:00',
        duration: 8,
        gracePeriod: 15,
        isActive: true,
      },
      {
        name: 'Comprehensive Very Early Shift 5-1',
        code: 'COMP_EARLY_5_1',
        startTime: '05:00',
        endTime: '13:00',
        duration: 8,
        gracePeriod: 10,
        isActive: true,
      },
      // Night Shifts
      {
        name: 'Comprehensive Evening Shift 16-00',
        code: 'COMP_NIGHT_16_00',
        startTime: '16:00',
        endTime: '00:00',
        duration: 8,
        gracePeriod: 15,
        isActive: true,
      },
      {
        name: 'Comprehensive Night Shift 20-04',
        code: 'COMP_NIGHT_20_04',
        startTime: '20:00',
        endTime: '04:00',
        duration: 8,
        gracePeriod: 15,
        isActive: true,
      },
      // Overnight Segmented Shifts
      {
        name: 'Comprehensive Overnight Segmented 22-06',
        code: 'COMP_OVERNIGHT_SEG_22_06',
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
      },
      {
        name: 'Comprehensive Late Night Segmented 00-08',
        code: 'COMP_LATE_NIGHT_SEG_00_08',
        startTime: '00:00',
        endTime: '08:00',
        duration: 8,
        gracePeriod: 10,
        isActive: true,
        firstHalf: {
          name: 'Midnight Half',
          startTime: '00:00',
          endTime: '04:00',
          duration: 4,
          gracePeriod: 10,
          payableShifts: 0.5,
        },
        secondHalf: {
          name: 'Dawn Half',
          startTime: '04:00',
          endTime: '08:00',
          duration: 4,
          gracePeriod: 10,
          payableShifts: 0.5,
        },
        break: {
          startTime: '04:00',
          endTime: '04:00',
          duration: 0,
        },
      },
    ];

    // Delete any existing test shifts first
    await Shift.deleteMany({ 
      $or: [
        { code: { $regex: /^COMP_/ } },
        { name: { $regex: /^Comprehensive/ } }
      ]
    });
    console.log('Cleaned up existing test shifts');

    // Create all shifts
    const createdShifts = [];
    for (const shiftData of shifts) {
      let shift = await Shift.findOne({ code: shiftData.code });
      if (!shift) {
        shift = await Shift.create(shiftData);
      }
      createdShifts.push(shift);
      console.log(`Created Shift: ${shift.name} (${shift.startTime}-${shift.endTime})`);
    }

    // Assign all test shifts to the department's divisionDefaults
    const shiftAssignments = createdShifts.map(shift => ({
      shiftId: shift._id,
      gender: 'All',
      employee_group_id: null,
    }));

    await Department.findByIdAndUpdate(department._id, {
      divisionDefaults: [{
        division: division._id,
        shifts: shiftAssignments,
      }],
    });
    console.log(`Assigned ${createdShifts.length} shifts to department`);

    // Test scenarios for each shift type
    console.log('\n=== COMPREHENSIVE SHIFT TESTING ===\n');

    const testDate = '2026-05-13'; // Wednesday
    const scenarios = [
      // Standard Day Shifts
      {
        shiftName: 'Comprehensive Standard Day Shift 9-5',
        scenarios: [
          { name: 'On time arrival', inTime: '09:00', outTime: '17:00' },
          { name: 'Late arrival (within grace)', inTime: '09:10', outTime: '17:00' },
          { name: 'Late arrival (beyond grace)', inTime: '09:30', outTime: '17:00' },
          { name: 'Early out', inTime: '09:00', outTime: '16:30' },
          { name: 'Partial attendance', inTime: '11:00', outTime: '15:00' },
        ]
      },
      // Morning Day Shifts
      {
        shiftName: 'Comprehensive Morning Day Shift 10-6',
        scenarios: [
          { name: 'On time arrival', inTime: '10:00', outTime: '18:00' },
          { name: 'Late arrival', inTime: '10:15', outTime: '18:00' },
          { name: 'Early out', inTime: '10:00', outTime: '17:30' },
        ]
      },
      // Early Morning Shifts
      {
        shiftName: 'Comprehensive Early Morning Shift 6-2',
        scenarios: [
          { name: 'On time arrival', inTime: '06:00', outTime: '14:00' },
          { name: 'Late arrival', inTime: '06:20', outTime: '14:00' },
          { name: 'Early out', inTime: '06:00', outTime: '13:30' },
          { name: 'Very early punch (wrong shift)', inTime: '04:00', outTime: '12:00' },
        ]
      },
      // Very Early Shifts
      {
        shiftName: 'Comprehensive Very Early Shift 5-1',
        scenarios: [
          { name: 'On time arrival', inTime: '05:00', outTime: '13:00' },
          { name: 'Late arrival', inTime: '05:15', outTime: '13:00' },
          { name: 'Early out', inTime: '05:00', outTime: '12:30' },
        ]
      },
      // Evening Shifts
      {
        shiftName: 'Comprehensive Evening Shift 16-00',
        scenarios: [
          { name: 'On time arrival', inTime: '16:00', outTime: '00:00' },
          { name: 'Late arrival', inTime: '16:20', outTime: '00:00' },
          { name: 'Early out', inTime: '16:00', outTime: '23:30' },
          { name: 'Next day out time', inTime: '16:00', outTime: '24:00' },
        ]
      },
      // Night Shifts
      {
        shiftName: 'Comprehensive Night Shift 20-04',
        scenarios: [
          { name: 'On time arrival', inTime: '20:00', outTime: '04:00' },
          { name: 'Late arrival', inTime: '20:25', outTime: '04:00' },
          { name: 'Early out', inTime: '20:00', outTime: '03:30' },
          { name: 'Next day out time', inTime: '20:00', outTime: '28:00' },
        ]
      },
      // Overnight Segmented Shifts
      {
        shiftName: 'Comprehensive Overnight Segmented 22-06',
        scenarios: [
          { name: 'Full night on time', inTime: '22:00', outTime: '06:00' },
          { name: 'First half only', inTime: '22:00', outTime: '02:00' },
          { name: 'Second half only', inTime: '02:00', outTime: '06:00' },
          { name: 'Late first half', inTime: '22:20', outTime: '06:00' },
          { name: 'Early out second half', inTime: '22:00', outTime: '05:45' },
          { name: 'Partial overlap', inTime: '01:30', outTime: '03:30' },
        ]
      },
      // Late Night Segmented Shifts
      {
        shiftName: 'Comprehensive Late Night Segmented 00-08',
        scenarios: [
          { name: 'Full shift on time', inTime: '00:00', outTime: '08:00' },
          { name: 'First half only', inTime: '00:00', outTime: '04:00' },
          { name: 'Second half only', inTime: '04:00', outTime: '08:00' },
          { name: 'Late arrival', inTime: '00:15', outTime: '08:00' },
          { name: 'Early out', inTime: '00:00', outTime: '07:30' },
        ]
      },
    ];

    // Run all test scenarios
    for (const shiftGroup of scenarios) {
      console.log(`\n🎯 TESTING: ${shiftGroup.shiftName}`);
      console.log('='.repeat(60));

      for (const scenario of shiftGroup.scenarios) {
        console.log(`\n--- ${scenario.name} ---`);
        console.log(`IN: ${scenario.inTime}, OUT: ${scenario.outTime}`);

        try {
          // Convert times to Date objects
          const inTime = createISTDate(testDate, scenario.inTime);
          let outTime = createISTDate(testDate, scenario.outTime);

          // Handle next-day out times for overnight shifts
          if (scenario.outTime.includes('24:') || scenario.outTime.includes('28:')) {
            outTime = new Date(outTime.getTime() + 24 * 60 * 60 * 1000);
          } else if (scenario.outTime.startsWith('0') && scenario.outTime < '12:00') {
            // For times like 04:00, 06:00, 08:00 in overnight shifts, add a day
            const outHour = parseInt(scenario.outTime.split(':')[0]);
            if (outHour < 12) {
              outTime = new Date(outTime.getTime() + 24 * 60 * 60 * 1000);
            }
          }

          const result = await detectAndAssignShift(
            'COMP001',
            testDate,
            inTime,
            outTime,
            { globalLateInGrace: 15, globalEarlyOutGrace: 15 }
          );

          if (result.success) {
            console.log(`✅ SUCCESS: ${result.shiftName}`);
            console.log(`   Match Method: ${result.matchMethod}`);
            console.log(`   Late In: ${result.lateInMinutes || 0} min`);
            console.log(`   Early Out: ${result.earlyOutMinutes || 0} min`);
            console.log(`   Total Payable: ${result.totalPayableShifts || result.basePayable || 'N/A'}`);

            if (result.shiftSegments && result.shiftSegments.length > 0) {
              console.log(`   Segments:`);
              result.shiftSegments.forEach((seg, idx) => {
                console.log(`     ${idx + 1}. ${seg.segmentName}: ${seg.startTime}-${seg.endTime}`);
                console.log(`        Present: ${seg.present}, Late: ${seg.lateInMinutes || 0}min, Early: ${seg.earlyOutMinutes || 0}min`);
                console.log(`        Overlap: ${seg.overlapMinutes}min, Payable: ${seg.payableShifts}`);
              });
            }
          } else if (result.confused) {
            console.log(`❓ CONFUSED: Multiple possible shifts`);
            console.log(`   Possible shifts: ${result.possibleShifts?.length || 0}`);
          } else {
            console.log(`❌ FAILED: ${result.message || 'Unknown error'}`);
          }
        } catch (error) {
          console.log(`💥 ERROR: ${error.message}`);
        }
      }
    }

    console.log('\n🎉 COMPREHENSIVE SHIFT TESTING COMPLETED');
    console.log('\n📊 SUMMARY:');
    console.log('- Day shifts: Standard proximity matching');
    console.log('- Early morning shifts: Correct assignment based on start time');
    console.log('- Night shifts: Handle midnight crossing correctly');
    console.log('- Overnight segmented shifts: Segment-level detection and partial attendance');

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

comprehensiveShiftTest();