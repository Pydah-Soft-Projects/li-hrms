const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected for Reset Script');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const resetAttendance = async () => {
    await connectDB();

    try {
        console.log('Starting Attendance Data Reset...');

        // Count before
        const dailyBefore = await AttendanceDaily.countDocuments({});
        const summaryBefore = await MonthlyAttendanceSummary.countDocuments({});
        console.log(`Found ${dailyBefore} AttendanceDaily records.`);
        console.log(`Found ${summaryBefore} MonthlyAttendanceSummary records.`);

        // Delete all
        const dailyRes = await AttendanceDaily.deleteMany({});
        const summaryRes = await MonthlyAttendanceSummary.deleteMany({});

        console.log(`Deleted ${dailyRes.deletedCount} AttendanceDaily records.`);
        console.log(`Deleted ${summaryRes.deletedCount} MonthlyAttendanceSummary records.`);

        console.log('All Attendance Daily and Monthly Summary records have been successfully reset.');

    } catch (error) {
        console.error('Error resetting attendance data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB Disconnected');
        process.exit(0);
    }
};

resetAttendance();
