/**
 * Remap punches stored under a device user id (ZK uid) to an HRMS emp_no, then POST to backend.
 *
 * Use case: thumb logs for device user 159 on device NFZ8244504974 should belong to employee 21514.
 *
 * Flow:
 *   1) Optional: TCP pull into Mongo — POST biometric service /api/devices/:deviceId/attendance/sync
 *   2) Copy each AttendanceLog row from REMAP_FROM_USER → REMAP_TO_EMP (same device), respecting unique (employeeId + timestamp)
 *   3) Optional: POST batches to HRMS /api/internal/attendance/sync
 *
 * PowerShell examples:
 *   cd biometric
 *   # Dry-run (count only)
 *   $env:DRY_RUN="1"; $env:REMAP_DEVICE_ID="NFZ8244504974"; $env:REMAP_FROM_USER="159"; $env:REMAP_TO_EMP="21514"; node scripts/remap_device_user_to_employee_and_push.js
 *
 *   # Pull from device first (biometric app must be running and able to reach device IP)
 *   $env:PULL_FROM_DEVICE="1"; $env:BIOMETRIC_SERVICE_URL="http://localhost:4000"; $env:REMAP_DEVICE_ID="NFZ8244504974"; $env:REMAP_START="2026-01-01"; $env:REMAP_END="2026-04-24"; node scripts/remap_device_user_to_employee_and_push.js
 *
 *   # Remap + push (set dates to bound the window you care about)
 *   $env:REMAP_DEVICE_ID="NFZ8244504974"; $env:REMAP_FROM_USER="159"; $env:REMAP_TO_EMP="21514"; $env:REMAP_START="2026-01-01"; $env:REMAP_END="2026-04-24"; node scripts/remap_device_user_to_employee_and_push.js
 *
 *   # Remap only (no HTTP to HRMS)
 *   $env:SKIP_PUSH="1"; ...
 *
 *   # Push only (after remap); same date window
 *   $env:SKIP_REMAP="1"; $env:REMAP_TO_EMP="21514"; $env:REMAP_DEVICE_ID="NFZ8244504974"; ...
 *
 *   # After remap, push only rows tagged remappedFromDeviceUser (not entire emp+device history)
 *   $env:PUSH_REMAPPED_ONLY="1"; ...
 *
 *   # Same run as remap: default is remapped-only push. To re-push all punches for that emp+device:
 *   $env:PUSH_ALL_FOR_DEVICE="1"; ...
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const SYNC_ENDPOINT = `${BACKEND_URL}/api/internal/attendance/sync`;
const SYSTEM_KEY = process.env.HRMS_MICROSERVICE_SECRET_KEY;
const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '200', 10);
const RETRY_ATTEMPTS = parseInt(process.env.SYNC_RETRY || '3', 10);
const DELAY_MS = parseInt(process.env.SYNC_DELAY || '1000', 10);

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
    mongoose.models.AttendanceLogRemapHelper ||
    mongoose.model('AttendanceLogRemapHelper', attendanceLogSchema, 'attendancelogs');

function truthy(v) {
    const s = String(v || '').trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
}

function parseDayBoundary(d, endOfDay) {
    if (!d || !String(d).trim()) return null;
    const str = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const x = new Date(`${str}T00:00:00.000Z`);
        if (endOfDay) x.setUTCHours(23, 59, 59, 999);
        return x;
    }
    const dt = new Date(str);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function employeeIdVariants(uid) {
    const s = String(uid).trim();
    const n = Number(s);
    const out = new Set([s]);
    if (Number.isFinite(n)) out.add(String(n));
    return [...out];
}

async function pullFromDevice(deviceId) {
    const base = String(process.env.BIOMETRIC_SERVICE_URL || process.env.BIOMETRIC_BASE_URL || '').replace(/\/$/, '');
    if (!base) {
        throw new Error('Set BIOMETRIC_SERVICE_URL (e.g. http://localhost:4000) when PULL_FROM_DEVICE=1');
    }
    const startDate = process.env.REMAP_START && /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.REMAP_START).trim())
        ? String(process.env.REMAP_START).trim()
        : undefined;
    const endDate = process.env.REMAP_END && /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.REMAP_END).trim())
        ? String(process.env.REMAP_END).trim()
        : undefined;
    const url = `${base}/api/devices/${encodeURIComponent(deviceId)}/attendance/sync`;
    const body = {};
    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;
    const { data } = await axios.post(url, body, { timeout: 600000 });
    return data;
}

async function remapLogs({
    deviceId, fromUid, toEmp, start, end, dryRun,
}) {
    const idVariants = employeeIdVariants(fromUid);
    const toEmpStr = String(toEmp).trim();
    const filter = {
        deviceId,
        employeeId: { $in: idVariants },
    };
    if (start || end) {
        filter.timestamp = {};
        if (start) filter.timestamp.$gte = start;
        if (end) filter.timestamp.$lte = end;
    }

    const total = await AttendanceLog.countDocuments(filter);
    console.log(`\nRemap filter: deviceId=${deviceId} employeeId in [${idVariants.join(', ')}] → ${toEmpStr}`);
    console.log(`Matching documents: ${total}${dryRun ? ' (DRY_RUN — no writes)' : ''}\n`);

    if (total === 0 || dryRun) {
        return { total, remapped: 0, skippedConflict: 0, insertErrors: 0 };
    }

    const cursor = AttendanceLog.find(filter).sort({ timestamp: 1 }).cursor();
    let remapped = 0;
    let skippedConflict = 0;
    let insertErrors = 0;

    for await (const log of cursor) {
        const exists = await AttendanceLog.exists({
            employeeId: toEmpStr,
            timestamp: log.timestamp,
        });
        if (exists) {
            skippedConflict++;
            continue;
        }

        const o = log.toObject ? log.toObject() : { ...log };
        delete o._id;
        delete o.__v;
        const rawData = { ...(o.rawData && typeof o.rawData === 'object' ? o.rawData : {}), remappedFromDeviceUser: String(fromUid), remappedAt: new Date().toISOString() };

        try {
            await AttendanceLog.create({
                ...o,
                employeeId: toEmpStr,
                rawData,
                syncedAt: new Date(),
            });
            await AttendanceLog.deleteOne({ _id: log._id });
            remapped++;
            if (remapped % 50 === 0) {
                process.stdout.write(`\r   Remapped: ${remapped}/${total}`);
            }
        } catch (e) {
            if (e && e.code === 11000) {
                skippedConflict++;
            } else {
                insertErrors++;
                console.error(`\n   Insert error: ${e.message}`);
            }
        }
    }
    if (remapped > 0) process.stdout.write('\n');
    return { total, remapped, skippedConflict, insertErrors };
}

async function pushToBackend({ deviceId, toEmpStr, start, end, remappedOnly }) {
    if (!SYSTEM_KEY) {
        throw new Error('HRMS_MICROSERVICE_SECRET_KEY is required for push');
    }
    const filter = { employeeId: toEmpStr };
    if (deviceId) filter.deviceId = deviceId;
    if (remappedOnly) {
        filter['rawData.remappedFromDeviceUser'] = { $exists: true };
    }
    if (start || end) {
        filter.timestamp = {};
        if (start) filter.timestamp.$gte = start;
        if (end) filter.timestamp.$lte = end;
    }

    const total = await AttendanceLog.countDocuments(filter);
    console.log(`\nPush to HRMS: ${SYNC_ENDPOINT}`);
    console.log(
        `Logs to send: ${total} (employeeId=${toEmpStr}${deviceId ? ` deviceId=${deviceId}` : ''}${remappedOnly ? ' remapped-only' : ''})\n`,
    );

    let processed = 0;
    let batchNum = 0;
    const totalBatches = Math.ceil(total / BATCH_SIZE) || 0;

    for (let skip = 0; skip < total; skip += BATCH_SIZE) {
        batchNum++;
        const logs = await AttendanceLog.find(filter)
            .sort({ timestamp: 1 })
            .skip(skip)
            .limit(BATCH_SIZE)
            .lean();

        const payload = logs.map((log) => {
            const ts = log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp;
            const timestamp = typeof ts === 'string' && !ts.endsWith('Z') ? `${ts}Z` : ts;
            return {
                employeeId: log.employeeId,
                timestamp,
                logType: log.logType,
                deviceId: log.deviceId || 'UNKNOWN',
                deviceName: log.deviceName || 'UNKNOWN',
                rawStatus: log.rawType ?? null,
            };
        });

        let attempt = 0;
        let ok = false;
        while (attempt < RETRY_ATTEMPTS && !ok) {
            try {
                const response = await axios.post(SYNC_ENDPOINT, payload, {
                    headers: { 'x-system-key': SYSTEM_KEY },
                    timeout: 180000,
                });
                processed += logs.length;
                ok = true;
                process.stdout.write(
                    `\r   Batch ${batchNum}/${totalBatches} — sent ${processed}/${total} | backend: ${JSON.stringify(response.data).slice(0, 120)}`,
                );
            } catch (err) {
                attempt++;
                const status = err.response
                    ? `HTTP ${err.response.status} - ${JSON.stringify(err.response.data)}`
                    : err.message;
                if (attempt >= RETRY_ATTEMPTS) {
                    console.error(`\n   Batch ${batchNum} failed: ${status}`);
                    throw err;
                }
                await new Promise((r) => setTimeout(r, 5000));
            }
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    if (total > 0) console.log('\n');
    return { pushed: processed };
}

async function main() {
    const mongoURI = process.env.BIOMETRIC_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
        throw new Error('Set BIOMETRIC_MONGODB_URI or MONGODB_URI in biometric/.env');
    }

    const deviceId = String(process.env.REMAP_DEVICE_ID || '').trim();
    const fromUid = process.env.REMAP_FROM_USER;
    const toEmp = process.env.REMAP_TO_EMP;
    const dryRun = truthy(process.env.DRY_RUN);
    const skipRemap = truthy(process.env.SKIP_REMAP);
    const skipPush = truthy(process.env.SKIP_PUSH);
    const pullFirst = truthy(process.env.PULL_FROM_DEVICE);

    if (!deviceId) {
        throw new Error('Set REMAP_DEVICE_ID (e.g. NFZ8244504974)');
    }
    if (!skipRemap && (fromUid === undefined || fromUid === null || String(fromUid).trim() === '')) {
        throw new Error('Set REMAP_FROM_USER (device user id, e.g. 159) or SKIP_REMAP=1');
    }
    if (!toEmp || String(toEmp).trim() === '') {
        throw new Error('Set REMAP_TO_EMP (HRMS emp_no, e.g. 21514)');
    }

    const start = parseDayBoundary(process.env.REMAP_START, false);
    const end = parseDayBoundary(process.env.REMAP_END, true);
    if (process.env.REMAP_START && !start) {
        throw new Error('REMAP_START must be YYYY-MM-DD or a valid ISO date');
    }
    if (process.env.REMAP_END && !end) {
        throw new Error('REMAP_END must be YYYY-MM-DD or a valid ISO date');
    }

    console.log('\n═══ Remap device user → employee + optional HRMS push ═══\n');
    await mongoose.connect(mongoURI);
    console.log('Connected to biometric MongoDB\n');

    if (pullFirst) {
        console.log('PULL_FROM_DEVICE: requesting TCP sync from biometric service...');
        const pullResult = await pullFromDevice(deviceId);
        console.log('Pull result:', JSON.stringify(pullResult, null, 2), '\n');
    }

    const toEmpStr = String(toEmp).trim();

    if (!skipRemap) {
        const stats = await remapLogs({
            deviceId,
            fromUid,
            toEmp,
            start,
            end,
            dryRun,
        });
        console.log('Remap summary:', stats);
    } else {
        console.log('SKIP_REMAP: leaving AttendanceLog documents unchanged.\n');
    }

    if (!skipPush && !dryRun) {
        const pushAll = truthy(process.env.PUSH_ALL_FOR_DEVICE);
        const remappedOnly = pushAll
            ? false
            : (truthy(process.env.PUSH_REMAPPED_ONLY) || (!skipRemap && !dryRun));
        await pushToBackend({ deviceId, toEmpStr, start, end, remappedOnly });
        console.log('Push finished.');
    } else if (dryRun) {
        console.log('DRY_RUN: skipped HRMS push.');
    } else {
        console.log('SKIP_PUSH: skipped HRMS push.');
    }

    await mongoose.disconnect();
    console.log('\nDone.\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
