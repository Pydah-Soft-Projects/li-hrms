/**
 * Live Attendance Report Controller
 * Handles real-time attendance reporting for superadmin
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const Division = require('../../departments/model/Division');

// Helper function to format date to YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to calculate hours worked from in_time
const calculateHoursWorked = (inTime) => {
  if (!inTime) return 0;
  const now = new Date();
  const inDateTime = new Date(inTime);
  const diffMs = now - inDateTime;
  const hours = diffMs / (1000 * 60 * 60);
  return Math.max(0, hours);
};

// @desc    Get live attendance report
// @route   GET /api/attendance/reports/live
// @access  Private (Super Admin only)
// @desc    Get live attendance report
// @route   GET /api/attendance/reports/live
// @access  Private (Super Admin only)
exports.getLiveAttendanceReport = async (req, res) => {
  try {
    const { date, division, department, shift } = req.query;

    // Use current date if not provided
    const targetDate = date ? date : formatDate(new Date());

    // 1. Build employee base query
    const employeeQuery = { is_active: { $ne: false } };
    if (division) employeeQuery.division_id = division;
    if (department) employeeQuery.department_id = department;

    // Fetch applicable active employees
    const activeEmployees = await Employee.find(employeeQuery)
      .select('_id emp_no employee_name division_id department_id designation_id')
      .populate({ path: 'division_id', select: 'name' })
      .populate({ path: 'department_id', select: 'name' })
      .populate({ path: 'designation_id', select: 'name' })
      .lean();

    const empNos = activeEmployees.map(e => e.emp_no);
    const employeeMap = activeEmployees.reduce((acc, e) => {
      const key = e.emp_no ? String(e.emp_no).trim().toUpperCase() : null;
      if (key) acc[key] = e;
      return acc;
    }, {});

    // 2. Fetch attendance records for target date
    const attendanceRecords = await AttendanceDaily.find({
      date: targetDate,
      employeeNumber: { $in: empNos }
    })
      .populate({
        path: 'shifts.shiftId',
        select: 'name startTime endTime'
      })
      .lean();

    // 3. Departmental Stats aggregation (using Employee collection to include those without attendance)
    const aggMatch = { is_active: { $ne: false } };
    if (division) aggMatch.division_id = division;
    if (department) aggMatch.department_id = department;

    const divDeptStats = await Employee.aggregate([
      { $match: aggMatch },
      {
        $group: {
          _id: { division: '$division_id', department: '$department_id' },
          total: { $sum: 1 }
        }
      },
      {
        $lookup: { from: 'divisions', localField: '_id.division', foreignField: '_id', as: 'divisionDoc' }
      },
      {
        $lookup: { from: 'departments', localField: '_id.department', foreignField: '_id', as: 'departmentDoc' }
      },
      {
        $project: {
          divisionId: '$_id.division',
          id: '$_id.department',
          divisionName: { $ifNull: [{ $arrayElemAt: ['$divisionDoc.name', 0] }, 'No Division'] },
          name: { $ifNull: [{ $arrayElemAt: ['$departmentDoc.name', 0] }, 'No Department'] },
          totalEmployees: '$total'
        }
      }
    ]);

    const departmentStats = divDeptStats.reduce((acc, item) => {
      const key = `${item.divisionId}_${item.id}`;
      acc[key] = {
        ...item,
        working: 0,
        completed: 0,
        present: 0,
        absent: 0
      };
      return acc;
    }, {});

    // 4. Categorize employees
    const currentlyWorking = [];
    const completedShift = [];
    const shiftStats = {}; // { shiftId: { name, working, completed } }

    attendanceRecords.forEach(record => {
      const empNo = record.employeeNumber ? String(record.employeeNumber).trim().toUpperCase() : null;
      const employee = empNo ? employeeMap[empNo] : null;
      if (!employee) return;

      // Extract shift info (preferring last segment if it exist)
      const lastSegment = record.shifts && record.shifts.length > 0 ? record.shifts[record.shifts.length - 1] : null;
      const shiftDoc = lastSegment?.shiftId;

      // Filter by shift if requested
      if (shift && shiftDoc?._id?.toString() !== shift) return;

      const employeeData = {
        id: employee._id,
        empNo: employee.emp_no,
        name: employee.employee_name,
        department: employee.department_id?.name || 'N/A',
        designation: employee.designation_id?.name || 'N/A',
        division: employee.division_id?.name || 'N/A',
        shift: shiftDoc?.name || 'Manual/Unknown',
        shiftStartTime: shiftDoc?.startTime || null,
        shiftEndTime: shiftDoc?.endTime || null,
        inTime: lastSegment?.inTime || record.inTime || null,
        outTime: lastSegment?.outTime || record.outTime || null,
        status: record.status,
        date: record.date,
        isLate: record.isLateIn || false,
        lateMinutes: record.lateInMinutes || 0,
        isEarlyOut: record.isEarlyOut || false,
        earlyOutMinutes: record.earlyOutMinutes || 0,
        otHours: record.extraHours || 0,
        hoursWorked: 0
      };

      const hasIn = !!employeeData.inTime;
      const hasOut = !!employeeData.outTime;

      // Update Shift Stats
      const sId = shiftDoc?._id?.toString() || 'manual';
      if (!shiftStats[sId]) {
        shiftStats[sId] = { name: shiftDoc?.name || 'Manual/Unknown', working: 0, completed: 0 };
      }

      // Update Department Stats
      const divId = employee.division_id?._id?.toString() || 'null';
      const deptId = employee.department_id?._id?.toString() || 'null';
      const dKey = `${divId}_${deptId}`;
      if (departmentStats[dKey]) {
        departmentStats[dKey].present++;
      }

      if (hasIn && !hasOut) {
        employeeData.hoursWorked = calculateHoursWorked(employeeData.inTime);
        employeeData.statusText = 'Working';
        currentlyWorking.push(employeeData);
        shiftStats[sId].working++;
        if (departmentStats[dKey]) departmentStats[dKey].working++;
      } else if (hasIn && hasOut) {
        const diff = new Date(employeeData.outTime) - new Date(employeeData.inTime);
        employeeData.hoursWorked = diff / (1000 * 60 * 60);
        employeeData.statusText = 'Completed';
        completedShift.push(employeeData);
        shiftStats[sId].completed++;
        if (departmentStats[dKey]) departmentStats[dKey].completed++;
      }
    });

    // 5. Finalize summaries
    const totalPresent = currentlyWorking.length + completedShift.length;

    // Sort and finalize department stats
    const finalDepartmentBreakdown = Object.values(departmentStats).map(dept => ({
      ...dept,
      absent: Math.max(0, dept.totalEmployees - dept.present)
    })).sort((a, b) => {
      const divCmp = (a.divisionName || '').localeCompare(b.divisionName || '');
      return divCmp !== 0 ? divCmp : (a.name || '').localeCompare(b.name || '');
    });

    res.status(200).json({
      success: true,
      data: {
        date: targetDate,
        summary: {
          currentlyWorking: currentlyWorking.length,
          completedShift: completedShift.length,
          totalPresent,
          totalActiveEmployees: activeEmployees.length,
          absentEmployees: Math.max(0, activeEmployees.length - totalPresent),
          shiftBreakdown: Object.values(shiftStats),
          departmentBreakdown: finalDepartmentBreakdown
        },
        currentlyWorking: currentlyWorking.sort((a, b) => new Date(b.inTime) - new Date(a.inTime)),
        completedShift: completedShift.sort((a, b) => new Date(b.outTime) - new Date(a.outTime))
      }
    });

  } catch (error) {
    console.error('Error fetching live attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching live attendance report',
      error: error.message
    });
  }
};

// @desc    Get filter options for live attendance report
// @route   GET /api/attendance/reports/live/filters
// @access  Private (Super Admin only)
exports.getFilterOptions = async (req, res) => {
  try {
    // Divisions (used instead of organization)
    const divisions = await Division.find({ isActive: true })
      .select('name')
      .sort({ name: 1 })
      .lean();

    // Get all departments
    const departments = await Department.find({ isActive: true })
      .select('name')
      .sort({ name: 1 })
      .lean();

    // Get all shifts
    const shifts = await Shift.find({ isActive: true })
      .select('name startTime endTime')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        divisions: divisions.map(d => ({ id: d._id, name: d.name })),
        departments: departments.map(dept => ({ id: dept._id, name: dept.name })),
        shifts: shifts.map(shift => ({
          id: shift._id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};
