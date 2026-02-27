/**
 * Reset Leave Register and Employee Leave Balances
 *
 * 1. Deletes ALL documents from the leave_register collection.
 * 2. Sets casualLeaves, paidLeaves (EL), and compensatoryOffs to 0 for ALL employees.
 *
 * Usage: node scripts/reset_leave_register_and_balances.js
 * Run from backend directory: node scripts/reset_leave_register_and_balances.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const LeaveRegister = require('../leaves/model/LeaveRegister');

async function resetLeaveRegisterAndBalances() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        // 1. Delete all leave register transactions
        const deleteResult = await LeaveRegister.deleteMany({});
        console.log(`Deleted ${deleteResult.deletedCount} leave register transaction(s).`);

        // 2. Set all employees' leave balances to 0
        const updateResult = await Employee.updateMany(
            {},
            {
                $set: {
                    casualLeaves: 0,
                    paidLeaves: 0,
                    compensatoryOffs: 0,
                },
            }
        );
        console.log(`Updated ${updateResult.modifiedCount} employee(s): casualLeaves, paidLeaves, compensatoryOffs set to 0.`);

        console.log('Done.');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
}

resetLeaveRegisterAndBalances();
