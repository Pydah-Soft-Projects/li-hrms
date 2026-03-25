const mongoose = require('mongoose');
require('dotenv').config();

const { performAnnualCLReset, performInitialCLSync } = require('../leaves/services/annualCLResetService');

// Require models that Employee might populate
require('../departments/model/Department');
require('../departments/model/Division');
require('../leaves/model/LeaveRegister');
require('../leaves/model/Leave');

async function runAnnualResetTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        // Check command-line arguments. Use --sync for the initial policy sync instead of annual rollover
        const isSyncMode = process.argv.includes('--sync');
        
        let result;
        if (isSyncMode) {
            console.log('\n--- Executing Initial CL Sync from Policy ---');
            console.log('This will set every active employee\'s CL balance exactly to the policy entitlement.');
            result = await performInitialCLSync();
        } else {
            console.log('\n--- Executing Annual CL Rollover ---');
            console.log('This will expire CL over the carry-forward limit and add the new year entitlement.');
            const targetYear = new Date().getFullYear(); // Or dynamically pass a year
            result = await performAnnualCLReset(targetYear);
        }

        console.log('\n=== Execution Results ===');
        console.log(`Success: ${result.success}`);
        console.log(`Message: ${result.message}`);
        console.log(`Processed: ${result.processed}`);
        
        if (result.successCount !== undefined) {
             console.log(`Success Count: ${result.successCount}`);
        }

        if (result.errors && result.errors.length > 0) {
            console.log('\n--- Errors Encountered ---');
            result.errors.forEach(err => {
                console.log(`Employee NO: ${err.empNo} - Error: ${err.error}`);
            });
        }

        console.log('\nDone!');
        process.exit(0);

    } catch (error) {
        console.error('Fatal error during execution:', error);
        process.exit(1);
    }
}

// Run the script
runAnnualResetTest();
