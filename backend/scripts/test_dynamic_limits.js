const mongoose = require('mongoose');

/**
 * Sanity check: leave register returns sub-ledgers with balances after monthly-limit policy removal.
 * (Legacy script used to flip monthlyLimitSettings; that configuration no longer exists.)
 */
async function testLimits() {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms');
    console.log('Connected to MongoDB');

    const Employee = require('../employees/model/Employee');
    const leaveRegisterService = require('../leaves/services/leaveRegisterService');

    require('../leaves/model/Leave');
    require('../departments/model/Designation');
    require('../departments/model/Department');
    require('../departments/model/Division');

    const emp = await Employee.findOne({ employee_name: /BURAGA RAVI/i });
    if (!emp) {
        console.log('Emp not found');
        process.exit(1);
    }

    const MONTH_MARCH = 3;
    const FY_2026 = 2026;

    const data = await leaveRegisterService.getLeaveRegister({ employeeId: emp._id }, MONTH_MARCH, FY_2026);
    const sub = data[0]?.monthlySubLedgers?.find((s) => s.month === MONTH_MARCH);
    console.log('CL balance:', sub?.casualLeave?.balance);
    console.log('allowedRemaining (CL − pending):', sub?.casualLeave?.allowedRemaining);
    console.log('monthlyAllowedLimit (deprecated):', sub?.monthlyAllowedLimit);

    process.exit(0);
}

testLimits().catch((err) => {
    console.error(err);
    process.exit(1);
});
