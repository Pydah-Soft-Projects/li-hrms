const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const Leave = require('../../leaves/model/Leave');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Department = require('../../departments/model/Department');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate('department');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const role = user.role;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let stats = {};

    // 1. Super Admin / Sub Admin - Global Stats
    if (['super_admin', 'sub_admin'].includes(role)) {
      // Total Employees (Active)
      const totalEmployees = await Employee.countDocuments({ is_active: true });

      // Pending Leaves (Global)
      const pendingLeaves = await Leave.countDocuments({ status: 'pending' });

      // Approved Leaves (Global - maybe for this month?)
      // "Ready for Payroll" implies approved leaves that are processed or final. Let's just count approved for now.
      const approvedLeaves = await Leave.countDocuments({ status: 'approved' });

      // Active Today (Present count)
      const todayPresent = await AttendanceDaily.countDocuments({
        date: today,
        status: { $in: ['P', 'WO-P', 'PH-P'] }, // Present, Weekoff Present, Holiday Present
      });

      stats = {
        totalEmployees,
        pendingLeaves,
        approvedLeaves,
        todayPresent,
        // Mock data for things we don't have easy queries for yet
        upcomingHolidays: 2,
      };
    }

    // 2. HR - Scoped Stats (Departments)
    else if (role === 'hr') {
      // Determine accessible departments
      let departmentIds = [];

      // Check for multi-department assignment
      if (user.departments && user.departments.length > 0) {
        // If populated, map to _id, otherwise use as is
        departmentIds = user.departments.map(d => d._id || d);
      }
      // Fallback to single department if no list
      else if (user.department) {
        departmentIds = [user.department._id || user.department];
      }

      // If dataScope is explicitly 'all', revert to global (optional, based on future needs)
      // For now, enforcing scoped access as per request

      const deptFilter = departmentIds.length > 0 ? { department_id: { $in: departmentIds } } : {};
      const leaveFilter = departmentIds.length > 0 ? { department: { $in: departmentIds } } : {};
      const attendanceFilter = departmentIds.length > 0 ? { departmentId: { $in: departmentIds } } : {};

      // Total Employees (Scoped)
      const totalEmployees = await Employee.countDocuments({
        is_active: true,
        ...deptFilter
      });

      // Pending Leaves (Scoped)
      const pendingLeaves = await Leave.countDocuments({
        status: 'pending',
        ...leaveFilter
      });

      // Approved Leaves (Scoped)
      const approvedLeaves = await Leave.countDocuments({
        status: 'approved',
        ...leaveFilter
      });

      // Active Today (Scoped)
      const todayPresent = await AttendanceDaily.countDocuments({
        date: today,
        status: { $in: ['P', 'WO-P', 'PH-P'] },
        ...attendanceFilter
      });

      stats = {
        totalEmployees,
        pendingLeaves,
        approvedLeaves,
        todayPresent,
        upcomingHolidays: 2,
      };
    }

    // 2. HOD - Department Stats
    else if (role === 'hod') {
      const departmentId = user.department?._id;

      if (!departmentId) {
        return res.status(400).json({ success: false, message: 'HOD has no department assigned' });
      }

      // Team Squad (Department Employees)
      const teamSize = await Employee.countDocuments({
        department_id: departmentId,
        is_active: true
      });

      // Team Present
      const teamPresent = await AttendanceDaily.countDocuments({
        date: today,
        departmentId: departmentId,
        status: { $in: ['P', 'WO-P', 'PH-P'] },
      });

      // Action Items (Pending Leaves for Department)
      // Pending leaves where employee belongs to this department
      // We need to look up employees in this department first or join.
      // Easiest is to find employees in dept, then find leaves for them.
      const deptEmployees = await Employee.find({ department_id: departmentId }).select('_id emp_no');
      const deptEmpNos = deptEmployees.map(e => e.emp_no);

      const teamPendingApprovals = await Leave.countDocuments({
        emp_no: { $in: deptEmpNos },
        status: 'pending'
      });

      stats = {
        totalEmployees: teamSize,
        todayPresent: teamPresent,
        teamPendingApprovals,
        approvedLeaves: 0, // Placeholder
        upcomingHolidays: 2,
      };

      // Efficiency Score Calculation
      // Formula: (Total Present Records This Month / (Team Size * Days PassedThisMonth)) * 100
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const daysPassed = today.getDate(); // 1 to 31

      // Get total present records for the whole department this month
      // We need to match by departmentId in AttendanceDaily if available, or by empNumbers
      // AttendanceDaily has departmentId field
      const totalDeptPresentThisMonth = await AttendanceDaily.countDocuments({
        departmentId: departmentId,
        date: { $gte: startOfMonth, $lte: today },
        status: { $in: ['P', 'WO-P', 'PH-P'] }
      });

      let efficiencyScore = 0;
      if (teamSize > 0 && daysPassed > 0) {
        const potentialManDays = teamSize * daysPassed;
        efficiencyScore = Math.round((totalDeptPresentThisMonth / potentialManDays) * 100);
      }
      stats.efficiencyScore = efficiencyScore;

      // Department Feed (Recent Pending Requests)
      const recentPendingRequests = await Leave.find({
        emp_no: { $in: deptEmpNos },
        status: 'pending'
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('employeeId', 'employee_name emp_no')
        .select('leaveType fromDate toDate numberOfDays employeeId createdAt');

      stats.departmentFeed = recentPendingRequests;
    }

    // 3. Employee - Personal Stats
    else {
      const employeeId = user.employeeId;

      if (!employeeId) {
        // Fallback if no employee ID linked
        return res.json({ success: true, data: {} });
      }

      // My Pending Leaves
      const myPendingLeaves = await Leave.countDocuments({
        emp_no: employeeId,
        status: 'pending'
      });

      // My Approved Leaves (This Year/Month?)
      const myApprovedLeaves = await Leave.countDocuments({
        emp_no: employeeId,
        status: 'approved'
      });

      // Attendance (Days present this month)
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const myAttendance = await AttendanceDaily.countDocuments({
        employeeNumber: employeeId,
        date: { $gte: startOfMonth },
        status: { $in: ['P', 'WO-P', 'PH-P'] }
      });

      const leaveBalance = myApprovedLeaves - myPendingLeaves;

      stats = {
        myPendingLeaves,
        myApprovedLeaves,
        todayPresent: myAttendance, // Reusing key
        upcomingHolidays: 2,
        leaveBalance
      };
    }

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message,
    });
  }
};
