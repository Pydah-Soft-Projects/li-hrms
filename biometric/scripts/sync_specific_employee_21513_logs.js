require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

/**
 * ============================================================
 * SPECIFIC EMPLOYEE BIOMETRIC LOG RESYNC SCRIPT
 * ============================================================
 * This script reads attendance logs for employee 143 (thumb
 * device ID) from the local biometric_logs database and pushes
 * them to the main backend HRMS application mapped to employee
 * 21513.
 *
 * SOURCE  : employeeId "143"  (thumb / biometric device ID)
 * TARGET  : employeeId "21513" (HRMS employee number)
 * ============================================================
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const SYNC_ENDPOINT = `${BACKEND_URL}/api/internal/attendance/sync`;
const SYSTEM_KEY = process.env.HRMS_MICROSERVICE_SECRET_KEY || "hrms-secret-key-2026-abc123xyz789";
if (!SYSTEM_KEY) {
    console.error('ERROR: HRMS_MICROSERVICE_SECRET_KEY not configured in biometric service');
    process.exit(1);
}
const BATCH_SIZE = 200;
const RETRY_ATTEMPTS = 3;
const DELAY_BETWEEN_BATCHES = 1000;

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
    const mongoURI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/biometric_logs';

    // SOURCE thumb ID in biometric_logs DB
    const SOURCE_THUMB_ID = "143";

    // Device to filter logs by
    const DEVICE_ID = "NFZ8244504974";

    // TARGET HRMS employee number to push logs as
    const TARGET_EMP_ID = "21513";

    console.log('\n🚀 Starting Biometric Log Resync: thumb 143 → employee 21513...\n');
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log(`✅ Connected to: ${mongoURI}\n`);

    const query = {
        employeeId: SOURCE_THUMB_ID,
        deviceId: DEVICE_ID,
    };

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP: Resend AttendanceLog records to backend');
    console.log(`   Source thumb ID : ${SOURCE_THUMB_ID}`);
    console.log(`   Device ID       : ${DEVICE_ID}`);
    console.log(`   Target emp no   : ${TARGET_EMP_ID}`);
    console.log(`   Range           : ALL logs (no date filter)`);
    console.log(`   Endpoint        : ${SYNC_ENDPOINT}`);
    console.log(`   Batch size      : ${BATCH_SIZE} logs per request`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const totalLogs = await AttendanceLog.countDocuments(query);
    console.log(`   Total logs matching filter: ${totalLogs}\n`);

    if (totalLogs === 0) {
        console.log('   ℹ️  No logs found for thumb ID 143 in the given date range.');
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

            // Build payload — override employeeId with TARGET_EMP_ID (21513)
            const payload = logs.map(log => {
                const ts = log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp;
                const timestamp = typeof ts === 'string' && !ts.endsWith('Z') ? `${ts}Z` : ts;

                return {
                    employeeId: TARGET_EMP_ID,   // remap: 143 thumb → 21513
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
                        timeout: 180000,
                    });
                    processed += logs.length;
                    successBatches++;
                    success = true;
                    process.stdout.write(
                        `\r   📤 Batch ${batchNum}/${totalBatches} — Sent: ${processed}/${totalLogs} | Backend accepted: ${response.data.processedCount ?? response.data.processed ?? '?'}`
                    );
                } catch (err) {
                    attempt++;
                    const status = err.response
                        ? `HTTP ${err.response.status} - ${JSON.stringify(err.response.data)}`
                        : err.message;
                    if (attempt < RETRY_ATTEMPTS) {
                        console.warn(`\n   ⚠️  Batch ${batchNum} attempt ${attempt} failed: ${status}. Retrying in 5s...`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        failedBatches++;
                        console.error(`\n   ❌ Batch ${batchNum} failed after ${RETRY_ATTEMPTS} attempts: ${status}`);
                    }
                }
            }

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
