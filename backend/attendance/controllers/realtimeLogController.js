/**
 * Real-Time Log Controller
 * Handles immediate biometric data processing from the microservice
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const { processAndAggregateLogs, formatDate } = require('../services/attendanceSyncService');
const { processMultiShiftAttendance } = require('../services/multiShiftProcessingService');
const Settings = require('../../settings/model/Settings');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

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
                // Parse timestamp safe - treat as UTC
                const timestampStr = typeof log.timestamp === 'string' && !log.timestamp.endsWith('Z')
                    ? `${log.timestamp}Z`
                    : log.timestamp;
                const timestamp = new Date(timestampStr);
                if (isNaN(timestamp.getTime())) continue;
                // Robust timestamp normalization
                let timestamp;
                const rawTimestampStr = log.timestamp;

                // If the machine sends a bare string like "2026-02-03 10:54:04"
                // it might be UTC or IST depending on the machine's reset state.
                const parsed = dayjs(rawTimestampStr);

                if (parsed.isValid()) {
                    // Check if it has explicit offset
                    const hasExplicitOffset = /Z|[+-]\d{2}(:?\d{2})?$/.test(String(rawTimestampStr));

                    if (hasExplicitOffset) {
                        // Trust explicit offsets (standard ISO format)
                        timestamp = parsed.toDate();
                    } else {
                        // Heuristic: If it's a bare string, we need to decide if it's UTC or IST.
                        // The user says devices keep resetting to UTC, but people are punching in IST.
                        // However, many ZK devices just output local time as a bare string.

                        // Let's assume the device *thinks* it's in the timezone it was configured with.
                        // If we just use new Date(bare_string), it uses system local time (which is IST on this server).
                        // If the machine is in UTC but the time LOOKS LIKE IST (e.g. machine says 11:00 AM but it's 11:00 AM IST),
                        // then new Date("2026-02-03 11:00:00") will correctly result in 11:00 AM IST.

                        // IF the machine is in UTC and says 05:30 AM (when it's 11:00 AM IST), 
                        // then we need to detect this and ADD 5:30.

                        const serverTime = dayjs();
                        const timeDiff = Math.abs(serverTime.diff(parsed, 'hour'));

                        if (timeDiff > 4 && timeDiff < 7) {
                            // Likely machine is in UTC (off by ~5.5 hours)
                            // Correct it by assuming the bare string WAS intended to be IST
                            // or by adding 5.5 hours if it was actually UTC.
                            // Decision: If machine is in UTC, it reports 05:30 when it's 11:00.
                            // We should ADD 5.5 hours to get the real IST moment.
                            timestamp = parsed.add(330, 'minute').toDate();
                            console.log(`[RealTime] Timezone correction applied for ${empId}: ${rawTimestampStr} -> ${timestamp.toISOString()}`);
                        } else {
                            timestamp = parsed.toDate();
                        }
                    }
                }

                if (!timestamp || isNaN(timestamp.getTime())) continue;

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

                // Trigger processing for ALL valid logs, not just normalized IN/OUT
                // This allows generic punches to be handled by the processing engine
                uniqueEmployees.add(empId);
                uniqueDates.add(formatDate(timestamp));
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
                        // type: { $in: ['IN', 'OUT'] }, // REMOVED: Include all logs for intelligent pairing
                    }).sort({ timestamp: 1 }).lean();

                    // Convert to simple format
                    const logs = allLogs.map(log => ({
                        timestamp: new Date(log.timestamp),
                        type: log.type,
                        punch_state: log.type === 'IN' ? 0 : (log.type === 'OUT' ? 1 : null),
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
            processed: rawLogsToSave.length,
            message: 'Sync successful'
        });

    } catch (error) {
        console.error('[RealTime] Critical Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
