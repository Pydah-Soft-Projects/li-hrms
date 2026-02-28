const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const Leave = require('../../leaves/model/Leave');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Department = require('../../departments/model/Department');
const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');
const OD = require('../../leaves/model/OD');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');

/**
 * Format a Date object to YYYY-MM-DD string (IST-safe)
 * AttendanceDaily stores date as String in YYYY-MM-DD format.
 */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const role = user.role;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    let stats = {};

    // 1. Super Admin / Sub Admin - Global Stats
    if (['super_admin', 'sub_admin'].includes(role)) {
      const totalEmployees = await Employee.countDocuments(Employee.getCurrentlyActiveFilter());
      const pendingLeaves = await Leave.countDocuments({ status: 'pending' });
      const approvedLeaves = await Leave.countDocuments({ status: 'approved' });

      // AttendanceDaily.date is stored as a YYYY-MM-DD string
      const todayPresent = await AttendanceDaily.countDocuments({
        date: todayStr,
        status: { $in: ['PRESENT', 'HALF_DAY'] },
      });

      stats = {
        totalEmployees,
        pendingLeaves,
        approvedLeaves,
        todayPresent,
        upcomingHolidays: 2,
      };
    }

    // 2. HR / Manager - Scoped Team Stats
    else if (['hr', 'manager'].includes(role)) {
      const scopedEmployeeIds = await getEmployeeIdsInScope(user);

      const activeFilter = Employee.getCurrentlyActiveFilter();
      const totalEmployees = await Employee.countDocuments(
        scopedEmployeeIds.length > 0 ? { _id: { $in: scopedEmployeeIds }, ...activeFilter } : { _id: null }
      );

      const leaveScopeFilter = scopedEmployeeIds.length > 0 ? { employeeId: { $in: scopedEmployeeIds } } : { _id: null };
      const pendingLeaves = await Leave.countDocuments({ status: 'pending', ...leaveScopeFilter });
      const approvedLeaves = await Leave.countDocuments({ status: 'approved', ...leaveScopeFilter });

      const scopedEmpNos = scopedEmployeeIds.length > 0
        ? (await Employee.find({ _id: { $in: scopedEmployeeIds } }).select('emp_no').lean()).map(e => e.emp_no)
        : [];

      const todayPresent = scopedEmpNos.length > 0
        ? await AttendanceDaily.countDocuments({
          date: todayStr,
          status: { $in: ['PRESENT', 'HALF_DAY'] },
          employeeNumber: { $in: scopedEmpNos }
        })
        : 0;

      stats = {
        totalEmployees,
        pendingLeaves,
        approvedLeaves,
        todayPresent,
        upcomingHolidays: 2,
      };
    }

    // 3. HOD - Department Stats
    else if (role === 'hod') {
      const scopedEmployeeIds = await getEmployeeIdsInScope(user);
      const scopedEmpNos = scopedEmployeeIds.length > 0
        ? (await Employee.find({ _id: { $in: scopedEmployeeIds } }).select('emp_no').lean()).map(e => e.emp_no)
        : [];

      if (scopedEmployeeIds.length === 0) {
        return res.status(400).json({ success: false, message: 'HOD has no scope assigned in divisionMapping' });
      }

      const activeFilter = Employee.getCurrentlyActiveFilter();
      const teamSize = await Employee.countDocuments({ _id: { $in: scopedEmployeeIds }, ...activeFilter });

      const teamPresent = scopedEmpNos.length > 0
        ? await AttendanceDaily.countDocuments({
          date: todayStr,
          employeeNumber: { $in: scopedEmpNos },
          status: { $in: ['PRESENT', 'HALF_DAY'] },
        })
        : 0;

      const teamPendingApprovals = await Leave.countDocuments({
        employeeId: { $in: scopedEmployeeIds },
        status: 'pending'
      });

      stats = {
        totalEmployees: teamSize,
        todayPresent: teamPresent,
        teamPendingApprovals,
        approvedLeaves: 0,
        upcomingHolidays: 2,
      };

      // Efficiency Score
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfMonthStr = toDateStr(startOfMonth);
      const daysPassed = today.getDate();

      const totalDeptPresentThisMonth = scopedEmpNos.length > 0
        ? await AttendanceDaily.countDocuments({
          employeeNumber: { $in: scopedEmpNos },
          date: { $gte: startOfMonthStr, $lte: todayStr },
          status: { $in: ['PRESENT', 'HALF_DAY'] }
        })
        : 0;

      let efficiencyScore = 0;
      if (teamSize > 0 && daysPassed > 0) {
        const potentialManDays = teamSize * daysPassed;
        efficiencyScore = Math.round((totalDeptPresentThisMonth / potentialManDays) * 100);
      }
      stats.efficiencyScore = efficiencyScore;

      // Department Feed (Recent Pending Requests)
      const recentPendingRequests = await Leave.find({
        employeeId: { $in: scopedEmployeeIds },
        status: 'pending'
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('employeeId', 'employee_name emp_no')
        .select('leaveType fromDate toDate numberOfDays employeeId createdAt');

      stats.departmentFeed = recentPendingRequests;
    }

    // 4. Employee - Personal Stats
    else {
      const employeeId = user.employeeId;

      if (!employeeId) {
        return res.json({ success: true, data: {} });
      }

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfMonthStr = toDateStr(startOfMonth);

      const myPendingLeaves = await Leave.countDocuments({ emp_no: employeeId, status: 'pending' });
      const myApprovedLeaves = await Leave.countDocuments({ emp_no: employeeId, status: 'approved' });

      const myAttendance = await AttendanceDaily.countDocuments({
        employeeNumber: employeeId,
        date: { $gte: startOfMonthStr, $lte: todayStr },
        status: { $in: ['PRESENT', 'HALF_DAY'] }
      });

      const leaveBalance = myApprovedLeaves - myPendingLeaves;

      stats = {
        myPendingLeaves,
        myApprovedLeaves,
        todayPresent: myAttendance,
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

    const startOfToday = new Date(today);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    // Convert to YYYY-MM-DD strings for AttendanceDaily queries
    const todayStr = toDateStr(today);
    const yesterdayStr = toDateStr(yesterday);
    const startOfMonthStr = toDateStr(startOfMonth);

    const [
      totalEmployees,
      activeEmployees,
      totalDepartments,
      totalUsers,
      todayPresentCount,
      todayAbsentCount,
      yesterdayPresentCount,
      yesterdayAbsentCount,
      pendingLeaves,
      pendingODs,
      pendingApplications,
      monthlyPresentDocs,
      allLeaves,
      allODs
    ] = await Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments(Employee.getCurrentlyActiveFilter()),
      Department.countDocuments(),
      User.countDocuments(),

      // Today present - using string date
      AttendanceDaily.countDocuments({
        date: todayStr,
        status: { $in: ['PRESENT', 'HALF_DAY'] }
      }),
      // Today absent
      AttendanceDaily.countDocuments({
        date: todayStr,
        status: 'ABSENT'
      }),

      // Yesterday present
      AttendanceDaily.countDocuments({
        date: yesterdayStr,
        status: { $in: ['PRESENT', 'HALF_DAY'] }
      }),
      // Yesterday absent
      AttendanceDaily.countDocuments({
        date: yesterdayStr,
        status: 'ABSENT'
      }),

      Leave.countDocuments({ status: 'pending' }),
      OD.countDocuments ? OD.countDocuments({ status: 'pending' }).catch(() => 0) : Promise.resolve(0),
      EmployeeApplication.countDocuments({ status: 'pending' }),

      // Monthly present count using string date range
      AttendanceDaily.countDocuments({
        date: { $gte: startOfMonthStr, $lte: todayStr },
        status: { $in: ['PRESENT', 'HALF_DAY'] }
      }),

      // Active leave approvals today
      Leave.find({
        status: 'approved',
        fromDate: { $lte: endOfToday },
        toDate: { $gte: startOfToday }
      }).populate('department', 'name'),

      OD.find ? OD.find({
        status: 'approved',
        fromDate: { $lte: endOfToday },
        toDate: { $gte: startOfToday }
      }).populate('department', 'name').catch(() => []) : Promise.resolve([])
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
      todayPresent: todayPresentCount,
      todayAbsent: todayAbsentCount,
      todayOnLeave: allLeaves.length,
      todayODs: allODs.length,
      yesterdayPresent: yesterdayPresentCount,
      yesterdayAbsent: yesterdayAbsentCount,
      yesterdayOnLeave: 0,
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
