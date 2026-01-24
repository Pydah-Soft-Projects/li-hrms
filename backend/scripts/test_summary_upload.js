const mongoose = require('mongoose');
const path = require('path');
const { processSummaryBulkUpload } = require('../pay-register/services/summaryUploadService');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Division = require('../departments/model/Division');
const Shift = require('../shifts/model/Shift');

// Mock UserId for testing
const MOCK_USER_ID = new mongoose.Types.ObjectId();

async function runTest() {
    try {
        console.log('--- Starting Bulk Summary Upload Verification ---\n');

        // 1. Connect to DB
        await mongoose.connect('mongodb://localhost:27017/li-hrms');
        console.log('✅ Connected to Database');

        // 2. Mock or Find a test employee
        let employee = await Employee.findOne({ is_active: true });
        if (!employee) {
            console.log('ℹ️ No active employee found, creating a mock record...');

            let dept = await Department.findOne({});
            if (!dept) {
                dept = await Department.create({ name: 'Test Dept', code: 'TD' });
            }

            employee = await Employee.create({
                employee_name: 'Test Uploader',
                emp_no: 'TEST001',
                department_id: dept._id,
                is_active: true
            });
            console.log(`✅ Created Mock Employee: ${employee.emp_no}`);
        } else {
            console.log(`Testing with Existing Employee: ${employee.employee_name} (${employee.emp_no})`);
        }

        const month = '2024-01'; // 31 days month

        // 3. Prepare Mock Excel Data
        // Scenario: Month has 31 days.
        // Upload: 21 Present, 1 OD, 2 Paid Leave, 2 LOP, 1 Absent = 27 days specified
        // Note: The rest (4 days) should be Holiday/Weekoff to reach 31.
        const mockExcelData = [
            {
                'Employee Code': employee.emp_no,
                'Total Present': 23.0,
                'Total Absent': 6.0,
                'Paid Leaves': 1.0,
                'LOP Count': 0.0,
                'Total OD': 1.0,
                'Total OT Hours': 0,
                'Lates': 0,
                'Total Extra Days': 3.0
            }
        ];

        const [year, monthNum] = month.split('-').map(Number);

        // CLEAN START
        await PayRegisterSummary.deleteMany({ employeeId: employee._id, month });
        console.log('ℹ️ Cleaned existing test records.');

        let payRegister = await PayRegisterSummary.findOne({ employeeId: employee._id, month });
        if (!payRegister) {
            console.log('ℹ️ Creating initial pay register with holidays...');

            // Correctly initialize daily records
            const { populatePayRegisterFromSources } = require('../pay-register/services/autoPopulationService');
            const dailyRecords = await populatePayRegisterFromSources(employee._id, employee.emp_no, year, monthNum);

            console.log(`ℹ️ Initial dailyRecords source count: ${dailyRecords.length}`);

            payRegister = await PayRegisterSummary.create({
                employeeId: employee._id,
                emp_no: employee.emp_no,
                month,
                monthName: 'January 2024',
                year,
                monthNumber: monthNum,
                totalDaysInMonth: 31,
                status: 'draft',
                dailyRecords
            });

            console.log(`ℹ️ dailyRecords length: ${payRegister.dailyRecords.length}`);
            if (payRegister.dailyRecords.length === 0) {
                console.error('❌ dailyRecords is EMPTY!');
                process.exit(1);
            }

            // Set 1 day as holiday (first day)
            for (let i = 0; i < 1; i++) {
                payRegister.dailyRecords[i].status = 'holiday';
                payRegister.dailyRecords[i].firstHalf.status = 'holiday';
                payRegister.dailyRecords[i].secondHalf.status = 'holiday';
            }
            await payRegister.save();
            console.log('✅ Initial pay register created with 1 holiday.');
        }

        console.log('\nProcessing simulated upload...');
        const result = await processSummaryBulkUpload(month, mockExcelData, MOCK_USER_ID);

        // RE-FETCH to get updated data
        const pr = await PayRegisterSummary.findOne({ employeeId: employee._id, month });

        console.log('Upload Result:', JSON.stringify(result, null, 2));

        if (result.success !== 1) {
            console.error('❌ Upload failed for the test row');
            console.error('Errors:', JSON.stringify(result.errors, null, 2));
            process.exit(1);
        }

        // 4. Verify Results in Database
        console.log('\n--- DATA INTEGRITY CHECKS ---');

        // Check Totals
        const t = pr.totals;
        const holWo = (t.totalWeeklyOffs || 0) + (t.totalHolidays || 0);
        console.log(`Holiday + Weekoffs: ${holWo}`);

        // Business Rule: Present count includes OD for the final 'demonstration'.
        const passPresent = (t.totalPresentDays + t.totalODDays) === 23.0;
        const passOD = t.totalODDays === 1.0;
        const passPaidLeave = t.totalPaidLeaveDays === 1.0;
        const passLOP = t.totalLopDays === 0.0;
        const passAbsent = t.totalAbsentDays === 6.0;

        console.log(`${passPresent ? '✅' : '❌'} Total Working Days: ${t.totalPresentDays + t.totalODDays} (Expected: 23.0) - Includes 1.0 OD`);
        console.log(`${passOD ? '✅' : '❌'} OD Days (demonstration): ${t.totalODDays} (Expected: 1.0)`);
        console.log(`${passPaidLeave ? '✅' : '❌'} Paid Leaves: ${t.totalPaidLeaveDays} (Expected: 1.0)`);
        console.log(`${passLOP ? '✅' : '❌'} LOP Count: ${t.totalLopDays} (Expected: 0.0)`);
        console.log(`${passAbsent ? '✅' : '❌'} Absents: ${t.totalAbsentDays} (Expected: 6.0)`);

        // Check Extra Days / Payout Shift Integration
        // Logic: PhysicalUnits = Present + PaidLeave (OD is already inside Present)
        // 23 + 1 = 24.
        // Payable Shifts = 24 + 3 (Extra) = 27.
        const expectedPayable = 27.0;
        const passPayable = t.totalPayableShifts === expectedPayable;
        console.log(`${passPayable ? '✅' : '❌'} Total Payable Shifts: ${t.totalPayableShifts} (Expected: ${expectedPayable})`);

        // Check Calendar Safety Check
        // Logic: (Present) + (OD) + (Absent + LOP) + HolidayAndWeekoff + PL = Month.
        // 22 + 1 + 6 + 0 + 1 + 1 = 31.
        const countedDays = t.totalPresentDays + t.totalODDays + t.totalPaidLeaveDays + t.totalAbsentDays + t.totalLopDays + holWo;
        const passSafety = Math.abs(countedDays - pr.totalDaysInMonth) < 0.01;

        console.log(`${passSafety ? '✅' : '❌'} Safety Check: ${countedDays} / ${pr.totalDaysInMonth} (Matches Month)`);

        // Check Distribution (Manual spot check)
        // The holiday at start should STILL be holiday
        const day1Status = pr.dailyRecords[0]?.status || pr.dailyRecords[0]?.firstHalf?.status;
        const passHolPreserve = day1Status === 'holiday';
        console.log(`${passHolPreserve ? '✅' : '❌'} Holiday Preservation (Day 1): ${day1Status}`);

        // Day 5 should be 'present' (since first 4 were holidays and it's sequential)
        const day5Status = pr.dailyRecords[4]?.status || pr.dailyRecords[4]?.firstHalf?.status;
        const passSeq = day5Status === 'present';
        console.log(`${passSeq ? '✅' : '❌'} Sequential Distribution (Day 5): ${day5Status} (Expected: present)`);

        console.log('\n--- VERIFICATION COMPLETE ---');

        process.exit(0);
    } catch (err) {
        console.error('❌ Test execution error:', err);
        process.exit(1);
    }
}

runTest();
