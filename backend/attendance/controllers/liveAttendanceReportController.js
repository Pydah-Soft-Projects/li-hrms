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

    // Use existing extractISTComponents if possible, or simple format
    // Default to today if no date provided
    const targetDate = date ? date : formatDate(new Date());

    // 1. Build employee base query for "Total Workforce"
    const employeeQuery = { is_active: true };
    if (division) employeeQuery.division_id = division;
    if (department) employeeQuery.department_id = department;

    // Fetch all applicable active employees
    const activeEmployees = await Employee.find(employeeQuery)
      .select('_id emp_no employee_name division_id department_id designation_id')
      .populate({ path: 'division_id', select: 'name' })
      .populate({ path: 'department_id', select: 'name' })
      .populate({ path: 'designation_id', select: 'name' })
      .lean();

    const totalActiveCount = activeEmployees.length;
    const empNos = activeEmployees.map(e => e.emp_no);

    // 2. Fetch attendance records for these employees on target date
    const attendanceRecords = await AttendanceDaily.find({
      date: targetDate,
      employeeNumber: { $in: empNos }
    })
      .populate({
        path: 'shifts.shiftId',
        select: 'name startTime endTime'
      })
      .lean();

    // Map records by emp_no for easy lookup
    const attendanceMap = attendanceRecords.reduce((acc, r) => {
      acc[r.employeeNumber] = r;
      return acc;
    }, {});

    // 3. Initialize categories and breakdowns
    const currentlyWorking = [];
    const completedShift = [];
    const shiftBreakdownMap = {}; // name -> { working, completed }
    const deptBreakdownMap = {}; // deptId -> { name, divisionName, total, present, working, completed, absent }

    // Initialize shift breakdown from all shifts if none filtered, or just relevant ones
    const allShifts = await Shift.find({ isActive: true }).select('name').lean();
    allShifts.forEach(s => {
      shiftBreakdownMap[s.name] = { name: s.name, working: 0, completed: 0 };
    });

    // 4. Process all active employees to categorize
    activeEmployees.forEach(employee => {
      const record = attendanceMap[employee.emp_no];
      const deptId = employee.department_id?._id?.toString() || 'unknown';

      // Initialize dept breakdown if not seen
      if (!deptBreakdownMap[deptId]) {
        deptBreakdownMap[deptId] = {
          id: deptId,
          name: employee.department_id?.name || 'Unknown',
          divisionId: employee.division_id?._id || 'unknown',
          divisionName: employee.division_id?.name || 'Unknown',
          totalEmployees: 0,
          present: 0,
          working: 0,
          completed: 0,
          absent: 0
        };
      }
      deptBreakdownMap[deptId].totalEmployees++;

      if (!record) {
        // ABSENT
        deptBreakdownMap[deptId].absent++;
        return;
      }

      // PRESENT
      const firstShift = record.shifts && record.shifts.length > 0 ? record.shifts[0] : null;
      const shiftDoc = firstShift?.shiftId;

      // Filter by shift if requested
      if (shift && shiftDoc?._id?.toString() !== shift) {
        // If we came here, the employee is technically present but doesn't match the shift filter
        // For the purpose of "Live Pulse", we usually want the counts to reflect the filtered view
        // But Total Active should remain constant for the scope? 
        // Actually, if a shift is selected, we should probably only focus on people assigned to/working that shift.
        // For simplicity, we filter the employee out of the results if they don't match selected shift
        deptBreakdownMap[deptId].totalEmployees--; // Adjust back
        return;
      }

      deptBreakdownMap[deptId].present++;

      const employeeData = {
        id: employee._id,
        empNo: employee.emp_no,
        name: employee.employee_name,
        department: employee.department_id?.name || 'N/A',
        designation: employee.designation_id?.name || 'N/A',
        division: employee.division_id?.name || 'N/A',
        shift: shiftDoc?.name || 'N/A',
        shiftStartTime: shiftDoc?.startTime || shiftDoc?.start_time || null,
        shiftEndTime: shiftDoc?.endTime || shiftDoc?.end_time || null,
        inTime: firstShift?.inTime || null,
        outTime: firstShift?.outTime || null,
        status: record.status,
        date: record.date,
        isLate: record.totalLateInMinutes > 0,
        lateMinutes: record.totalLateInMinutes || 0,
        isEarlyOut: record.totalEarlyOutMinutes > 0,
        earlyOutMinutes: record.totalEarlyOutMinutes || 0,
        otHours: record.totalOTHours || 0,
        extraHours: record.extraHours || 0,
        hoursWorked: 0
      };

      const hasIn = !!employeeData.inTime;
      const hasOut = !!employeeData.outTime;
      const shiftName = shiftDoc?.name || 'Default';

      if (!shiftBreakdownMap[shiftName]) {
        shiftBreakdownMap[shiftName] = { name: shiftName, working: 0, completed: 0 };
      }

      if (hasIn && !hasOut) {
        employeeData.hoursWorked = calculateHoursWorked(employeeData.inTime);
        employeeData.statusText = 'Working';
        currentlyWorking.push(employeeData);
        shiftBreakdownMap[shiftName].working++;
        deptBreakdownMap[deptId].working++;
      } else if (hasIn && hasOut) {
        const inDateTime = new Date(employeeData.inTime);
        const outDateTime = new Date(employeeData.outTime);
        employeeData.hoursWorked = (outDateTime - inDateTime) / (1000 * 60 * 60);
        employeeData.statusText = 'Completed';
        completedShift.push(employeeData);
        shiftBreakdownMap[shiftName].completed++;
        deptBreakdownMap[deptId].completed++;
      } else {
        // Technically present but no punch? (e.g. manual status)
        employeeData.statusText = 'Present';
      }
    });

    // 5. Finalize data
    const totalPresent = currentlyWorking.length + completedShift.length;
    const finalShiftBreakdown = Object.values(shiftBreakdownMap).filter(s => s.working > 0 || s.completed > 0);
    const finalDeptBreakdown = Object.values(deptBreakdownMap);

    res.status(200).json({
      success: true,
      data: {
        date: targetDate,
        summary: {
          currentlyWorking: currentlyWorking.length,
          completedShift: completedShift.length,
          totalPresent,
          totalActiveEmployees: totalActiveCount, // Count within the filter scope
          absentEmployees: totalActiveCount - totalPresent,
          shiftBreakdown: finalShiftBreakdown,
          departmentBreakdown: finalDeptBreakdown
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
