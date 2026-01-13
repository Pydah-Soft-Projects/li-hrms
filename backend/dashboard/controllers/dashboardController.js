const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const Leave = require('../../leaves/model/Leave');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Department = require('../../departments/model/Department');
const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');
const OD = require('../../leaves/model/OD');

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
// @desc    Get detailed analytics for superadmin
// @route   GET /api/dashboard/analytics
// @access  Private (Super Admin)
exports.getSuperAdminAnalytics = async (req, res) => {
  try {
    if (!['super_admin', 'sub_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalEmployees,
      activeEmployees,
      totalDepartments,
      totalUsers,
      todayStats,
      yesterdayStats,
      pendingLeaves,
      pendingODs,
      pendingApplications,
      monthlyPresentDocs,
      allLeaves,
      allODs
    ] = await Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments({ is_active: true }),
      Department.countDocuments(),
      User.countDocuments(),
      // Today Stats
      AttendanceDaily.aggregate([
        { $match: { date: today } },
        {
          $group: {
            _id: null,
            present: { $sum: { $cond: [{ $in: ["$status", ["P", "WO-P", "PH-P", "PRESENT"]] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0] } }
          }
        }
      ]),
      // Yesterday Stats
      AttendanceDaily.aggregate([
        { $match: { date: yesterday } },
        {
          $group: {
            _id: null,
            present: { $sum: { $cond: [{ $in: ["$status", ["P", "WO-P", "PH-P", "PRESENT"]] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0] } }
          }
        }
      ]),
      Leave.countDocuments({ status: 'pending' }),
      OD.countDocuments ? await OD.countDocuments({ status: 'pending' }).catch(() => 0) : 0, // Fallback if OD model not exists/imported correctly
      EmployeeApplication.countDocuments({ status: 'pending' }),
      AttendanceDaily.countDocuments({
        date: { $gte: startOfMonth, $lte: today },
        status: { $in: ["P", "WO-P", "PH-P", "PRESENT", "PARTIAL"] }
      }),
      // For distributions (Simplified - getting all active leaves/ods for today)
      Leave.find({
        status: 'approved',
        fromDate: { $lte: today },
        toDate: { $gte: today }
      }).populate('department', 'name'),
      OD.find ? await OD.find({
        status: 'approved',
        fromDate: { $lte: today },
        toDate: { $gte: today }
      }).populate('department', 'name').catch(() => []) : []
    ]);

    // Process Distributions
    const deptLeaveDist = {};
    allLeaves.forEach(l => {
      const name = l.department?.name || 'Unknown';
      deptLeaveDist[name] = (deptLeaveDist[name] || 0) + 1;
    });

    const deptODDist = {};
    allODs.forEach(o => {
      const name = o.department?.name || 'Unknown';
      deptODDist[name] = (deptODDist[name] || 0) + 1;
    });

    const daysPassed = today.getDate();
    const attendanceRate = activeEmployees > 0 ? (monthlyPresentDocs / (activeEmployees * daysPassed)) * 100 : 0;

    const data = {
      totalEmployees,
      activeEmployees,
      totalDepartments,
      totalUsers,
      todayPresent: todayStats[0]?.present || 0,
      todayAbsent: todayStats[0]?.absent || 0,
      todayOnLeave: allLeaves.length,
      todayODs: allODs.length,
      yesterdayPresent: yesterdayStats[0]?.present || 0,
      yesterdayAbsent: yesterdayStats[0]?.absent || 0,
      yesterdayOnLeave: 0, // Would need another query for yesterday's leaves if critical
      yesterdayODs: 0,
      pendingLeaves,
      pendingODs,
      pendingPermissions: 0,
      pendingApplications,
      monthlyPresent: monthlyPresentDocs,
      attendanceRate: Math.min(100, attendanceRate),
      departmentLeaveDistribution: deptLeaveDist,
      departmentODDistribution: deptODDist
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, message: 'Error fetching analytics', error: error.message });
  }
};
