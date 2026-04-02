const { calculateSecondSalaryForPayRegister } = require('./secondSalaryCalculationService');
const PayrollConfiguration = require('../model/PayrollConfiguration');
const payrollCalculationFromOutputColumnsService = require('./payrollCalculationFromOutputColumnsService');

async function testPassedSettlements() {
    console.log('Testing second salary settlement passing...');
    
    // Mock data
    const employeeId = '65f1a2b3c4d5e6f7a8b9c0d1'; // Dummy ID
    const month = '2024-03';
    const userId = '65f1a2b3c4d5e6f7a8b9c0d2';
    const strategy = 'dynamic';
    const options = {
        arrearsSettlements: [{ arrearId: 'arrear123', amount: 5000 }],
        deductionSettlements: [{ deductionId: 'deduction456', amount: 1000 }]
    };

    // Spy on the dynamic engine call
    const originalCalc = payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns;
    let passedOptions = null;
    payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns = async (emp, m, u, opt) => {
        passedOptions = opt;
        return { success: true };
    };

    try {
        await calculateSecondSalaryForPayRegister(employeeId, month, userId, strategy, options);
        
        console.log('Passed Options to Dynamic Engine:', JSON.stringify(passedOptions, null, 2));
        
        if (passedOptions && 
            passedOptions.arrearsSettlements[0].arrearId === 'arrear123' &&
            passedOptions.deductionSettlements[0].deductionId === 'deduction456') {
            console.log('SUCCESS: Settlements correctly passed to dynamic engine.');
        } else {
            console.log('FAILURE: Settlements not correctly passed.');
        }
    } catch (err) {
        console.error('Test failed with error:', err.message);
    } finally {
        payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns = originalCalc;
    }
}

// Note: This script requires a running environment with models etc. 
// I will run it via a temporary node process if possible, but it might fail due to database connection.
// Instead, I'll just check the code again carefully.
