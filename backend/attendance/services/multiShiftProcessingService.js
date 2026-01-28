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

const formatDate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Calculate overlap between two time ranges in minutes
 */
function getOverlapMinutes(startA, endA, startB, endB) {
    if (!startA || !endA || !startB || !endB) return 0;
    const start = Math.max(startA.getTime(), startB.getTime());
    const end = Math.min(endA.getTime(), endB.getTime());
    const overlap = Math.max(0, end - start);
    return overlap / (1000 * 60);
}

/**
 * Helper to parse HH:MM to a Date object on a specific refernce date
 */
function timeStringToDate(timeStr, refDate, isNextDay = false) {
    if (!timeStr) return null;
    const [hours, mins] = timeStr.split(':').map(Number);
    const date = new Date(refDate);
    date.setHours(hours, mins, 0, 0);
    if (isNextDay) date.setDate(date.getDate() + 1);
    return date;
}

/**
 * Process multi-shift attendance for a single employee on a single date
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date in YYYY-MM-DD format
 * @param {Array} rawLogs - All raw logs for this employee (sorted chronologically)
 * @param {Object} generalConfig - General settings
 * @returns {Promise<Object>} Processing result
 */
async function processMultiShiftAttendance(employeeNumber, date, rawLogs, generalConfig) {

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
        let odDetails = null;
        let approvedODs = []; // Initialize here for scope

        if (employeeId) {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            approvedODs = await OD.find({
                employeeId,
                status: 'approved',
                $or: [
                    { fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart } }
                ],
                isActive: true
            });

            for (const od of approvedODs) {
                // For the first OD, we'll store its details for display
                if (!odDetails) {
                    odDetails = {
                        odStartTime: od.startTime,
                        odEndTime: od.endTime,
                        durationHours: od.durationHours,
                        odType: od.odType_extended || (od.isHalfDay ? 'half_day' : 'full_day'),
                        odId: od._id,
                        approvedAt: od.updatedAt,
                        approvedBy: od.approvedBy
                    };
                }

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
            // Detect shift for this punch pair
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
                } catch (assignError) {
                    console.error(`[Multi-Shift Processing] Error in shift assignment:`, assignError);
                }
                // Build shift object
                const processedShift = {
                    shiftNumber: shift.shiftNumber,
                    inTime: shift.inTime,
                    outTime: shift.outTime,
                    duration: shift.duration,
                    punchHours: shift.workingHours || 0,
                    workingHours: shift.workingHours || 0,
                    odHours: 0,
                    extraHours: 0,
                    otHours: 0,
                    status: shift.status,
                };

                // Add shift assignment data & Surgical OD Integration
                if (shiftAssignment && shiftAssignment.success) {
                    processedShift.shiftId = shiftAssignment.assignedShift;
                    processedShift.shiftName = shiftAssignment.shiftName || null;
                    processedShift.shiftStartTime = shiftAssignment.shiftStartTime || null;
                    processedShift.shiftEndTime = shiftAssignment.shiftEndTime || null;
                    processedShift.lateInMinutes = shiftAssignment.lateInMinutes || null;
                    processedShift.earlyOutMinutes = shiftAssignment.earlyOutMinutes || null;
                    processedShift.isLateIn = shiftAssignment.isLateIn || false;
                    processedShift.isEarlyOut = shiftAssignment.isEarlyOut || false;

                    // GAP-FILLING OD LOGIC
                    if (approvedODs && approvedODs.length > 0) {
                        const shiftStart = timeStringToDate(shiftAssignment.shiftStartTime, date);
                        const shiftEnd = timeStringToDate(shiftAssignment.shiftEndTime, date, shiftAssignment.shiftEndTime < shiftAssignment.shiftStartTime);

                        const punchIn = new Date(shift.inTime);
                        const punchOut = shift.outTime ? new Date(shift.outTime) : null;

                        let addedOdMinutes = 0;

                        for (const od of approvedODs) {
                            if (od.odType_extended === 'hours' && od.odStartTime && od.odEndTime) {
                                const odStart = timeStringToDate(od.odStartTime, date);
                                const odEnd = timeStringToDate(od.odEndTime, date, od.odEndTime < od.odStartTime);

                                // 1. Calculate Overlap between OD and Shift range
                                const odInShiftOverlap = getOverlapMinutes(shiftStart, shiftEnd, odStart, odEnd);

                                // 2. Calculate portion of OD already covered by Punches
                                let odInPunchOverlap = 0;
                                if (punchIn && punchOut) {
                                    odInPunchOverlap = getOverlapMinutes(punchIn, punchOut, odStart, odEnd);
                                }

                                // 3. Gap Hours = (OD in Shift) - (OD in Punch)
                                const gapMinutes = Math.max(0, odInShiftOverlap - odInPunchOverlap);
                                addedOdMinutes += gapMinutes;

                                // 4. Check for Penalty Waiver
                                // Waive Late In if OD covers the start gap
                                if (processedShift.isLateIn && odStart <= shiftStart && odEnd >= punchIn) {
                                    processedShift.isLateIn = false;
                                    console.log(`[OD-Integration] Waiving Late In for ${employeeNumber} due to OD ${od.odStartTime}-${od.odEndTime}`);
                                }
                                // Waive Early Out if OD covers the end gap
                                if (processedShift.isEarlyOut && punchOut && odStart <= punchOut && odEnd >= shiftEnd) {
                                    processedShift.isEarlyOut = false;
                                    console.log(`[OD-Integration] Waiving Early Out for ${employeeNumber} due to OD ${od.odStartTime}-${od.odEndTime}`);
                                }
                            }
                        }

                        const addedOdHours = Math.round((addedOdMinutes / 60) * 100) / 100;
                        processedShift.odHours = addedOdHours;
                        processedShift.workingHours = Math.round((processedShift.punchHours + addedOdHours) * 100) / 100;
                    }

                    // Calculate Extra Hours for this segment
                    if (shiftAssignment.expectedHours) {
                        const totalDuration = processedShift.workingHours || 0;
                        processedShift.extraHours = Math.max(0, totalDuration - shiftAssignment.expectedHours);
                        processedShift.extraHours = Math.round(processedShift.extraHours * 100) / 100;
                    }
                    // Determine Shift Status & Payable Value
                    const expectedDuration = shiftAssignment.expectedHours || 8;
                    if (processedShift.workingHours >= (expectedDuration * 0.9)) {
                        processedShift.status = 'PRESENT';
                        processedShift.payableShift = 1;
                    } else if (processedShift.workingHours >= (expectedDuration * 0.45)) {
                        processedShift.status = 'HALF_DAY';
                        processedShift.payableShift = 0.5;
                    } else {
                        processedShift.status = 'ABSENT';
                        processedShift.payableShift = 0;
                    }
                }

                processedShifts.push(processedShift);
            }
        } // End of for (const shift of shifts)

        // Step 5: Calculate daily totals
        const totals = calculateDailyTotals(processedShifts);

        // Step 6: Determine overall status
        const totalPayableShifts = processedShifts.reduce((sum, s) => sum + (s.payableShift || 0), 0);

        let status = 'ABSENT';
        if (totals.totalShifts > 0) {
            if (totals.lastOutTime) {
                if (totalPayableShifts >= 1) {
                    status = 'PRESENT';
                } else if (totalPayableShifts >= 0.5) {
                    status = 'HALF_DAY';
                } else {
                    status = 'ABSENT';
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
            extraHours: totals.totalExtraHours,
            payableShifts: totalPayableShifts,

            // Backward compatibility fields (Metrics)
            inTime: totals.firstInTime,
            outTime: totals.lastOutTime,
            totalHours: totals.totalWorkingHours,
            odHours,
            odDetails,
            status,
            lastSyncedAt: new Date(),

            // Primary shift fields (from first shift)
            shiftId: processedShifts[0]?.shiftId || null,
            lateInMinutes: processedShifts[0]?.lateInMinutes || null,
            earlyOutMinutes: processedShifts[0]?.earlyOutMinutes || null,
            isLateIn: processedShifts[0]?.isLateIn || false,
            isEarlyOut: processedShifts[0]?.isEarlyOut || false,
            expectedHours: processedShifts[0]?.expectedHours || 8, // Use detected expected hours
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
                console.log(`[DEBUG] Shift Assignment for ${employeeNumber}:`, JSON.stringify(shiftAssignment, null, 2));

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
