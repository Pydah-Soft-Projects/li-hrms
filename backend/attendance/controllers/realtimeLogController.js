/**
 * Real-Time Log Controller
 * Handles immediate biometric data processing from the microservice
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const { processAndAggregateLogs, formatDate, filterRedundantLogs } = require('../services/attendanceSyncService');
const { processMultiShiftAttendance } = require('../services/multiShiftProcessingService');
const Settings = require('../../settings/model/Settings');

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
    const SYSTEM_KEY = process.env.HRMS_MICROSERVICE_SECRET_KEY || "hrms-secret-key-2026-abc123xyz789";
    if (!SYSTEM_KEY) {
        console.error('[RealTime] System key not configured in environment variables');
        return res.status(500).json({ success: false, message: 'Server configuration error' });
    }
    if (req.headers['x-system-key'] !== SYSTEM_KEY) {
        console.warn('[RealTime] Unauthorized access attempt blocked.');
        return res.status(401).json({ success: false, message: 'Unauthorized System Access' });
    }

    const logs = req.body;

    // 1. Basic Validation
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({ success: false, message: 'No logs provided' });
    }

    // Validate each log structure
    for (const log of logs) {
        if (!log.employeeId || !log.timestamp || !log.logType) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid log structure. Required: employeeId, timestamp, logType',
                invalidLog: log
            });
        }
        
        // Validate timestamp format
        const timestamp = new Date(log.timestamp);
        if (isNaN(timestamp.getTime())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid timestamp format',
                invalidLog: log
            });
        }
        
        // Validate logType
        const validLogTypes = ['CHECK-IN', 'CHECK-OUT', 'BREAK-OUT', 'BREAK-IN', 'OVERTIME-IN', 'OVERTIME-OUT', null];
        if (!validLogTypes.includes(log.logType.toUpperCase())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid logType. Must be one of: ' + validLogTypes.join(', '),
                invalidLog: log
            });
        }
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

            if (typeUpper === null || VALID_LOG_TYPES.includes(typeUpper)) {
                // Parse timestamp safe
                // Parse timestamp safe - treat as UTC
                const timestampStr = typeof log.timestamp === 'string' && !log.timestamp.endsWith('Z')
                    ? `${log.timestamp}Z`
                    : log.timestamp;
                const timestamp = new Date(timestampStr);
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

                // Add to processing set for ANY valid log type (Thumb Press)
                // This ensures "Thumb Only" punches (normalizedType: null) still trigger calculation
                uniqueEmployees.add(empId);
                uniqueDates.add(formatDate(timestamp));
            }
        }

        // NEW: Apply 30-minute redundancy filtering to real-time logs
        const rawLogsForRedundancyCheck = rawLogsToSave.map(op => op.insertOne.document);
        const filteredLogs = filterRedundantLogs(rawLogsForRedundancyCheck, 30);
        
        console.log(`[RealTime] Redundancy Filter: ${rawLogsForRedundancyCheck.length} -> ${filteredLogs.length} logs`);
        
        // Convert back to bulk write format
        const filteredBulkOps = filteredLogs.map(log => ({
            insertOne: {
                document: log
            }
        }));

        // 3. Bulk Persist (High Performance)
        if (filteredBulkOps.length > 0) {
            // ordered: false = continue even if duplicates fail
            // We expect strict duplicates (same user/time) to fail due to db index, which is GOOD.
            await AttendanceRawLog.bulkWrite(filteredBulkOps, { ordered: false }).catch(err => {
                // Ignore duplicate key errors (code 11000)
                if (err.code !== 11000 && !err.writeErrors?.every(e => e.code === 11000)) {
                    console.error('RealTime Sync BulkWrite partial error:', err.message);
                }
            });
        }

        // 4. Trigger Multi-Shift Processing Engine
        // Process each affected employee/date combination with multi-shift support

        if (uniqueEmployees.size > 0) {
            console.log(`[RealTime] Processing ${uniqueEmployees.size} employee(s) with multi-shift support`);

            // Get general settings for shift detection
            const generalConfig = await Settings.getSettingsByCategory('general');

            // Process each unique employee
            for (const empNo of uniqueEmployees) {
                try {
                    // Get all raw logs for this employee (for context)
                    const dates = Array.from(uniqueDates);

                    // Extend date range by 1 day on each side for overnight shifts
                    const minDate = new Date(Math.min(...dates.map(d => new Date(d))));
                    minDate.setDate(minDate.getDate() - 1);
                    const maxDate = new Date(Math.max(...dates.map(d => new Date(d))));
                    maxDate.setDate(maxDate.getDate() + 1);

                    // Fetch all logs for this employee in the date range
                    const allLogs = await AttendanceRawLog.find({
                        employeeNumber: empNo,
                        date: {
                            $gte: formatDate(minDate),
                            $lte: formatDate(maxDate),
                        },
                        timestamp: { $gte: new Date('2020-01-01') },
                        type: { $in: ['IN', 'OUT'] }, // Only IN/OUT logs
                    }).sort({ timestamp: 1 }).lean();

                    // Convert to simple format
                    const logs = allLogs.map(log => ({
                        timestamp: new Date(log.timestamp),
                        type: log.type,
                        punch_state: log.type === 'IN' ? 0 : 1,
                        _id: log._id,
                    }));

                    // Process each unique date
                    for (const date of uniqueDates) {
                        await processMultiShiftAttendance(
                            empNo,
                            date,
                            logs,
                            generalConfig
                        );
                    }

                } catch (empError) {
                    console.error(`[RealTime] Error processing employee ${empNo}:`, empError);
                    // Continue with other employees
                }
            }
        }

        const duration = Date.now() - startTime;
        // console.log(`[RealTime] Processed ${rawLogsToSave.length} logs in ${duration}ms`);

        return res.status(200).json({
            success: true,
            processed: filteredBulkOps.length,
            original: rawLogsForRedundancyCheck.length,
            filtered: rawLogsForRedundancyCheck.length - filteredBulkOps.length,
            message: 'Sync successful with redundancy filtering'
        });

    } catch (error) {
        console.error('[RealTime] Critical Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
