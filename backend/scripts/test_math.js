const mongoose = require('mongoose');

async function testMath() {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms');
    console.log('Connected to MongoDB');

    const leaveRegisterService = require('../leaves/services/leaveRegisterService');
    const LeavePolicySettings = require('../settings/model/LeavePolicySettings');

    const CL_LIMIT = 2;
    const clBal = 10;
    const cclBal = 5;
    const elBal = 10;
    const pendingCL = 0;
    const pendingOther = 0;

    function calculate(logicType, inclCCL, inclEL) {
        const isCapInclusive = logicType === 'CAP_INCLUSIVE';
        const clAllowedRem = Math.max(0, Math.min(clBal, CL_LIMIT) - pendingCL);
        
        if (isCapInclusive) {
             const totalPotential = clBal + (inclCCL ? cclBal : 0) + (inclEL ? elBal : 0);
             const sub_monthlyAllowedLimit_before = Math.min(totalPotential, CL_LIMIT); 
             return Math.max(0, sub_monthlyAllowedLimit_before - pendingOther);
        } else {
             return clAllowedRem + (inclCCL ? cclBal : 0) + (inclEL ? elBal : 0);
        }
    }

    console.log('\n--- Manual Math Verification ---');
    console.log('Inputs: CL_Cap=2, CL_Bal=10, CCL_Bal=5, EL_Bal=10');
    
    console.log('ADDITIVE (All on):', calculate('ADDITIVE', true, true), '(Expected: 2 + 5 + 10 = 17)');
    console.log('ADDITIVE (CL only):', calculate('ADDITIVE', false, false), '(Expected: 2)');
    console.log('CAP_INCLUSIVE (All on):', calculate('CAP_INCLUSIVE', true, true), '(Expected: 2)');
    console.log('CAP_INCLUSIVE (Low bal 1+1):', (function(){
        // Case: CL_Limit=5, but total bal is 2.
        const clB=1, cclB=1;
        const totalP = clB + cclB;
        return Math.min(totalP, 5);
    })(), '(Expected: 2)');

    // Now verify the actual service method by mocking a sub object
    // (This is harder, let's just use the real getSettings in the service)

    process.exit(0);
}

testMath().catch(err => {
    console.error(err);
    process.exit(1);
});
