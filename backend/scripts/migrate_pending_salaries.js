/**
 * Migration Script: Approve all existing employees with pending salaries
 * 
 * Usage: node scripts/migrate_pending_salaries.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load Models
const Employee = require('../employees/model/Employee');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const EmployeeHistory = require('../employees/model/EmployeeHistory');
const User = require('../users/model/User');

const migrate = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // 1. Get a Super Admin to act as approver
        const superAdmin = await User.findOne({ role: 'super_admin' });
        if (!superAdmin) {
            console.error('❌ Error: No super_admin found in the system. Please create one first.');
            process.exit(1);
        }
        console.log(`Using approver: ${superAdmin.name} (${superAdmin.email})`);

        // 2. Find employees with pending_approval status
        const pendingEmployees = await Employee.find({ salaryStatus: 'pending_approval' });
        console.log(`Found ${pendingEmployees.length} employees with pending salary approval.`);

        if (pendingEmployees.length === 0) {
            console.log('✅ No pending salaries to approve. Exiting.');
            process.exit(0);
        }

        let successCount = 0;
        let failCount = 0;

        for (const employee of pendingEmployees) {
            try {
                console.log(`Processing Employee: ${employee.employee_name} (${employee.emp_no})...`);

                // 3. Find the corresponding verified/pending application
                // Note: Applications for verified employees are usually in 'verified' status
                const application = await EmployeeApplication.findOne({
                    emp_no: employee.emp_no,
                    status: { $in: ['verified', 'pending'] }
                });

                const now = new Date();

                // 4. Update Employee
                employee.salaryStatus = 'approved';
                employee.salaryApprovedBy = superAdmin._id;
                employee.salaryApprovedAt = now;

                // Ensure gross_salary is set (should be from verification, but fallback to 0)
                if (employee.gross_salary === null || employee.gross_salary === undefined) {
                    employee.gross_salary = application ? application.proposedSalary : 0;
                }

                await employee.save();

                // 5. Update Application if found
                if (application) {
                    application.status = 'approved';
                    application.approvedBy = superAdmin._id;
                    application.approvedAt = now;
                    application.approvedSalary = application.approvedSalary || application.proposedSalary || employee.gross_salary;
                    application.approvalComments = application.approvalComments || 'Bulk approved via migration script';
                    await application.save();
                }

                // 6. Log History
                await EmployeeHistory.create({
                    emp_no: employee.emp_no,
                    event: 'salary_approved',
                    performedBy: superAdmin._id,
                    details: {
                        gross_salary: employee.gross_salary,
                        status: 'approved',
                        migration: true
                    },
                    comments: 'Bulk approved via migration script'
                }).catch(err => console.error(`   ⚠️ Failed to log history for ${employee.emp_no}:`, err.message));

                console.log(`   ✅ Successfully approved salary for ${employee.emp_no}`);
                successCount++;

            } catch (err) {
                console.error(`   ❌ Failed to approve ${employee.emp_no}:`, err.message);
                failCount++;
            }
        }

        console.log('\n--- Migration Summary ---');
        console.log(`Total Found:    ${pendingEmployees.length}`);
        console.log(`Success:        ${successCount}`);
        console.log(`Failed:         ${failCount}`);
        console.log('-------------------------');

        process.exit(0);

    } catch (error) {
        console.error('Migration Script Failed:', error);
        process.exit(1);
    }
};

migrate();
