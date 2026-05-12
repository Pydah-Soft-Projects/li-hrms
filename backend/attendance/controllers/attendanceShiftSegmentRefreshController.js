/**
 * Batch refresh shift half-segment metadata on historical attendance (same filters as auto-edge generator).
 */

const Employee = require('../../employees/model/Employee');
const AttendanceDaily = require('../model/AttendanceDaily');
const { mergeScopeWithEmployeeClauses } = require('../services/attendanceEmployeeQuery');
const { refreshAttendanceShiftSegments } = require('../services/shiftSegmentAttendanceService');

const escapeRegex = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

exports.refreshShiftSegmentsBatch = async (req, res) => {
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

    if (startDate > endDate) {
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
          updated: 0,
          skipped: [],
        },
      });
    }

    const employeeNumbers = employees
      .map((e) => String(e.emp_no || '').toUpperCase())
      .filter(Boolean);

    const query = {
      employeeNumber: { $in: employeeNumbers },
      date: { $gte: startDate, $lte: endDate },
    };

    const cursor = AttendanceDaily.find(query).cursor();
    let processed = 0;
    let updated = 0;
    const skipped = [];

    for await (const doc of cursor) {
      processed += 1;
      const result = await refreshAttendanceShiftSegments(doc.employeeNumber, doc.date);
      if (result?.success) {
        updated += 1;
      } else {
        skipped.push({
          employeeNumber: doc.employeeNumber,
          date: doc.date,
          reason: result?.message || 'Unable to refresh segments',
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Shift segment refresh completed.',
      data: {
        employeeCount: employees.length,
        processed,
        updated,
        skipped,
      },
    });
  } catch (error) {
    console.error('[refreshShiftSegmentsBatch]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh shift segments.',
    });
  }
};
