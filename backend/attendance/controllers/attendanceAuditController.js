/**
 * Attendance Audit Controller
 */

const { parseQueryIdList } = require('../../pay-register/services/payRegisterEmployeeFilter');
const { AUDIT_TYPES, runAttendanceAudit } = require('../services/attendanceAuditService');
const { getEmployeeAuditCompare, getAttendanceAuditOverview, parseOverviewQuery } = require('../services/attendanceAuditCompareService');

function parseEmpNoList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map((e) => String(e).trim().toUpperCase())
    .filter(Boolean);
}

/**
 * @desc    List available attendance audit types
 * @route   GET /api/attendance/audit/types
 */
exports.getAuditTypes = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: AUDIT_TYPES });
  } catch (error) {
    console.error('Error fetching audit types:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Run an attendance audit for a payroll month
 * @route   POST /api/attendance/audit/run
 */
exports.runAudit = async (req, res) => {
  try {
    const {
      type,
      month,
      onlyMismatches = true,
      limit = 500,
    } = req.body || {};

    const divisionIds = parseQueryIdList(req.body?.divisionIds ?? req.body?.division);
    const departmentIds = parseQueryIdList(req.body?.departmentIds ?? req.body?.department);
    const empNos = parseEmpNoList(req.body?.empNos ?? req.body?.empNo);

    if (!type) {
      return res.status(400).json({ success: false, message: 'Audit type is required' });
    }
    if (!month) {
      return res.status(400).json({ success: false, message: 'Month (YYYY-MM) is required' });
    }

    const parsedLimit = Math.min(Math.max(parseInt(String(limit), 10) || 500, 1), 2000);
    const data = await runAttendanceAudit({
      type,
      month,
      divisionIds,
      departmentIds,
      empNos,
      onlyMismatches: onlyMismatches !== false && onlyMismatches !== 'false',
      limit: parsedLimit,
      scopeFilter: req.scopeFilter || {},
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error running attendance audit:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Attendance vs pay register side-by-side compare for one employee
 * @route   GET /api/attendance/audit/compare
 */
exports.getCompare = async (req, res) => {
  try {
    const { employeeId, month } = req.query;
    if (!employeeId || !month) {
      return res.status(400).json({ success: false, message: 'employeeId and month (YYYY-MM) are required' });
    }
    const data = await getEmployeeAuditCompare(employeeId, month, req.scopeFilter || {});
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching attendance audit compare:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Load all attendance vs pay register comparisons for a month (auto on page load)
 * @route   GET /api/attendance/audit/overview
 */
exports.getOverview = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ success: false, message: 'Month (YYYY-MM) is required' });
    }
    const { divisionIds, departmentIds, empNos, onlyIssues, limit, page } = parseOverviewQuery(req.query);
    const data = await getAttendanceAuditOverview({
      month,
      scopeFilter: req.scopeFilter || {},
      divisionIds,
      departmentIds,
      empNos,
      onlyIssues,
      limit,
      page,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching attendance audit overview:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
