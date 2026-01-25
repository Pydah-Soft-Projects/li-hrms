/**
 * Multi-Shift Attendance Processing Service
 * Integrates multi-shift detection into attendance processing pipeline
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const { detectAndPairShifts, calculateDailyTotals } = require('./multiShiftDetectionService');
const { processSmartINDetection } = require('./smartINDetectionService');
const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');
const Employee = require('../../employees/model/Employee');
const OD = require('../../leaves/model/OD');

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Process multi-shift attendance for a single employee on a single date
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date in YYYY-MM-DD format
 * @param {Array} rawLogs - All raw logs for this employee (sorted chronologically)
 * @param {Object} generalConfig - General settings
 * @returns {Promise<Object>} Processing result
 */
async function processMultiShiftAttendance(employeeNumber, date, rawLogs, generalConfig) {
    console.log(`\n[Multi-Shift Processing] Employee: ${employeeNumber}, Date: ${date}`);

    try {
        // Step 1: Detect and pair shifts
        const shifts = detectAndPairShifts(rawLogs, date, 3); // Max 3 shifts

        if (shifts.length === 0) {
            console.log(`[Multi-Shift Processing] No shifts detected for ${date}`);
            return { success: false, reason: 'No shifts detected' };
        }

        console.log(`[Multi-Shift Processing] Detected ${shifts.length} shift(s)`);

        // Step 2: Get employee ID for OD and shift assignment
        const employee = await Employee.findOne({ emp_no: employeeNumber.toUpperCase() }).select('_id department_id division_id');
        const employeeId = employee ? employee._id : null;

        // Step 3: Get approved OD hours for this day
        let odHours = 0;
        if (employeeId) {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const approvedODs = await OD.find({
                employeeId,
                status: 'approved',
                $or: [
                    { fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart } }
                ],
                isActive: true
            });

            for (const od of approvedODs) {
                if (od.odType_extended === 'hours') {
                    odHours += od.durationHours || 0;
                } else if (od.odType_extended === 'half_day' || od.isHalfDay) {
                    odHours += 4.5;
                } else {
                    odHours += 9;
                }
            }
        }

        // Step 4: Process each shift - assign shift, calculate late/early
        const processedShifts = [];

        for (const shift of shifts) {
            // Detect and assign shift
            let shiftAssignment = null;
            if (shift.inTime) {
                try {
                    shiftAssignment = await detectAndAssignShift(
                        employeeNumber,
                        date,
                        shift.inTime,
                        shift.outTime,
                        generalConfig
                    );
                } catch (error) {
                    console.error(`[Multi-Shift Processing] Error detecting shift:`, error);
                }
            }

            // Build shift object
            const processedShift = {
                shiftNumber: shift.shiftNumber,
                inTime: shift.inTime,
                outTime: shift.outTime,
                duration: shift.duration,
                workingHours: shift.workingHours || 0,
                otHours: 0, // Will be calculated based on shift duration
                status: shift.status,
            };

            // Add shift assignment data
            if (shiftAssignment && shiftAssignment.success) {
                processedShift.matchedShiftId = shiftAssignment.assignedShift;
                processedShift.shiftName = shiftAssignment.shiftName || null;
                processedShift.lateInMinutes = shiftAssignment.lateInMinutes || null;
                processedShift.earlyOutMinutes = shiftAssignment.earlyOutMinutes || null;
                processedShift.isLateIn = shiftAssignment.isLateIn || false;
                processedShift.isEarlyOut = shiftAssignment.isEarlyOut || false;

                // Calculate OT hours for this shift
                if (shift.outTime && shiftAssignment.expectedHours) {
                    const shiftDuration = shift.workingHours || 0;
                    processedShift.otHours = Math.max(0, shiftDuration - shiftAssignment.expectedHours);
                }
            }

            processedShifts.push(processedShift);
        }

        // Step 5: Calculate daily totals
        const totals = calculateDailyTotals(processedShifts);

        // Step 6: Determine overall status
        let status = 'ABSENT';
        if (totals.totalShifts > 0) {
            if (totals.lastOutTime) {
                // Has complete shift(s)
                const totalEffectiveHours = totals.totalWorkingHours + odHours;

                // Get expected hours from first shift assignment
                const firstShiftAssignment = processedShifts[0].matchedShiftId ?
                    processedShifts.find(s => s.matchedShiftId) : null;

                if (firstShiftAssignment && firstShiftAssignment.matchedShiftId) {
                    // Use 70% threshold
                    const expectedHours = processedShifts.reduce((sum, s) => {
                        // Get expected hours from shift assignment (need to fetch from DB)
                        return sum + 8; // Default 8 hours per shift
                    }, 0);

                    const threshold = expectedHours * 0.7;
                    status = totalEffectiveHours >= threshold ? 'PRESENT' : 'HALF_DAY';
                } else {
                    status = 'PRESENT';
                }
            } else {
                status = 'PARTIAL'; // Has IN but no OUT
            }
        }

        // Step 7: Prepare update data for AttendanceDaily
        const updateData = {
            // Multi-shift fields
            shifts: processedShifts,
            totalShifts: totals.totalShifts,
            totalWorkingHours: totals.totalWorkingHours,
            totalOTHours: totals.totalOTHours,

            // Backward compatibility fields
            inTime: totals.firstInTime,
            outTime: totals.lastOutTime,
            totalHours: totals.totalWorkingHours,
            odHours,
            status,
            lastSyncedAt: new Date(),

            // Primary shift fields (from first shift)
            shiftId: processedShifts[0]?.matchedShiftId || null,
            lateInMinutes: processedShifts[0]?.lateInMinutes || null,
            earlyOutMinutes: processedShifts[0]?.earlyOutMinutes || null,
            isLateIn: processedShifts[0]?.isLateIn || false,
            isEarlyOut: processedShifts[0]?.isEarlyOut || false,
            expectedHours: 8, // Default, should be from shift assignment
            otHours: totals.totalOTHours,
        };

        // Step 8: Update or create daily record
        console.log(`[Multi-Shift Processing] Updating daily record with ${totals.totalShifts} shift(s)`);

        const dailyRecord = await AttendanceDaily.findOneAndUpdate(
            { employeeNumber, date },
            {
                $set: updateData,
                $addToSet: { source: 'biometric-realtime' },
            },
            { upsert: true, new: true }
        );

        console.log(`[Multi-Shift Processing] ✓ Daily record updated successfully`);

        return {
            success: true,
            dailyRecord,
            shiftsProcessed: totals.totalShifts,
            totalHours: totals.totalWorkingHours,
            totalOT: totals.totalOTHours,
        };

    } catch (error) {
        console.error(`[Multi-Shift Processing] Error:`, error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Process multiple employees and dates with multi-shift support
 * @param {Object} logsByEmployee - Logs grouped by employee
 * @param {Object} generalConfig - General settings
 * @returns {Promise<Object>} Processing statistics
 */
async function processMultiShiftBatch(logsByEmployee, generalConfig) {
    const stats = {
        employeesProcessed: 0,
        datesProcessed: 0,
        totalShiftsCreated: 0,
        errors: [],
    };

    for (const [employeeNumber, logs] of Object.entries(logsByEmployee)) {
        try {
            // Group logs by date
            const logsByDate = {};

            for (const log of logs) {
                const date = formatDate(log.timestamp);
                if (!logsByDate[date]) {
                    logsByDate[date] = [];
                }
                logsByDate[date].push(log);
            }

            // Process each date
            for (const [date, dateLogs] of Object.entries(logsByDate)) {
                const result = await processMultiShiftAttendance(
                    employeeNumber,
                    date,
                    logs, // Pass all logs for context
                    generalConfig
                );

                if (result.success) {
                    stats.datesProcessed++;
                    stats.totalShiftsCreated += result.shiftsProcessed || 0;
                } else {
                    stats.errors.push(`${employeeNumber} on ${date}: ${result.error || result.reason}`);
                }
            }

            stats.employeesProcessed++;

        } catch (error) {
            stats.errors.push(`Error processing ${employeeNumber}: ${error.message}`);
        }
    }

    return stats;
}

module.exports = {
    processMultiShiftAttendance,
    processMultiShiftBatch,
    formatDate,
};
