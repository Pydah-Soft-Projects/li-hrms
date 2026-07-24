const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const admsParser = require('../utils/admsParser');
const AttendanceLog = require('../models/AttendanceLog');
const AdmsRawLog = require('../models/AdmsRawLog');
const Device = require('../models/Device');
const DeviceCommand = require('../models/DeviceCommand');
const DeviceUser = require('../models/DeviceUser');
const { getEffectiveOperationMode, resolveLogType } = require('../utils/operationModeResolver');
const {
    cloneUserToDevices,
    autoCloneUserWithinCategory,
    deactivateUsersOnDevice,
    activateUsersOnDevice
} = require('../services/userCloneService');
const {
    membershipUpdate,
    usersOnDeviceQuery,
    normalizeDeviceId
} = require('../utils/deviceMembership');

/**
 * Common ADMS Responses
 */
const ADMS_OK = "OK";
const ADMS_ERROR = "ERROR";

/**
 * OPTIONS /iclock/getrequest.aspx
 * Part of some ADMS handshake flows
 */
router.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Custom-Header');
    res.sendStatus(200);
});

/**
 * GET /iclock/getrequest.aspx
 * Heartbeat, Options exchange, and Command polling
 */
router.get('/getrequest.aspx', async (req, res) => {
    const { SN, INFO, option } = req.query;
    const clientIp = getClientIp(req);

    // Ensure device is in DB
    await ensureDeviceRegistered(SN, clientIp);
    await touchDeviceHeartbeat(SN);

    // Log basic heartbeat
    logger.info(`ADMS Heartbeat: SN=${SN}, INFO=${INFO || 'none'}, Options=${option || 'none'} from ${clientIp}`);

    try {
        // Store raw hit
        await AdmsRawLog.create({
            serialNumber: SN || 'UNKNOWN',
            table: 'HEARTBEAT',
            query: req.query,
            method: 'GET',
            ipAddress: clientIp
        });

        // Handshake: If device asks for options
        if (option === 'any') {
            const config = [
                'GET_PROTOCOL=1',
                'RegistryCode=1',
                'TransInterval=1',
                'LogInterval=1',
                'TransFlag=1111111111',
                'Realtime=1',
                'Encrypt=0',
                'TimeZone=330',
                'DaylightSavingTime=0'
            ].join('\n');
            return res.send(config);
        }

        // Command Polling: Check for PENDING commands for this device
        const pendingCmd = await DeviceCommand.findOne({
            deviceId: SN,
            status: 'PENDING'
        }).sort({ queuedAt: 1 });

        if (pendingCmd) {
            // Command format: C:ID:COMMAND_STRING
            // ID should be numeric/unique for the session
            const cmdString = `C:${pendingCmd._id.toString().slice(-6)}:${pendingCmd.command}`;

            logger.info(`ADMS Command Delivered: [${SN}] -> ${cmdString}`);

            pendingCmd.status = 'SENT';
            pendingCmd.sentAt = new Date();
            await pendingCmd.save();

            return res.send(cmdString);
        }

        // Standard heartbeat response
        res.send(ADMS_OK);

    } catch (error) {
        logger.error(`ADMS GET Error [${SN}]:`, error);
        res.status(500).send(ADMS_ERROR);
    }
});

/**
 * GET /iclock/cdata.aspx
 * ICLOCK990 uses this for handshake/options (instead of getrequest.aspx)
 */
router.get('/cdata.aspx', async (req, res) => {
    const { SN, options, language, pushver } = req.query;
    const clientIp = getClientIp(req);

    // Ensure device is in DB
    await ensureDeviceRegistered(SN, clientIp);
    await touchDeviceHeartbeat(SN);

    logger.info(`ICLOCK990 Handshake: SN=${SN}, Options=${options || 'none'}, PushVer=${pushver || 'unknown'} from ${clientIp}`);

    try {
        // Store handshake attempt
        await AdmsRawLog.create({
            serialNumber: SN || 'UNKNOWN',
            table: 'HANDSHAKE',
            query: req.query,
            body: '', // GET requests have no body
            method: 'GET',
            ipAddress: clientIp
        });

        // If device asks for options (ICLOCK990 specific handshake)
        if (options === 'all') {
            // Update device with handshake metadata
            await Device.findOneAndUpdate(
                { deviceId: SN },
                {
                    $set: {
                        'protocol.pushVersion': pushver,
                        'protocol.language': language,
                        lastSeenAt: new Date()
                    }
                },
                { upsert: true }
            );

            console.log('\n');
            console.log('═'.repeat(80));
            console.log(`✅ ICLOCK HANDSHAKE - SN: ${SN}`);
            console.log('═'.repeat(80));
            console.log(`PushVer: ${pushver} | Lang: ${language}`);
            console.log('Sending optimized configuration...');
            console.log('═'.repeat(80));
            console.log('\n');

            const config = [
                'GET_PROTOCOL=1',
                'RegistryCode=1',
                'TransInterval=1',
                'LogInterval=1',
                'TransFlag=1111111111',
                'Realtime=1',
                'Encrypt=0',
                'ServerVer=3.4.1',
                'PushProtVer=2.4.1',
                'ErrorDelay=3',
                'Delay=10',
                'TransTimes=00:00;23:59',
                'TimeZone=330',
                'DaylightSavingTime=0'
            ].join('\n');
            return res.send(config);
        }

        // Standard response
        res.send(ADMS_OK);

    } catch (error) {
        logger.error(`ICLOCK990 Handshake Error [${SN}]:`, error);
        res.status(500).send(ADMS_ERROR);
    }
});

