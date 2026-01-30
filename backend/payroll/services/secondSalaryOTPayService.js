const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const Settings = require('../../settings/model/Settings');
const cacheService = require('../../shared/services/cacheService');

/**
 * Second Salary OT Pay Calculation Service
 * Handles overtime pay calculation specifically for 2nd salary cycle
 */

/**
 * Get resolved OT settings for a department
 * @param {String} departmentId - Department ID
 * @returns {Object} Resolved OT settings
 */
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
 * Calculate OT pay for second salary
 * @param {Number} otHours - Total OT hours
 * @param {String} departmentId - Department ID
 * @returns {Object} OT pay calculation result
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
