require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

/**
 * ============================================================
 * BIOMETRIC LOG RESYNC SCRIPT
 * ============================================================
 * This script sends ALL attendance logs from the local 
 * biometric_logs database to the main backend HRMS application.
 * 
 * Use this to verify shift detection logic on existing data.
 * ============================================================
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const SYNC_ENDPOINT = `${BACKEND_URL}/api/internal/attendance/sync`;
const SYSTEM_KEY = 'hrms-microservice-secret-key-999';
const BATCH_SIZE = 200; // Optimal batch size with delays
const RETRY_ATTEMPTS = 3;
const DELAY_BETWEEN_BATCHES = 1000; // 1s delay to prevent backend overload

// ─── Biometric AttendanceLog model ───────────────────────────────────────────
const attendanceLogSchema = new mongoose.Schema({
    employeeId: String,
    timestamp: Date,
    logType: String,
    rawType: Number,
    rawData: Object,
    deviceId: String,
    deviceName: String,
    syncedAt: Date,
}, { timestamps: true });

const AttendanceLog =
    mongoose.models.AttendanceLog ||
    mongoose.model('AttendanceLog', attendanceLogSchema);

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/biometric_logs';

    console.log('\n🚀 Starting Biometric Log Resync...\n');
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log(`✅ Connected to: ${mongoURI}\n`);

    // ── STEP 2: Resend logs to backend (Filtered by date) ────────────────────
    // Jan 20 00:00 — till date (today end of day)
    const START_DATE = new Date('2026-01-20T00:00:00.000Z');
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const query = {
        timestamp: { $gte: START_DATE, $lte: endOfToday },
    };

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP: Resend AttendanceLog records to backend');
    console.log(`   Filter   : Jan 20, 2026 — till date (${endOfToday.toISOString().slice(0, 10)})`);
    console.log(`   Endpoint : ${SYNC_ENDPOINT}`);
    console.log(`   Batch    : ${BATCH_SIZE} logs per request`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const totalLogs = await AttendanceLog.countDocuments(query);
    console.log(`   Total logs matching filter: ${totalLogs}\n`);

    if (totalLogs === 0) {
        console.log('   ℹ️  No logs to send.');
    } else {
        let processed = 0;
        let batchNum = 0;
        let successBatches = 0;
        let failedBatches = 0;
        const totalBatches = Math.ceil(totalLogs / BATCH_SIZE);

        for (let skip = 0; skip < totalLogs; skip += BATCH_SIZE) {
            batchNum++;
            const logs = await AttendanceLog.find(query)
                .sort({ timestamp: 1 })
                .skip(skip)
                .limit(BATCH_SIZE)
                .lean();

            // Build payload matching the format the backend expects
            const payload = logs.map(log => {
                const ts = log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp;
                // Ensure it ends with Z
                const timestamp = typeof ts === 'string' && !ts.endsWith('Z') ? `${ts}Z` : ts;

                return {
                    employeeId: log.employeeId,
                    timestamp: timestamp,
                    logType: log.logType,
                    deviceId: log.deviceId || 'UNKNOWN',
                    deviceName: log.deviceName || 'UNKNOWN',
                    rawStatus: log.rawType ?? null,
                };
            });

            let attempt = 0;
            let success = false;

            while (attempt < RETRY_ATTEMPTS && !success) {
                try {
                    const response = await axios.post(SYNC_ENDPOINT, payload, {
                        headers: { 'x-system-key': SYSTEM_KEY },
                        timeout: 180000, // 3 minutes timeout
                    });
                    processed += logs.length;
                    successBatches++;
                    success = true;
                    process.stdout.write(
                        `\r   📤 Batch ${batchNum}/${totalBatches} — Sent: ${processed}/${totalLogs} | Backend accepted: ${response.data.processedCount ?? response.data.processed ?? '?'}`
                    );
                } catch (err) {
                    attempt++;
                    const status = err.response ? `HTTP ${err.response.status} - ${JSON.stringify(err.response.data)}` : err.message;
                    if (attempt < RETRY_ATTEMPTS) {
                        // console.log(`\n   ⚠️  Batch ${batchNum} retry ${attempt}/${RETRY_ATTEMPTS} after error: ${status}`);
                        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
                    } else {
                        failedBatches++;
                        console.error(`\n   ❌ Batch ${batchNum} failed after ${RETRY_ATTEMPTS} attempts: ${status}`);
                    }
                }
            }

            // Wait between batches to prevent backend exhaustion
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }

        console.log(`\n\n   ✅ Done — ${successBatches} batch(es) succeeded, ${failedBatches} failed.`);
    }

    console.log('\n🏁 Closing connection...');
    await mongoose.disconnect();
    console.log('✅ Disconnected.');
}

main().catch(err => {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
});
