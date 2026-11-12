require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

/**
 * ============================================================
 * FAST EMPLOYEE-BY-EMPLOYEE BIOMETRIC RESYNC SCRIPT
 * ============================================================
 * Groups logs by employee so that all punches for an employee
 * are sent in a single request. This allows the backend calculation
 * engine to process each employee in ONE pass instead of recalculating
 * 30 days repeatedly for 1,985 random batches!
 *
 * Usage:
 *   All employees:
 *     node scripts/sync_by_employee.js
 *
 *   Specific Date Range:
 *     $env:SYNC_START="2026-09-01"; $env:SYNC_END="2026-10-24"; node scripts/sync_by_employee.js
 *
 *   Single Employee:
 *     $env:SYNC_EMP="1698"; node scripts/sync_by_employee.js
 * ============================================================
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const SYNC_ENDPOINT = `${BACKEND_URL}/api/internal/attendance/sync`;

const candidateKeys = [
    process.env.HRMS_MICROSERVICE_SECRET_KEY,
    'hrms-secret-key-2026-abc123xyz789',
    'hrms-secret-key-2024-abc123xyz789'
].filter(Boolean);

let verifiedKey = candidateKeys[0];

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

const AttendanceLog = mongoose.models.AttendanceLog || mongoose.model('AttendanceLog', attendanceLogSchema);

async function sendBatchWithRetry(payload, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await axios.post(SYNC_ENDPOINT, payload, {
                headers: {
                    'x-system-key': verifiedKey,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            });
            return { success: true, data: res.data };
        } catch (err) {
            if (err.response && err.response.status === 401) {
                // Try alternate keys
                for (const k of candidateKeys) {
                    if (k === verifiedKey) continue;
                    try {
                        const retryRes = await axios.post(SYNC_ENDPOINT, payload, {
                            headers: { 'x-system-key': k, 'Content-Type': 'application/json' },
                            timeout: 120000
                        });
                        verifiedKey = k;
                        return { success: true, data: retryRes.data };
                    } catch (kErr) {
                        // keep trying
                    }
                }
            }
            if (attempt === maxRetries) {
                return { success: false, error: err.response ? JSON.stringify(err.response.data) : err.message };
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function main() {
    const mongoURI = process.env.BIOMETRIC_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';

    console.log('============================================================');
    console.log('⚡ FAST EMPLOYEE-BY-EMPLOYEE BIOMETRIC SYNC');
    console.log('============================================================\n');

    console.log(`🔌 Connecting to Biometric DB: ${mongoURI}`);
    await mongoose.connect(mongoURI);
    console.log('✅ Connected successfully.\n');

    const SYNC_START = process.env.SYNC_START || '2026-09-01';
    const SYNC_END = process.env.SYNC_END || '2026-10-24';
    const SYNC_EMP = process.env.SYNC_EMP;

    const START_DATE = new Date(`${SYNC_START}T00:00:00.000Z`);
    const END_DATE = new Date(`${SYNC_END}T23:59:59.999Z`);

    console.log(`📅 Date Range : ${SYNC_START} to ${SYNC_END}`);
    console.log(`🎯 Endpoint   : ${SYNC_ENDPOINT}`);

    let targetEmployeeIds = [];

    if (SYNC_EMP) {
        targetEmployeeIds = String(SYNC_EMP).split(',').map(s => s.trim()).filter(Boolean);
        console.log(`👤 Targeted Employee(s) : ${targetEmployeeIds.join(', ')}\n`);
    } else {
        console.log('🔍 Discovering all employees with logs in this date range...');
        const distinctEmps = await AttendanceLog.distinct('employeeId', {
            timestamp: { $gte: START_DATE, $lte: END_DATE }
        });
        // Filter and sort cleanly
        targetEmployeeIds = distinctEmps.filter(Boolean).sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a).localeCompare(String(b));
        });
        console.log(`📋 Found ${targetEmployeeIds.length} distinct employees with logs.\n`);
    }

    if (targetEmployeeIds.length === 0) {
        console.log('ℹ️ No employees to sync.');
        await mongoose.disconnect();
        return;
    }

    const startTime = Date.now();
    let totalLogsSent = 0;
    let successEmployees = 0;
    let failedEmployees = [];

    console.log('🚀 Starting sync...\n');

    for (let idx = 0; idx < targetEmployeeIds.length; idx++) {
        const empId = targetEmployeeIds[idx];
        const progress = `[${idx + 1}/${targetEmployeeIds.length}] (${Math.round(((idx + 1) / targetEmployeeIds.length) * 100)}%)`;

        const logs = await AttendanceLog.find({
            employeeId: empId,
            timestamp: { $gte: START_DATE, $lte: END_DATE }
        }).sort({ timestamp: 1 }).lean();

        if (!logs.length) {
            continue;
        }

        const payload = logs.map(l => {
            const ts = l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp;
            const timestamp = typeof ts === 'string' && !ts.endsWith('Z') ? `${ts}Z` : ts;
            return {
                employeeId: l.employeeId,
                timestamp,
                logType: l.logType,
                deviceId: l.deviceId || 'UNKNOWN',
                deviceName: l.deviceName || 'UNKNOWN',
                rawStatus: l.rawType ?? null,
            };
        });

        const result = await sendBatchWithRetry(payload);

        if (result.success) {
            totalLogsSent += payload.length;
            successEmployees++;
            const accepted = result.data.processedCount ?? result.data.processed ?? payload.length;
            console.log(`  ${progress} Emp: ${empId.padEnd(8)} | ${String(payload.length).padStart(3)} logs -> Accepted: ${accepted}`);
        } else {
            failedEmployees.push({ empId, error: result.error });
            console.error(`  ❌ ${progress} Emp: ${empId} FAILED: ${result.error}`);
        }

        // Small delay to let backend engine write smoothly
        await new Promise(r => setTimeout(r, 150));
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    console.log('\n============================================================');
    console.log('🎉 SYNC COMPLETED');
    console.log('============================================================');
    console.log(`⏱️ Total Time        : ${elapsedSec} seconds`);
    console.log(`👥 Employees Synced  : ${successEmployees}/${targetEmployeeIds.length}`);
    console.log(`📊 Total Logs Sent   : ${totalLogsSent}`);
    if (failedEmployees.length > 0) {
        console.log(`⚠️ Failures (${failedEmployees.length}):`, failedEmployees);
    }
    console.log('============================================================\n');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Script crashed:', err);
    process.exit(1);
});
