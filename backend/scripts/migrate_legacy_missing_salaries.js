/**
 * Migration Script: Migrate all legacy employees missing salaryStatus to approved
 * 
 * Usage: node scripts/migrate_legacy_missing_salaries.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load Models
const Employee = require('../employees/model/Employee');
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
            console.error('❌ Error: No super_admin found in the system.');
            process.exit(1);
        }
        console.log(`Using approver: ${superAdmin.name} (${superAdmin.email})`);

        // 2. Find employees WITHOUT salaryStatus approved or pending_approval
        // This targets "legacy" employees who missed the 3-step rollout
        const legacyEmployees = await Employee.find({
            salaryStatus: { $nin: ['approved', 'pending_approval'] }
        });

        console.log(`Found ${legacyEmployees.length} legacy employees to migrate.`);

        if (legacyEmployees.length === 0) {
            console.log('✅ No legacy employees to migrate. Exiting.');
            process.exit(0);
        }

        let successCount = 0;
        let failCount = 0;
        const now = new Date();

        for (const employee of legacyEmployees) {
            try {
                console.log(`Processing: ${employee.employee_name} (${employee.emp_no})...`);

                // Update Employee
                employee.salaryStatus = 'approved';
                employee.salaryApprovedBy = superAdmin._id;
                employee.salaryApprovedAt = now;

                // For legacy employees, if they don't have verifiedBy, we'll mark them as auto-verified by Super Admin too
                if (!employee.verifiedBy) {
                    employee.verifiedBy = superAdmin._id;
                    employee.verifiedAt = now;
                }

                await employee.save();

                // Log History
                await EmployeeHistory.create({
                    emp_no: employee.emp_no,
                    event: 'salary_approved',
                    performedBy: superAdmin._id,
                    details: {
                        gross_salary: employee.gross_salary,
                        status: 'approved',
                        migration: 'legacy'
                    },
                    comments: 'Migration: Auto-approved legacy employee'
                }).catch(err => console.error(`   ⚠️ History log failed for ${employee.emp_no}:`, err.message));

                successCount++;
            } catch (err) {
                console.error(`   ❌ Failed to migrate ${employee.emp_no}:`, err.message);
                failCount++;
            }
        }

        console.log('\n--- Migration Summary ---');
        console.log(`Total Found:    ${legacyEmployees.length}`);
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
