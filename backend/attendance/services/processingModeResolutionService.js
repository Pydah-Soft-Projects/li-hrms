/**
 * Resolves attendance processingMode: division override → organization default.
 * Org defaults live in AttendanceSettings; divisions may set useOrgDefault: false to override.
 */

const mongoose = require('mongoose');
const AttendanceSettings = require('../model/AttendanceSettings');
const Division = require('../../departments/model/Division');
const Employee = require('../../employees/model/Employee');

function usesDivisionOverride(divisionProcessingMode) {
  return divisionProcessingMode && divisionProcessingMode.useOrgDefault === false;
}

/**
 * Merge org processingMode (resolved object) with an optional division override document.
 * @param {Object} orgProcessingMode - output of AttendanceSettings.getProcessingMode
 * @param {Object|null|undefined} divisionOverride - division.processingMode
 */
function mergeDivisionProcessingMode(orgProcessingMode, divisionOverride) {
  if (!usesDivisionOverride(divisionOverride)) {
    return orgProcessingMode;
  }

  const d = divisionOverride || {};
  const merged = {
    ...orgProcessingMode,
    mode: d.mode === 'single_shift' || d.mode === 'multi_shift' ? d.mode : orgProcessingMode.mode,
  };

  if (merged.mode === 'multi_shift') {
    merged.strictCheckInOutOnly = true;
  } else if (d.strictCheckInOutOnly !== undefined) {
    merged.strictCheckInOutOnly = d.strictCheckInOutOnly !== false;
  }

  if (d.continuousSplitThresholdHours !== undefined && d.continuousSplitThresholdHours !== null) {
    merged.continuousSplitThresholdHours = d.continuousSplitThresholdHours;
  }
  if (d.splitMinGapHours !== undefined && d.splitMinGapHours !== null) {
    merged.splitMinGapHours = d.splitMinGapHours;
  }
  if (d.maxShiftsPerDay !== undefined && d.maxShiftsPerDay !== null) {
    merged.maxShiftsPerDay = d.maxShiftsPerDay;
  }
  if (d.rosterStrictWhenPresent !== undefined) {
    merged.rosterStrictWhenPresent = d.rosterStrictWhenPresent !== false;
  }
  if (d.postShiftOutMarginHours !== undefined && d.postShiftOutMarginHours !== null) {
    merged.postShiftOutMarginHours = d.postShiftOutMarginHours;
  }

  return AttendanceSettings.getProcessingMode({ processingMode: merged });
}

async function getOrgAttendanceContext() {
  const settings = await AttendanceSettings.getSettings();
  const processingMode = AttendanceSettings.getProcessingMode(settings);
  return { settings, processingMode };
}

/**
 * @param {import('mongoose').Types.ObjectId|string|null|undefined} divisionId
 */
async function getProcessingModeForDivisionId(divisionId) {
  const { processingMode: orgPm } = await getOrgAttendanceContext();
  if (!divisionId) return orgPm;

  const division = await Division.findById(divisionId).select('processingMode').lean();
  return mergeDivisionProcessingMode(orgPm, division?.processingMode);
}

/**
 * @param {Object|string|import('mongoose').Types.ObjectId|null} employeeOrIdOrEmpNo
 */
async function getProcessingModeForEmployee(employeeOrIdOrEmpNo) {
  const divisionId = await resolveEmployeeDivisionId(employeeOrIdOrEmpNo);
  return getProcessingModeForDivisionId(divisionId);
}

async function getProcessingModeForEmployeeNumber(employeeNumber) {
  return getProcessingModeForEmployee(employeeNumber);
}

/**
 * Attendance settings doc shape with processingMode resolved for punch filtering / sync.
 */
async function getAttendanceContextForEmployee(employeeOrIdOrEmpNo) {
  const { settings, processingMode: orgPm } = await getOrgAttendanceContext();
  const processingMode = await getProcessingModeForEmployee(employeeOrIdOrEmpNo);
  const settingsObj = settings?.toObject ? settings.toObject() : { ...settings };
  return {
    settings: {
      ...settingsObj,
      processingMode: {
        ...(settingsObj.processingMode || {}),
        ...processingMode,
      },
    },
    processingMode,
    orgProcessingMode: orgPm,
  };
}

async function resolveEmployeeDivisionId(employeeOrIdOrEmpNo) {
  if (!employeeOrIdOrEmpNo) return null;

  if (typeof employeeOrIdOrEmpNo === 'object') {
    const div = employeeOrIdOrEmpNo.division_id;
    if (!div) return null;
    return div._id || div;
  }

  if (mongoose.Types.ObjectId.isValid(String(employeeOrIdOrEmpNo))) {
    const employee = await Employee.findById(employeeOrIdOrEmpNo).select('division_id').lean();
    return employee?.division_id || null;
  }

  if (typeof employeeOrIdOrEmpNo === 'string') {
    const employee = await Employee.findOne({ emp_no: employeeOrIdOrEmpNo.toUpperCase() })
      .select('division_id')
      .lean();
    return employee?.division_id || null;
  }

  return null;
}

/**
 * Batch-resolve processing modes for many divisions (live reports, etc.).
 * @param {Array<import('mongoose').Types.ObjectId|string>} divisionIds
 * @returns {Promise<Map<string, Object>>}
 */
async function buildDivisionProcessingModeMap(divisionIds = []) {
  const { processingMode: orgPm } = await getOrgAttendanceContext();
  const uniqueIds = [...new Set((divisionIds || []).filter(Boolean).map(String))];
  const map = new Map();

  if (!uniqueIds.length) return map;

  const divisions = await Division.find({ _id: { $in: uniqueIds } }).select('processingMode').lean();
  for (const div of divisions) {
    map.set(String(div._id), mergeDivisionProcessingMode(orgPm, div.processingMode));
  }
  return map;
}

function resolveProcessingModeFromDivisionMap(employee, divisionModeMap, orgProcessingMode) {
  const divId = employee?.division_id?._id || employee?.division_id;
  if (!divId) return orgProcessingMode;
  return divisionModeMap.get(String(divId)) || orgProcessingMode;
}

module.exports = {
  usesDivisionOverride,
  mergeDivisionProcessingMode,
  getOrgAttendanceContext,
  getProcessingModeForDivisionId,
  getProcessingModeForEmployee,
  getProcessingModeForEmployeeNumber,
  getAttendanceContextForEmployee,
  buildDivisionProcessingModeMap,
  resolveProcessingModeFromDivisionMap,
};