/**
 * POST /iclock/devicecmd.aspx
 * Device sends command execution results here
 */
router.post('/devicecmd.aspx', async (req, res) => {
    const { SN } = req.query;
    const clientIp = getClientIp(req);
    const body = req.body;
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    logger.info(`ADMS Command Result: SN=${SN} from ${clientIp}: ${bodyStr}`);

    try {
        // Ensure body is a string for parsing
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

        await AdmsRawLog.create({
            serialNumber: SN || 'UNKNOWN',
            table: 'CMD_RESULT',
            query: req.query,
            body: bodyStr,
            method: 'POST',
            ipAddress: clientIp
        });

        // Parse result if possible
        // Format of result body usually: ID=XXX&Return=0 (or 1, etc)
        const resultMatch = bodyStr.match(/ID=([^&]*)/);
        const returnMatch = bodyStr.match(/Return=([^&]*)/);

        if (resultMatch) {
            const cmdPartialId = resultMatch[1];
            const returnVal = returnMatch ? returnMatch[1] : 'unknown';

            // Find the most recent SENT command for this device
            // Since we use slice(-6) in getrequest, we search for partial match
            const cmd = await DeviceCommand.findOne({
                deviceId: SN,
                status: 'SENT'
            }).sort({ sentAt: -1 });

            if (cmd && cmd._id.toString().endsWith(cmdPartialId)) {
                cmd.status = returnVal === '0' || returnVal === 'OK' ? 'SUCCESS' : 'FAIL';
                cmd.result = body;
                cmd.completedAt = new Date();
                await cmd.save();
                logger.info(`ADMS Command Acknowledged: [${SN}] CMD_ID=${cmdPartialId} Status=${cmd.status}`);
            }
        }

        // Always respond OK so device clears its command queue
        res.send(ADMS_OK);
    } catch (error) {
        logger.error(`ADMS Command Result Error [${SN}]:`, error);
        res.status(500).send(ADMS_ERROR);
    }
});

/**
 * POST /iclock/getrequest.aspx (Alternative upload)
 */
router.post('/getrequest.aspx', async (req, res) => {
    const { SN } = req.query;
    const clientIp = getClientIp(req);
    logger.info(`ADMS Extra Info/Keep-alive: SN=${SN} from ${clientIp}`);

    try {
        await AdmsRawLog.create({
            serialNumber: SN || 'UNKNOWN',
            table: 'KEEPALIVE',
            query: req.query,
            body: req.body || '',
            method: 'POST',
            ipAddress: clientIp
        });
        await touchDeviceHeartbeat(SN);
    } catch (err) {
        logger.error(`ADMS Keep-alive Log Error: ${err.message}`);
    }

    res.send(ADMS_OK);
});

const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.socket.remoteAddress ||
        req.ip;
};

/** Updates lastSeenAt on any ADMS heartbeat / handshake / data push (for live online UI). */
async function touchDeviceHeartbeat(SN) {
    if (!SN || SN === 'UNKNOWN') return;
    try {
        await Device.updateOne(
            { deviceId: SN },
            { $set: { lastSeenAt: new Date() } }
        );
    } catch (err) {
        logger.warn(`touchDeviceHeartbeat failed for ${SN}: ${err.message}`);
    }
}

/**
 * HELPER: Ensure device is registered and visible
 */
