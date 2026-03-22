const mongoose = require('mongoose');

async function testLimits() {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms');
    console.log('Connected to MongoDB');

    const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
    const LeaveSettings = require('../leaves/model/LeaveSettings');
    const Employee = require('../employees/model/Employee');
    const leaveRegisterService = require('../leaves/services/leaveRegisterService');
    const LeaveRegister = require('../leaves/model/LeaveRegister');

    // Register all needed models
    require('../leaves/model/Leave');
    require('../departments/model/Designation');
    require('../departments/model/Department');
    require('../departments/model/Division');

    const emp = await Employee.findOne({ employee_name: /BURAGA RAVI/i });
    if (!emp) { console.log('Emp not found'); process.exit(1); }

    const FY_2026 = 2026;
    const MONTH_MARCH = 3;
    const now = new Date();

    console.log('\n--- Adding Temporary 5 CCL to BURAGA RAVI ---');
    await LeaveRegister.create({
        employeeId: emp._id,
        empNo: emp.emp_no || 'TEMP001',
        employeeName: emp.employee_name || 'BURAGA RAVI',
        designation: 'Software Developer', // Default
        department: 'Development', // Default
        departmentId: emp.department || new mongoose.Types.ObjectId(),
        divisionId: emp.division || new mongoose.Types.ObjectId(),
        dateOfJoining: emp.date_of_joining || now,
        leaveType: 'CCL',
        transactionType: 'CREDIT',
        days: 5,
        month: MONTH_MARCH,
        year: FY_2026,
        reason: 'Test CCL injection',
        startDate: now,
        endDate: now,
        financialYear: '2025-26',
        payrollCycleStart: now,
        payrollCycleEnd: now,
        financialYearStart: now,
        financialYearEnd: now,
        openingBalance: 0,
        closingBalance: 5
    });

    console.log('\n--- Employee Balances ---');
    const register = await leaveRegisterService.getLeaveRegister({ employeeId: emp._id }, MONTH_MARCH, FY_2026);
    const initialSub = register[0].monthlySubLedgers.find(s => s.month === MONTH_MARCH);
    const actualCCL = initialSub.compensatoryOff.balance;
    console.log('CL Available:', initialSub.casualLeave.balance);
    console.log('CCL Available:', actualCCL);

    console.log('\n--- TEST 1: ADDITIVE (CL_Cap + CCL) ---');
    await LeavePolicySettings.updateSettings({
        monthlyLimitSettings: { includeCCL: true, includeEL: true, logicType: 'ADDITIVE' }
    });
    let data = await leaveRegisterService.getLeaveRegister({ employeeId: emp._id }, MONTH_MARCH, FY_2026);
    let sub = data[0].monthlySubLedgers.find(s => s.month === MONTH_MARCH);
    console.log('Limit (Additive):', sub.monthlyAllowedLimit);

    console.log('\n--- TEST 2: CAP_INCLUSIVE (Absolute Cap of 2) ---');
    await LeavePolicySettings.updateSettings({
        monthlyLimitSettings: { includeCCL: true, includeEL: true, logicType: 'CAP_INCLUSIVE' }
    });
    data = await leaveRegisterService.getLeaveRegister({ employeeId: emp._id }, MONTH_MARCH, FY_2026);
    sub = data[0].monthlySubLedgers.find(s => s.month === MONTH_MARCH);
    console.log('Limit (Cap Inclusive):', sub.monthlyAllowedLimit);

    console.log('\n--- TEST 3: DISABLING CCL IN LIMIT ---');
    await LeavePolicySettings.updateSettings({
        monthlyLimitSettings: { includeCCL: false, includeEL: true, logicType: 'ADDITIVE' }
    });
    data = await leaveRegisterService.getLeaveRegister({ employeeId: emp._id }, MONTH_MARCH, FY_2026);
    sub = data[0].monthlySubLedgers.find(s => s.month === MONTH_MARCH);
    console.log('Limit (No CCL):', sub.monthlyAllowedLimit);

    // Clean up
    await LeaveRegister.deleteOne({ reason: 'Test CCL injection' });
    
    // Reset settings to default for user
    await LeavePolicySettings.updateSettings({
        monthlyLimitSettings: { includeCCL: true, includeEL: true, logicType: 'ADDITIVE' }
    });

    process.exit(0);
}

testLimits().catch(err => {
    console.error(err);
    process.exit(1);
});
