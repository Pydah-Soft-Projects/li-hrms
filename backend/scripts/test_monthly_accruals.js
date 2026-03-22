const mongoose = require('mongoose');
require('dotenv').config();

const accrualEngine = require('../leaves/services/accrualEngine');

async function runMonthlyAccrualsTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        // You can conditionally pass month and year arguments via CLI:
        // node test_monthly_accruals.js 3 2026
        const args = process.argv.slice(2);
        
        let month, year;
        if (args.length >= 2) {
            month = parseInt(args[0], 10);
            year = parseInt(args[1], 10);
        } else {
            const now = new Date();
            month = now.getMonth() + 1;
            year = now.getFullYear();
        }

        console.log(`\n--- Executing Monthly Accruals for ${month}/${year} ---`);
        console.log('This will calculate EL, post CL/EL credits, and expire CCLs for the payroll cycle.');
        
        const results = await accrualEngine.postMonthlyAccruals(month, year);
        
        console.log('\n=== Execution Results ===');
        if (results.message) {
            console.log(`Message: ${results.message}`); // Usually prints if idempotency guard skips it
        } else {
            console.log(`Processed Employees: ${results.processed}`);
            console.log(`CL Credits: ${results.clCredits}`);
            console.log(`EL Credits: ${results.elCredits}`);
            console.log(`Expired CCLs: ${results.expiredCCLs}`);
        }

        if (results.errors && results.errors.length > 0) {
            console.log('\n--- Errors Encountered ---');
            results.errors.forEach(err => {
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
runMonthlyAccrualsTest();
