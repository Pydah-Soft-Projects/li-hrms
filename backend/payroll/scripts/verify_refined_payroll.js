/**
 * Verification Script for Refined Payroll Logic
 * Tests the 34-day scenario in a 30-day month.
 */
const basicPayService = require('../services/basicPayService');

// Mock data
const employee = {
    gross_salary: 60000
};

const attendanceSummary = {
    totalDaysInMonth: 30,
    totalPayableShifts: 34, // (Worked + Paid Leaves + Holidays + Weekoffs)
    extraDays: 0 // No separate extra days, let logic derive from totalPayableShifts
};

console.log('--- EXECUTING REFINED PAYROLL LOGIC TEST ---');
console.log(`Input: Gross=60000, DaysInMonth=30, TotalPaidDays(Calc)=34`);

try {
    const result = basicPayService.calculateBasicPay(employee, attendanceSummary);

    console.log('\n--- CALCULATION RESULTS ---');
    console.log(`Daily Rate: ${result.perDayBasicPay}`);
    console.log(`Calculated Paid Days (Input): ${result.calculatedPaidDays}`);
    console.log(`Total Paid Days (Capped): ${result.totalPaidDays}`);
    console.log(`Extra Days (Excess): ${result.extraDays}`);
    console.log(`Base Pay (for capped units): ${result.basePayForWork}`);
    console.log(`Incentive Pay (for extra days): ${result.incentive}`);
    console.log(`Total Payable Amount: ${result.payableAmount}`);

    // Validation
    const expectedDailyRate = 2000;
    const expectedTotalPaidDays = 30;
    const expectedExtraDays = 4;
    const expectedBasePay = 60000;
    const expectedIncentive = 8000;
    const expectedTotal = 68000;

    let success = true;
    if (result.totalPaidDays !== expectedTotalPaidDays) {
        console.error(`❌ FAILED: totalPaidDays expected ${expectedTotalPaidDays}, got ${result.totalPaidDays}`);
        success = false;
    }
    if (result.extraDays !== expectedExtraDays) {
        console.error(`❌ FAILED: extraDays expected ${expectedExtraDays}, got ${result.extraDays}`);
        success = false;
    }
    if (result.basePayForWork !== expectedBasePay) {
        console.error(`❌ FAILED: basePayForWork expected ${expectedBasePay}, got ${result.basePayForWork}`);
        success = false;
    }
    if (result.incentive !== expectedIncentive) {
        console.error(`❌ FAILED: incentive expected ${expectedIncentive}, got ${result.incentive}`);
        success = false;
    }

    if (success) {
        console.log('\n✅ VERIFICATION SUCCESSFUL: All refined formulas working as expected!');
    } else {
        console.error('\n❌ VERIFICATION FAILED: Check logs above.');
    }

} catch (error) {
    console.error('An error occurred during verification:', error.message);
}
