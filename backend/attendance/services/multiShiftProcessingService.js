/**
 * Multi-Shift Attendance Processing Service
 * Integrates multi-shift detection into attendance processing pipeline
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const { detectAndPairShifts } = require('./multiShiftDetectionService');
const { processSmartINDetection } = require('./smartINDetectionService');
const { detectAndAssignShift, getShiftsForEmployee, calculateTimeDifference, calculateLateIn, calculateEarlyOut, timeToMinutes } = require('../../shifts/services/shiftDetectionService');
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
        // Step 1: Detect, Pair AND Assign Shifts (Integrated Loop)
        // We filter punches dynamically based on the ASSIGNED shift's end time.

        const { isSameDay, findNextOut } = require('./multiShiftDetectionService');
        const MAX_SHIFTS = 3;

        // Prepare Raw Logs
        const allPunches = rawLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const targetDateIns = allPunches.filter(p => {
            const isTargetDate = isSameDay(new Date(p.timestamp), date);
            const isIN = p.punch_state === 0 || p.punch_state === '0' || p.type === 'IN';
            return isTargetDate && isIN;
        });
        const allOuts = allPunches.filter(p => p.punch_state === 1 || p.punch_state === '1' || p.type === 'OUT');

        // Step 2: Get employee ID & ODs (Moved up for context)
        const employee = await Employee.findOne({ emp_no: employeeNumber.toUpperCase() }).select('_id department_id division_id');
        const employeeId = employee ? employee._id : null;

        let odHours = 0;
        let odDetails = null;
        let approvedODs = [];

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

        const processedShifts = [];
        let blockUntilTime = null; // The timestamp until which we ignore new IN punches
        let shiftCounter = 0;

        for (let i = 0; i < targetDateIns.length; i++) {
            if (shiftCounter >= MAX_SHIFTS) break;

            const currentIn = targetDateIns[i];
            const currentInTime = new Date(currentIn.timestamp);

            // 1. Smart Filtering Check
            if (blockUntilTime && currentInTime < blockUntilTime) {
                console.log(`[Multi-Shift] Skipping IN at ${currentIn.timestamp} because it overlaps with previous assigned shift (Blocked until ${blockUntilTime})`);
                continue;
            }

            // 2. Find Pair
            const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
            const nextOut = allOuts.find(out => {
                const tDiff = new Date(out.timestamp) - currentInTime;
                return tDiff > 0 && tDiff <= MAX_WINDOW_MS;
            });

            // --- CONTINUOUS SHIFT SPLITTING CHECK ---
            let isContinuousSplit = false;
            let splitShifts = [];
            const durationMs = nextOut ? (new Date(nextOut.timestamp) - currentInTime) : 0;

            // Trigger if duration > 14 hours
            if (nextOut && durationMs > 14 * 60 * 60 * 1000) {
                try {
                    const candidates = await getShiftsForEmployee(employeeNumber, date);
                    const shiftsList = candidates.shifts || [];

                    const findShiftStartingNear = (time, list) => {
                        return list.find(s => {
                            const diff = calculateTimeDifference(time, s.startTime, date);
                            // 60 min tolerance
                            return diff <= 60;
                        });
                    };

                    const firstShift = findShiftStartingNear(currentInTime, shiftsList);
                    if (firstShift) {
                        const firstEnd = timeStringToDate(firstShift.endTime, date, timeToMinutes(firstShift.endTime) < timeToMinutes(firstShift.startTime));

                        // Look for second shift starting where first ended
                        const secondShift = findShiftStartingNear(firstEnd, shiftsList);
                        if (secondShift) {
                            console.log(`[Multi-Shift] Continuous Chain: ${firstShift.name} -> ${secondShift.name}`);

                            splitShifts.push({ assignedShift: firstShift, inTime: currentIn.timestamp, outTime: firstEnd.toISOString() });
                            splitShifts.push({ assignedShift: secondShift, inTime: firstEnd.toISOString(), outTime: nextOut.timestamp });
                            isContinuousSplit = true;
                        }
                    }
                } catch (e) { console.error("Continuous Split Error", e); }
            }

            if (isContinuousSplit) {
                // Process Split Shifts
                for (const split of splitShifts) {
                    if (shiftCounter >= MAX_SHIFTS) break;
                    shiftCounter++;

                    const sIn = new Date(split.inTime);
                    const sOut = new Date(split.outTime);
                    const sDuration = sOut - sIn;

                    const pShift = {
                        shiftNumber: shiftCounter,
                        inTime: split.inTime,
                        outTime: split.outTime,
                        duration: Math.round(sDuration / 60000),
                        punchHours: Math.round((sDuration / 3600000) * 100) / 100, // Fixed precision
                        workingHours: Math.round((sDuration / 3600000) * 100) / 100,
                        odHours: 0,
                        extraHours: 0,
                        otHours: 0,
                        status: 'complete',
                        inPunchId: currentIn._id || currentIn.id,
                        outPunchId: nextOut ? (nextOut._id || nextOut.id) : null,
                        shiftId: split.assignedShift._id,
                        shiftName: split.assignedShift.name,
                        shiftStartTime: split.assignedShift.startTime,
                        shiftEndTime: split.assignedShift.endTime,
                        expectedHours: split.assignedShift.duration || 8,
                        isLateIn: false,
                        isEarlyOut: false
                    };

                    // Calc Late/Early
                    if (split === splitShifts[0]) {
                        try {
                            const late = calculateLateIn(sIn, split.assignedShift.startTime, split.assignedShift.gracePeriod, date);
                            pShift.lateInMinutes = late || 0;
                            pShift.isLateIn = pShift.lateInMinutes > 0;
                        } catch (err) { }
                    }
                    if (split === splitShifts[splitShifts.length - 1]) {
                        try {
                            const early = calculateEarlyOut(sOut, split.assignedShift.endTime, split.assignedShift.startTime, date);
                            pShift.earlyOutMinutes = early || 0;
                            pShift.isEarlyOut = pShift.earlyOutMinutes > 0;
                        } catch (err) { }
                    }

                    // Dynamic Payable
                    pShift.status = 'PRESENT';
                    pShift.payableShift = split.assignedShift.payableShifts !== undefined ? split.assignedShift.payableShifts : 1;

                    processedShifts.push(pShift);
                }
                blockUntilTime = new Date(nextOut.timestamp);
                continue;
            }

            // 3. Assign Shift (Async) to determing "Block Until"
            let shiftAssignment = null;
            let assignedShiftDef = null;
            try {
                shiftAssignment = await detectAndAssignShift(
                    employeeNumber,
                    date,
                    currentIn.timestamp,
                    nextOut ? nextOut.timestamp : null,
                    generalConfig
                );

                // Fetch Shift Def for Payable Value
                if (shiftAssignment && shiftAssignment.assignedShift) {
                    const Shift = require('../../shifts/model/Shift');
                    assignedShiftDef = await Shift.findById(shiftAssignment.assignedShift).select('payableShifts duration');
                }

            } catch (e) {
                console.error("Assignment Error", e);
            }

            // 4. Determine Block Time for NEXT iteration
            if (shiftAssignment && shiftAssignment.success && shiftAssignment.shiftEndTime) {
                const shiftEnd = timeStringToDate(shiftAssignment.shiftEndTime, date, shiftAssignment.shiftEndTime < shiftAssignment.shiftStartTime);
                blockUntilTime = shiftEnd || new Date(currentInTime.getTime() + 60 * 60 * 1000);
            } else {
                blockUntilTime = new Date(currentInTime.getTime() + 60 * 60 * 1000);
            }

            // 5. Construct Processed Shift Object
            shiftCounter++;
            const pShift = {
                shiftNumber: shiftCounter,
                inTime: currentIn.timestamp,
                outTime: nextOut ? nextOut.timestamp : null,
                duration: Math.round(durationMs / 60000),
                punchHours: Math.round((durationMs / 3600000) * 100) / 100,
                workingHours: Math.round((durationMs / 3600000) * 100) / 100,
                odHours: 0,
                extraHours: 0,
                otHours: 0,
                status: nextOut ? 'complete' : 'incomplete',
                inPunchId: currentIn._id || currentIn.id,
                outPunchId: nextOut ? (nextOut._id || nextOut.id) : null
            };

            // 6. Enrich with Assignment Data
            if (shiftAssignment && shiftAssignment.success) {
                pShift.shiftId = shiftAssignment.assignedShift;
                pShift.shiftName = shiftAssignment.shiftName;
                pShift.shiftStartTime = shiftAssignment.shiftStartTime;
                pShift.shiftEndTime = shiftAssignment.shiftEndTime;
                pShift.lateInMinutes = shiftAssignment.lateInMinutes;
                pShift.earlyOutMinutes = shiftAssignment.earlyOutMinutes;
                pShift.isLateIn = shiftAssignment.isLateIn;
                pShift.isEarlyOut = shiftAssignment.isEarlyOut;

                // Calculate Extra Hours
                if (assignedShiftDef && assignedShiftDef.duration) {
                    const extra = pShift.workingHours - assignedShiftDef.duration;
                    if (extra > 0) {
                        pShift.extraHours = Math.round(extra * 100) / 100;
                    }
                }

                // GAP-FILLING OD LOGIC
                if (approvedODs && approvedODs.length > 0) {
                    const shiftStart = timeStringToDate(shiftAssignment.shiftStartTime, date);
                    const shiftEnd = timeStringToDate(shiftAssignment.shiftEndTime, date, shiftAssignment.shiftEndTime < shiftAssignment.shiftStartTime);

                    const punchIn = new Date(pShift.inTime);
                    const punchOut = pShift.outTime ? new Date(pShift.outTime) : null;

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
                            if (pShift.isLateIn && odStart <= shiftStart && odEnd >= punchIn) {
                                pShift.isLateIn = false;
                            }
                            if (pShift.isEarlyOut && punchOut && odStart <= punchOut && odEnd >= shiftEnd) {
                                pShift.isEarlyOut = false;
                            }
                        }
                    }

                    const addedOdHours = Math.round((addedOdMinutes / 60) * 100) / 100;
                    pShift.odHours = addedOdHours;
                    pShift.workingHours = Math.round((pShift.punchHours + addedOdHours) * 100) / 100;
                }

                // Calculate Extra Hours & Status With Dynamic Payable
                const expectedDuration = shiftAssignment.expectedHours || 8;
                const totalDuration = pShift.workingHours || 0;

                if (shiftAssignment.expectedHours) {
                    pShift.extraHours = Math.max(0, Math.round((totalDuration - shiftAssignment.expectedHours) * 100) / 100);
                }

                // Determine Base Payable Value
                const basePayable = assignedShiftDef && assignedShiftDef.payableShifts !== undefined ? assignedShiftDef.payableShifts : 1;

                if (pShift.workingHours >= (expectedDuration * 0.9)) {
                    pShift.status = 'PRESENT';
                    pShift.payableShift = basePayable;
                } else if (pShift.workingHours >= (expectedDuration * 0.45)) {
                    pShift.status = 'HALF_DAY';
                    pShift.payableShift = basePayable * 0.5;
                } else {
                    pShift.status = 'ABSENT';
                    pShift.payableShift = 0;
                }
            }

            processedShifts.push(pShift);
        }

        // Step 5: Calculate daily totals
        const totals = calculateDailyTotals(processedShifts);

        // Step 6: Determine overall status
        // Step 6: Determine overall status
        const totalPayableShifts = processedShifts.reduce((sum, s) => sum + (s.payableShift || 0), 0);

        // Check for any Present shift
        const hasPresentShift = processedShifts.some(s => s.status === 'complete' || s.status === 'PRESENT' || (s.payableShift && s.payableShift >= 1));

        let status = 'ABSENT';

        if (processedShifts.length > 0) {
            if (hasPresentShift || totalPayableShifts >= 1) {
                status = 'PRESENT';
            } else if (processedShifts.length === 1 && (processedShifts[0].status === 'HALF_DAY' || processedShifts[0].payableShift === 0.5)) {
                status = 'HALF_DAY';
            } else {
                // Determine if PARTIAL or ABSENT based on incomplete punches
                const hasIncomplete = processedShifts.some(s => !s.outTime);
                status = hasIncomplete ? 'PARTIAL' : 'ABSENT';
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

        // findOneAndUpdate does not trigger post-save hook — recalculate monthly summary so totalPayableShifts etc. stay correct
        const { recalculateOnAttendanceUpdate } = require('./summaryCalculationService');
        await recalculateOnAttendanceUpdate(employeeNumber, date);

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
 * Helper to calculate daily totals from processed shifts
 */
function calculateDailyTotals(shifts) {
    let totalWorkingHours = 0;
    let totalOTHours = 0;
    let totalExtraHours = 0;
    let firstInTime = null;
    let lastOutTime = null;

    if (shifts && shifts.length > 0) {
        // Sort by inTime to be safe
        const sorted = [...shifts].sort((a, b) => new Date(a.inTime) - new Date(b.inTime));

        firstInTime = sorted[0].inTime;
        lastOutTime = sorted[sorted.length - 1].outTime;

        for (const shift of shifts) {
            totalWorkingHours += (parseFloat(shift.workingHours) || 0);
            totalOTHours += (parseFloat(shift.otHours) || 0);
            totalExtraHours += (parseFloat(shift.extraHours) || 0);
        }
    }

    return {
        totalShifts: shifts.length,
        totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
        totalOTHours: Math.round(totalOTHours * 100) / 100,
        totalExtraHours: Math.round(totalExtraHours * 100) / 100,
        firstInTime,
        lastOutTime
    };
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