async function ensureDeviceRegistered(SN, clientIp) {
    const normalizedSN = normalizeSerialNumber(SN);
    if (!normalizedSN || normalizedSN === 'UNKNOWN') return null;

    const cleanedIp = (clientIp || '').replace('::ffff:', '');

    try {
        let device = await Device.findOne({ deviceId: normalizedSN });

        if (device) {
            // Update IP if it has changed
            if (device.ip !== cleanedIp && cleanedIp) {
                const oldIp = device.ip;
                device.ip = cleanedIp;
                await device.save();
                logger.info(`ADMS: Device ${device.name} (${SN}) IP updated: ${oldIp} -> ${cleanedIp}`);
            }
        } else {
            // New Device - Create it
            const count = await Device.countDocuments({ name: /^Auto-ADMS-/ });
            const newName = `Auto-ADMS-${count + 1}`;

            logger.info(`ADMS: New device detected! [${normalizedSN}] from IP: ${cleanedIp}`);

            device = await Device.create({
                deviceId: normalizedSN,
                name: newName,
                ip: cleanedIp || '0.0.0.0',
                port: 4370,
                enabled: true,
                location: 'Auto-Registered'
            });
            logger.info(`ADMS: Successfully created new device: ${newName} (${normalizedSN})`);
        }
        return device;
    } catch (err) {
        logger.error(`ADMS: Error in ensureDeviceRegistered for ${normalizedSN}:`, err);
        return { name: `Unregistered-${normalizedSN}`, deviceId: normalizedSN };
    }
}

/**
 * POST /iclock/cdata.aspx
 * Primary data upload endpoint
 */
router.post('/cdata.aspx', async (req, res) => {
    const { SN, table } = req.query;
    const clientIp = getClientIp(req);

    // FAIL-SAFE: If body-parser failed to capture text data
    if (!req.body || typeof req.body !== 'string' || Object.keys(req.body).length === 0) {
        // Attempt manual capture if not already parsed
        let rawData = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { rawData += chunk; });
        req.on('end', async () => {
            req.body = rawData;
            await processAdmsPost(req, res, SN, table, clientIp);
        });
        return;
    }

    await processAdmsPost(req, res, SN, table, clientIp);
});

/**
 * Process the ADMS POST request logic
 */
