require('dotenv').config();
const mongoose = require('mongoose');

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const AttendanceDaily = mongoose.connection.db.collection('attendancedailies');

        // Find recent records that aren't from MSSQL (likely our benchmark ones)
        const sample = await AttendanceDaily.find({
            source: { $ne: 'mssql' },
            date: { $gte: '2024-01-01' } // adjust if needed
        }).sort({ _id: -1 }).limit(5).toArray();

        console.log('--- RECENT ATTENDANCE DAILY RECORDS ---');
        sample.forEach(rec => {
            console.log(`Emp: ${rec.employeeNumber}, Date: ${rec.date}, Status: ${rec.status}, In: ${rec.inTime}, Out: ${rec.outTime}, Hours: ${rec.totalHours}`);
        });

        const totalCount = await AttendanceDaily.countDocuments({ source: { $ne: 'mssql' } });
        console.log(`\nTotal Non-MSSQL Daily Records: ${totalCount}`);

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

verify();
