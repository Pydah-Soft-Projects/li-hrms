/**
 * Simulation: biometric HRMS outbox + catch-up worker.
 *
 * Starts a fake HRMS (can go down / hang / 400 / 500), uses a dedicated Mongo DB,
 * and drives the real catch-up service. Does not touch production biometric_logs.
 *
 * Usage: node scripts/simulate_hrms_catchup.js
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');

const PREFIX = 'SIMCATCH';
const DEVICE_ID = 'SIM-DEVICE';
const DEVICE_NAME = 'Simulation Device';

const results = [];
const fakeHrms = {
    mode: 'up', // up | hang | fail500 | fail400bad
    received: [],
    unique: new Set(),
    healthHits: 0,
    syncHits: 0,
};

function check(name, cond, detail) {
    const ok = Boolean(cond);
    results.push({ name, ok, detail: detail || '' });
    const mark = ok ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
    return ok;
}

function logKey(emp, ts) {
    return `${String(emp).toUpperCase()}|${new Date(ts).toISOString()}`;
}

function startFakeHrms() {
    const server = http.createServer((req, res) => {
        if (fakeHrms.mode === 'hang') {
            return;
        }

        if (req.method === 'GET' && req.url && req.url.startsWith('/health')) {
            fakeHrms.healthHits += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy' }));
            return;
        }

        if (req.method === 'POST' && req.url && req.url.startsWith('/api/internal/attendance/sync')) {
            fakeHrms.syncHits += 1;
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                if (fakeHrms.mode === 'fail500') {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'simulated 500' }));
                    return;
                }

                let logs = [];
                try {
                    logs = JSON.parse(body);
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'bad json' }));
                    return;
                }

                if (fakeHrms.mode === 'fail400bad' && logs.some((l) => String(l.employeeId) === `${PREFIX}-BAD`)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid log structure' }));
                    return;
                }

                let inserted = 0;
                let duplicates = 0;
                for (const log of logs) {
                    const key = logKey(log.employeeId, log.timestamp);
                    fakeHrms.received.push(log);
                    if (fakeHrms.unique.has(key)) {
                        duplicates += 1;
                    } else {
                        fakeHrms.unique.add(key);
                        inserted += 1;
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    processed: logs.length,
                    inserted,
                    duplicates,
                    message: 'simulated sync',
                }));
            });
            return;
        }

        res.writeHead(404);
        res.end('not found');
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, port });
        });
    });
}

function stopListening(server) {
    return new Promise((resolve) => server.close(() => resolve()));
}

async function punch(AttendanceLog, emp, minutesAgo, extra = {}) {
    const timestamp = extra.timestamp || new Date(Date.now() - minutesAgo * 60 * 1000);
    const doc = await AttendanceLog.create({
        employeeId: emp,
        timestamp,
        logType: extra.logType || 'CHECK-IN',
        rawType: extra.rawType != null ? extra.rawType : 0,
        deviceId: DEVICE_ID,
        deviceName: DEVICE_NAME,
        syncedAt: new Date(),
        hrmsSyncStatus: extra.hrmsSyncStatus === undefined ? 'pending' : extra.hrmsSyncStatus,
        hrmsSyncAttempts: extra.hrmsSyncAttempts || 0,
        hrmsLastError: extra.hrmsLastError || undefined,
        createdAt: extra.createdAt,
        updatedAt: extra.updatedAt,
    });
    return doc;
}

async function statusOf(AttendanceLog, emp) {
    return AttendanceLog.findOne({ employeeId: emp }).lean();
}

async function countByStatus(AttendanceLog) {
    const rows = await AttendanceLog.aggregate([
        { $match: { employeeId: { $regex: `^${PREFIX}` } } },
        { $group: { _id: '$hrmsSyncStatus', n: { $sum: 1 } } },
    ]);
    const map = { pending: 0, syncing: 0, synced: 0, failed: 0, unset: 0 };
    for (const row of rows) {
        if (!row._id) map.unset += row.n;
        else map[row._id] = row.n;
    }
    return map;
}

async function clearOpenOutbox(AttendanceLog) {
    await AttendanceLog.updateMany(
        { employeeId: { $regex: `^${PREFIX}` }, hrmsSyncStatus: { $in: ['pending', 'syncing'] } },
        { $set: { hrmsSyncStatus: 'synced', hrmsNextRetryAt: null } }
    );
}

function payloadFromDoc(doc) {
    return {
        employeeId: doc.employeeId,
        timestamp: doc.timestamp,
        logType: doc.logType,
        deviceId: doc.deviceId,
        deviceName: doc.deviceName,
        rawStatus: doc.rawType,
    };
}

async function main() {
    console.log('\n======== HRMS catch-up simulation ========\n');

    const { server, port } = await startFakeHrms();
    process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
    process.env.HRMS_MICROSERVICE_SECRET_KEY = 'sim-key';
    process.env.HRMS_CATCHUP_ENABLED = 'true';
    process.env.HRMS_CATCHUP_BATCH_SIZE = '10';
    process.env.HRMS_CATCHUP_LOOKBACK_HOURS = '48';
    process.env.HRMS_CATCHUP_MAX_ATTEMPTS = '3';
    process.env.HRMS_CATCHUP_BATCH_GAP_MS = '0';
    process.env.HRMS_CATCHUP_MAX_BATCHES_PER_TICK = '10';
    process.env.HRMS_CATCHUP_STALE_SYNCING_MS = '30000';
    process.env.HRMS_LIVE_SYNC_TIMEOUT_MS = '400';
    process.env.HRMS_CATCHUP_TIMEOUT_MS = '800';
    process.env.HRMS_HEALTH_TIMEOUT_MS = '300';
    process.env.HRMS_CATCHUP_PENDING_ALERT_THRESHOLD = '100';

    const hrmsAttendanceSync = require('../src/services/hrmsAttendanceSyncService');
    const HrmsCatchUpScheduler = require('../src/jobs/hrmsCatchUpScheduler');
    const AttendanceLog = require('../src/models/AttendanceLog');

    console.log('--- 1. Error classification (no DB) ---');
    check(
        'ECONNREFUSED is connection (not timeout)',
        hrmsAttendanceSync.classifySyncError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }) === 'connection'
    );
    check(
        'ECONNRESET is connection',
        hrmsAttendanceSync.classifySyncError({ code: 'ECONNRESET', message: 'socket hang up' }) === 'connection'
    );
    check(
        'axios timeout is timeout, not connection',
        hrmsAttendanceSync.classifySyncError({ code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' }) === 'timeout'
    );
    check(
        'HTTP 400 is client',
        hrmsAttendanceSync.classifySyncError({ response: { status: 400, data: { message: 'bad' } } }) === 'client'
    );
    check(
        'HTTP 500 is server',
        hrmsAttendanceSync.classifySyncError({ response: { status: 500, data: { message: 'down' } } }) === 'server'
    );
    check(
        'CHECK-IN maps to sync payload',
        hrmsAttendanceSync.mapLogToSyncPayload({
            employeeId: '1001',
            timestamp: new Date('2026-08-22T08:00:00.000Z'),
            logType: 'CHECK-IN',
            deviceId: 'D1',
            deviceName: 'Gate',
            rawType: 0,
        })?.logType === 'CHECK-IN'
    );
    check(
        'garbage logType is rejected',
        hrmsAttendanceSync.mapLogToSyncPayload({
            employeeId: '1001',
            timestamp: new Date(),
            logType: 'THUMB',
            deviceId: 'D1',
            deviceName: 'Gate',
        }) === null
    );

    const mongoUri = process.env.HRMS_CATCHUP_SIM_MONGODB_URI
        || process.env.MONGODB_URI
        || 'mongodb://127.0.0.1:27017/biometric_catchup_sim';

    console.log(`\n--- 2. Connect Mongo (${mongoUri.replace(/\/\/.*@/, '//***@')}) ---`);
    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 8000,
            dbName: 'biometric_catchup_sim',
        });
        check('Mongo connected for simulation DB', mongoose.connection.readyState === 1, mongoose.connection.name);
    } catch (err) {
        check('Mongo connected for simulation DB', false, err.message);
        console.log('\nMongo is required for the live/catch-up simulation. Classification tests above still ran.');
        server.close();
        printSummary();
        process.exit(1);
    }

    await AttendanceLog.deleteMany({ employeeId: { $regex: `^${PREFIX}` } });

    const scheduler = new HrmsCatchUpScheduler();

    try {
        console.log('\n--- 3. Live POST while HRMS is UP ---');
        fakeHrms.mode = 'up';
        const liveOk = await punch(AttendanceLog, `${PREFIX}-LIVEOK`, 1);
        const liveResult = await hrmsAttendanceSync.dispatchLiveSync([payloadFromDoc(liveOk)]);
        const liveAfter = await statusOf(AttendanceLog, `${PREFIX}-LIVEOK`);
        check('live success returns ok', liveResult.ok === true, `marked=${liveResult.marked}`);
        check('live success marks local row synced', liveAfter.hrmsSyncStatus === 'synced');
        check('HRMS stored the live punch', fakeHrms.unique.has(logKey(liveOk.employeeId, liveOk.timestamp)));

        console.log('\n--- 4. Connection lost: live POST fails, punch stays in biometric ---');
        await stopListening(server);
        const lost = await punch(AttendanceLog, `${PREFIX}-LOST`, 2);
        const lostResult = await hrmsAttendanceSync.dispatchLiveSync([payloadFromDoc(lost)]);
        const lostAfter = await statusOf(AttendanceLog, `${PREFIX}-LOST`);
        check('live connection error is classified as connection', lostResult.kind === 'connection', lostResult.error);
        check('lost punch stays pending in biometric', lostAfter.hrmsSyncStatus === 'pending');
        check('lost punch is NOT in HRMS yet', !fakeHrms.unique.has(logKey(lost.employeeId, lost.timestamp)));

        console.log('\n--- 5. Catch-up while HRMS still down ---');
        const beforeHits = fakeHrms.syncHits;
        await scheduler.tick();
        const stillPending = await statusOf(AttendanceLog, `${PREFIX}-LOST`);
        check('worker does not drain while backend is down', stillPending.hrmsSyncStatus === 'pending');
        check('no sync POST while backend is down', fakeHrms.syncHits === beforeHits, `syncHits=${fakeHrms.syncHits}`);
        check('worker snapshot says unreachable', scheduler.getSnapshot().hrmsReachable === false);

        console.log('\n--- 6. HRMS comes back: catch-up sends pending punches ---');
        await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
        fakeHrms.mode = 'up';
        const extraPending = await punch(AttendanceLog, `${PREFIX}-LOST2`, 3);
        await scheduler.tick();
        const recovered1 = await statusOf(AttendanceLog, `${PREFIX}-LOST`);
        const recovered2 = await statusOf(AttendanceLog, `${PREFIX}-LOST2`);
        check('first lost punch marked synced after catch-up', recovered1.hrmsSyncStatus === 'synced');
        check('second pending punch marked synced after catch-up', recovered2.hrmsSyncStatus === 'synced');
        check('HRMS now has first lost punch', fakeHrms.unique.has(logKey(lost.employeeId, lost.timestamp)));
        check('HRMS now has second pending punch', fakeHrms.unique.has(logKey(extraPending.employeeId, extraPending.timestamp)));
        check('worker recorded a drain', Boolean(scheduler.getSnapshot().lastDrain?.sent > 0), JSON.stringify(scheduler.getSnapshot().lastDrain));

        console.log('\n--- 7. Existing history is not replayed ---');
        const legacy = await AttendanceLog.create({
            employeeId: `${PREFIX}-LEGACY`,
            timestamp: new Date(Date.now() - 4 * 60 * 1000),
            logType: 'CHECK-IN',
            rawType: 0,
            deviceId: DEVICE_ID,
            deviceName: DEVICE_NAME,
            syncedAt: new Date(),
        });
        await AttendanceLog.updateOne({ _id: legacy._id }, { $unset: { hrmsSyncStatus: 1 } });
        const claimed = await hrmsAttendanceSync.claimPendingBatch(hrmsAttendanceSync.getCatchUpConfig());
        const claimedEmps = claimed.map((r) => r.employeeId);
        check('legacy row with no status is not claimed', !claimedEmps.includes(`${PREFIX}-LEGACY`), `claimed=${claimedEmps.join(',') || 'none'}`);
        if (claimed.length) {
            await AttendanceLog.updateMany(
                { _id: { $in: claimed.map((r) => r._id) } },
                { $set: { hrmsSyncStatus: 'pending' } }
            );
        }

        console.log('\n--- 8. $setOnInsert: re-push does not reset a synced punch to pending ---');
        const tsReuse = new Date(Date.now() - 5 * 60 * 1000);
        await AttendanceLog.bulkWrite([{
            updateOne: {
                filter: { employeeId: `${PREFIX}-UPSERT`, timestamp: tsReuse },
                update: {
                    $set: {
                        logType: 'CHECK-IN',
                        rawType: 0,
                        deviceName: DEVICE_NAME,
                        deviceId: DEVICE_ID,
                        syncedAt: new Date(),
                    },
                    $setOnInsert: {
                        hrmsSyncStatus: 'pending',
                        hrmsSyncAttempts: 0,
                        createdAt: new Date(),
                    },
                },
                upsert: true,
            },
        }]);
        const firstUpsert = await AttendanceLog.findOne({ employeeId: `${PREFIX}-UPSERT` }).lean();
        check('first ADMS upsert is pending', firstUpsert.hrmsSyncStatus === 'pending');
        await AttendanceLog.updateOne({ _id: firstUpsert._id }, { $set: { hrmsSyncStatus: 'synced' } });
        await AttendanceLog.bulkWrite([{
            updateOne: {
                filter: { employeeId: `${PREFIX}-UPSERT`, timestamp: tsReuse },
                update: {
                    $set: {
                        logType: 'CHECK-IN',
                        rawType: 0,
                        deviceName: DEVICE_NAME,
                        deviceId: DEVICE_ID,
                        syncedAt: new Date(),
                    },
                    $setOnInsert: {
                        hrmsSyncStatus: 'pending',
                        hrmsSyncAttempts: 0,
                        createdAt: new Date(),
                    },
                },
                upsert: true,
            },
        }]);
        const secondUpsert = await AttendanceLog.findOne({ employeeId: `${PREFIX}-UPSERT` }).lean();
        check('re-push of already-synced punch stays synced', secondUpsert.hrmsSyncStatus === 'synced');

        console.log('\n--- 9. Duplicate resend does not create a second HRMS row ---');
        const dup = await punch(AttendanceLog, `${PREFIX}-DUP`, 6);
        await hrmsAttendanceSync.dispatchLiveSync([payloadFromDoc(dup)]);
        const uniqueBefore = fakeHrms.unique.size;
        await AttendanceLog.updateOne({ _id: dup._id }, { $set: { hrmsSyncStatus: 'pending' } });
        await scheduler.tick();
        const dupAfter = await statusOf(AttendanceLog, `${PREFIX}-DUP`);
        check('catch-up resend still only one HRMS unique key', fakeHrms.unique.size === uniqueBefore, `unique=${fakeHrms.unique.size}`);
        check('duplicate resend still marked synced locally', dupAfter.hrmsSyncStatus === 'synced');

        console.log('\n--- 10. Lookback: old pending expires to failed, recent pending is kept ---');
        const oldPending = await punch(AttendanceLog, `${PREFIX}-OLD`, 7, {
            createdAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
        });
        await AttendanceLog.collection.updateOne(
            { _id: oldPending._id },
            { $set: { createdAt: new Date(Date.now() - 50 * 60 * 60 * 1000), hrmsSyncStatus: 'pending' } }
        );
        const expired = await hrmsAttendanceSync.expirePendingOutsideLookback(hrmsAttendanceSync.getCatchUpConfig());
        const oldAfter = await statusOf(AttendanceLog, `${PREFIX}-OLD`);
        check('expired at least one lookback row', expired >= 1, `expired=${expired}`);
        check('50h-old pending is failed', oldAfter.hrmsSyncStatus === 'failed' && oldAfter.hrmsLastError === 'expired_outside_catchup_lookback');

        console.log('\n--- 11. Stale syncing rows are reclaimed ---');
        const stale = await punch(AttendanceLog, `${PREFIX}-STALE`, 8, { hrmsSyncStatus: 'syncing' });
        await AttendanceLog.collection.updateOne(
            { _id: stale._id },
            { $set: { hrmsSyncStatus: 'syncing', updatedAt: new Date(Date.now() - 10 * 60 * 1000) } }
        );
        const reclaimed = await hrmsAttendanceSync.reclaimStaleSyncing(hrmsAttendanceSync.getCatchUpConfig());
        const staleAfter = await statusOf(AttendanceLog, `${PREFIX}-STALE`);
        check('reclaimed stale syncing row', reclaimed >= 1, `reclaimed=${reclaimed}`);
        check('stale syncing is pending again', staleAfter.hrmsSyncStatus === 'pending');

        console.log('\n--- 12. HTTP 500: stay pending, do not burn attempt budget ---');
        await clearOpenOutbox(AttendanceLog);
        fakeHrms.mode = 'fail500';
        const s500 = await punch(AttendanceLog, `${PREFIX}-S500`, 9);
        await AttendanceLog.updateOne({ _id: s500._id }, { $set: { hrmsSyncStatus: 'syncing' } });
        const drain500 = await hrmsAttendanceSync.drainClaimedBatch(
            [await AttendanceLog.findById(s500._id).lean()],
            hrmsAttendanceSync.getCatchUpConfig()
        );
        const s500After = await statusOf(AttendanceLog, `${PREFIX}-S500`);
        check('5xx drain stops the tick', drain500.stop === true && drain500.kind === 'server');
        check('5xx punch stays pending', s500After.hrmsSyncStatus === 'pending');
        check('5xx does not increment attempts', (s500After.hrmsSyncAttempts || 0) === 0, `attempts=${s500After.hrmsSyncAttempts}`);

        console.log('\n--- 13. Timeout: pending with backoff, attempts incremented ---');
        await clearOpenOutbox(AttendanceLog);
        fakeHrms.mode = 'hang';
        const hung = await punch(AttendanceLog, `${PREFIX}-HANG`, 10);
        await AttendanceLog.updateOne({ _id: hung._id }, { $set: { hrmsSyncStatus: 'syncing' } });
        const drainHang = await hrmsAttendanceSync.drainClaimedBatch(
            [await AttendanceLog.findById(hung._id).lean()],
            hrmsAttendanceSync.getCatchUpConfig()
        );
        const hungAfter = await statusOf(AttendanceLog, `${PREFIX}-HANG`);
        check('timeout classified as timeout', drainHang.kind === 'timeout', drainHang.error);
        check('timeout punch stays pending', hungAfter.hrmsSyncStatus === 'pending');
        check('timeout increments attempts', hungAfter.hrmsSyncAttempts === 1, `attempts=${hungAfter.hrmsSyncAttempts}`);
        check('timeout sets nextRetryAt', Boolean(hungAfter.hrmsNextRetryAt));
        if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
        }
        fakeHrms.mode = 'up';

        console.log('\n--- 14. Poison 400 in a mixed batch: isolate, fail bad, sync good ---');
        await clearOpenOutbox(AttendanceLog);
        fakeHrms.mode = 'fail400bad';
        const good = await punch(AttendanceLog, `${PREFIX}-GOOD`, 11);
        const bad = await punch(AttendanceLog, `${PREFIX}-BAD`, 12);
        const mixed = await AttendanceLog.find({
            employeeId: { $in: [`${PREFIX}-GOOD`, `${PREFIX}-BAD`] },
        }).sort({ createdAt: 1 }).lean();
        await AttendanceLog.updateMany(
            { _id: { $in: mixed.map((r) => r._id) } },
            { $set: { hrmsSyncStatus: 'syncing' } }
        );
        const drainMixed = await hrmsAttendanceSync.drainClaimedBatch(mixed, hrmsAttendanceSync.getCatchUpConfig());
        const goodAfter = await statusOf(AttendanceLog, `${PREFIX}-GOOD`);
        const badAfter = await statusOf(AttendanceLog, `${PREFIX}-BAD`);
        check('mixed 400 isolation sent the good punch', drainMixed.sent >= 1, `sent=${drainMixed.sent} failed=${drainMixed.failed}`);
        check('good punch in mixed batch is synced', goodAfter.hrmsSyncStatus === 'synced');
        check('bad punch in mixed batch is failed', badAfter.hrmsSyncStatus === 'failed');
        fakeHrms.mode = 'up';

        console.log('\n--- 15. Invalid local payload is failed, not retried forever ---');
        const invalid = await punch(AttendanceLog, `${PREFIX}-INVALID`, 13, { logType: 'CHECK-IN' });
        await AttendanceLog.collection.updateOne({ _id: invalid._id }, { $set: { logType: 'THUMB' } });
        const invalidDoc = await AttendanceLog.findById(invalid._id).lean();
        await AttendanceLog.updateOne({ _id: invalid._id }, { $set: { hrmsSyncStatus: 'syncing' } });
        await hrmsAttendanceSync.drainClaimedBatch([invalidDoc], hrmsAttendanceSync.getCatchUpConfig());
        const invalidAfter = await statusOf(AttendanceLog, `${PREFIX}-INVALID`);
        check('invalid payload marked failed', invalidAfter.hrmsSyncStatus === 'failed' && invalidAfter.hrmsLastError === 'invalid_local_payload');

        console.log('\n--- 16. Burst catch-up: 12 pending punches drain in batches ---');
        await clearOpenOutbox(AttendanceLog);
        fakeHrms.mode = 'up';
        const burstEmps = [];
        for (let i = 0; i < 12; i += 1) {
            const doc = await punch(AttendanceLog, `${PREFIX}-BURST${i}`, 20 + i);
            burstEmps.push(doc.employeeId);
        }
        const uniqueBeforeBurst = fakeHrms.unique.size;
        await scheduler.tick();
        const burstRows = await AttendanceLog.find({ employeeId: { $in: burstEmps } }).lean();
        const burstSynced = burstRows.filter((r) => r.hrmsSyncStatus === 'synced').length;
        check('all 12 burst punches marked synced', burstSynced === 12, `synced=${burstSynced}`);
        check('HRMS unique keys grew by 12', fakeHrms.unique.size === uniqueBeforeBurst + 12, `unique delta=${fakeHrms.unique.size - uniqueBeforeBurst}`);

        console.log('\n--- 17. Full story: punch during outage, then backend returns ---');
        await clearOpenOutbox(AttendanceLog);
        await stopListening(server);
        const storyBio = await punch(AttendanceLog, `${PREFIX}-STORY`, 1);
        const storyLive = await hrmsAttendanceSync.dispatchLiveSync([payloadFromDoc(storyBio)]);
        const storyWhileDown = await statusOf(AttendanceLog, `${PREFIX}-STORY`);
        check('story: live fails as connection while HRMS down', storyLive.kind === 'connection');
        check('story: biometric kept the punch pending', storyWhileDown.hrmsSyncStatus === 'pending');
        await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
        fakeHrms.mode = 'up';
        await scheduler.tick();
        const storyAfter = await statusOf(AttendanceLog, `${PREFIX}-STORY`);
        check('story: catch-up delivered punch after HRMS returned', storyAfter.hrmsSyncStatus === 'synced');
        check('story: HRMS has the delayed punch', fakeHrms.unique.has(logKey(storyBio.employeeId, storyBio.timestamp)));

        const counts = await countByStatus(AttendanceLog);
        console.log('\n--- Final SIMCATCH status counts ---');
        console.log(`  pending=${counts.pending}  syncing=${counts.syncing}  synced=${counts.synced}  failed=${counts.failed}  unset=${counts.unset}`);
        console.log(`  fake HRMS unique punches=${fakeHrms.unique.size}  syncHits=${fakeHrms.syncHits}  healthHits=${fakeHrms.healthHits}`);
    } finally {
        await AttendanceLog.deleteMany({ employeeId: { $regex: `^${PREFIX}` } });
        await mongoose.disconnect();
        await stopListening(server).catch(() => {});
        server.close();
    }

    printSummary();
    process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary() {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log('\n======== results ========');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failed) {
        console.log('Failed cases:');
        for (const row of results.filter((r) => !r.ok)) {
            console.log(`  - ${row.name}${row.detail ? ` (${row.detail})` : ''}`);
        }
    }
    console.log('=========================\n');
}

main().catch(async (err) => {
    console.error('\nSimulation crashed:', err);
    try {
        await mongoose.disconnect();
    } catch (_) { /* ignore */ }
    process.exit(1);
});