async function processAdmsPost(req, res, SN, table, clientIp) {
    const normalizedSN = normalizeSerialNumber(SN);
    const rawBody = req.body;

    try {
        // CRITICAL: Always log and store raw data for visual inspection later
        await AdmsRawLog.create({
            serialNumber: normalizedSN || 'UNKNOWN',
            table: table || 'UNKNOWN',
            query: req.query,
            body: rawBody,
            method: 'POST',
            ipAddress: clientIp
        });

        logger.info(`ADMS Data: SN=${normalizedSN}, Table=${table}, Size=${rawBody?.length || 0} chars`);

        await touchDeviceHeartbeat(normalizedSN);

        // ==========================================
        // DEBUG: Show RAW body data
        // ==========================================
        console.log('\n');
        console.log('═'.repeat(80));
        console.log(`RAW BODY DEBUG - SN: ${SN}, Table: ${table}`);
        console.log('═'.repeat(80));
        console.log(`Type: ${typeof rawBody}`);
        console.log(`Is Array: ${Array.isArray(rawBody)}`);
        console.log(`Is String: ${typeof rawBody === 'string'}`);
        console.log(`Length: ${rawBody?.length || 'N/A'}`);
        console.log('Raw Body Content:');
        console.log(JSON.stringify(rawBody, null, 2));
        console.log('Raw Body (direct):');
        console.log(rawBody);
        console.log('═'.repeat(80));
        console.log('\n');

        if (table === 'ATTLOG') {
            const records = admsParser.parseTextRecords(rawBody);

            // AUTO-REGISTRATION / UPDATE LOGIC
            const device = await ensureDeviceRegistered(normalizedSN, clientIp);
            const deviceName = device?.name || `Unregistered-${normalizedSN}`;
            const operationMode = await getEffectiveOperationMode();
            const deviceOperationGroup = device?.operationGroup || null;
            logger.info(`ATTLOG mode resolution: SN=${normalizedSN}, mode=${operationMode}, deviceOperationGroup=${deviceOperationGroup || 'NONE'}`);

            const bulkOps = records.map(rec => {
                const { resolvedLogType } = resolveLogType({
                    rawStatusCode: rec.inOutMode,
                    deviceOperationGroup,
                    operationMode
                });
                return {
                    updateOne: {
                        filter: { employeeId: rec.userId, timestamp: rec.timestamp }, // Unique by User + Time
                        update: {
                            $set: {
                                logType: resolvedLogType,
                                rawType: rec.inOutMode,
                                rawData: rec,
                                deviceName,
                                deviceId: normalizedSN,
                                syncedAt: new Date()
                            }
                        },
                        upsert: true
                    }
                };
            });

            if (bulkOps.length > 0) {
                try {
                    const result = await AttendanceLog.bulkWrite(bulkOps);
                    logger.info(`ADMS Bulk Write [${SN}]: Matched ${result.matchedCount}, Modified ${result.modifiedCount}, Upserted ${result.upsertedCount}`);

                    // ==========================================
                    // REAL-TIME SYNC TRIGGER (Microservice -> Backend)
                    // Skipped while a fresh ADMS backup is capturing ATTLOG for this SN (avoid duplicate HRMS rows).
                    // ==========================================
                    try {
                        const deviceService = req.app.get('deviceService');
                        if (deviceService && typeof deviceService.shouldSuppressHrmsSyncForAdmsAttlog === 'function'
                            && deviceService.shouldSuppressHrmsSyncForAdmsAttlog(normalizedSN)) {
                            logger.info(`ADMS ATTLOG: skipping HRMS sync for ${normalizedSN} (fresh backup capture in progress; local AttendanceLog still updated)`);
                        } else {
                            const axios = require('axios'); // Lazy load
                            const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
                            const syncEndpoint = `${BACKEND_URL}/api/internal/attendance/sync`;
                            const SYSTEM_KEY = process.env.HRMS_MICROSERVICE_SECRET_KEY || "hrms-secret-key-2026-abc123xyz789";
                            if (!SYSTEM_KEY) {
                                logger.error('HRMS_MICROSERVICE_SECRET_KEY not configured in biometric service');
                                return;
                            }

                            const syncPayload = records.map(rec => {
                                const { resolvedLogType } = resolveLogType({
                                    rawStatusCode: rec.inOutMode,
                                    deviceOperationGroup,
                                    operationMode
                                });
                                return {
                                    employeeId: rec.userId,
                                    timestamp: rec.timestamp,
                                    logType: resolvedLogType,
                                    deviceId: normalizedSN,
                                    deviceName: deviceName,
                                    rawStatus: rec.inOutMode
                                };
                            });

                            // Audit log: shows exactly which operation is being sent to internal sync.
                            logger.info(
                                `ADMS Internal Sync Dispatch: SN=${normalizedSN}, mode=${operationMode}, deviceOperationGroup=${deviceOperationGroup || 'NONE'}, count=${syncPayload.length}`
                            );
                            syncPayload.slice(0, 25).forEach((row, idx) => {
                                logger.info(
                                    `ADMS Internal Sync Row[${idx + 1}]: emp=${row.employeeId}, ts=${new Date(row.timestamp).toISOString()}, rawStatus=${row.rawStatus}, logType=${row.logType}, deviceId=${row.deviceId}`
                                );
                            });
                            if (syncPayload.length > 25) {
                                logger.info(`ADMS Internal Sync Row: ... ${syncPayload.length - 25} more rows omitted from preview`);
                            }

                            axios.post(syncEndpoint, syncPayload, {
                                headers: { 'x-system-key': SYSTEM_KEY },
                                timeout: 5000
                            })
                                .then(response => {
                                    logger.info(`ADMS Real-Time Sync Success: Backend accepted ${response.data.processed} logs.`);
                                })
                                .catch(err => {
                                    const errorReason = err.code === 'ECONNREFUSED' ? `Connection refused at ${syncEndpoint}` : err.message;
                                    logger.error(`ADMS Real-Time Sync Failed: ${errorReason}`);
                                });
                        }

                    } catch (syncError) {
                        logger.error(`ADMS Real-Time Trigger Error: ${syncError.message}`);
                    }
                } catch (bulkErr) {
                    logger.error(`ADMS Bulk Write Error:`, bulkErr);
                }
            }

            return res.send(`OK: ${records.length}`);
        }

        // ==========================================
        // DEVICE HEALTH & STATUS MONITORING
        // ==========================================
        if (typeof rawBody === 'string' && (rawBody.includes('~DeviceName=') || rawBody.includes('TransactionCount='))) {
            const statusData = admsParser.parseDeviceStatus(rawBody);
            if (statusData) {
                await Device.findOneAndUpdate(
                    { deviceId: SN },
                    {
                        $set: {
                            status: {
                                userCount: parseInt(statusData.UserCount) || 0,
                                fingerCount: parseInt(statusData.FPCount) || 0,
                                attCount: parseInt(statusData.TransactionCount) || 0,
                                faceCount: parseInt(statusData.FaceCount) || 0,
                                firmware: statusData.FWVersion,
                                platform: statusData.Platform,
                                rawStatus: rawBody
                            },
                            // Auto-Discover Capabilities
                            capabilities: {
                                hasFingerprint: statusData.FingerFunOn === '1',
                                hasFace: statusData.FaceFunOn === '1',
                                hasPalm: statusData.PvFunOn === '1',
                                hasCard: !!statusData.CARD,
                                fpVersion: statusData.FPVersion || '10',
                                faceVersion: statusData.FaceVersion,
                                maxUsers: parseInt(statusData.MaxUserCount),
                                maxFingers: parseInt(statusData.MaxFingerCount),
                                maxAttLogs: parseInt(statusData.MaxAttLogCount)
                            },
                            protocol: {
                                pushVersion: statusData.PushVersion,
                                // Adjust protocol based on hardware platform if needed
                                separator: statusData.Platform?.includes('ZMM100') ? ',' : '\t'
                            },
                            lastSeenAt: new Date()
                        }
                    },
                    { upsert: true }
                );
                logger.info(`ADMS: Updated health status for device ${SN} (${statusData.UserCount} Users, ${statusData.TransactionCount} Logs)`);
                // We've processed the main logic for this packet, but let it fall through 
                // to generic handling if needed. For now, keep it silent like other handlers.
            }
        }

        // ==========================================
        // STRUCTURED BIOMETRIC DATA HANDLING
        // ==========================================

        // Handle User Information
        // Some devices send USER lines under USERINFO/USER table, others may include them in OPERLOG packets.
        const containsUserRows = typeof rawBody === 'string' && /(?:^|\n)\s*USER\s+PIN=/i.test(rawBody);
        if (table === 'USERINFO' || table === 'USER' || containsUserRows) {
            const count = await parseAndUpsertUserInfoRows(rawBody, normalizedSN);
            if (count > 0) {
                logger.info(`ADMS: Parsed and updated ${count} User records from SN: ${normalizedSN} (table=${table || 'UNKNOWN'})`);
                return res.send(ADMS_OK);
            }
        }

        // Handle Fingerprint Templates
        if (table === 'FINGERTMP' || table === 'FP' || (table === 'OPERLOG' && rawBody.includes('FP PIN='))) {
            const fingerprints = admsParser.parseBiometricData(rawBody);
            if (fingerprints.length > 0) {
                for (const fp of fingerprints) {
                    // First remove existing template for this index to avoid duplicates in the array
                    await DeviceUser.updateOne(
                        { userId: fp.userId },
                        { $pull: { fingerprints: { fingerIndex: fp.fingerIndex } } }
                    );
                    // Then push the new one + record device membership
                    const mem = membershipUpdate(normalizedSN);
                    await DeviceUser.updateOne(
                        { userId: fp.userId },
                        {
                            $push: {
                                fingerprints: {
                                    fingerIndex: fp.fingerIndex,
                                    templateData: fp.template,
                                    updatedAt: new Date()
                                }
                            },
                            $set: mem.$set,
                            ...(mem.$addToSet ? { $addToSet: mem.$addToSet } : {}),
                            ...(mem.$pull ? { $pull: mem.$pull } : {})
                        },
                        { upsert: true }
                    );
                    autoCloneUserWithinCategory(fp.userId, normalizedSN);
                }
                logger.info(`ADMS: Parsed and updated ${fingerprints.length} Fingerprint records from SN: ${SN} (Table: ${table})`);
                return res.send(ADMS_OK);
            }
        }

        // Handle Face Templates
        if (table === 'FACE') {
            const faces = admsParser.parseBiometricData(rawBody);
            for (const face of faces) {
                const mem = membershipUpdate(normalizedSN, {
                    userId: face.userId,
                    face: {
                        templateData: face.template,
                        length: face.size,
                        updatedAt: new Date()
                    }
                });
                await DeviceUser.findOneAndUpdate(
                    { userId: face.userId },
                    mem,
                    { upsert: true }
                );
            }
            logger.info(`ADMS: Parsed and updated ${faces.length} Face records from SN: ${SN}`);
            return res.send(ADMS_OK);
        }

        // Handle User Photos (USERPIC)
        if (table === 'USERPIC') {
            const lines = rawBody.split('\n');
            for (const line of lines) {
                const data = admsParser.parseKeyValueLine(line);
                if (data && data.PIN) {
                    const userId = data.PIN;
                    const mem = membershipUpdate(normalizedSN, {
                        userId,
                        photo: {
                            content: data.CONTENT || '',
                            fileName: data.FILENAME || '',
                            size: parseInt(data.SIZE) || 0,
                            updatedAt: new Date()
                        }
                    });
                    await DeviceUser.findOneAndUpdate(
                        { userId: userId },
                        mem,
                        { upsert: true }
                    );
                    autoCloneUserWithinCategory(userId, normalizedSN);
                }
            }
            logger.info(`ADMS: Parsed and updated User Photos from SN: ${SN}`);
            return res.send(ADMS_OK);
        }

        // Generic support for other tables (OPERLOG, etc.)
        if (['OPERLOG', 'ERRORLOG'].includes(table)) {
            logger.info(`ADMS Data [${table}] received from SN: ${SN}. Storing in Raw Logs.`);
            return res.send(ADMS_OK);
        }

        // Echo OK for unknown tables
        res.send(ADMS_OK);

    } catch (error) {
        logger.error(`ADMS Process Error [${SN}]:`, error);
        res.status(500).send(ADMS_ERROR);
    }
}

