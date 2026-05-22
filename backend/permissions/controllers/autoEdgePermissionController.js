/**
 * Auto Edge Permission Controller
 * Generates auto edge permissions for historical attendance records.
 */

const Employee = require('../../employees/model/Employee');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const { autoCreateEdgePermissionsForAttendance } = require('../services/autoEdgePermissionCreationService');
const { mergeScopeWithEmployeeClauses } = require('../../attendance/services/attendanceEmployeeQuery');

const escapeRegex = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

exports.generateAutoEdgePermissions = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      divisionId,
      departmentId,
      designationId,
      search,
    } = req.body || {};

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required.',
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'Date format must be YYYY-MM-DD.',
      });
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date values.',
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be earlier than or equal to end date.',
      });
    }

    const employeeClauses = [];
    if (search) {
      const safeSearch = escapeRegex(search);
      employeeClauses.push({
        $or: [
          { employee_name: { $regex: safeSearch, $options: 'i' } },
          { emp_no: { $regex: safeSearch, $options: 'i' } },
        ],
      });
    }
    if (divisionId) employeeClauses.push({ division_id: divisionId });
    if (departmentId) employeeClauses.push({ department_id: departmentId });
    if (designationId) employeeClauses.push({ designation_id: designationId });

    const employeeFilter = mergeScopeWithEmployeeClauses(req.scopeFilter || {}, employeeClauses);
    const employees = await Employee.find(employeeFilter).select('emp_no');

    if (!employees.length) {
      return res.status(200).json({
        success: true,
        message: 'No employees found for the selected filters and scope.',
        data: {
          employeeCount: 0,
          processed: 0,
          created: 0,
          finalized: 0,
          skipped: [],
        },
      });
    }

    const employeeNumbers = employees
      .map((employee) => String(employee.emp_no || '').toUpperCase())
      .filter(Boolean);

    const query = {
      employeeNumber: { $in: employeeNumbers },
      date: { $gte: startDate, $lte: endDate },
    };

    const attendanceCursor = AttendanceDaily.find(query).cursor();
    let processed = 0;
    let created = 0;
    let finalized = 0;
    const skipped = [];

    for await (const attendanceDaily of attendanceCursor) {
      processed += 1;
      const result = await autoCreateEdgePermissionsForAttendance(attendanceDaily);
      if (!result || !result.success) {
        skipped.push({
          employeeNumber: attendanceDaily.employeeNumber,
          date: attendanceDaily.date,
          reason: result?.error || result?.skippedReason || 'Unable to create auto edge permission',
        });
        continue;
      }

      created += Number(result.created || 0);
      finalized += Number(result.finalized || 0);
    }

    return res.status(200).json({
      success: true,
      message: 'Auto edge permission generation completed.',
      data: {
        employeeCount: employees.length,
        processed,
        created,
        finalized,
        skipped,
      },
    });
  } catch (error) {
    console.error('Error generating auto edge permissions:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate auto edge permissions.',
    });
  }
};
