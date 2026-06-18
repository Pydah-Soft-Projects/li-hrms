const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../users/model/User');
const Employee = require('../employees/model/Employee');

async function syncPasswords() {
    const dryRun = process.argv.includes('--dry-run');
    if (dryRun) {
        console.log('=== DRY RUN MODE: No modifications will be saved ===\n');
    }

    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is missing from .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB successfully.');

        // Find all users and select password
        const users = await User.find({}).select('+password');
        console.log(`Found ${users.length} total users in User collection.`);

        let processedCount = 0;
        let syncedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const user of users) {
            // Check if user is linked to an employee
            if (!user.employeeRef && !user.employeeId) {
                console.log(`- User ${user.email} is not linked to any employee. Skipping.`);
                skippedCount++;
                continue;
            }

            processedCount++;

            try {
                // Find corresponding employee record
                const employee = await Employee.findOne({
                    $or: [
                        ...(user.employeeRef ? [{ _id: user.employeeRef }] : []),
                        ...(user.employeeId ? [{ emp_no: user.employeeId }] : [])
                    ]
                }).select('+password');

                if (!employee) {
                    console.log(`[WARN] Linked employee for User ${user.email} (ref: ${user.employeeRef}, ID: ${user.employeeId}) was not found in Employee collection.`);
                    errorCount++;
                    continue;
                }

                // Check if passwords match
                if (employee.password === user.password) {
                    console.log(`- User ${user.email} and Employee ${employee.emp_no} passwords already match. Skipping.`);
                    skippedCount++;
                } else {
                    console.log(`[SYNC] Passwords differ for User ${user.email} and Employee ${employee.emp_no}.`);
                    console.log(`  User password hash:     ${user.password ? user.password.substring(0, 10) + '...' : 'none'}`);
                    console.log(`  Employee password hash: ${employee.password ? employee.password.substring(0, 10) + '...' : 'none'}`);

                    if (!dryRun) {
                        employee.password = user.password;
                        // Since employee.plain_password cannot be reconstructed, we keep it as is or leave it undefined.
                        // We do not modify plain_password if we don't have it, but we can set it to undefined if it was different to avoid stale credentials,
                        // or we can just leave it. Let's keep it but print a note.
                        await employee.save();
                        console.log(`  -> Successfully synchronized password for Employee ${employee.emp_no}.`);
                    } else {
                        console.log(`  -> [Dry Run] Would synchronize password for Employee ${employee.emp_no}.`);
                    }
                    syncedCount++;
                }
            } catch (err) {
                console.error(`[ERROR] Failed processing User ${user.email}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n======================================');
        console.log('Sync completed:');
        console.log(`- Linked Accounts Processed: ${processedCount}`);
        console.log(`- Passwords Synced:          ${syncedCount}`);
        console.log(`- Accounts Skipped/Matched:  ${skippedCount}`);
        console.log(`- Errors/Warnings Encountered: ${errorCount}`);
        console.log('======================================');

    } catch (err) {
        console.error('Fatal execution error:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

syncPasswords();