/**
 * GET /api/adms/users
 * Returns structured device users with biometric info.
 * Query: sn, status=active|inactive|all, q, page, limit,
 *        light=1 (omit template blobs), all=1 (ignore sn filter — full golden set)
 */
router.get('/users', async (req, res) => {
    try {
        const { sn, q, light, all } = req.query;
        const statusRaw = String(req.query.status || 'active').toLowerCase();
        const membershipStatus = ['active', 'inactive', 'all'].includes(statusRaw)
            ? statusRaw
            : 'active';

        const searchParts = [];
        if (q && String(q).trim()) {
            const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(escaped, 'i');
            searchParts.push({ userId: rx }, { name: rx });
        }

        let query = {};
        const wantAll = all === '1' || all === 'true';
        const deviceSn = normalizeDeviceId(sn);

        if (deviceSn && !wantAll) {
            const membership = usersOnDeviceQuery(deviceSn, membershipStatus);
            if (searchParts.length) {
                query = { $and: [membership, { $or: searchParts }] };
            } else {
                query = membership;
            }
        } else if (searchParts.length) {
            query = { $or: searchParts };
        }

        const usePaging = req.query.page != null || req.query.limit != null;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limitRaw = parseInt(req.query.limit, 10);
        const limit = usePaging
            ? Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
            : null;

        let mongoQuery = DeviceUser.find(query).sort({ userId: 1 });
        if (light === '1' || light === 'true') {
            mongoQuery = mongoQuery
                .select('-fingerprints.templateData -face.templateData -photo.content');
        }
        if (usePaging && limit != null) {
            mongoQuery = mongoQuery.skip((page - 1) * limit).limit(limit);
        }

        const [users, total, devices] = await Promise.all([
            mongoQuery.lean(),
            usePaging ? DeviceUser.countDocuments(query) : Promise.resolve(null),
            Device.find({}).select('deviceId name').lean()
        ]);

        const deviceNameById = Object.fromEntries(
            (devices || []).map((d) => [d.deviceId, d.name || d.deviceId])
        );

        const data = (users || []).map((u) => {
            const activeIds = Array.isArray(u.deviceIds) && u.deviceIds.length
                ? [...new Set(u.deviceIds.map(String))]
                : (u.lastDeviceId && !(u.inactiveDeviceIds || []).includes(u.lastDeviceId)
                    ? [String(u.lastDeviceId)]
                    : []);
            const inactiveIds = Array.isArray(u.inactiveDeviceIds)
                ? [...new Set(u.inactiveDeviceIds.map(String))]
                : [];

            let statusOnDevice = 'none';
            if (deviceSn) {
                if (inactiveIds.includes(deviceSn)) statusOnDevice = 'inactive';
                else if (activeIds.includes(deviceSn) || u.lastDeviceId === deviceSn) statusOnDevice = 'active';
            }

            return {
                ...u,
                deviceIds: activeIds,
                inactiveDeviceIds: inactiveIds,
                statusOnDevice,
                devices: activeIds.map((id) => ({
                    deviceId: id,
                    name: deviceNameById[id] || id,
                    isLast: u.lastDeviceId === id,
                    isSelected: deviceSn ? id === deviceSn : false,
                    status: 'active'
                })),
                inactiveDevices: inactiveIds.map((id) => ({
                    deviceId: id,
                    name: deviceNameById[id] || id,
                    isSelected: deviceSn ? id === deviceSn : false,
                    status: 'inactive'
                }))
            };
        });

        const payload = {
            success: true,
            count: data.length,
            data,
            filter: wantAll ? 'all' : (deviceSn ? 'device' : 'none'),
            membershipStatus: wantAll ? null : membershipStatus,
            deviceSn: deviceSn || null
        };
        if (usePaging) {
            payload.total = total;
            payload.page = page;
            payload.limit = limit;
            payload.totalPages = Math.max(1, Math.ceil(total / limit));
        }
        res.json(payload);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/adms/delete-users
 * Remove user(s) from a device terminal; keep golden DB record as inactive on that device.
 * Body: { deviceId, userIds: string[] }
 */
router.post('/delete-users', async (req, res) => {
    try {
        const { deviceId, userIds } = req.body || {};
        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId is required' });
        }
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, error: 'userIds array is required' });
        }

        const result = await deactivateUsersOnDevice(userIds, deviceId);

        res.json({
            success: result.errors.length === 0,
            message: `Queued delete on ${result.deviceName || result.deviceId} for ${result.deleted} user(s); marked inactive in database`,
            data: result
        });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        if (error.code === 'BAD_REQUEST') {
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error deleting users from device:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/adms/activate-users
 * Write user(s) back onto a device (profile + biometrics) and mark active in DB.
 * Body: { deviceId, userIds: string[] }
 */
router.post('/activate-users', async (req, res) => {
    try {
        const { deviceId, userIds } = req.body || {};
        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId is required' });
        }
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, error: 'userIds array is required' });
        }

        const result = await activateUsersOnDevice(userIds, deviceId);

        res.json({
            success: result.errors.length === 0,
            message: `Queued activate on ${result.deviceName || result.deviceId} for ${result.activated} user(s); marked active in database`,
            data: result
        });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        if (error.code === 'BAD_REQUEST') {
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error activating users on device:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/adms/command
 * Public API to queue a command for a device
 */
router.post('/command', async (req, res) => {
    try {
        const { deviceId, command } = req.body;

        if (!deviceId || !command) {
            return res.status(400).json({ success: false, error: 'deviceId and command are required' });
        }

        const newCommand = await DeviceCommand.create({
            deviceId,
            command,
            status: 'PENDING'
        });

        logger.info(`ADMS Command Queued: [${deviceId}] -> ${command}`);

        res.json({
            success: true,
            commandId: newCommand._id,
            status: 'PENDING'
        });
    } catch (error) {
        logger.error('Error queuing ADMS command:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/adms/clone-user
 * Clone a user's profile and fingerprints to target machine(s).
 * Body: { userId, targetDeviceId? | targetDeviceIds? | targetCategoryId?, sourceDeviceId? }
 */
router.post('/clone-user', async (req, res) => {
    try {
        const { userId, targetDeviceId, targetDeviceIds, targetCategoryId, sourceDeviceId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId is required' });
        }
        if (!targetDeviceId && !targetDeviceIds?.length && !targetCategoryId) {
            return res.status(400).json({
                success: false,
                error: 'Provide targetDeviceId, targetDeviceIds, or targetCategoryId'
            });
        }

        const result = await cloneUserToDevices(String(userId), {
            sourceDeviceId: sourceDeviceId || undefined,
            targetDeviceId,
            targetDeviceIds,
            categoryId: targetCategoryId,
            excludeSource: true
        });

        if (result.devicesQueued === 0) {
            return res.status(404).json({ success: false, error: 'No target devices found' });
        }

        res.json({
            success: true,
            message: `User ${userId} queued on ${result.devicesQueued} device(s)`,
            data: result
        });
    } catch (error) {
        if (error.code === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        logger.error('Error cloning user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/adms/clone-users-bulk
 * Bulk clone multiple users to a category or explicit device list.
 * Body: { userIds: string[], targetCategoryId?, targetDeviceIds?, sourceDeviceId? }
 */
router.post('/clone-users-bulk', async (req, res) => {
    try {
        const { userIds, targetCategoryId, targetDeviceIds, sourceDeviceId } = req.body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, error: 'userIds array is required' });
        }
        if (!targetCategoryId && (!targetDeviceIds || targetDeviceIds.length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'Provide targetCategoryId or targetDeviceIds'
            });
        }

        const results = [];
        const errors = [];

        for (const userId of userIds) {
            try {
                const result = await cloneUserToDevices(String(userId), {
                    sourceDeviceId: sourceDeviceId || undefined,
                    targetDeviceIds,
                    categoryId: targetCategoryId,
                    excludeSource: true
                });
                results.push(result);
            } catch (err) {
                errors.push({ userId, error: err.message });
            }
        }

        const totalQueued = results.reduce((sum, r) => sum + r.devicesQueued, 0);

        res.json({
            success: errors.length === 0,
            message: `Bulk clone: ${results.length} user(s), ${totalQueued} total device queue operations`,
            data: { results, errors }
        });
    } catch (error) {
        logger.error('Error bulk cloning users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /logs
 * Unified endpoint to query any ADMS table data (USER, FINGERTMP, OPERLOG, etc.)
 */
router.get('/logs', async (req, res) => {
    try {
        const { sn, table, start, end, limit } = req.query;
        const query = {};

        if (sn) query.serialNumber = sn;
        if (table) query.table = table;

        if (start || end) {
            query.receivedAt = {};
            if (start) query.receivedAt.$gte = new Date(start);
            if (end) query.receivedAt.$lte = new Date(end);
        }

        const logLimit = parseInt(limit) || 100;

        const logs = await AdmsRawLog.find(query)
            .sort({ receivedAt: -1 })
            .limit(logLimit);

        res.json({
            success: true,
            count: logs.length,
            filters: { sn, table, start, end, limit: logLimit },
            data: logs
        });
    } catch (error) {
        logger.error('Error fetching ADMS logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /raw (LEGACY - keep for backward compatibility)
 */
router.get('/raw', async (req, res) => {
    // Redirect to the public unified endpoint
    res.redirect(`/api/adms/logs?limit=${req.query.limit || 50}`);
});

/**
 * Prefer non-empty device value; otherwise keep biometric DB value (avoid wiping name/card with blanks).
 */
function mergeDeviceUserField(incoming, stored) {
    const t = incoming != null ? String(incoming).trim() : '';
    if (t !== '') return t;
    return stored != null ? String(stored).trim() : '';
}

function mergeDeviceUserRole(incomingStr, storedNum) {
    if (incomingStr == null || String(incomingStr).trim() === '') {
        return typeof storedNum === 'number' && !Number.isNaN(storedNum) ? storedNum : 0;
    }
    const n = parseInt(String(incomingStr), 10);
    return Number.isNaN(n) ? (typeof storedNum === 'number' ? storedNum : 0) : n;
}

/**
 * True when the terminal's USERINFO payload still does not match our canonical DeviceUser document
 * (after merge)—so the device should receive DATA UPDATE USERINFO for this PIN.
 */
function deviceUserinfoDrift(deviceData, userDoc) {
    if (!userDoc) return false;
    const dName = (deviceData.NAME || '').trim();
    const dCard = (deviceData.CARD || '').trim();
    const dPwd = (deviceData.PASSWORD || '').trim();
    let dRole = null;
    if (deviceData.ROLE != null && String(deviceData.ROLE).trim() !== '') {
        const n = parseInt(String(deviceData.ROLE), 10);
        if (!Number.isNaN(n)) dRole = n;
    }

    const uName = (userDoc.name || '').trim();
    const uCard = (userDoc.card || '').trim();
    const uPwd = (userDoc.password || '').trim();
    const uRole = userDoc.role || 0;

    if (uName !== dName) return true;
    if (uCard !== dCard) return true;
    if (uPwd !== dPwd) return true;
    if (dRole !== null && uRole !== dRole) return true;

    return false;
}

/**
 * Push stored biometric DeviceUser profile to this device (ADMS queue). Not HRMS—local DeviceUser only.
 */
async function queueUserInfoPushToDevice(serialNumber, userDoc) {
    const { getValues } = require('../services/biometricSettingsService');
    const settings = await getValues();
    if (!settings.syncStoredDeviceUserToTerminal) return;

    const device = await Device.findOne({ deviceId: serialNumber });
    if (!device || device.enabled === false) return;

    const sep = device.protocol?.separator || '\t';
    const cmd = `DATA UPDATE USERINFO PIN=${userDoc.userId}${sep}Name=${userDoc.name || ''}${sep}Password=${userDoc.password || ''}${sep}Group=1${sep}Card=${userDoc.card || ''}${sep}Role=${userDoc.role || 0}`;

    await DeviceCommand.create({
        deviceId: serialNumber,
        command: cmd,
        status: 'PENDING'
    });
    logger.info(`ADMS: Queued USERINFO reconcile push to device ${serialNumber} for PIN ${userDoc.userId}`);
}

module.exports = router;

function normalizeSerialNumber(sn) {
    const v = sn == null ? '' : String(sn).trim();
    return v || 'UNKNOWN';
}

async function parseAndUpsertUserInfoRows(rawBody, serialNumber) {
    if (!rawBody || typeof rawBody !== 'string') return 0;
    const lines = rawBody.split('\n');
    let count = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!/^(USER\s+)?PIN=/i.test(trimmed)) continue;

        const data = admsParser.parseUserInfoAdmsLine(trimmed)
            || admsParser.parseKeyValueLine(trimmed.replace(/^(USER)\s+/i, '').trim());
        if (!data || !data.PIN) continue;

        const userId = String(data.PIN).trim();
        if (!userId) continue;

        const existing = await DeviceUser.findOne({ userId }).lean();

        const mergedName = mergeDeviceUserField(data.NAME, existing?.name);
        const mergedPassword = mergeDeviceUserField(data.PASSWORD, existing?.password);
        const mergedCard = mergeDeviceUserField(data.CARD, existing?.card);
        const mergedRole = mergeDeviceUserRole(data.ROLE, existing?.role);

        await DeviceUser.findOneAndUpdate(
            { userId },
            membershipUpdate(serialNumber, {
                userId,
                name: mergedName,
                password: mergedPassword,
                card: mergedCard,
                role: mergedRole
            }),
            { upsert: true }
        );
        count++;

        const stored = await DeviceUser.findOne({ userId });
        if (existing && stored && deviceUserinfoDrift(data, stored)) {
            await queueUserInfoPushToDevice(serialNumber, stored);
        }

        autoCloneUserWithinCategory(userId, serialNumber);
    }

    return count;
}

