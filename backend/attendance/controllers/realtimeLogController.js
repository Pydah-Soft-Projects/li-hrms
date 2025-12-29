/**
 * Real-Time Log Controller
 * Handles immediate biometric data processing from the microservice
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const { processAndAggregateLogs, formatDate } = require('../services/attendanceSyncService');

// Valid Log Types whitelist
const VALID_LOG_TYPES = ['CHECK-IN', 'CHECK-OUT', 'BREAK-OUT', 'BREAK-IN', 'OVERTIME-IN', 'OVERTIME-OUT'];
// Strictly Mapped Types (only these trigger attendance logic)
const ATTENDANCE_LOG_TYPES = ['IN', 'OUT'];

/**
 * @desc    Receive Real-Time Logs from Microservice
 * @route   POST /api/attendance/internal/sync
 * @access  Internal (No Auth)
 */
exports.receiveRealTimeLogs = async (req, res) => {
    const startTime = Date.now();

    // SECURITY CHECK: Verify it's the microservice
    const SYSTEM_KEY = 'hrms-microservice-secret-key-999';
    if (req.headers['x-system-key'] !== SYSTEM_KEY) {
        console.warn('[RealTime] Unauthorized access attempt blocked.');
        return res.status(401).json({ success: false, message: 'Unauthorized System Access' });
    }

    const logs = req.body;

    // 1. Basic Validation
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({ success: false, message: 'No logs provided' });
    }

    try {
        const processQueue = [];
        const rawLogsToSave = [];
        const uniqueEmployees = new Set();
        const uniqueDates = new Set();

        // VALIDATION: Cache valid employees to avoid DB hammering
        const incomingEmpIds = [...new Set(logs.map(l => String(l.employeeId).toUpperCase()))];
        const validEmployees = await Employee.find({ emp_no: { $in: incomingEmpIds } }).select('emp_no').lean();
        const validEmpSet = new Set(validEmployees.map(e => e.emp_no));

        // 2. Filter & Prepare
        for (const log of logs) {
            const empId = String(log.employeeId).toUpperCase();

            // Check if employee exists
            if (!validEmpSet.has(empId)) {
                // Skip unknown employees
                continue;
            }
            // Strict Filter: Allow declared VALID types, mapping ADMS junk to null if needed
            // The microservice sends "CHECK-IN", "BREAK-IN" etc.

            // We map "CHECK-IN" -> "IN", "CHECK-OUT" -> "OUT" for the calculation engine
            // But we keep the original 'logType' for record keeping.
            // IMPORTANT: OVERTIME and BREAK punches are stored separately and NOT included in shift attendance

            let normalizedType = null;
            const typeUpper = log.logType ? log.logType.toUpperCase() : null;

            // ONLY regular CHECK-IN/OUT are normalized to IN/OUT for shift attendance
            // BREAK-IN/OUT, OVERTIME-IN/OUT are kept as null type - they don't affect shift attendance
            if (typeUpper === 'CHECK-IN') {
                normalizedType = 'IN';
            } else if (typeUpper === 'CHECK-OUT') {
                normalizedType = 'OUT';
            }
            // BREAK-IN, BREAK-OUT, OVERTIME-IN, and OVERTIME-OUT are intentionally left as null
            // They will be stored in rawData for break/OT tracking but won't trigger attendance processing

            if (VALID_LOG_TYPES.includes(typeUpper)) {
                // Parse timestamp safe
                const timestamp = new Date(log.timestamp);
                if (isNaN(timestamp.getTime())) continue;

                rawLogsToSave.push({
                    insertOne: {
                        document: {
                            employeeNumber: empId,
                            timestamp: timestamp,
                            type: normalizedType, // 'IN' or 'OUT'
                            subType: typeUpper,   // 'CHECK-IN', 'BREAK-OUT'
                            source: 'biometric-realtime',
                            date: formatDate(timestamp),
                            rawData: log,
                            deviceId: log.deviceId,
                            deviceName: log.deviceName
                        }
                    }
                });

                if (normalizedType) {
                    uniqueEmployees.add(empId);
                    uniqueDates.add(formatDate(timestamp));
                }
            }
        }

        // 3. Bulk Persist (High Performance)
        if (rawLogsToSave.length > 0) {
            // ordered: false = continue even if duplicates fail
            // We expect strict duplicates (same user/time) to fail due to db index, which is GOOD.
            await AttendanceRawLog.bulkWrite(rawLogsToSave, { ordered: false }).catch(err => {
                // Ignore duplicate key errors (code 11000)
                if (err.code !== 11000 && !err.writeErrors?.every(e => e.code === 11000)) {
                    console.error('RealTime Sync BulkWrite partial error:', err.message);
                }
            });
        }

        // 4. Trigger Processing Engine (Fire & Forget mostly, but we await to ensure correctness before ack)
        // We only trigger for the specific employees affected to keep it fast.

        if (uniqueEmployees.size > 0) {
            // We reconstruct the "rawLogs" array format expected by processAndAggregateLogs
            // Just strictly for the affected users. Note: processAndAggregateLogs 
            // re-fetches from DB anyway to get the full day's picture, so passing just these is fine/safe.
            // WE DO NOT PASS 'rawLogs' argument heavily Because the service refetches from DB. 
            // We just need to ensure the DB has the data (Step 3 done).

            // However, processAndAggregateLogs logic expects an input array to determine WHO to process.
            // So we mock the input array based on the unique set.

            const triggerSamples = Array.from(uniqueEmployees).map(empId => ({
                employeeNumber: empId,
                timestamp: new Date() // Dummy time, just triggers the fetch-by-date logic
            }));

            await processAndAggregateLogs(triggerSamples, false, true);
        }

        const duration = Date.now() - startTime;
        // console.log(`[RealTime] Processed ${rawLogsToSave.length} logs in ${duration}ms`);

        return res.status(200).json({
            success: true,
            processed: rawLogsToSave.length,
            message: 'Sync successful'
        });

    } catch (error) {
        console.error('[RealTime] Critical Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
