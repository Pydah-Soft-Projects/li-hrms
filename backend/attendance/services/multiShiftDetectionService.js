/**
 * Multi-Shift Detection Service
 * Handles detection and pairing of multiple shifts per day
 */

/**
 * Filter duplicate IN punches based on 1-hour threshold
 * @param {Array} inPunches - Array of IN punches sorted by timestamp
 * @param {Number} thresholdMinutes - Minimum gap in minutes (default: 60)
 * @returns {Array} Filtered array of valid IN punches
 */
function filterDuplicateIns(inPunches, thresholdMinutes = 60) {
    if (!inPunches || inPunches.length === 0) return [];

    const valid = [];

    for (let i = 0; i < inPunches.length; i++) {
        if (i === 0) {
            // First IN is always valid
            valid.push(inPunches[i]);
        } else {
            // Check gap from previous valid IN
            const prevValidIN = valid[valid.length - 1];
            const gapMinutes = (inPunches[i].timestamp - prevValidIN.timestamp) / (1000 * 60);

            if (gapMinutes >= thresholdMinutes) {
                valid.push(inPunches[i]);
            } else {
                console.log(`[Multi-Shift] Ignoring duplicate IN at ${inPunches[i].timestamp} (gap: ${gapMinutes.toFixed(2)} min < ${thresholdMinutes} min)`);
            }
        }
    }

    return valid;
}

/**
 * Find the next OUT punch after a given IN timestamp
 * @param {Array} outPunches - Array of OUT punches sorted by timestamp
 * @param {Date} inTimestamp - IN timestamp to find OUT for
 * @returns {Object|null} Next OUT punch or null
 */
function findNextOut(outPunches, inTimestamp) {
    if (!outPunches || outPunches.length === 0) return null;

    for (const outPunch of outPunches) {
        if (outPunch.timestamp > inTimestamp) {
            return outPunch;
        }
    }

    return null;
}

/**
 * Check if a date string matches a Date object's date
 * @param {Date} dateObj - Date object
 * @param {String} dateStr - Date string in YYYY-MM-DD format
 * @returns {Boolean}
 */
function isSameDay(dateObj, dateStr) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const formatted = `${year}-${month}-${day}`;
    return formatted === dateStr;
}

/**
 * Detect and pair multiple shifts from raw punches
 * @param {Array} rawLogs - Array of raw punch logs
 * @param {String} date - Date in YYYY-MM-DD format
 * @param {Number} maxShifts - Maximum shifts per day (default: 3)
 * @returns {Array} Array of shift objects
 */
function detectAndPairShifts(rawLogs, date, maxShifts = 3) {
    if (!rawLogs || rawLogs.length === 0) {
        return [];
    }

    console.log(`\n[Multi-Shift] Detecting shifts for date: ${date}`);
    console.log(`[Multi-Shift] Total raw logs: ${rawLogs.length}`);

    // Step 1: Filter punches for this date and sort by timestamp
    const punches = rawLogs
        .filter(log => {
            const logDate = new Date(log.timestamp);
            return isSameDay(logDate, date);
        })
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(`[Multi-Shift] Punches for ${date}: ${punches.length}`);

    if (punches.length === 0) {
        return [];
    }

    // Step 2: Separate INs and OUTs
    const ins = punches.filter(p => p.punch_state === 0 || p.punch_state === '0' || p.type === 'IN');
    const outs = punches.filter(p => p.punch_state === 1 || p.punch_state === '1' || p.type === 'OUT');

    console.log(`[Multi-Shift] INs: ${ins.length}, OUTs: ${outs.length}`);

    if (ins.length === 0) {
        console.log('[Multi-Shift] No IN punches found');
        return [];
    }

    // Step 3: Filter duplicate INs (1-hour threshold)
    const validIns = filterDuplicateIns(ins, 60);
    console.log(`[Multi-Shift] Valid INs after filtering: ${validIns.length}`);

    // Step 4: Pair each IN with next OUT (up to maxShifts)
    const shifts = [];

    for (let i = 0; i < validIns.length && i < maxShifts; i++) {
        const inPunch = validIns[i];
        const outPunch = findNextOut(outs, inPunch.timestamp);

        const shift = {
            shiftNumber: i + 1,
            inTime: inPunch.timestamp,
            outTime: outPunch ? outPunch.timestamp : null,
            status: outPunch ? 'complete' : 'incomplete',
            inPunchId: inPunch._id || inPunch.id,
            outPunchId: outPunch ? (outPunch._id || outPunch.id) : null,
        };

        // Calculate duration if complete
        if (shift.outTime) {
            const durationMs = new Date(shift.outTime) - new Date(shift.inTime);
            shift.duration = Math.round(durationMs / (1000 * 60)); // in minutes
            shift.workingHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100; // in hours
        }

        shifts.push(shift);

        console.log(`[Multi-Shift] Shift ${i + 1}: IN=${inPunch.timestamp}, OUT=${outPunch ? outPunch.timestamp : 'INCOMPLETE'}, Duration=${shift.duration || 0} min`);
    }

    return shifts;
}

/**
 * Calculate aggregate totals from shifts
 * @param {Array} shifts - Array of shift objects
 * @returns {Object} Aggregate totals
 */
function calculateDailyTotals(shifts) {
    if (!shifts || shifts.length === 0) {
        return {
            totalShifts: 0,
            totalWorkingHours: 0,
            totalOTHours: 0,
            firstInTime: null,
            lastOutTime: null,
        };
    }

    const completeShifts = shifts.filter(s => s.status === 'complete');

    return {
        totalShifts: shifts.length,
        totalWorkingHours: completeShifts.reduce((sum, s) => sum + (s.workingHours || 0), 0),
        totalOTHours: completeShifts.reduce((sum, s) => sum + (s.otHours || 0), 0),
        firstInTime: shifts[0]?.inTime || null,
        lastOutTime: shifts[shifts.length - 1]?.outTime || null,
    };
}

module.exports = {
    filterDuplicateIns,
    findNextOut,
    detectAndPairShifts,
    calculateDailyTotals,
    isSameDay,
};
