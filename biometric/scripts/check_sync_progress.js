const mongoose = require('mongoose');

async function findProgressDate() {
    const mongoURI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/biometric_logs';
    await mongoose.connect(mongoURI);

    const attendanceLogSchema = new mongoose.Schema({
        timestamp: Date,
    });
    const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);

    const END_DATE = new Date('2026-01-30T23:59:59.999Z');
    const query = { timestamp: { $lte: END_DATE } };

    // Find the 135,600th log
    const log = await AttendanceLog.find(query)
        .sort({ timestamp: 1 })
        .skip(140399) // 0-indexed skip for 135,600th record
        .limit(1)
        .lean();

    // timestamp: { $gt: new Date('2025-08-11T10:55:06Z') } from this we need to 

    if (log.length > 0) {
        console.log('PROGRESS_TIMESTAMP:' + log[0].timestamp.toISOString());
    } else {
        console.log('LOG_NOT_FOUND');
    }

    await mongoose.disconnect();
}

findProgressDate().catch(err => {
    console.error(err);
    process.exit(1);
});
