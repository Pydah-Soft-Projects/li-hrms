/**
 * Fix Inconsistent Applications
 * Sets status back to 'pending' for applications that are 'approved' but have no employee record.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const Employee = require('../employees/model/Employee');

async function fixApplications() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const approvedApplications = await EmployeeApplication.find({ status: 'approved' });
        console.log(`Found ${approvedApplications.length} approved applications.`);

        let fixedCount = 0;
        for (const app of approvedApplications) {
            const employee = await Employee.findOne({ emp_no: String(app.emp_no || '').toUpperCase() });
            if (!employee) {
                console.log(`Application for ${app.emp_no} has no employee. Reverting to pending...`);
                app.status = 'pending';
                // Clear approval data if needed, or keep for retry
                await app.save();
                fixedCount++;
            }
        }

        console.log(`Fixed ${fixedCount} inconsistent applications.`);
        process.exit(0);
    } catch (error) {
        console.error('Error fixing applications:', error);
        if (process.env.NODE_ENV !== "test") process.exit(1);
    }
}

fixApplications();
