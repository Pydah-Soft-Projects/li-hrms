/**
 * Smart IN Detection Service
 * Handles intelligent duplicate IN detection with grace period logic
 */

const AttendanceDeductionSettings = require('../model/AttendanceDeductionSettings');

/**
 * Get grace period from attendance deduction settings
 * @param {String} departmentId - Department ID (optional)
 * @param {String} divisionId - Division ID (optional)
 * @returns {Promise<Number>} Grace period in minutes
 */
async function getGracePeriod(departmentId = null, divisionId = null) {
    try {
        const settings = await AttendanceDeductionSettings.getActiveSettings();

        // Get early out grace period
        const earlyOutGrace = settings?.deductionRules?.earlyOutGrace || 0;

        // If 0, use 15 minutes default
        return earlyOutGrace > 0 ? earlyOutGrace : 15;
    } catch (error) {
        console.error('[Smart IN] Error getting grace period:', error);
        return 15; // Default fallback
    }
}

/**
 * Add minutes to a Date object
 * @param {Date} date - Base date
 * @param {Number} minutes - Minutes to add
 * @returns {Date} New date with added minutes
 */
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Smart IN detection with grace period logic
 * @param {Object} newIN - New IN punch object
 * @param {Object} previousIN - Previous IN punch (if exists)
 * @param {Object} assignedShift - Assigned shift for previous IN
 * @param {Number} gracePeriod - Grace period in minutes
 * @returns {Object} Detection result with action and metadata
 */
function smartINDetection(newIN, previousIN, assignedShift, gracePeriod) {
    // Case 1: No previous IN - this is the first shift
    if (!previousIN) {
        return {
            action: 'NEW_SHIFT',
            reason: 'First shift of the day',
        };
    }

    // Case 2: Previous IN has OUT - use normal 1-hour rule
    if (previousIN.hasOut) {
        const hourGap = (newIN.timestamp - previousIN.timestamp) / (1000 * 60 * 60);

        if (hourGap >= 1) {
            return {
                action: 'NEW_SHIFT',
                reason: `1+ hour gap from previous IN (${hourGap.toFixed(2)} hours)`,
            };
        } else {
            return {
                action: 'IGNORE',
                reason: `Less than 1 hour gap from previous IN (${hourGap.toFixed(2)} hours)`,
            };
        }
    }

    // Case 3: Previous IN has NO OUT - Smart Detection
    console.log(`[Smart IN] Previous IN has no OUT, applying smart detection`);

    // If no assigned shift, fallback to 1-hour rule
    if (!assignedShift) {
        const hourGap = (newIN.timestamp - previousIN.timestamp) / (1000 * 60 * 60);

        if (hourGap >= 1) {
            return {
                action: 'NEW_SHIFT',
                reason: `No assigned shift, 1+ hour gap (${hourGap.toFixed(2)} hours)`,
            };
        } else {
            return {
                action: 'IGNORE',
                reason: `No assigned shift, less than 1 hour gap (${hourGap.toFixed(2)} hours)`,
            };
        }
    }

    // Get shift end time and grace end time
    const shiftEndTime = new Date(assignedShift.endTime);
    const graceEndTime = addMinutes(shiftEndTime, gracePeriod);
    const newINTime = new Date(newIN.timestamp);

    console.log(`[Smart IN] Shift end: ${shiftEndTime.toISOString()}`);
    console.log(`[Smart IN] Grace end: ${graceEndTime.toISOString()} (${gracePeriod} min)`);
    console.log(`[Smart IN] New IN: ${newINTime.toISOString()}`);

    // Case A: New IN is BEFORE shift end time
    if (newINTime < shiftEndTime) {
        return {
            action: 'IGNORE',
            reason: `Still within shift working hours (shift ends at ${shiftEndTime.toLocaleTimeString()})`,
        };
    }

    // Case B: New IN is WITHIN grace period
    if (newINTime <= graceEndTime) {
        return {
            action: 'CONVERT_TO_OUT',
            outTime: newINTime, // Use IN timestamp as OUT
            reason: `Within grace period after shift end (${gracePeriod} min)`,
        };
    }

    // Case C: New IN is AFTER grace period
    if (newINTime > graceEndTime) {
        return {
            action: 'AUTO_CLOSE_AND_NEW_SHIFT',
            previousOUT: newINTime, // Use IN timestamp as OUT (to capture OT)
            newShiftIN: newINTime,
            reason: `Beyond grace period, auto-close previous shift with OT`,
        };
    }
}

/**
 * Process smart IN detection for a new punch
 * @param {Object} newPunch - New IN punch
 * @param {Object} existingShifts - Existing shifts for the day
 * @param {Object} assignedShifts - Assigned shifts for the employee
 * @param {String} departmentId - Department ID
 * @param {String} divisionId - Division ID
 * @returns {Promise<Object>} Processing result
 */
async function processSmartINDetection(newPunch, existingShifts, assignedShifts, departmentId, divisionId) {
    // Get grace period
    const gracePeriod = await getGracePeriod(departmentId, divisionId);

    console.log(`\n[Smart IN] Processing new IN punch at ${newPunch.timestamp}`);
    console.log(`[Smart IN] Grace period: ${gracePeriod} minutes`);
    console.log(`[Smart IN] Existing shifts: ${existingShifts.length}`);

    // Get the last shift (if exists)
    const lastShift = existingShifts.length > 0 ? existingShifts[existingShifts.length - 1] : null;

    if (!lastShift) {
        // No existing shifts, this is the first shift
        return {
            action: 'NEW_SHIFT',
            reason: 'First shift of the day',
        };
    }

    // Prepare previous IN data
    const previousIN = {
        timestamp: lastShift.inTime,
        hasOut: lastShift.outTime !== null,
    };

    // Get assigned shift for the last shift
    const assignedShift = lastShift.shiftId ?
        assignedShifts.find(s => s._id.toString() === lastShift.shiftId.toString()) :
        null;

    // Run smart detection
    const result = smartINDetection(
        { timestamp: newPunch.timestamp },
        previousIN,
        assignedShift,
        gracePeriod
    );

    console.log(`[Smart IN] Detection result: ${result.action} - ${result.reason}`);

    return result;
}

module.exports = {
    getGracePeriod,
    smartINDetection,
    processSmartINDetection,
    addMinutes,
};
