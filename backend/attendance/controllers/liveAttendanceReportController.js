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
exports.getLiveAttendanceReport = async (req, res) => {
  try {
    const { date, department, shift } = req.query;

    // Default to today if no date provided
    const targetDate = date ? formatDate(new Date(date)) : formatDate(new Date());

    // Build query for attendance records
    const query = { date: targetDate };

    // Get all attendance records for the date, with shift populated
    let attendanceRecords = await AttendanceDaily.find(query)
      .populate({
        path: 'shiftId',
        select: 'name startTime endTime'
      })
      .lean();

    // Collect unique employee numbers and fetch employee docs
    const empNumbers = [...new Set(attendanceRecords.map(r => r.employeeNumber).filter(Boolean))];
    let employeeMap = {};
    if (empNumbers.length > 0) {
      const employees = await Employee.find({ emp_no: { $in: empNumbers } })
        .select('_id emp_no employee_name division_id department_id designation_id')
        .populate({ path: 'division_id', select: 'name' })
        .populate({ path: 'department_id', select: 'name' })
        .populate({ path: 'designation_id', select: 'name' })
        .lean();

      employeeMap = employees.reduce((acc, e) => {
        acc[e.emp_no] = e;
        return acc;
      }, {});
    }

    // Categorize employees and calculate shift-wise stats
    const currentlyWorking = [];
    const completedShift = [];
    const shiftStats = {}; // { shiftId: { name, working, completed } }

    attendanceRecords.forEach(record => {
      const empNo = record.employeeNumber;
      const employee = employeeMap[empNo];
      if (!employee) return;

      // Department filter if requested
      if (department && employee.department_id?._id?.toString() !== department) return;

      // Shift filter if requested
      if (shift && record.shiftId?._id?.toString() !== shift) return;

      const shiftId = record.shiftId?._id?.toString() || 'manual';
      if (!shiftStats[shiftId]) {
        shiftStats[shiftId] = {
          name: record.shiftId?.name || 'Manual/Unknown',
          working: 0,
          completed: 0
        };
      }

      const employeeData = {
        id: employee._id,
        empNo: employee.emp_no,
        name: employee.employee_name,
        department: employee.department_id?.name || 'N/A',
        designation: employee.designation_id?.name || 'N/A',
        division: employee.division_id?.name || 'N/A',
        shift: record.shiftId?.name || 'N/A',
        shiftStartTime: record.shiftId?.startTime || record.shiftId?.start_time || null,
        shiftEndTime: record.shiftId?.endTime || record.shiftId?.end_time || null,
        inTime: record.inTime || record.in_time || record.inTime || null,
        outTime: record.outTime || record.out_time || null,
        status: record.status,
        date: record.date,
        isLate: record.isLateIn || record.is_late_in || false,
        lateMinutes: record.lateInMinutes || record.late_in_minutes || 0,
        isEarlyOut: record.isEarlyOut || record.is_early_out || false,
        earlyOutMinutes: record.earlyOutMinutes || record.early_out_minutes || 0,
        otHours: record.otHours || record.ot_hours || 0,
        extraHours: record.extraHours || record.extra_hours || 0
      };

      // Determine status text and hours worked
      const hasIn = !!(employeeData.inTime);
      const hasOut = !!(employeeData.outTime);

      if (hasIn && !hasOut) {
        employeeData.hoursWorked = calculateHoursWorked(employeeData.inTime);
        employeeData.statusText = 'Working';
        currentlyWorking.push(employeeData);
        shiftStats[shiftId].working++;
      } else if (hasIn && hasOut) {
        const inDateTime = new Date(employeeData.inTime);
        const outDateTime = new Date(employeeData.outTime);
        const diffMs = outDateTime - inDateTime;
        employeeData.hoursWorked = diffMs / (1000 * 60 * 60);
        employeeData.statusText = 'Completed';
        completedShift.push(employeeData);
        shiftStats[shiftId].completed++;
      }
    });

    // Fetch total active employees count
    const totalActiveEmployees = await Employee.countDocuments({ is_active: { $ne: false } });

    // Sort currently working by latest in_time first (default)
    currentlyWorking.sort((a, b) => new Date(b.inTime) - new Date(a.inTime));

    // Sort completed shift by latest out_time first (default)
    completedShift.sort((a, b) => new Date(b.outTime) - new Date(a.outTime));

    res.status(200).json({
      success: true,
      data: {
        date: targetDate,
        summary: {
          currentlyWorking: currentlyWorking.length,
          completedShift: completedShift.length,
          totalPresent: currentlyWorking.length + completedShift.length,
          totalActiveEmployees: totalActiveEmployees,
          absentEmployees: Math.max(0, totalActiveEmployees - (currentlyWorking.length + completedShift.length)),
          shiftBreakdown: Object.values(shiftStats)
        },
        currentlyWorking,
        completedShift
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
