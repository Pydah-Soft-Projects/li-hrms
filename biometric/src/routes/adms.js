const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const admsParser = require('../utils/admsParser');
const AttendanceLog = require('../models/AttendanceLog');
const AdmsRawLog = require('../models/AdmsRawLog');
const Device = require('../models/Device');

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

    // Log basic heartbeat
    logger.info(`ADMS Heartbeat: SN=${SN}, INFO=${INFO || 'none'}, Options=${option || 'none'}`);

    try {
        // Store raw hit
        await AdmsRawLog.create({
            serialNumber: SN || 'UNKNOWN',
            table: 'HEARTBEAT',
            query: req.query,
            method: 'GET'
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
                'Encrypt=0'
            ].join('\n');
            return res.send(config);
        }

        // Standard heartbeat response
        res.send(ADMS_OK);

    } catch (error) {
        logger.error(`ADMS GET Error [${SN}]:`, error);
        res.status(500).send(ADMS_ERROR);
    }
});

/**
 * POST /iclock/cdata.aspx
 * Primary data upload endpoint
 */
router.post('/cdata.aspx', async (req, res) => {
    const { SN, table } = req.query;
    const rawBody = req.body;
    console.log(rawBody);

    try {
        // CRITICAL: Always log and store raw data for visual inspection later
        await AdmsRawLog.create({
            serialNumber: SN || 'UNKNOWN',
            table: table || 'UNKNOWN',
            query: req.query,
            body: rawBody,
            method: 'POST'
        });

        logger.info(`ADMS Data: SN=${SN}, Table=${table}, Size=${rawBody?.length || 0} chars`);

        if (table === 'ATTLOG') {
            const records = admsParser.parseTextRecords(rawBody);

            // AUTO-REGISTRATION / UPDATE LOGIC
            const clientIp = req.ip || req.connection.remoteAddress;
            const cleanedIp = clientIp.replace('::ffff:', ''); // Clean IPv6 prefix if present

            // KEY CRITERIA: Serial Number (SN) is the absolute Identity
            let device = await Device.findOne({ deviceId: SN });

            if (device) {
                // Device exists (Matched by SN)
                // Update IP if it has changed (e.g. DHCP change or moved)
                if (device.ip !== cleanedIp) {
                    const oldIp = device.ip;
                    device.ip = cleanedIp;
                    await device.save();
                    logger.info(`ADMS: Device ${device.name} (${SN}) IP updated: ${oldIp} -> ${cleanedIp}`);
                }
            } else {
                // New Device (SN not in DB) - Create it
                const count = await Device.countDocuments({ name: /^Auto-ADMS-/ });
                const newName = `Auto-ADMS-${count + 1}`;

                logger.info(`ADMS: New device detected! [${SN}] from IP: ${cleanedIp}`);

                try {
                    device = await Device.create({
                        deviceId: SN,
                        name: newName,
                        ip: cleanedIp,
                        port: 4370, // Default TCP port
                        enabled: true,
                        location: 'Auto-Registered'
                    });
                    logger.info(`ADMS: successfully created new device: ${newName} (${SN})`);
                } catch (createErr) {
                    logger.error(`ADMS: Failed to auto-register device ${SN}:`, createErr);
                    // Fallback to allow processing
                    device = { name: `Unregistered-${SN}`, deviceId: SN };
                }
            }

            const deviceName = device.name;


            const LOG_TYPE_MAP = {
                0: 'CHECK-IN',
                1: 'CHECK-OUT',
                2: 'BREAK-OUT',
                3: 'BREAK-IN',
                4: 'OVERTIME-IN',
                5: 'OVERTIME-OUT',
                255: 'CHECK-IN'
            };

            const bulkOps = records.map(rec => {
                const logType = LOG_TYPE_MAP[rec.inOutMode] || 'CHECK-IN';
                return {
                    updateOne: {
                        filter: { employeeId: rec.userId, timestamp: rec.timestamp }, // Unique by User + Time
                        update: {
                            $set: {
                                logType,
                                rawType: rec.inOutMode,
                                rawData: rec,
                                deviceName,
                                deviceId: SN,
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
                    logger.info(`ADMS Bulk Write: Matched ${result.matchedCount}, Modified ${result.modifiedCount}, Upserted ${result.upsertedCount}`);

                    // ==========================================
                    // REAL-TIME SYNC TRIGGER (Microservice -> Backend)
                    // ==========================================
                    try {
                        const axios = require('axios'); // Lazy load
                        const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
                        // Updated to new internal path
                        const syncEndpoint = `${BACKEND_URL}/api/internal/attendance/sync`;
                        const SYSTEM_KEY = 'hrms-microservice-secret-key-999';

                        // Prepare the payload (Cleaned data)
                        const syncPayload = records.map(rec => {
                            const logType = LOG_TYPE_MAP[rec.inOutMode] || 'CHECK-IN';
                            return {
                                employeeId: rec.userId,
                                timestamp: rec.timestamp,
                                logType: logType,
                                deviceId: SN,
                                deviceName: deviceName,
                                rawStatus: rec.inOutMode
                            };
                        });

                        logger.info(`ADMS Real-Time: Forwarding ${syncPayload.length} logs to Backend...`);

                        // Fire & Forget (Don't await strict response time, but catch errors)
                        axios.post(syncEndpoint, syncPayload, {
                            headers: { 'x-system-key': SYSTEM_KEY }
                        })
                            .then(response => {
                                logger.info(`ADMS Real-Time Sync Success: Backend accepted ${response.data.processed} logs.`);
                            })
                            .catch(err => {
                                logger.error(`ADMS Real-Time Sync Failed: ${err.message}`);
                                if (err.response) {
                                    logger.error(`Backend Response: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
                                }
                            });

                    } catch (syncError) {
                        logger.error(`ADMS Real-Time Trigger Error: ${syncError.message}`);
                    }
                    // ==========================================

                } catch (bulkErr) {
                    logger.error(`ADMS Bulk Write Error:`, bulkErr);
                }
            }

            return res.send(`OK: ${records.length}`);
        }

        // Echo OK for other tables (OPERLOG, etc)
        res.send(ADMS_OK);

    } catch (error) {
        logger.error(`ADMS POST Error [${SN}]:`, error);
        res.status(500).send(ADMS_ERROR);
    }
});

/**
 * GET /api/adms/raw
 * Endpoint for the user to see only ADMS raw logs
 */
router.get('/api/raw', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await AdmsRawLog.find()
            .sort({ receivedAt: -1 })
            .limit(limit);

        res.json({
            success: true,
            count: logs.length,
            data: logs
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
