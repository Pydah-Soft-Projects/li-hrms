require('dotenv').config();
const mongoose = require('mongoose');
const { calculateAllEmployeesSummary, deleteAllMonthlySummaries } = require('./attendance/services/summaryCalculationService');

async function run() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/li-hrms';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const year = 2026;
        const month = 3; // March

        console.log(`Deleting all monthly summaries for ${year}-${month}...`);
        const deleteRes = await deleteAllMonthlySummaries({ year, monthNumber: month });
        console.log(`Deleted ${deleteRes?.deletedCount || 0} summaries.`);

        console.log(`Recalculating monthly summaries for all employees for ${year}-${month}...`);
        const calcRes = await calculateAllEmployeesSummary(year, month);

        const successCount = calcRes.filter(r => r.success).length;
        const failCount = calcRes.filter(r => !r.success).length;
        console.log(`Recalculation complete. Success: ${successCount}, Failed: ${failCount}`);

        if (failCount > 0) {
            console.log('Failures:');
            calcRes.filter(r => !r.success).forEach(r => console.log(`- Emp: ${r.employee}, Error: ${r.error}`));
        }

    } catch (error) {
        console.error('Error in script:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
}

run();
