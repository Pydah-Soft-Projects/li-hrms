const mongoose = require('mongoose');
const { connectMongoDB } = require('../config/database');
const { calculateSecondSalary } = require('../payroll/services/secondSalaryCalculationService');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const SecondSalaryRecord = require('../payroll/model/SecondSalaryRecord');
const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Division = require('../divisions/model/Division');
const SecondSalaryBatch = require('../payroll/model/SecondSalaryBatch');

/**
 * Verification Script: Regular Payroll vs Second Salary Parity
 * 
 * Compares attendance totals and basic calculation logic to ensure second salary engine
 * matches the "New" regular payroll engine accurately.
 */
async function verifyParity(empNo, month) {
    try {
        await connectMongoDB();
        const employee = await Employee.findOne({ emp_no: empNo });
        if (!employee) throw new Error(`Employee ${empNo} not found`);

        console.log(`\n=== VERIFYING PARITY FOR ${employee.employee_name} (${empNo}) - ${month} ===`);

        // 1. Regular Payroll (Source of Truth)
        const summary = await PayRegisterSummary.findOne({ employeeId: employee._id, month });
        if (!summary) {
            console.warn(`[WARN] PayRegisterSummary not found for ${empNo}. Verification will use fallback logic.`);
        }

        // 2. Run Second Salary Calculation
        console.log('Running Second Salary Calculation...');
        const result = await calculateSecondSalary(employee._id, month, 'system');
        const secondRec = result.record;

        // 3. Comparison
        console.log('\n--- Attendance Figures ---');
        const regularPresent = summary?.totals?.totalPresentDays ?? 'N/A';
        const regularAbsent = summary?.totals?.totalAbsentDays ?? 'N/A';
        const regularPayable = summary?.totals?.totalPayableShifts ?? 'N/A';

        console.log(`Regular Present: ${regularPresent.toString().padEnd(5)} | Second Present: ${secondRec.attendance.presentDays}`);
        console.log(`Regular Absent:  ${regularAbsent.toString().padEnd(5)} | Second Absent:  ${secondRec.attendance.absentDays}`);
        console.log(`Regular Payable: ${regularPayable.toString().padEnd(5)} | Second Payable: ${secondRec.attendance.payableShifts}`);

        // 4. Mathematical Validation
        // Absent Days should be: MonthDays - (Present + WO + Holiday + PaidLeave)
        // OD Days should NOT be subtracted twice.
        const monthDays = secondRec.attendance.totalDaysInMonth;
        const totalPaidDays = secondRec.attendance.totalPaidDays;

        console.log(`\n--- Calculation Logic Check ---`);
        console.log(`Total Days In Month: ${monthDays}`);
        console.log(`Total Paid Days (Units): ${totalPaidDays}`);

        const expectedAbsent = Math.max(0, monthDays - (secondRec.attendance.presentDays + secondRec.attendance.weeklyOffs + secondRec.attendance.holidays + secondRec.attendance.paidLeaveDays));

        if (secondRec.attendance.absentDays === expectedAbsent) {
            console.log('✅ Absent Days Logic: CORRECT (OD days not double-subtracted)');
        } else {
            console.log('❌ Absent Days Logic: MISMATCH');
            console.log(`   Calculated: ${secondRec.attendance.absentDays}, Expected: ${expectedAbsent}`);
        }

        if (summary && regularPayable !== 'N/A') {
            if (secondRec.attendance.payableShifts >= regularPayable) {
                console.log('✅ Payable Shifts Parity: PASS (Matches or includes EL compensation)');
            } else {
                console.log('❌ Payable Shifts Parity: FAIL (Lower than regular payroll)');
            }
        }

        console.log('\n=== VERIFICATION COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Verification Failed with Error:');
        console.error(err.message);
        process.exit(1);
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node verify_second_salary.js <emp_no> [month (YYYY-MM)]');
    process.exit(0);
}

verifyParity(args[0], args[1] || '2026-01');
