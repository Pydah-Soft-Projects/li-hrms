/**
 * Punch Filtering Helper
 * Filters raw logs for attendance pairing based on processingMode.strictCheckInOutOnly
 * Design: When strict, only IN and OUT are used for pairing; others stored but ignored
 */

const AttendanceSettings = require('../model/AttendanceSettings');

/**
 * Resolve processingMode from settings doc or object
 */
function resolveProcessingMode(attendanceSettings) {
  if (!attendanceSettings) {
    return { strictCheckInOutOnly: true };
  }
  if (AttendanceSettings.getProcessingMode) {
    return AttendanceSettings.getProcessingMode(attendanceSettings);
  }
  const pm = attendanceSettings.processingMode || {};
  return {
    strictCheckInOutOnly: pm.strictCheckInOutOnly !== false,
  };
}

/**
 * Filter raw logs for pairing. When strictCheckInOutOnly is true, only IN and OUT are included.
 * @param {Array} rawLogs - Array of log objects with { type, timestamp, ... }
 * @param {Object} attendanceSettings - AttendanceSettings doc or { processingMode }
 * @returns {Array} Filtered logs for pairing
 */
function getPunchesForPairing(rawLogs, attendanceSettings = null) {
  if (!rawLogs || !Array.isArray(rawLogs)) return [];
  const pm = resolveProcessingMode(attendanceSettings);
  return filterPunchesForPairing(rawLogs, pm);
}

/**
 * Filter punches when processingMode already resolved
 * @param {Array} rawLogs - Array of log objects
 * @param {Object} processingMode - { strictCheckInOutOnly } from getProcessingMode
 * @returns {Array} Filtered logs
 */
function filterPunchesForPairing(rawLogs, processingMode = {}) {
  if (!rawLogs || !Array.isArray(rawLogs)) return [];
  const strict = processingMode.strictCheckInOutOnly !== false;

  if (strict) {
    return rawLogs.filter(log => log && (log.type === 'IN' || log.type === 'OUT'));
  }
  return rawLogs.filter(log => log && (log.type === 'IN' || log.type === 'OUT' || log.type == null));
}

module.exports = {
  getPunchesForPairing,
  filterPunchesForPairing,
  resolveProcessingMode,
};
