const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const Settings = require('../../settings/model/Settings');
const cacheService = require('../../shared/services/cacheService');

/**
 * Second Salary OT Pay Calculation Service
 * Handles overtime pay calculation specifically for 2nd salary cycle
 */

/**
 * Resolve OT settings for a department and optional division, applying department/division overrides to global overtime defaults.
 *
 * Caches the resolved settings for 300 seconds; on error returns defaults with zero values.
 * @param {String} departmentId - Department identifier.
 * @param {String|null} [divisionId=null] - Optional division identifier.
 * @returns {{otPayPerHour: number, minOTHours: number}} Resolved OT settings where `otPayPerHour` is the pay rate per OT hour and `minOTHours` is the minimum OT hours threshold.
async function getResolvedOTSettings(departmentId, divisionId = null) {
    try {
        const cacheKey = `settings:ot:second-salary:dept:${departmentId}:div:${divisionId || 'none'}`;
        let resolved = await cacheService.get(cacheKey);
        if (resolved) return resolved;

        // Get department/division settings
        const deptSettings = await DepartmentSettings.getByDeptAndDiv(departmentId, divisionId);

        // Get global OT settings
        const globalPayPerHour = await Settings.findOne({ key: 'ot_pay_per_hour', category: 'overtime' }).lean();
        const globalMinHours = await Settings.findOne({ key: 'ot_min_hours', category: 'overtime' }).lean();

        // Merge: Department settings override global
        resolved = {
            otPayPerHour: deptSettings?.ot?.otPayPerHour ?? (globalPayPerHour?.value || 0),
            minOTHours: deptSettings?.ot?.minOTHours ?? (globalMinHours?.value || 0),
        };

        // Cache for 5 minutes during batch processing
        await cacheService.set(cacheKey, resolved, 300);

        return resolved;
    } catch (error) {
        console.error('Error getting resolved OT settings for second salary:', error);
        return {
            otPayPerHour: 0,
            minOTHours: 0,
        };
    }
}

/**
 * Compute overtime pay and eligibility for the second salary cycle.
 *
 * @param {number} otHours - Total overtime hours; negative or missing values are treated as 0.
 * @param {string} departmentId - Department identifier used to resolve department-specific OT settings.
 * @param {string|null} [divisionId=null] - Optional division identifier used when resolving OT settings.
 * @returns {Object} An object containing OT input, eligibility and calculated pay:
 *  - `otHours` {number} — normalized OT hours.
 *  - `eligibleOTHours` {number} — OT hours that meet the minimum threshold.
 *  - `otPayPerHour` {number} — resolved pay rate per OT hour.
 *  - `minOTHours` {number} — resolved minimum OT hours required for eligibility.
 *  - `otPay` {number} — total OT pay rounded to two decimal places.
 *  - `isEligible` {boolean} — `true` if `otHours` is greater than or equal to `minOTHours`, `false` otherwise.
 */
async function calculateOTPay(otHours, departmentId, divisionId = null) {
    // Validate inputs
    if (otHours === null || otHours === undefined || otHours < 0) {
        otHours = 0;
    }

    // Get resolved OT settings
    const otSettings = await getResolvedOTSettings(departmentId, divisionId);

    const otPayPerHour = otSettings.otPayPerHour || 0;
    const minOTHours = otSettings.minOTHours || 0;

    // Check eligibility
    let eligibleOTHours = 0;
    if (otHours >= minOTHours) {
        eligibleOTHours = otHours;
    }

    // Calculate OT pay
    const otPay = eligibleOTHours * otPayPerHour;

    return {
        otHours,
        eligibleOTHours,
        otPayPerHour,
        minOTHours,
        otPay: Math.round(otPay * 100) / 100,
        isEligible: otHours >= minOTHours,
    };
}

module.exports = {
    getResolvedOTSettings,
    calculateOTPay,
};